/*
  One call, end to end: GRIDGO's call record, the signalling, and the peer
  connection (gridgo-api `docs/CALLS_API.md`). No React here — `store/call.ts`
  holds the one live session and hands its snapshot to the screen.

  The contract's recommended sequence is followed as written:

    caller   start → ICE servers → audio-only peer + offer → POST offer and ICE
    callee   accept → ICE servers → read the offer → answer → POST answer and ICE
    both     heartbeat every 20 s while accepted

  HTTP carries every outbound signal; the SSE `calls` pointer (`poke`) and a
  two-second poll both mean "read state and signals now", so a dropped pointer
  costs at most two seconds. Remote ICE waits until the remote description is
  set. One offer/answer per call: a peer that fails ends the call, and the shop
  calls again.

  Fail closed, always. The API cannot cut a direct media path, so the moment
  the call is terminal, a request is refused, or the lease runs out without a
  renewal, this stops the microphone, closes the peer and releases the audio
  route. `finish` is the one way out and it is idempotent.
*/

import * as api from "@/lib/api";
import { callRefusal } from "@/lib/apiErrors";
import { withInCall, type CallRuntime } from "@/lib/callRuntime";
import {
  CALL_HEARTBEAT_MS,
  CALL_LEASE_MS,
  CALL_PAIR,
  CALL_POLL_MS,
  activeCall,
  endReasonFor,
  isRingingForMe,
  isTerminal,
  otherParty,
  type CallPhase,
  type EndReason,
  type OrderCall,
} from "@/lib/orderCall";

/** The parts of `lib/api.ts` a call uses; tests pass a fake. */
export type CallApi = Pick<
  typeof api,
  "startCall" | "listCalls" | "getCall" | "callAction" | "sendCallSignal" | "getCallSignals" | "getCallIceServers"
>;

export type CallSnapshot = {
  orderId: string;
  phase: CallPhase;
  call: OrderCall | null;
  /** The rider's first name, or "the rider" before GRIDGO names them. */
  otherName: string;
  muted: boolean;
  speaker: boolean;
  /** When audio first connected, on this phone's clock. */
  connectedAt: number | null;
  endReason: EndReason | null;
  /** True when this shop's own tap ended it (hang up, cancel, decline). */
  endedByMe: boolean;
  /** How long the connected part lasted, once ended. */
  durationMs: number | null;
};

/* The few shapes used from react-native-webrtc, so a fake can stand in. */
type IceCandidateInit = { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null };
type Description = { type: string; sdp: string };
type Track = { enabled: boolean; stop: () => void };
type Stream = { getTracks: () => Track[]; getAudioTracks: () => Track[] };
type PeerConnection = {
  iceConnectionState: string;
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  addTrack: (track: Track, stream: Stream) => unknown;
  createOffer: (options?: object) => Promise<Description>;
  createAnswer: () => Promise<Description>;
  setLocalDescription: (description: Description) => Promise<void>;
  setRemoteDescription: (description: unknown) => Promise<void>;
  addIceCandidate: (candidate: unknown) => Promise<void>;
  close: () => void;
};

/** A ringing call vibrates in this rhythm; the ringtone itself is the phone's own. */
export const RING_VIBRATION = Array.from({ length: 31 }, (_, i) => (i === 0 ? 0 : 1000));
/** ICE `disconnected` for this long without recovering is a dropped call. */
export const RECONNECT_GIVE_UP_MS = 15_000;
/** Polls failing for this long while still ringing out: the network is gone. */
export const RING_OFFLINE_GIVE_UP_MS = 15_000;

export class CallSession {
  private snapshot: CallSnapshot;
  private pc: PeerConnection | null = null;
  private stream: Stream | null = null;
  private cursor = 0;
  private seenSignals = new Set<number>();
  private pendingIce: IceCandidateInit[] = [];
  private remoteSet = false;
  private offerApplied = false;
  private iceCount = 0;
  private outbox: Promise<void> = Promise.resolve();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;
  private pollAgain = false;
  private failingSince: number | null = null;
  private leaseExpiresAt: number | null = null;
  private aborted = false;
  private finished = false;

  constructor(
    orderId: string,
    otherName: string | null,
    private readonly runtime: CallRuntime,
    private readonly onChange: (snapshot: CallSnapshot) => void,
    private readonly deps: { api: CallApi; now: () => number } = { api, now: Date.now },
  ) {
    this.snapshot = {
      orderId,
      phase: "calling",
      call: null,
      otherName: otherName || "the rider",
      muted: false,
      speaker: false,
      connectedAt: null,
      endReason: null,
      endedByMe: false,
      durationMs: null,
    };
  }

  get current(): CallSnapshot {
    return this.snapshot;
  }

  private set(patch: Partial<CallSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.onChange(this.snapshot);
  }

  private adopt(call: OrderCall): void {
    this.set({ call, otherName: otherParty(call).firstName || this.snapshot.otherName });
  }

  /* ------------------------------------------------------------------ caller */

  async startOutgoing(retried = false): Promise<void> {
    this.set({ phase: "calling" });
    let call: OrderCall;
    try {
      call = await this.deps.api.startCall(this.snapshot.orderId, CALL_PAIR);
    } catch (error) {
      const refusal = callRefusal(error);
      if (refusal === "already_active") return this.recoverActive(retried);
      return this.finish(refusal === "not_available" ? "not_available" : refusal === "too_many" ? "too_many" : "failed");
    }
    if (this.aborted) {
      // Hung up while the request was on its way: take the ring back.
      await this.deps.api.callAction(call.orderId, call.id, "cancel").catch(() => undefined);
      return this.finish("cancelled", true);
    }
    this.adopt(call);
    if (isTerminal(call.state)) return this.finish(endReasonFor(call));
    this.set({ phase: "ringing" });
    withInCall(this.runtime, (inCall) => {
      inCall.start({ media: "audio", ringback: "_DTMF_" });
      inCall.setKeepScreenOn(true);
      inCall.setForceSpeakerphoneOn(false);
    });
    this.startPolling();
    try {
      await this.openPeer();
      const offer = await this.pc!.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
      await this.pc!.setLocalDescription(offer);
      this.send({ clientId: "offer_1", kind: "offer", sdp: offer.sdp });
    } catch {
      if (!this.finished) await this.hangUpWith("failed");
    }
  }

  /**
   * GRIDGO already has a live call on this pair. The rider's ringing call is
   * answered here instead; a call of this shop's own left behind by a closed
   * app cannot be resumed (its offer belongs to a peer that is gone), so it is
   * put down and a fresh one started once.
   */
  private async recoverActive(retried = false): Promise<void> {
    let live: OrderCall | null = null;
    try {
      live = activeCall(await this.deps.api.listCalls(this.snapshot.orderId));
    } catch {
      return this.finish("failed");
    }
    if (!live) return retried ? this.finish("failed") : this.startOutgoing(true);
    if (isRingingForMe(live, this.deps.now())) return this.receive(live);
    if (retried || !live.mine) return this.finish("failed");
    await this.deps.api
      .callAction(live.orderId, live.id, live.state === "ringing" ? "cancel" : "end")
      .catch(() => undefined);
    return this.startOutgoing(true);
  }

  /* ------------------------------------------------------------------ callee */

  /** Ring for a call the rider placed. */
  receive(call: OrderCall): void {
    this.adopt(call);
    this.set({ phase: "incoming" });
    const seconds = Math.max(1, Math.ceil((Date.parse(call.ringExpiresAt) - this.deps.now()) / 1000));
    withInCall(this.runtime, (inCall) => {
      inCall.startRingtone("_DEFAULT_", RING_VIBRATION, "playback", seconds);
      inCall.setKeepScreenOn(true);
    });
    this.startPolling();
  }

  async accept(): Promise<void> {
    const call = this.snapshot.call;
    if (!call || this.snapshot.phase !== "incoming") return;
    withInCall(this.runtime, (inCall) => inCall.stopRingtone());
    this.set({ phase: "connecting" });
    try {
      this.adopt(await this.deps.api.callAction(call.orderId, call.id, "accept"));
    } catch (error) {
      return this.settleAfterRefusal(error);
    }
    withInCall(this.runtime, (inCall) => {
      inCall.start({ media: "audio" });
      inCall.setForceSpeakerphoneOn(false);
    });
    this.startHeartbeat();
    try {
      await this.openPeer();
    } catch {
      return this.hangUpWith("failed");
    }
    void this.poll();
  }

  async decline(): Promise<void> {
    const call = this.snapshot.call;
    if (!call || this.snapshot.phase !== "incoming") return;
    withInCall(this.runtime, (inCall) => inCall.stopRingtone());
    this.finish("missed", true);
    await this.deps.api.callAction(call.orderId, call.id, "decline").catch(() => undefined);
  }

  /* -------------------------------------------------------------------- both */

  /** The red button, whatever the call is doing. */
  async hangUp(): Promise<void> {
    if (this.finished) return;
    const { phase, call } = this.snapshot;
    if (phase === "incoming") return this.decline();
    if (!call) {
      this.aborted = true;
      return this.finish("cancelled", true);
    }
    if (call.state === "ringing" && call.mine) {
      this.finish("cancelled", true);
      await this.deps.api.callAction(call.orderId, call.id, "cancel").catch(() => undefined);
      return;
    }
    this.finish("ended", true);
    await this.deps.api.callAction(call.orderId, call.id, "end").catch(() => undefined);
  }

  setMuted(muted: boolean): void {
    for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = !muted;
    this.set({ muted });
  }

  setSpeaker(speaker: boolean): void {
    withInCall(this.runtime, (inCall) => inCall.setForceSpeakerphoneOn(speaker));
    this.set({ speaker });
  }

  /** GRIDGO said this order's calls changed (SSE): read now rather than in two seconds. */
  poke(): void {
    void this.poll();
  }

  /** Leave without a word to GRIDGO (the account changed). Media still stops. */
  dispose(): void {
    this.finish("ended", true);
  }

  /* ---------------------------------------------------------------- the peer */

  private async openPeer(): Promise<void> {
    const call = this.snapshot.call!;
    const iceServers = await this.deps.api.getCallIceServers(call.orderId, call.id);
    if (this.finished) return;
    const { RTCPeerConnection, mediaDevices } = this.runtime.webrtc;
    const pc = new RTCPeerConnection({ iceServers }) as unknown as PeerConnection;
    this.pc = pc;
    pc.addEventListener("icecandidate", (event) => {
      const candidate = (event as { candidate?: { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null } | null })
        .candidate;
      this.iceCount += 1;
      this.send({
        clientId: `ice_${this.iceCount}`,
        kind: "ice",
        // A null candidate is the end of gathering; GRIDGO takes it as an empty one.
        candidate: candidate?.candidate ?? "",
        sdpMid: candidate?.sdpMid ?? null,
        sdpMLineIndex: candidate?.sdpMLineIndex ?? null,
      });
    });
    pc.addEventListener("iceconnectionstatechange", () => this.onIceState(pc.iceConnectionState));
    const stream = (await mediaDevices.getUserMedia({ audio: true, video: false })) as unknown as Stream;
    if (this.finished) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    this.stream = stream;
    for (const track of stream.getAudioTracks()) {
      track.enabled = !this.snapshot.muted;
      pc.addTrack(track, stream);
    }
  }

  private onIceState(state: string): void {
    if (this.finished) return;
    if (state === "connected" || state === "completed") {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      withInCall(this.runtime, (inCall) => inCall.stopRingback());
      this.set({ phase: "connected", connectedAt: this.snapshot.connectedAt ?? this.deps.now() });
    } else if (state === "disconnected") {
      if (this.snapshot.connectedAt) this.set({ phase: "reconnecting" });
      if (!this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => void this.hangUpWith("network_lost"), RECONNECT_GIVE_UP_MS);
      }
    } else if (state === "failed") {
      void this.hangUpWith("network_lost");
    }
  }

  private send(signal: api.CallSignalBody): void {
    const call = this.snapshot.call;
    if (!call) return;
    // One at a time and in order, so the offer always lands before its candidates.
    this.outbox = this.outbox.then(async () => {
      for (let attempt = 0; attempt < 3 && !this.finished; attempt += 1) {
        try {
          await this.deps.api.sendCallSignal(call.orderId, call.id, signal);
          return;
        } catch (error) {
          // Retrying the same clientId is safe; a refusal is not worth a second try.
          if (callRefusal(error) || (error instanceof api.ApiError && error.status < 500)) return;
        }
      }
    });
  }

  private async applySignals(signals: api.CallSignal[]): Promise<void> {
    const pc = this.pc;
    for (const signal of signals) {
      if (this.seenSignals.has(signal.id)) continue;
      if (signal.kind === "ice") {
        const init = { candidate: signal.candidate, sdpMid: signal.sdpMid, sdpMLineIndex: signal.sdpMLineIndex };
        if (!init.candidate) {
          this.seenSignals.add(signal.id);
          continue;
        }
        if (pc && this.remoteSet) await this.addIce(init);
        else this.pendingIce.push(init);
        this.seenSignals.add(signal.id);
        continue;
      }
      if (!pc) return; // Not ready for a description yet; read it again next poll.
      const { RTCSessionDescription } = this.runtime.webrtc;
      if (signal.kind === "answer" && this.snapshot.call?.mine && !this.remoteSet) {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: signal.sdp }));
        this.remoteSet = true;
      } else if (signal.kind === "offer" && !this.snapshot.call?.mine && !this.offerApplied) {
        this.offerApplied = true;
        await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: signal.sdp }));
        this.remoteSet = true;
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.send({ clientId: "answer_1", kind: "answer", sdp: answer.sdp });
      }
      this.seenSignals.add(signal.id);
      if (this.remoteSet) await this.flushIce();
    }
  }

  private async flushIce(): Promise<void> {
    const queued = this.pendingIce;
    this.pendingIce = [];
    for (const init of queued) await this.addIce(init);
  }

  private async addIce(init: IceCandidateInit): Promise<void> {
    const { RTCIceCandidate } = this.runtime.webrtc;
    await this.pc?.addIceCandidate(new RTCIceCandidate(init)).catch(() => undefined);
  }

  /* ---------------------------------------------------------- state and lease */

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => void this.poll(), CALL_POLL_MS);
  }

  private async poll(): Promise<void> {
    const call = this.snapshot.call;
    if (!call || this.finished) return;
    if (this.polling) {
      this.pollAgain = true;
      return;
    }
    this.polling = true;
    try {
      // The callee reads the call alone until it has a peer: its offer waits for accept.
      if (!call.mine && !this.pc) {
        this.onState(await this.deps.api.getCall(call.orderId, call.id));
      } else {
        const result = await this.deps.api.getCallSignals(call.orderId, call.id, this.cursor);
        if (result.call) this.onState(result.call);
        if (!this.finished) {
          await this.applySignals(result.signals);
          // A description read before its peer existed is read again; applied ones are skipped by id.
          if (result.signals.every((signal) => this.seenSignals.has(signal.id))) this.cursor = result.cursor;
        }
      }
      this.failingSince = null;
    } catch (error) {
      await this.onPollFailure(error);
    } finally {
      this.polling = false;
      this.checkLease();
      if (this.pollAgain && !this.finished) {
        this.pollAgain = false;
        void this.poll();
      }
    }
  }

  private onState(call: OrderCall): void {
    if (this.finished) return;
    const was = this.snapshot.call?.state;
    this.adopt(call);
    if (isTerminal(call.state)) {
      this.finish(endReasonFor(call));
      return;
    }
    if (call.state === "ringing" && !call.mine && Date.parse(call.ringExpiresAt) <= this.deps.now()) {
      // GRIDGO will call it missed on its next sweep; this phone stops ringing now.
      this.finish("missed");
      return;
    }
    if (call.state === "accepted" && was === "ringing" && call.mine) {
      withInCall(this.runtime, (inCall) => inCall.stopRingback());
      if (this.snapshot.phase === "ringing") this.set({ phase: "connecting" });
      this.startHeartbeat();
    }
  }

  private async onPollFailure(error: unknown): Promise<void> {
    const refusal = callRefusal(error);
    if (refusal) return this.settleAfterRefusal(error);
    const now = this.deps.now();
    this.failingSince ??= now;
    const call = this.snapshot.call;
    // Once accepted, the audio path speaks for itself (ICE state) and the lease decides.
    if (call?.state === "ringing" && now - this.failingSince >= RING_OFFLINE_GIVE_UP_MS) {
      await this.hangUpWith("network_lost");
    }
  }

  /** A request was refused: read what the call became, and end on that. */
  private async settleAfterRefusal(error: unknown): Promise<void> {
    const call = this.snapshot.call;
    const refusal = callRefusal(error);
    if (call && refusal !== "gone") {
      try {
        const fresh = await this.deps.api.getCall(call.orderId, call.id);
        this.adopt(fresh);
        if (isTerminal(fresh.state)) return this.finish(endReasonFor(fresh));
      } catch {
        // Gone or unreachable: fail closed below.
      }
    }
    this.finish(refusal === "not_available" || refusal === "gone" ? "not_available" : this.snapshot.connectedAt ? "ended" : "failed");
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.leaseExpiresAt = this.deps.now() + CALL_LEASE_MS;
    this.heartbeatTimer = setInterval(() => void this.beat(), CALL_HEARTBEAT_MS);
  }

  private async beat(): Promise<void> {
    const call = this.snapshot.call;
    if (!call || this.finished) return;
    try {
      const renewed = await this.deps.api.callAction(call.orderId, call.id, "heartbeat");
      // This phone's own clock: GRIDGO's timestamps may disagree with it by minutes.
      this.leaseExpiresAt = this.deps.now() + CALL_LEASE_MS;
      this.onState(renewed);
    } catch (error) {
      if (callRefusal(error)) await this.settleAfterRefusal(error);
    }
    this.checkLease();
  }

  /** No renewal before the lease ran out: GRIDGO has ended it, so stop the audio here too. */
  private checkLease(): void {
    if (this.finished || this.snapshot.call?.state !== "accepted" || this.leaseExpiresAt === null) return;
    if (this.deps.now() >= this.leaseExpiresAt) void this.hangUpWith("network_lost");
  }

  private async hangUpWith(reason: EndReason): Promise<void> {
    const call = this.snapshot.call;
    if (this.finished) return;
    this.finish(reason);
    if (!call) return;
    const action = call.state === "ringing" ? (call.mine ? "cancel" : "decline") : "end";
    await this.deps.api.callAction(call.orderId, call.id, action).catch(() => undefined);
  }

  /** Stop everything, once. */
  private finish(reason: EndReason, byMe = false): void {
    if (this.finished) return;
    this.finished = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.pollTimer = this.heartbeatTimer = null;
    this.reconnectTimer = null;
    for (const track of this.stream?.getTracks() ?? []) {
      try {
        track.stop();
      } catch {
        // Already stopped.
      }
    }
    this.stream = null;
    try {
      this.pc?.close();
    } catch {
      // Already closed.
    }
    this.pc = null;
    withInCall(this.runtime, (inCall) => {
      inCall.stopRingtone();
      inCall.stopRingback();
      inCall.setKeepScreenOn(false);
      inCall.stop();
    });
    const connectedAt = this.snapshot.connectedAt;
    this.set({
      phase: "ended",
      endReason: reason,
      endedByMe: byMe,
      durationMs: connectedAt ? this.deps.now() - connectedAt : null,
    });
  }

  get isFinished(): boolean {
    return this.finished;
  }
}

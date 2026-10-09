import { router, useLocalSearchParams } from "expo-router";
import {
  Lock,
  Mic,
  MicOff,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  PhoneOutgoing,
  Signal,
  Smartphone,
  Volume2,
  WifiOff,
  type LucideIcon,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, BackHandler, Linking, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CallAvatar } from "@/components/call/CallAvatar";
import { CallControl } from "@/components/call/CallControl";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { DOWNLOAD_PAGE_URL } from "@/lib/appUpdate";
import { openMicSettings } from "@/lib/microphone";
import {
  CALLS_NEED_APP,
  endCopy,
  formatCallDuration,
  phaseLabel,
  spokenDuration,
  type CallPhase,
  type EndReason,
} from "@/lib/orderCall";
import { pickupChatHref } from "@/lib/pickupChat";
import { useCall } from "@/store/call";

/** How long "Call ended · 2:31" stays up after the shop hangs up a connected call. */
const ENDED_BY_ME_HOLD_MS = 1500;

/** One call screen at a time: a second push of this route steps aside. */
let mountedScreens = 0;

/**
 * A call with the rider collecting a job, from first ring to end reason.
 *
 * Opened three ways: the shop taps Call (`mode=start`), a rider's call rings
 * while the app is open (`hooks/useIncomingCallScreen`), or the shop taps the
 * `order_call_incoming` push (`mode=incoming`). The screen holds no call
 * logic — `store/call.ts` owns the one live session — and it never lets the
 * shop leave with a microphone open: the red button is the way out until the
 * call has ended.
 */
export default function CallScreen() {
  const params = useLocalSearchParams<{ orderId?: string; mode?: string; name?: string }>();
  const orderId = typeof params.orderId === "string" ? params.orderId : "";
  const mode = params.mode === "incoming" ? "incoming" : "start";
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const snapshot = useCall((s) => (s.snapshot?.orderId === orderId ? s.snapshot : null));
  const mic = useCall((s) => s.mic);
  // An incoming push is checked against GRIDGO before anything rings, unless the call is already up.
  const [checking, setChecking] = useState(() => {
    const current = useCall.getState().snapshot;
    return mode === "incoming" && !(current && current.orderId === orderId && current.phase !== "ended");
  });
  const leaving = useRef(false);

  function leave() {
    if (leaving.current) return;
    leaving.current = true;
    if (router.canGoBack()) router.back();
    else router.replace(orderId ? { pathname: "/job/[id]", params: { id: orderId } } : "/(tabs)/home");
  }

  // Register, start or find the call. Runs once per screen.
  useEffect(() => {
    mountedScreens += 1;
    if (mountedScreens > 1) {
      // The call is already on screen beneath (a tapped push for the call that is ringing).
      leaving.current = true;
      router.back();
      return () => {
        mountedScreens -= 1;
      };
    }
    useCall.getState().setScreenOpen(true);
    const store = useCall.getState();
    const current = store.snapshot;
    const liveHere = current && current.orderId === orderId && current.phase !== "ended";
    if (!liveHere) {
      if (mode === "start" && orderId) {
        store.clear();
        void store.start(orderId, typeof params.name === "string" ? params.name : null);
      } else if (mode === "incoming" && orderId) {
        void store.checkIncoming(orderId).then((ringing) => {
          setChecking(false);
          // A stale or duplicate push: the job says what was missed and offers to call back.
          if (!ringing && !useCall.getState().snapshot) {
            leaving.current = true;
            router.replace({ pathname: "/job/[id]", params: { id: orderId } });
          }
        });
      }
    }
    return () => {
      mountedScreens -= 1;
      useCall.getState().setScreenOpen(false);
      useCall.getState().clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phase: CallPhase | "checking" = snapshot?.phase ?? (checking || mode === "start" ? "checking" : "ended");
  const live = phase !== "ended" && phase !== "permission" && phase !== "unsupported" && phase !== "checking";

  // Android's back key never drops a live call; the red button does.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => live);
    return () => sub.remove();
  }, [live]);

  // Say each change of state to a screen reader, as a sighted shop sees it.
  useEffect(() => {
    if (!snapshot) return;
    const words =
      snapshot.phase === "ended" && snapshot.endReason
        ? endCopy(snapshot.endReason, snapshot.otherName).title
        : phaseLabel(snapshot.phase);
    AccessibilityInfo.announceForAccessibility(words);
  }, [snapshot?.phase, snapshot?.endReason, snapshot?.otherName, snapshot]);

  // The shop's own hang-up or decline closes the screen; anything else stays to be read.
  useEffect(() => {
    if (snapshot?.phase !== "ended" || !snapshot.endedByMe) return;
    if (snapshot.endReason !== "ended") {
      leave();
      return;
    }
    const timer = setTimeout(leave, ENDED_BY_ME_HOLD_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.phase, snapshot?.endedByMe, snapshot?.endReason]);

  const name = snapshot?.otherName ?? (typeof params.name === "string" && params.name ? params.name : "the rider");
  const displayName = name === "the rider" ? "Rider" : name;
  const ringing = phase === "calling" || phase === "ringing" || phase === "incoming";

  return (
    <View
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
      testID="call-screen"
    >
      <ScrollView className="flex-1" contentContainerClassName="flex-grow px-4" bounces={false}>
        <View className="flex-row items-center justify-center gap-1.5 py-2">
          <Lock size={13} color={colors.textMuted} strokeWidth={2} aria-hidden />
          <Text className="text-caption text-text-muted">Internet call. Your number stays private.</Text>
        </View>

        <View className="flex-1 items-center justify-center py-4">
          <CallAvatar name={displayName} ringing={ringing} dimmed={phase === "ended"} />
          <Text className="mt-2 text-center text-h1 text-text-primary" accessibilityRole="header">
            {displayName}
          </Text>
          <Text className="mt-1 text-center text-body text-text-secondary">Rider collecting this job</Text>
          <View className="mt-4 min-h-8 items-center" accessibilityLiveRegion="polite">
            {snapshot ? <CallStatus phase={snapshot.phase} connectedAt={snapshot.connectedAt} endReason={snapshot.endReason} name={displayName} durationMs={snapshot.durationMs} /> : null}
          </View>
        </View>

        <View className="gap-4 pb-2">
          {phase === "permission" ? (
            <PermissionPanel
              name={displayName}
              blocked={mic === "blocked"}
              onAllow={async () => {
                const next = await useCall.getState().askMic();
                if (next === "granted") await useCall.getState().start(orderId, snapshot?.otherName ?? null);
              }}
              onClose={leave}
            />
          ) : phase === "unsupported" ? (
            <Notice
              icon={Smartphone}
              title={CALLS_NEED_APP}
              body="This version of GRIDGO cannot place internet calls. Messages with the rider still work."
            >
              <PrimaryButton label="Open the download page" onPress={() => void Linking.openURL(DOWNLOAD_PAGE_URL).catch(() => undefined)} />
              <SecondaryButton label="Close" onPress={leave} />
            </Notice>
          ) : phase === "incoming" ? (
            <View className="gap-4">
              {mic !== "granted" ? (
                <Text className="text-center text-caption text-text-muted">
                  GRIDGO will ask to use your microphone when you answer. Calls are never recorded.
                </Text>
              ) : null}
              <View className="flex-row justify-around">
                <CallControl icon={PhoneOff} label="Decline" tone="end" onPress={() => void useCall.getState().decline()} testID="call-decline" />
                <CallControl icon={Phone} label="Accept" tone="accept" onPress={() => void useCall.getState().accept()} testID="call-accept" />
              </View>
            </View>
          ) : phase === "ended" ? (
            <EndedActions
              reason={snapshot?.endReason ?? "ended"}
              endedByMe={snapshot?.endedByMe ?? false}
              name={displayName}
              onCallAgain={() => void useCall.getState().start(orderId, snapshot?.otherName ?? null)}
              onMessage={() => {
                leaving.current = true;
                router.replace(pickupChatHref(orderId));
              }}
              onClose={leave}
            />
          ) : phase === "checking" ? null : (
            <View className="flex-row items-start justify-around">
              <CallControl
                icon={snapshot?.muted ? MicOff : Mic}
                label={snapshot?.muted ? "Muted" : "Mute"}
                on={snapshot?.muted ?? false}
                onPress={() => useCall.getState().toggleMute()}
                testID="call-mute"
              />
              <CallControl icon={PhoneOff} label="End call" tone="end" onPress={() => void useCall.getState().hangUp()} testID="call-end" />
              <CallControl
                icon={Volume2}
                label="Speaker"
                on={snapshot?.speaker ?? false}
                onPress={() => useCall.getState().toggleSpeaker()}
                testID="call-speaker"
              />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const PHASE_ICON: Record<Exclude<CallPhase, "ended" | "permission" | "unsupported">, LucideIcon> = {
  calling: PhoneOutgoing,
  ringing: PhoneOutgoing,
  incoming: PhoneIncoming,
  connecting: Signal,
  connected: Signal,
  reconnecting: WifiOff,
};

const END_ICON: Record<EndReason, LucideIcon> = {
  declined: PhoneOff,
  no_answer: PhoneMissed,
  missed: PhoneMissed,
  ended: PhoneOff,
  cancelled: PhoneOff,
  network_lost: WifiOff,
  not_available: PhoneOff,
  too_many: PhoneOff,
  failed: WifiOff,
};

/** Icon, words and colour together: the line a shop glances at to know where the call is. */
function CallStatus({
  phase,
  connectedAt,
  endReason,
  name,
  durationMs,
}: {
  phase: CallPhase;
  connectedAt: number | null;
  endReason: EndReason | null;
  name: string;
  durationMs: number | null;
}) {
  const colors = useThemeColors();
  const elapsed = useElapsed(phase === "connected" || phase === "reconnecting" ? connectedAt : null);

  if (phase === "permission" || phase === "unsupported") return null;
  if (phase === "ended") {
    const copy = endCopy(endReason ?? "ended", name, durationMs ? formatCallDuration(durationMs) : null);
    const Icon = END_ICON[endReason ?? "ended"];
    const tone = endReason === "network_lost" || endReason === "failed" ? colors.warning : colors.textPrimary;
    return (
      <View className="items-center gap-2 px-4">
        <View className="flex-row items-center gap-2">
          <Icon size={18} color={tone} strokeWidth={2} aria-hidden />
          <Text className="text-h3 text-text-primary" testID="call-end-title">
            {copy.title}
          </Text>
        </View>
        <Text className="max-w-80 text-center text-body text-text-secondary">{copy.body}</Text>
      </View>
    );
  }
  const Icon = PHASE_ICON[phase];
  const tone = phase === "connected" ? colors.success : phase === "reconnecting" ? colors.warning : colors.textSecondary;
  const showTimer = phase === "connected" && elapsed !== null;
  return (
    <View className="flex-row items-center gap-2" testID="call-status">
      <Icon size={16} color={tone} strokeWidth={2} aria-hidden />
      {showTimer ? (
        <Text
          className="text-body-lg font-medium text-text-primary"
          style={{ fontVariant: ["tabular-nums"] }}
          accessibilityLabel={`Connected, ${spokenDuration(elapsed)}`}
        >
          {formatCallDuration(elapsed)}
        </Text>
      ) : (
        <Text className="text-body-lg text-text-secondary" style={phase === "reconnecting" ? { color: tone } : undefined}>
          {phaseLabel(phase)}
        </Text>
      )}
    </View>
  );
}

/** Milliseconds since `since`, ticking each second; null while there is no start. */
function useElapsed(since: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return since === null ? null : Math.max(0, now - since);
}

function Notice({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <View className="gg-card gap-4">
      <View className="flex-row gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-pill bg-surface-variant">
          <Icon size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-body-lg font-medium text-text-primary">{title}</Text>
          <Text className="text-body text-text-secondary">{body}</Text>
        </View>
      </View>
      <View className="gap-3">{children}</View>
    </View>
  );
}

function PermissionPanel({
  name,
  blocked,
  onAllow,
  onClose,
}: {
  name: string;
  blocked: boolean;
  onAllow: () => Promise<void>;
  onClose: () => void;
}) {
  return (
    <Notice
      icon={blocked ? MicOff : Mic}
      title={blocked ? "Microphone is off for GRIDGO" : "Allow the microphone for calls"}
      body={
        blocked
          ? "Your phone is blocking it, so calls cannot start. Turn on the microphone for GRIDGO in your phone's settings, then come back."
          : `GRIDGO uses your microphone only while you are on a call with ${name}. Calls go over mobile data or Wi-Fi and are never recorded.`
      }
    >
      {blocked ? (
        <PrimaryButton label="Open phone settings" onPress={openMicSettings} />
      ) : (
        <PrimaryButton label="Allow microphone" onPress={() => void onAllow()} />
      )}
      <SecondaryButton label="Not now" onPress={onClose} />
    </Notice>
  );
}

function EndedActions({
  reason,
  endedByMe,
  name,
  onCallAgain,
  onMessage,
  onClose,
}: {
  reason: EndReason;
  endedByMe: boolean;
  name: string;
  onCallAgain: () => void;
  onMessage: () => void;
  onClose: () => void;
}) {
  // A call the shop just ended itself closes in a moment; nothing to choose.
  if (endedByMe) return null;
  const copy = endCopy(reason, name);
  const messageLabel = name === "Rider" ? "Message the rider" : `Message ${name}`;
  return (
    <View className="gap-3">
      {copy.canCallAgain ? (
        <PrimaryButton label={reason === "missed" ? "Call back" : "Call again"} onPress={onCallAgain} />
      ) : null}
      <SecondaryButton label={messageLabel} onPress={onMessage} />
      <SecondaryButton label="Close" onPress={onClose} />
    </View>
  );
}

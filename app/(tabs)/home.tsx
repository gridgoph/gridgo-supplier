import { useReadVersion } from "@/hooks/useReadVersion";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { usePhotoLinkRefresh } from "@/hooks/usePhotoLinkRefresh";
import { useUser } from "@clerk/expo";
import { useTourAutoStart, useTourScreen } from "@/hooks/useTourScreen";
import { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { ChevronDown, ChevronRight, Zap } from "lucide-react-native";
import { router, useFocusEffect, type Href } from "expo-router";

import { AlertsBell } from "@/components/AlertsBell";
import { ChatButton } from "@/components/ChatButton";
import { EmptyState } from "@/components/EmptyState";
import { ExpressJobCard } from "@/components/express/ExpressJobCard";
import { HomeTesterSlot } from "@/components/HomeTesterSlot";
import { SamplePhoto } from "@/components/SamplePhoto";
import { SchedulingNotice } from "@/components/SchedulingNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { LinkPill } from "@/components/LinkPill";
import { LegalNoticeCard } from "@/components/legal/LegalNoticeCard";
import { PushEnableCard } from "@/components/PushEnableCard";
import { SetupResumeCard } from "@/components/signup/SetupResumeCard";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SecondaryButton } from "@/components/SecondaryButton";
import { ShopNotReadyCard, ShopReadyLine, ShopSetupGaps } from "@/components/ShopReadiness";
import { SkeletonBlock } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { GroupOrderChip } from "@/components/GroupOrderChip";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TodoRow } from "@/components/TodoRow";
import { TourTarget } from "@/components/TourTarget";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { clerkDisplayName } from "@/lib/clerk";
import { buildTodo, greeting, homeHeadline, type Obligation } from "@/lib/homeBoard";
import { quickAction, todoTitle } from "@/lib/todo";
import { boardCountLine, boardPrompt, photoViewUrl, type Listing, type ServiceLine } from "@/lib/listings";
import { loadBoard } from "@/lib/listingsApi";
import { isTightBeforeAccepting } from "@/lib/scheduling";
import { statusPillLabel } from "@/lib/shopStatus";
import { useAlertsStore } from "@/store/alerts";
import { canRunShop, isMatchable, isShopStaff, useSession } from "@/store/session";
import { useGuidedSignup } from "@/store/guidedSignup";
import { setupComplete } from "@/lib/guidedSignup";
import { VerifyNoticeCard } from "@/components/verify/VerifyNoticeCard";
import { useShopVerification } from "@/hooks/useShopVerification";
import { missingPapers, todoVerifyNotice } from "@/lib/shopVerification";
import { useVerifyOffer } from "@/store/verifyOffer";
import { usePlayOptIn } from "@/store/playOptIn";
import { useShopStatus } from "@/store/shopStatus";
import { useTesterProgram } from "@/store/testerProgram";
import { loadServiceLines } from "@/hooks/useBoard";
import { loadReadiness } from "@/hooks/useReadiness";
import type { Readiness } from "@/lib/readiness";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import { expressGroup } from "@/lib/expressOrder";

type QuietRead = { loading: boolean; error: string | null };

/**
 * To do: the floor at a glance (gridgo-supplier#269).
 *
 * A count of what needs the shop, then the work in the order it should be
 * done: Express cards on top — a five-minute offer to accept, or an accepted
 * job to mark ready — then every other job as a row whose next step (Ready,
 * Code, Photos) is a button on the row. All jobs and Schedule open from here.
 *
 * The Owner's figure — the shop's own money that has stopped moving, see
 * `lib/homeBoard` — sits under the work as one line into Money. Staff work the
 * same screen without it, and without the board, readiness or team cards,
 * which are the Owner's.
 */
export default function HomeScreen() {
  const { user, refresh } = useSession();
  const staff = isShopStaff(user);
  const { user: clerkUser } = useUser();
  const colors = useThemeColors();
  const refreshAlerts = useAlertsStore((s) => s.refresh);
  const [jobs, setJobs] = useState<api.Order[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [services, setServices] = useState<ServiceLine[]>([]);
  const [boardTotal, setBoardTotal] = useState<number | undefined>(undefined);
  // GRIDGO's matching verdict. Null on an API that predates it: Home then
  // draws exactly what it drew before.
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  // False while GRIDGO has no board routes: nothing to nag a shop about.
  const [boardOpen, setBoardOpen] = useState(false);
  // Optional failures stay with their own read, never the floor's error.
  // They remain quiet: the board is absent and the bell keeps its last count.
  const [boardRead, setBoardRead] = useState<QuietRead>({ loading: false, error: null });
  const [alertsRead, setAlertsRead] = useState<QuietRead>({ loading: false, error: null });
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // People who joined the team and wait on the Owner's answer.
  const [joining, setJoining] = useState<string[]>([]);
  const waitingOnOps = !isMatchable(user);

  /**
   * The board rides along with the floor.
   *
   * It is a second, quieter question — is there anything for a client to
   * choose? — and it must never delay or break the first one, so it is loaded
   * beside the jobs and its failures are simply an absent card rather than an
   * error on a screen about work.
   */
  const loadBoardQuietly = useCallback(async (current: () => boolean) => {
    setBoardRead({ loading: true, error: null });
    try {
      const [board, lines, verdict] = await Promise.all([
        loadBoard(),
        loadServiceLines(),
        loadReadiness(),
      ]);
      if (!current()) return;
      setServices(lines);
      setListings(board.status === "ok" ? board.value.listings : []);
      setBoardTotal(board.status === "ok" ? board.value.total : undefined);
      setBoardOpen(board.status === "ok");
      setBoardRead({ loading: false, error: board.status === "failed" ? board.message : null });
      // Keep the last verdict through a failed read rather than blanking it.
      if (verdict) setReadiness(verdict);
    } catch (e) {
      if (!current()) return;
      setBoardOpen(false);
      setBoardRead({
        loading: false,
        error: humanizeApiError(e, offlineMessage("load your board")),
      });
    }
  }, []);

  const loadAlertsQuietly = useCallback(async (current: () => boolean) => {
    setAlertsRead({ loading: true, error: null });
    try {
      await refreshAlerts();
      if (current()) setAlertsRead({ loading: false, error: null });
    } catch (e) {
      if (!current()) return;
      setAlertsRead({
        loading: false,
        error: humanizeApiError(e, offlineMessage("load your alerts")),
      });
    }
  }, [refreshAlerts]);

  const beginRead = useReadVersion();
  const loadJoining = useCallback(async (current: () => boolean) => {
    try {
      const { members } = await api.getShopTeam();
      if (current()) setJoining(members.filter((m) => m.status === "pending").map((m) => m.name));
    } catch {
      // A quiet extra: the Team screen still lists them.
    }
  }, []);
  const reload = useCallback(async () => {
    const current = beginRead();
    // The board, readiness and team are the Owner's; GRIDGO refuses them to Staff.
    if (!staff) void loadJoining(current);
    const boardTask = staff ? Promise.resolve() : loadBoardQuietly(current);
    if (waitingOnOps) {
      await Promise.all([refresh(), boardTask]);
      return;
    }
    const alertsTask = loadAlertsQuietly(current);
    setLoading(true);
    try {
      const list = await api.listJobs();
      if (!current()) return;
      setJobs(list);
      setError(null);
      setLoaded(true);
    } catch (e) {
      if (!current()) return;
      setError(humanizeApiError(e, offlineMessage("load your floor")));
    } finally {
      if (current()) setLoading(false);
      // Publish the floor first, but keep reload pending for refresh/SSE
      // serialization until the optional work has also settled.
      await Promise.all([boardTask, alertsTask]);
    }
  }, [beginRead, loadBoardQuietly, loadAlertsQuietly, loadJoining, refresh, waitingOnOps, staff]);

  useLiveRefresh(["jobs", "orders", "payouts", "identity", "approvals", "catalog", "services", "availability"], reload);
  // The board strip's photo links expire in five minutes; a resume re-reads
  // only the board, not the floor.
  const beginBoardRead = useReadVersion();
  usePhotoLinkRefresh(boardOpen ? listings : null, () => loadBoardQuietly(beginBoardRead()));

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  // The status pill's answer, shared with My shop and the status sheet.
  const shopStatus = useShopStatus((s) => s.status);
  useFocusEffect(
    useCallback(() => {
      void useShopStatus.getState().load();
    }, []),
  );

  /*
    A Google Play tester's open is the day's check-in, and so is coming back
    to the app on a new day. Nothing at all for an account that is not
    enrolled (`lib/testerProgram.ts`). The Play opt-in read beside it is
    also this install's report to GRIDGO: a Play build that reads it is
    counted as a tester, and an APK shop GRIDGO wants asked gets the card
    (`lib/playOptIn.ts`).
  */
  useFocusEffect(
    useCallback(() => {
      const userId = useSession.getState().user?.id ?? null;
      // The opt-in read first: a Play build's report is what enrols it, so
      // the tester read after it sees today's run.
      void usePlayOptIn.getState().load(userId).finally(() => useTesterProgram.getState().load(userId));
    }, []),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      const userId = useSession.getState().user?.id ?? null;
      // The opt-in read first: a Play build's report is what enrols it, so
      // the tester read after it sees today's run.
      void usePlayOptIn.getState().load(userId).finally(() => useTesterProgram.getState().load(userId));
    });
    return () => subscription.remove();
  }, []);

  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const firstLoad = loading && !loaded;
  const verification = useShopVerification();
  const verifyNotice = verification.read ? todoVerifyNotice(verification.read.verification, missingPapers(verification.read.files)) : null;
  // Sign-up's last, skippable step: Get verified opens once over To do.
  const offerVerify = useVerifyOffer((st) => st.open);
  useEffect(() => {
    if (!offerVerify || !verification.read || verification.read.verification.verified) return;
    useVerifyOffer.getState().consume();
    router.push("/verify?first=1" as Href);
  }, [offerVerify, verification.read]);

  const headline = homeHeadline(jobs);
  const todo = buildTodo(jobs);
  // With an Express card on top, the card owns the yellow; otherwise the first
  // obligation still gets the card and the action it always had.
  const first: Obligation | undefined = todo.express.length ? undefined : todo.after[0];
  const rest = todo.express.length ? todo.after : todo.after.slice(1);
  const thingsToDo = todo.express.length + todo.after.length;
  /*
    The first-run tour starts here, once, for a shop with no job on its books
    (`lib/tour.ts`). A shop still with Operations has none by definition. Its
    Home step lights the Jobs tab, so the floor only has to have arrived.
  */
  useTourScreen("home", waitingOnOps || !firstLoad);
  // Not over a half-finished sign-up: its card is the one thing to do first.
  const guided = useGuidedSignup((st) => st.signup);
  const shopRead = useGuidedSignup((st) => st.shopRead);
  // The tour waits until GRIDGO has said whether guided setup is finished:
  // a shop mid-way through it is shown the setup card, not a tour of a floor
  // it cannot use yet.
  const setupPending =
    (canRunShop(user) && !shopRead) || Boolean(guided?.supplierId && !setupComplete(guided));
  useTourAutoStart(!setupPending && (waitingOnOps || (loaded && !error && jobs.length === 0)));

  const board = boardOpen ? boardPrompt(listings, services, !waitingOnOps) : null;
  const needsBoardWork = board != null && board.kind !== "ready";
  /*
    Ready or not is GRIDGO's matching verdict and nothing else — never the
    approval checklist, never setup completion. A shop whose listings match
    must not read "Not ready" (gridgoph/gridgo-supplier#100).
  */
  const notReady = readiness != null && !readiness.ready;
  const listingNames = Object.fromEntries(listings.map((l) => [l.id, l.name]));

  function openJob(orderId: string) {
    router.push({ pathname: "/job/[id]", params: { id: orderId } });
  }

  function open(obligation: Obligation) {
    router.push({
      pathname: obligation.route,
      params: obligation.actionKind
        ? { id: obligation.orderId, action: obligation.actionKind }
        : { id: obligation.orderId },
    });
  }

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-10"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textMuted}
          />
        }
      >
        {/*
          The mark is not here on purpose. A shop on its own floor knows whose
          app this is; what it does not know is what today looks like. So the
          header carries the shop's own name, and the corner carries the inbox.
          The lockup lives at the door: sign-in, onboarding, accreditation.

          What used to sit in that corner was a chip counting today's jobs. It
          was not alerts and it read as alerts, which is the worst of both — so
          the corner is now a real bell, on this masthead and every other one in
          the bar. What is due and what is late is said properly below, on the
          obligations this screen is built around, and again on Schedule.
        */}
        <ScreenHeader
          eyebrow={greeting(clerkDisplayName(clerkUser) || user?.name)}
          title={
            waitingOnOps || !loaded ? user?.supplierName || "Your shop" : todoTitle(thingsToDo)
          }
          right={
            <View className="flex-row items-center gap-1" accessibilityState={{ busy: alertsRead.loading }}>
              <ThemeToggle />
              {staff ? null : <ChatButton />}
              <AlertsBell />
            </View>
          }
        />

        {/*
          The status pill (gridgo-supplier#267): what clients can send this
          shop right now, in a few words, opening the status sheet. It replaced
          the old "Express on" pill that sent a shop to Products to find a
          switch. Staff see it too; the sheet holds its controls still for them.
        */}
        {shopStatus ? (
          <Pressable
            onPress={() => router.push("/shop-status" as Href)}
            accessibilityRole="button"
            accessibilityLabel={`${statusPillLabel(shopStatus, new Date())}. Open shop status.`}
            className="gg-touch mb-4 flex-row items-center gap-1.5 self-start rounded-pill border border-outline bg-surface px-3"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            testID="shop-status-pill"
          >
            <Zap size={14} color={shopStatus.expressEnabled ? colors.info : colors.textMuted} strokeWidth={2.25} />
            <Text className="text-caption font-medium text-text-primary">
              {statusPillLabel(shopStatus, new Date())}
            </Text>
            <ChevronDown size={14} color={colors.textMuted} aria-hidden />
          </Pressable>
        ) : null}

        {/*
          An editorial change to a legal document: read once, never asked to
          agree to. Under the masthead because it is rare and closes for good
          with one tap; it draws nothing once seen on this phone.
        */}
        <LegalNoticeCard className="mb-4" />

        {/* Guided sign-up left mid-way (gridgo-supplier#265). Owner or Manager only. */}
        <SetupResumeCard enabled={canRunShop(user)} />

        {joining.length ? (
          <Pressable
            onPress={() => router.push("/team")}
            accessibilityRole="button"
            accessibilityLabel={`${joinLine(joining)}. Open your team.`}
            className="gg-card mb-4 flex-row items-center gap-3"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <View className="min-w-0 flex-1 gap-1">
              <StatusChip tone="warning" icon="clock" label="Waiting" />
              <Text className="text-body font-medium text-text-primary" numberOfLines={2}>
                {joinLine(joining)}
              </Text>
            </View>
            <ChevronRight size={20} color={colors.textMuted} aria-hidden />
          </Pressable>
        ) : null}

        {/*
          Shaped to the screen that replaces it — the figure, the card with its
          action, two rows — so the floor does not grow under the shop's thumb
          the moment it lands.
        */}
        {waitingOnOps && notReady && readiness ? (
          <View className="mt-2">
            {/*
              A shop with Operations sees its whole list, approval included,
              instead of a single "being reviewed": what it can do while it
              waits is usually a listing, and the list says which one.
            */}
            <ShopNotReadyCard
              readiness={readiness}
              listingNames={listingNames}
              listingCount={boardTotal}
              takesYellow
            />
            <View className="mt-4">
              <ShopSetupGaps readiness={readiness} />
            </View>
            <HomeTesterSlot className="mt-6" />
            <PushEnableCard spacing="above" />
          </View>
        ) : null}

        {waitingOnOps && !notReady ? (
          <View className="mt-2">
            <EmptyState
              title="Operations is reviewing your shop"
              body="The floor stays empty until they approve."
              actionLabel="Open accreditation"
              onAction={() => router.push("/accreditation")}
              {...(board
                ? {
                    secondaryLabel: "Build your board while you wait",
                    onSecondary: () => router.push("/(tabs)/catalogues"),
                  }
                : {})}
            />
            {/*
              Operations' answer is the notification a waiting shop most wants
              with GRIDGO closed. Draws nothing once the phone allows them.
            */}
            <HomeTesterSlot className="mt-6" />
            <PushEnableCard spacing="above" />
          </View>
        ) : null}

        {firstLoad && !waitingOnOps ? (
          <View accessibilityRole="progressbar" accessibilityLabel="Loading your floor">
            <View className="gg-card gap-2">
              <SkeletonBlock className="h-4 w-40" />
              <SkeletonBlock className="h-10 w-2/3" />
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-4/5" />
            </View>
            <View className="mt-6 gap-2">
              <SkeletonBlock className="h-4 w-16" />
              <View className="gg-card gap-5">
                <View className="gap-3">
                  <View className="flex-row items-center justify-between gap-3">
                    <SkeletonBlock className="h-4 w-28" />
                    <SkeletonBlock className="h-6 w-24 rounded-pill" />
                  </View>
                  <SkeletonBlock className="h-7 w-3/4" />
                  <SkeletonBlock className="h-5 w-2/3" />
                </View>
                <SkeletonBlock className="h-11 w-full" />
              </View>
              <SkeletonBlock className="h-16 w-full rounded-card" />
              <SkeletonBlock className="h-16 w-full rounded-card" />
            </View>
          </View>
        ) : null}

        {error && !loaded && !waitingOnOps ? (
          <EmptyState
            title="Your floor is not reachable"
            body={error}
            actionLabel="Try again"
            onAction={() => void reload()}
          />
        ) : null}

        {!waitingOnOps && !firstLoad && !(error && !loaded) ? (
          <>
            {/*
              Above the figure: a shop GRIDGO cannot match is not getting new
              work, which outranks how much money is waiting. The yellow stays
              with the day's work when there is any.
            */}
            {/*
              Getting verified (report F318781A): short, and only for the
              Owner. A countdown appears only in the last seven days.
              Above Not ready: when new orders pause, this card says why
              and what is owed, which GRIDGO's matching steps do not.
            */}
            {verifyNotice ? (
              <View className="mb-6">
                <VerifyNoticeCard notice={verifyNotice} testID="todo-verify-card" />
              </View>
            ) : null}
            {notReady && readiness ? (
              <View className="mb-6">
                <ShopNotReadyCard
                  readiness={readiness}
                  listingNames={listingNames}
                  listingCount={boardTotal}
                  takesYellow={!first}
                />
              </View>
            ) : null}
            {todo.express.length ? (
              <View className="gap-3" testID="express-cards">
                {todo.express.map((job) => (
                  <ExpressJobCard key={job.id} job={job} reload={reload} staff={staff} />
                ))}
              </View>
            ) : null}

            {first || rest.length ? (
              <View className={todo.express.length ? "mt-6 gap-2" : "gap-2"}>
                <Text className="text-body font-medium text-text-secondary">
                  {todo.express.length ? "After that" : "Today"}
                </Text>
                {first ? (
                  <NextCard
                    obligation={first}
                    job={jobs.find((job) => job.id === first.orderId)}
                    hideMoney={staff}
                    onPress={() => open(first)}
                  />
                ) : null}
                {rest.map((obligation) => {
                  const job = jobs.find((row) => row.id === obligation.orderId);
                  const quick = job ? quickAction(job) : null;
                  return (
                    <TodoRow
                      key={obligation.id}
                      obligation={obligation}
                      job={job}
                      quick={quick}
                      hideMoney={staff}
                      onOpen={() => openJob(obligation.orderId)}
                      onQuick={() =>
                        quick &&
                        router.push({
                          pathname: quick.route,
                          params: { id: obligation.orderId, action: quick.kind },
                        })
                      }
                    />
                  );
                })}
              </View>
            ) : !todo.express.length ? (
              <EmptyState
                title="Nothing to do right now"
                body="No job is waiting on you. A new one lands here with a sound, and Express jobs come first."
                {...(needsBoardWork || notReady || staff
                  ? {}
                  : {
                      secondaryLabel: "Open schedule",
                      onSecondary: () => router.push("/(tabs)/schedule"),
                    })}
              />
            ) : null}

            {/* Every job and the week, one tap from the floor. */}
            <View className="mt-4 flex-row flex-wrap gap-2">
              <TourTarget step="home.jobsTab">
                <LinkPill label="All jobs" onPress={() => router.push("/(tabs)/jobs")} testID="todo-all-jobs" />
              </TourTarget>
              {staff ? null : (
                <LinkPill label="Schedule" onPress={() => router.push("/(tabs)/schedule")} testID="todo-schedule" />
              )}
            </View>

            {/*
              The Owner's one figure: money that has stopped moving, as a line
              under the work rather than above it. Staff never see it.
            */}
            {staff ? null : (
              <Pressable
                onPress={() => router.push("/(tabs)/money")}
                accessibilityRole="button"
                accessibilityLabel={`${headline.label}: ${api.formatPhp(headline.amountMinor)}. Open Money.`}
                className="gg-touch mt-6 flex-row items-center gap-3 rounded-card bg-surface-variant px-4 py-3"
                style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
                testID="todo-money-line"
              >
                <View className="min-w-0 flex-1">
                  <Text className="text-caption text-text-muted">{headline.label}</Text>
                  <Text className="text-h3 text-text-primary" numberOfLines={1} adjustsFontSizeToFit>
                    {api.formatPhp(headline.amountMinor)}
                  </Text>
                </View>
                <ChevronRight size={20} color={colors.textMuted} aria-hidden />
              </Pressable>
            )}

            {/*
              A Google Play tester's check-in sits under the day's work, never
              above it: one compact row that moves no job down the screen.
            */}
            <HomeTesterSlot className="mt-6" />

            {/*
              Under the day's work, above the board: the way back to phone
              notifications for a shop that said "Not now" to the explainer.
              Draws nothing once the phone allows them.
            */}
            <PushEnableCard spacing="above" />

            {/*
              While "Clients cannot be matched with your shop yet" is up, it
              already names every listing that needs work and the button for
              each, in GRIDGO's words. The older board card would say the same
              thing again below it from the phone's own checklist, so it is
              left out until the shop can be matched.
            */}
            {board && !(notReady && board.kind !== "ready") ? (
              <View className="mt-8 gap-2" accessibilityState={{ busy: boardRead.loading }}>
                <Text className="text-overline text-text-muted">YOUR BOARD</Text>
                {readiness?.ready ? <ShopReadyLine readiness={readiness} /> : null}
                {board.kind === "ready" ? (
                  <SampleStrip listings={listings} />
                ) : (
                  <BoardCard prompt={board} quiet={Boolean(first)} />
                )}
              </View>
            ) : null}

            {readiness ? (
              <View className="mt-6">
                <ShopSetupGaps readiness={readiness} />
              </View>
            ) : null}

            {error ? (
              <Text className="mt-4 text-caption text-text-muted">
                Last refresh did not reach GRIDGO, so these figures may be behind. Pull down to
                try again.
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

/**
 * The one thing to do next, with the screen's only yellow.
 *
 * It states the job, where the job stands, what is owed, and what pressing the
 * button commits the shop to — the same sentence the flow screen will repeat,
 * so nothing is a surprise on the other side of the tap.
 */
function NextCard({
  obligation,
  job,
  hideMoney,
  onPress,
}: {
  obligation: Obligation;
  job?: api.Order;
  hideMoney: boolean;
  onPress: () => void;
}) {
  return (
    <View className="gg-card gap-5">
      <View className="gap-3">
        {/*
          The overline and the state chip share a row only while both fit. A
          long state ("Client can still report") beside the long overline was
          pushed clean off the card, so the row wraps and the chip drops under
          the overline instead of being clipped.
        */}
        <View className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <Text className="shrink text-overline text-text-muted">
            {obligation.kind === "proof" ? "MONEY WAITING ON YOU" : "NEEDS YOU NEXT"}
          </Text>
          <StatusChip
            tone={obligation.status.tone}
            icon={obligation.status.icon}
            label={obligation.status.label}
          />
        </View>
        <Text className="text-h2 text-text-primary">{obligation.title}</Text>
        <GroupTag job={job} />
        {/* The same Tight badge the job screen shows: it is why the shop may decline. */}
        {job && isTightBeforeAccepting(job) ? <SchedulingNotice order={job} compact /> : null}
        {obligation.kind === "proof" && obligation.amountMinor != null && !hideMoney ? (
          <Text className="text-body-lg font-medium text-text-primary">
            {api.formatPhp(obligation.amountMinor)} waits on this photo
          </Text>
        ) : null}
        <Text className="text-body text-text-secondary">{obligation.detail}</Text>
        {obligation.urgency === "overdue" ? (
          <Text className="text-body font-medium text-error">Past the promised time</Text>
        ) : null}
      </View>
      <PrimaryButton label={obligation.actionLabel} onPress={onPress} />
    </View>
  );
}

/** A group order's tag under the title: the person at the counter collects every bundle. */
function GroupTag({ job }: { job?: api.Order }) {
  const group = job ? expressGroup(job) : null;
  return group ? (
    <View className="flex-row">
      <GroupOrderChip group={group} />
    </View>
  ) : null;
}

/**
 * The board, when it still needs something.
 *
 * It takes the screen's yellow only when the floor has no obligation to carry
 * it — a shop with a proof owed on a delivered job should not be pulled into
 * writing product copy, and two yellows on one screen means neither of them is
 * the next thing to do.
 */
function BoardCard({
  prompt,
  quiet,
}: {
  prompt: NonNullable<ReturnType<typeof boardPrompt>>;
  quiet: boolean;
}) {
  return (
    <View className="gg-card gap-3">
      <Text className="text-h3 text-text-primary">{prompt.title}</Text>
      <Text className="text-body text-text-secondary">{prompt.body}</Text>
      {quiet ? (
        <SecondaryButton label={prompt.actionLabel} onPress={() => router.push("/(tabs)/catalogues")} />
      ) : (
        <PrimaryButton label={prompt.actionLabel} onPress={() => router.push("/(tabs)/catalogues")} />
      )}
    </View>
  );
}

/**
 * The finished board, at a glance.
 *
 * Deliberately not a second ranking: it is the shop's own board order, cropped
 * to what fits on one row, and its only job is to be a door. The samples here
 * do not open the loupe — on web that would nest a button in this one. A shop
 * that wants to read its board opens its board.
 */
function SampleStrip({ listings }: { listings: Listing[] }) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={() => router.push("/(tabs)/catalogues")}
      accessibilityRole="button"
      accessibilityLabel={`Open your board. ${boardCountLine(listings.length)}.`}
      className="gg-card-flush px-3 py-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1 flex-row">
          {listings.slice(0, 4).map((listing) => (
            <View key={listing.id} className="w-1/4">
              <SamplePhoto
                fileId={listing.photos[0]?.fileId}
                url={photoViewUrl(listing.photos[0])}
                altText={listing.name}
                gutter="tight"
                emptyLabel=""
                enlarge={false}
              />
            </View>
          ))}
        </View>
        <ChevronRight size={20} color={colors.textMuted} aria-hidden />
      </View>
      <Text className="mt-2 text-caption text-text-muted">
        {listings.length === 1
          ? "1 listing on your board"
          : `${listings.length} listings on your board`}
      </Text>
    </Pressable>
  );
}

/** "Sam wants to join your team", or "Sam and 2 more want to join". */
function joinLine(names: string[]): string {
  if (names.length === 1) return `${names[0]} wants to join your team`;
  return `${names[0]} and ${names.length - 1} more want to join your team`;
}

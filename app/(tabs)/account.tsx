import { useUser } from "@clerk/expo";
import { ChevronRight } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Pressable } from "@/components/Pressable";
import { router, useFocusEffect, type Href } from "expo-router";

import { AlertsBell } from "@/components/AlertsBell";
import { ChatButton } from "@/components/ChatButton";
import { RenderGuard } from "@/components/RenderGuard";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SecondaryButton } from "@/components/SecondaryButton";
import { CheckProductsCard } from "@/components/myshop/CheckProductsCard";
import { ProductRail } from "@/components/myshop/ProductRail";
import { ShopSignCard } from "@/components/myshop/ShopSignCard";
import { StatusChip } from "@/components/StatusChip";
import { useBoard } from "@/hooks/useBoard";
import { useCheckProducts } from "@/hooks/useCheckProducts";
import { useReadiness } from "@/hooks/useReadiness";
import * as api from "@/lib/api";
import { clerkDisplayName } from "@/lib/clerk";
import { pendingCount, roleLabel } from "@/lib/shopTeam";
import { performanceHref } from "@/lib/performance";
import { standingLine } from "@/lib/reviews";
import { shopHoursSummary } from "@/lib/shopHours";
import { nightChipLabel, signOf } from "@/lib/shopStatus";
import { WHATS_NEW_HISTORY_COPY } from "@/lib/whatsNewHistory";
import { useThemeColors } from "@/hooks/useTheme";
import { askConfirm } from "@/store/sheets";
import { isMatchable, isShopManager, isShopStaff, isVerifiedShop, useSession, verifyLater } from "@/store/session";
import { useShopContact } from "@/store/shopContact";
import { useShopHours } from "@/store/shopHours";
import { useShopStatus } from "@/store/shopStatus";
import { useShopWorker } from "@/store/shopWorker";
import { useTour } from "@/store/tour";

/**
 * The shop's own account.
 *
 * Deliberately short. A screen that lists every setting at once is a screen
 * people scan instead of read, and almost nothing here is looked at twice a
 * year — so it leads with the two facts that change what the shop can do today
 * (who GRIDGO thinks it is, and that GRIDGO will match work to it) and puts
 * everything routine one clear tap away, grouped by what it is about.
 *
 * Recognition over recall: every destination says what is behind it in a line,
 * so a shop chooses from what it can see rather than remembering where a
 * setting lives. And the one action that undoes the session asks first — a
 * counter phone gets handed around, and signing out by accident on a Saturday
 * means finding a password on a Saturday.
 */
export default function AccountScreen() {
  const staff = useSession((s) => isShopStaff(s.user));
  return staff ? <StaffAccount /> : <OwnerAccount />;
}

/**
 * A Staff member's account: who they are, whose shop, and the way out.
 * Everything else on the Owner's account is the Owner's to change.
 */
function StaffAccount() {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const { user: clerkUser } = useUser();
  const lockPhone = useShopWorker((s) => s.lock);
  // On a shared shop phone the person is whoever picked themselves, not the login.
  const personName = user?.worker?.name || clerkDisplayName(clerkUser) || user?.name || "—";
  const shopStatus = useShopStatus((s) => s.status);
  const loadStatus = useShopStatus((s) => s.load);
  useFocusEffect(
    useCallback(() => {
      void loadStatus();
    }, [loadStatus]),
  );

  async function signOut() {
    const confirmed = await askConfirm({
      question: "Sign out of GRIDGO on this phone?",
      consequence: "New order alerts stop reaching this phone until you sign in again.",
      confirmLabel: "Sign out",
      cancelLabel: "Stay signed in",
      destructive: true,
    });
    if (confirmed) void logout();
  }

  return (
    <View className="gg-screen">
      <ScrollView className="flex-1" contentContainerClassName="gg-page pb-10" showsVerticalScrollIndicator={false}>
        <ScreenHeader title="My shop" right={<AlertsBell />} />
        <ShopSignCard
          shopName={user?.supplierName || "Your shop"}
          subtitle={personName}
          status={shopStatus}
          canChange={false}
          onSignPress={() => {}}
          verification={null}
        />
        {shopStatus ? null : <StatusLoadNote />}
        <View className="mt-3 flex-row">
          <StatusChip tone="neutral" icon="wrench" label={roleLabel(user?.shopRole)} />
        </View>
        {/* On the shop phone the login is the Owner's: its email is not the worker's. */}
        {user?.worker ? null : (
          <Text className="mt-2 text-caption text-text-muted" numberOfLines={1}>
            {clerkUser?.primaryEmailAddress?.emailAddress || user?.email || ""}
          </Text>
        )}

        <StaffShopRows />
        <View className="mt-6 gap-2">
          <DestinationRow
            title={WHATS_NEW_HISTORY_COPY.accountRow}
            detail={WHATS_NEW_HISTORY_COPY.accountCaption}
            onPress={() => router.push("/whats-new" as Href)}
          />
          <DestinationRow
            title="Settings"
            detail="Theme and the connection this app is using"
            onPress={() => router.push("/settings" as Href)}
          />
        </View>

        <View className="mt-8">
          {user?.worker ? (
            // Signing out here would end the shop phone's login for everyone.
            <SecondaryButton label="Switch person" onPress={() => void lockPhone()} />
          ) : (
            <SecondaryButton label="Sign out" onPress={() => void signOut()} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * The team, for everyone on it (report F315793B), and — for a Manager — the
 * hours and products a Manager runs. The Team row is drawn only once GRIDGO
 * has answered the team read: an older GRIDGO keeps the team to Owners, and a
 * row that opened a refusal would be a dead end.
 */
function StaffShopRows() {
  const manager = useSession((s) => isShopManager(s.user));
  const [team, setTeam] = useState<{ size: number; waiting: number } | null>(null);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      api
        .getShopTeam()
        .then((result) => {
          if (cancelled) return;
          setTeam({
            size: result.people.filter((person) => person.status === "active").length,
            waiting: manager ? result.people.filter((person) => person.status === "pending").length : 0,
          });
        })
        .catch(() => {
          if (!cancelled) setTeam(null);
        });
      return () => {
        cancelled = true;
      };
    }, [manager]),
  );
  if (!team && !manager) return null;
  return (
    <View className="mt-6 gap-2">
      <Text className="text-overline text-text-muted">YOUR SHOP</Text>
      {team ? (
        <DestinationRow
          title="Team"
          detail={team.waiting ? `${team.waiting} waiting for you` : `${team.size} people · this week's mission`}
          badge={team.waiting || undefined}
          onPress={() => router.push("/team" as Href)}
        />
      ) : null}
      {manager ? (
        <>
          <DestinationRow
            title="Products"
            detail="What clients see: samples and Express"
            onPress={() => router.push("/(tabs)/catalogues")}
          />
          <DestinationRow
            title="Shop hours & closures"
            detail="When you open, closure dates, and closing for a while"
            onPress={() => router.push("/shop-hours" as Href)}
          />
        </>
      ) : null}
    </View>
  );
}

function OwnerAccount() {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const refresh = useSession((s) => s.refresh);
  const { user: clerkUser } = useUser();
  const approved = isMatchable(user);
  // The card is the way into "Your shop details", so it names the shop's
  // contact person from there; the sign-in's own name is the fallback until
  // that record has been read (gridgo-supplier#217).
  const contactName = useShopContact((s) => s.contactName);
  const loadContact = useShopContact((s) => s.load);
  const personName = contactName || clerkDisplayName(clerkUser) || user?.name || "—";

  /*
   * Read the account again every time this screen comes back into view.
   *
   * The shop name on this card is GRIDGO's, and the screen that corrects it is
   * one tap away — so the moment a shop is most likely to look at this card is
   * the moment straight after changing it. Trusting whatever the session held
   * on the way out is how a shop renames itself, comes back, and finds the old
   * name still sitting here. The contact person is on the shop's own record,
   * so it is read alongside.
   */
  useFocusEffect(
    useCallback(() => {
      void refresh();
      void loadContact();
    }, [loadContact, refresh]),
  );

  /*
   * The shop's standing, read fresh with the account. It is the one line on
   * this screen that changes without the shop doing anything, and the row it
   * sits on is the only place a shop learns a new review has landed. A failed
   * read leaves the row's plain description; the number is a courtesy, not
   * a gate.
   */
  const [standing, setStanding] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!approved) return;
      let cancelled = false;
      api
        .getMyReviews()
        .then((mine) => {
          if (!cancelled) setStanding(standingLine(mine.summary, mine.ranking));
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [approved]),
  );

  // Who is on the team, and whether anyone waits on the Owner's answer.
  const [team, setTeam] = useState<{ size: number; waiting: number } | null>(null);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      api
        .getShopTeam()
        .then(({ members }) => {
          if (cancelled) return;
          setTeam({
            size: members.filter((m) => m.status === "active").length,
            waiting: pendingCount(members),
          });
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // Open now or not, on the row that changes it. A failed read keeps the plain description.
  const shopHours = useShopHours((s) => s.hours);
  const loadShopHours = useShopHours((s) => s.load);
  useFocusEffect(
    useCallback(() => {
      void loadShopHours();
    }, [loadShopHours]),
  );

  // The sign, the chips and the status sheet read one answer.
  const shopStatus = useShopStatus((s) => s.status);
  const loadStatus = useShopStatus((s) => s.load);
  const saveStatus = useShopStatus((s) => s.save);
  useFocusEffect(
    useCallback(() => {
      void loadStatus();
    }, [loadStatus]),
  );
  const [signFeedback, setSignFeedback] = useState<{ ok: boolean; message: string; undo?: boolean } | null>(null);

  // The first few products, with their standing, for the rail.
  const board = useBoard(PRODUCT_RAIL_QUERY);
  const { check: productCheck } = useCheckProducts();
  const { readiness } = useReadiness();

  const night = shopStatus ? nightChipLabel(shopStatus.nightJobs) : null;
  const hoursDetail = [
    shopHours ? shopHoursSummary(shopHours, new Date()) : "When you open, closure dates, and closing for a while",
    night,
  ]
    .filter(Boolean)
    .join(". ");

  async function changeStatus(patch: { temporarilyClosed: boolean } | { pause: null }) {
    setSignFeedback(null);
    const outcome = await saveStatus(patch);
    if (!outcome.message) return;
    setSignFeedback({
      ok: outcome.ok,
      message: outcome.message,
      undo: outcome.ok && "temporarilyClosed" in patch && patch.temporarilyClosed,
    });
  }

  /** The sign does what its word suggests; closing asks first. */
  async function pressSign() {
    if (!shopStatus) return;
    const sign = signOf(shopStatus, new Date());
    if (sign.action === "hours") {
      router.push("/shop-hours" as Href);
      return;
    }
    if (sign.action === "open") return changeStatus({ temporarilyClosed: false });
    if (sign.action === "resume") return changeStatus({ pause: null });
    const confirmed = await askConfirm({
      question: "Close your shop now?",
      consequence:
        "Clients cannot send you new jobs until you open it again. Jobs you already have still finish. To stop for a short while, pause from Shop status instead.",
      confirmLabel: "Close shop",
      cancelLabel: "Stay open",
      destructive: true,
    });
    if (confirmed) await changeStatus({ temporarilyClosed: true });
  }

  async function signOut() {
    const confirmed = await askConfirm({
      question: "Sign out of GRIDGO on this phone?",
      consequence:
        "Your jobs and earnings stay with GRIDGO. You will need your email and password to get back in, and no job alerts will reach this phone until you do.",
      confirmLabel: "Sign out",
      cancelLabel: "Stay signed in",
      destructive: true,
    });
    if (confirmed) void logout();
  }

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-10"
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          title="My shop"
          right={
            <View className="flex-row items-center">
              <ChatButton />
              <AlertsBell />
            </View>
          }
        />

        {/*
          Identity, whether the shop is open, and the chips that open the
          status sheet (gridgo-supplier#267). The shop's name still opens its
          details: this is where a shop reads its own name, so it is where a
          wrong one is noticed.
        */}
        <ShopSignCard
          shopName={user?.supplierName || "Your shop"}
          imageUrl={clerkUser?.imageUrl}
          subtitle={user?.shop?.label || personName}
          status={shopStatus}
          canChange
          onSignPress={() => void pressSign()}
          verification={{ approved: isVerifiedShop(user), verifyLater: verifyLater(user) }}
          onDetailsPress={() => router.push("/shop-details")}
        />
        {approved ? null : (
          <Text className="mt-2 text-caption text-text-muted">
            Operations is reviewing your shop. No job is matched until they approve.
          </Text>
        )}
        {shopStatus ? null : <StatusLoadNote />}
        {signFeedback ? (
          <View className="mt-3 flex-row items-center gap-3" accessibilityLiveRegion="polite">
            <Text
              className={signFeedback.ok ? "min-w-0 flex-1 text-body text-success" : "min-w-0 flex-1 text-body text-error"}
              testID="sign-feedback"
            >
              {signFeedback.message}
            </Text>
            {signFeedback.undo ? (
              <Pressable
                onPress={() => void changeStatus({ temporarilyClosed: false })}
                accessibilityRole="button"
                accessibilityLabel="Undo, open the shop again"
                className="gg-touch justify-center px-2"
              >
                <Text className="text-button text-text-primary underline">Undo</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/*
          Products are GRIDGO's data, drawn row by row; if they cannot be drawn
          at all, the rest of My shop still opens (issue report 8DC78D1F).
        */}
        <RenderGuard fallback={<ProductsUnavailable />}>
          {productCheck?.items.length ? (
            <View className="mt-6">
              <CheckProductsCard check={productCheck} />
            </View>
          ) : null}

          <View className="mt-6">
            <ProductRail
              listings={board.listings}
              total={board.total}
              services={board.services}
              readiness={readiness}
              shopApproved={approved}
              loading={board.loading}
              error={board.error}
            />
          </View>
        </RenderGuard>

        <View className="mt-6 gap-2">
          <Text className="text-overline text-text-muted">YOUR SHOP</Text>
          {/*
            The board leads because it is the only thing here a client ever
            sees, and it is first for a waiting shop too: accreditation needs a
            finished listing, so this is work that shortens the wait rather than
            work that follows it. What GRIDGO may send you — the accreditation
            — sits under it, because those are two different questions and a
            shop that confuses them prices the wrong thing.
          */}
          <DestinationRow
            title="Team"
            detail={
              team?.waiting
                ? `${team.waiting} waiting for you`
                : team && team.size > 1
                  ? `${team.size} people`
                  : "Add staff to take orders with you"
            }
            badge={team?.waiting ? team.waiting : undefined}
            onPress={() => router.push("/team" as Href)}
          />
          {approved ? (
            <DestinationRow
              title="Services you offer"
              detail="The work GRIDGO may send you, and how each one is verified"
              onPress={() => router.push("/services")}
            />
          ) : null}
          <DestinationRow
            title="Hours and night jobs"
            detail={hoursDetail}
            onPress={() => router.push("/shop-hours" as Href)}
          />
          <DestinationRow
            title="Where you print"
            detail={user?.shop?.label || "Set the pin every delivery fee is measured from"}
            onPress={() => router.push("/shop-location")}
          />
          {!approved ? (
            <DestinationRow
              title="Accreditation"
              detail="Papers and the wait — what Operations still needs from you"
              onPress={() => router.push("/accreditation")}
            />
          ) : verifyLater(user) ? (
            <DestinationRow
              title="Get verified"
              detail="Your ID and business permit — shown first, no payout limit"
              onPress={() => router.push("/verify" as Href)}
            />
          ) : null}
          {approved ? (
            <DestinationRow
              title="Reviews & ranking"
              detail={standing ?? "What clients said about each job, and where you rank"}
              onPress={() => router.push("/reviews" as Href)}
            />
          ) : null}
          {approved ? (
            <DestinationRow
              title="Performance"
              detail="Warnings, late-finish notices, on-time rate and Top Pick"
              onPress={() => router.push(performanceHref())}
            />
          ) : null}
          {approved ? (
            <DestinationRow
              title="Capacity"
              detail="What you can take on each day, and how fast you turn work around"
              onPress={() => router.push("/capacity")}
            />
          ) : null}
        </View>

        {approved ? (
          <View className="mt-6 gap-2">
            <Text className="text-overline text-text-muted">MONEY</Text>
            <DestinationRow
              title="Earnings"
              detail="What each job pays you, and what each part is waiting on"
              onPress={() => router.push("/payout")}
            />
            <DestinationRow
              title="Your shop's record"
              detail="Late jobs, jobs you let go, and deadline requests"
              onPress={() => router.push("/late-production" as Href)}
            />
            <DestinationRow
              title="Where you get paid"
              detail="The QR and account Operations pays your jobs to"
              onPress={() => router.push("/payout-account" as Href)}
            />
          </View>
        ) : null}

        <View className="mt-6 gap-2">
          <Text className="text-overline text-text-muted">APP</Text>
          {/*
            The first-run tour, again. It starts on Home, so the row takes the
            shop there — the one navigation the tour ever does, and only
            because the shop asked for it.
          */}
          {user ? (
            <DestinationRow
              title="Replay the tour"
              detail="Where jobs arrive, your schedule, and adding to your catalogue"
              onPress={() => {
                useTour.getState().replay(user.id);
                router.navigate("/(tabs)/home");
              }}
            />
          ) : null}
          <DestinationRow
            title={WHATS_NEW_HISTORY_COPY.accountRow}
            detail={WHATS_NEW_HISTORY_COPY.accountCaption}
            onPress={() => router.push("/whats-new" as Href)}
          />
          <DestinationRow
            title="Report a problem"
            detail="Tell Operations what went wrong. They reply in your chat"
            onPress={() => router.push("/report" as Href)}
          />
          <DestinationRow
            title="Settings"
            detail="Theme, the product tour, and the connection this app is using"
            onPress={() => router.push("/settings" as Href)}
          />
        </View>

        {/*
          The agreements the shop works under, and what it can ask about its
          own data — read from the API, so a newly published version is here
          without an app update. Deleting the account is one of the asks on
          Your data, still behind a check that it is really the account holder.
        */}
        <View className="mt-6 gap-2">
          <Text className="text-overline text-text-muted">PRIVACY</Text>
          <DestinationRow
            title="Legal & Privacy"
            detail="Your Supplier Agreement, the Terms and the Privacy Notice"
            onPress={() => router.push("/legal" as Href)}
          />
          <DestinationRow
            title="Your data"
            detail="See, correct or delete the personal data GRIDGO holds about you"
            onPress={() => router.push("/privacy" as Href)}
          />
        </View>

        <View className="mt-8">
          <SecondaryButton label="Sign out" onPress={() => void signOut()} />
        </View>
      </ScrollView>
    </View>
  );
}

function DestinationRow({
  title,
  detail,
  badge,
  onPress,
}: {
  title: string;
  detail: string;
  /** A count that waits on the shop, drawn beside the chevron. */
  badge?: number;
  onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      className="gg-touch flex-row items-center gap-3 rounded-card border border-outline bg-surface px-4 py-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-medium text-text-primary">{title}</Text>
        <Text className="text-caption text-text-muted" numberOfLines={2}>
          {detail}
        </Text>
      </View>
      {badge ? (
        <View className="min-h-6 min-w-6 items-center justify-center rounded-pill bg-accent px-1.5">
          <Text className="text-caption font-medium text-accent-on">{badge}</Text>
        </View>
      ) : null}
      <ChevronRight size={20} color={colors.textMuted} aria-hidden />
    </Pressable>
  );
}

/** Said in place of the products when they cannot be drawn here. */
function ProductsUnavailable() {
  return (
    <View className="mt-6 gap-2">
      <Text className="text-h3 text-text-primary" accessibilityRole="header">
        Products
      </Text>
      <DestinationRow
        title="Open your products"
        detail="They could not be shown here. Open them to see each one."
        onPress={() => router.push("/(tabs)/catalogues")}
      />
    </View>
  );
}

/** The rail asks for a short first page; See all opens the whole board. */
const PRODUCT_RAIL_QUERY = { limit: 8 };

/** Said in place of the sign while GRIDGO's status answer is missing. */
function StatusLoadNote() {
  const phase = useShopStatus((s) => s.phase);
  const error = useShopStatus((s) => s.error);
  if (phase === "failed" && error) {
    return <Text className="mt-2 text-caption text-error">{error}</Text>;
  }
  return null;
}

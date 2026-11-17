import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Hand,
  LocateFixed,
  MapPin,
  Search,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { MapFrame, type MapFrameHandle } from "@/components/MapFrame";
import { ErrorNotice } from "@/components/ErrorNotice";
import { WhyWeAsk } from "@/components/legal/WhyWeAsk";
import { multilineFieldTextStyle, singleLineFieldTextStyle, spacing } from "@/constants/theme";
import {
  geocodeFailureMessage,
  isSearchable,
  reverseAddress,
  searchPlaces,
  type GeocodePlace,
  type PinPrecision,
} from "@/lib/geocode";
import {
  canUseDeviceLocation,
  LOCATION_OUTSIDE_DAVAO,
  requestCurrentLocation,
  type LocationRemedy,
} from "@/lib/deviceLocation";
import { WHY_WE_ASK } from "@/lib/legal";
import { buildShopMapHtml, PIN_ZOOM, type ShopMapEvent } from "@/lib/mapHtml";
import {
  isFarFromDavao,
  isPlaced,
  nudgePin,
  NUDGE_METERS,
  type NudgeDirection,
  PIN_CONSEQUENCE,
  pinBlocker,
  pinStatus,
  type PinStatus,
  type ShopPin,
} from "@/lib/shopLocation";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";

type Props = {
  pin: ShopPin | null;
  /** Fired on every change — a moved pin, a chosen result, a corrected label. */
  onChange: (pin: ShopPin) => void;
  onSearchFocusChange?: (focused: boolean) => void;
  searchPlaceholder?: string;
  /**
   * Why the pin cannot be used yet, or null. The screen refuses to save on it:
   * only the picker knows the address lookup put the point in another town,
   * or that a move is still being read.
   */
  onBlockerChange?: (problem: string | null) => void;
};

/** How long the pin rests after a nudge before its address is read. */
const NUDGE_SETTLE_MS = 800;

/** How close the map comes in on a search result, by how exactly it pins. */
const RESULT_ZOOM: Record<PinPrecision, number> = { exact: PIN_ZOOM, street: 17, area: 16 };

/**
 * Where the shop is, placed by the person who stands in it.
 *
 * Two ways in, because either one alone fails somebody: search for the street,
 * or tap the map. Search goes through OpenStreetMap's own geocoder and is the
 * first thing to stop working on a bad connection, so the map is always live
 * and the failure says to use it rather than pretending the screen is broken.
 *
 * The pin is the thing that matters and the label is a courtesy: GRIDGO prices
 * delivery on the distance from the point, so moving the pin rewrites the
 * label, never the other way round. A search result that is only a road or a
 * barangay says so, because its middle is nobody's door.
 */
export function ShopLocationPicker({
  pin,
  onChange,
  onSearchFocusChange,
  searchPlaceholder = "Street, barangay or landmark",
  onBlockerChange,
}: Props) {
  const { height } = useWindowDimensions();
  const mapHeight = Math.max(280, Math.min(480, height * 0.45));
  const colors = useThemeColors();
  const theme = useThemeName();
  const frame = useRef<MapFrameHandle>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodePlace[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // The lookup failed (not the words): the same words can simply be sent again.
  const [canRetry, setCanRetry] = useState(false);
  const [reading, setReading] = useState(false);
  const [lookup, setLookup] = useState<"no_street" | "failed" | null>(null);
  const [outside, setOutside] = useState(false);
  // Set by a search result, and forgotten the moment the shop moves the pin.
  const [chosen, setChosen] = useState<{ precision: PinPrecision; name: string } | null>(null);
  // Use my location: waiting on the phone, the error radius of the fix it
  // placed (forgotten once the shop moves the pin), and why it could not.
  const [locating, setLocating] = useState(false);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [locateError, setLocateError] = useState<{ message: string; remedy: LocationRemedy } | null>(null);
  const showLocate = useMemo(() => canUseDeviceLocation(), []);

  // Address lookups and searches each take a ticket from their own counter.
  // An answer for an older ticket is dropped — it named a point the shop has
  // left, and applying it moved the pin back. Two counters, because a search
  // started after a pin move must not orphan that move's lookup: it would
  // leave "Reading this place…" and a locked address field for good.
  const pinTicket = useRef(0);
  const searchTicket = useRef(0);
  // A third, for Use my location: a pin the shop places while the phone is
  // still looking wins, and the late fix is dropped rather than jumping it.
  const locateTicket = useRef(0);
  const take = (counter: { current: number }) => {
    counter.current += 1;
    const mine = counter.current;
    return () => counter.current === mine;
  };

  // The document is built once. Everything after the first paint is pushed in
  // as a model, so a moved pin never reloads the tiles under the shop's thumb.
  const initialHtml = useMemo(
    () =>
      buildShopMapHtml({
        theme,
        pin: pin ? { lat: pin.lat, lng: pin.lng } : null,
        label: pin?.label ?? "",
        recentre: Boolean(pin),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first paint only
    [],
  );

  const push = useCallback(
    (next: ShopPin | null, recentreZoom: number | null, accuracy: number | null) => {
      frame.current?.post(
        JSON.stringify({
          theme,
          pin: next ? { lat: next.lat, lng: next.lng } : null,
          label: next?.label ?? "",
          recentre: recentreZoom != null,
          zoom: recentreZoom ?? undefined,
          accuracyMeters: next ? accuracy : null,
        }),
      );
    },
    [theme],
  );

  // A pin the shop moved, a label it corrected, or a theme change: all of them
  // are the same push. Recentring is not — the map only jumps when a search
  // result or the phone's fix put the pin somewhere the shop cannot see.
  useEffect(() => {
    push(pin, null, accuracyMeters);
  }, [pin, push, accuracyMeters]);

  /** Read the address at a point the shop did not type, and judge the town. */
  const readPlace = useCallback(
    (lat: number, lng: number) => {
      const isCurrent = take(pinTicket);
      const far = isFarFromDavao({ lat, lng, label: "" });
      setOutside(far);
      if (far) {
        setReading(false);
        return;
      }
      setReading(true);
      void reverseAddress(lat, lng, { isCurrent }).then((result) => {
        if (!isCurrent()) return;
        setReading(false);
        if (!result.ok) {
          setLookup("failed");
          return;
        }
        setOutside(!result.value.inDavao);
        if (result.value.address) onChange({ lat, lng, label: result.value.address });
        else setLookup("no_street");
      });
    },
    [onChange],
  );

  // A run of nudges is read once, after the shop stops pressing: a lookup per
  // press would spend OpenStreetMap's one-a-second budget on points left behind.
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    },
    [],
  );

  /** Something else placed the pin: a fix still on its way is for nobody. */
  const dropLocate = useCallback(() => {
    take(locateTicket);
    setLocating(false);
    setLocateError(null);
  }, []);

  const onEvent = useCallback(
    (event: ShopMapEvent) => {
      if (event.type === "grab") {
        // Picked up by hand: a fix still on its way loses, now rather than at
        // the drop, or it would move the pin out from under the finger.
        dropLocate();
        setAccuracyMeters(null);
        return;
      }
      if (event.type !== "pin") return;
      // A search still out is for somewhere the shop has stopped looking.
      take(searchTicket);
      dropLocate();
      const { lat, lng } = event;
      setChosen(null);
      setLookup(null);
      setSearching(false);
      setResults(null);
      // Placed by hand: the phone's error circle no longer describes it.
      setAccuracyMeters(null);
      // The old label described the old point, so it goes with it. The panel
      // says the address is being looked up rather than showing a stale one.
      onChange({ lat, lng, label: "" });
      readPlace(lat, lng);
    },
    [onChange, readPlace, dropLocate],
  );

  /**
   * The last few metres without a drag: a keyboard, a switch or a screen
   * reader cannot pick the pin up, and "drag it onto your door" is advice
   * they could not follow. Each press moves it about `NUDGE_METERS`.
   */
  const nudge = useCallback(
    (direction: NudgeDirection) => {
      if (!isPlaced(pin)) return;
      take(searchTicket);
      dropLocate();
      setChosen(null);
      setLookup(null);
      setSearching(false);
      setResults(null);
      setAccuracyMeters(null);
      const next = nudgePin(pin, direction);
      // Any lookup still out named the point the pin just left.
      const isCurrent = take(pinTicket);
      setReading(true);
      onChange({ ...next, label: "" });
      if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
      nudgeTimer.current = setTimeout(() => {
        nudgeTimer.current = null;
        // A drag, a search pick or a phone fix since then owns the pin.
        if (isCurrent()) readPlace(next.lat, next.lng);
      }, NUDGE_SETTLE_MS);
    },
    [pin, onChange, readPlace, dropLocate],
  );

  /**
   * Use my location. Asks for the permission on this tap and never before,
   * takes a satellite fix where the phone can get one, and puts the pin there
   * with its error circle — still draggable, because a shop standing at its
   * counter is metres from its door, and a rough fix is further.
   */
  const locate = useCallback(async () => {
    const isCurrent = take(locateTicket);
    setLocating(true);
    setLocateError(null);
    const result = await requestCurrentLocation();
    if (!isCurrent()) return;
    setLocating(false);
    if (result.status !== "ok") {
      setLocateError({ message: result.message, remedy: result.remedy });
      return;
    }
    const { lat, lng } = result.point;
    if (isFarFromDavao({ lat, lng, label: "" })) {
      // Not a pin: the phone is somewhere GRIDGO does not send riders, and a
      // pin there is one the shop would only have to drag back across town.
      setLocateError({ message: LOCATION_OUTSIDE_DAVAO, remedy: "none" });
      return;
    }
    take(searchTicket);
    setSearching(false);
    setResults(null);
    setChosen(null);
    setLookup(null);
    const accuracy = result.accuracyMeters ?? null;
    setAccuracyMeters(accuracy);
    const next: ShopPin = { lat, lng, label: "" };
    onChange(next);
    push(next, PIN_ZOOM, accuracy);
    readPlace(lat, lng);
  }, [onChange, push, readPlace]);

  /**
   * Search runs on submit and never on a keystroke. OpenStreetMap's geocoder
   * forbids autocomplete outright, and it is a donated service — a request per
   * letter typed is how a free service stops being one.
   */
  const runSearch = useCallback(async () => {
    if (!isSearchable(query)) {
      setSearchError("Type at least three letters of the street or landmark, then search.");
      setCanRetry(false);
      return;
    }
    const isCurrent = take(searchTicket);
    setSearching(true);
    setSearchError(null);
    setCanRetry(false);
    const result = await searchPlaces(query, { isCurrent });
    if (!isCurrent()) return;
    setSearching(false);
    if (!result.ok) {
      setResults(null);
      setSearchError(geocodeFailureMessage(result.reason));
      setCanRetry(true);
      return;
    }
    setResults(result.value);
  }, [query]);

  const choose = useCallback(
    (place: GeocodePlace) => {
      // The chosen place replaces any address still being read for a dropped pin.
      take(pinTicket);
      dropLocate();
      setAccuracyMeters(null);
      const next: ShopPin = { lat: place.lat, lng: place.lng, label: place.address };
      setResults(null);
      setQuery("");
      setReading(false);
      setLookup(null);
      setOutside(false);
      setChosen(place.precision === "exact" ? null : { precision: place.precision, name: place.label });
      onChange(next);
      // The one place the map is allowed to move itself: the shop asked for
      // somewhere it is not currently looking.
      push(next, RESULT_ZOOM[place.precision], null);
    },
    [onChange, push, dropLocate],
  );

  const placed = isPlaced(pin);
  const isOutside = placed && (outside || isFarFromDavao(pin));
  const blocker = placed || locating ? pinBlocker({ outside: isOutside, reading, locating }) : null;
  useEffect(() => {
    onBlockerChange?.(blocker);
  }, [blocker, onBlockerChange]);
  const status = pinStatus({
    placed,
    locating,
    accuracyMeters,
    reading,
    outside: isOutside,
    lookup,
    precision: chosen?.precision ?? null,
    placeName: chosen?.name ?? "",
  });
  const searchEndInset = query ? 48 : spacing.lg;

  return (
    <View>
      {/* Keep room to drag the pin; the surrounding form scrolls on short screens. */}
      <View
        testID="shop-location-map"
        className="mx-4 overflow-hidden rounded-card border border-outline"
        style={{ height: mapHeight }}
      >
        <MapFrame
          ref={frame}
          html={initialHtml}
          onReady={() => push(pin, pin ? PIN_ZOOM : null, accuracyMeters)}
          onEvent={onEvent}
          accessibilityLabel="Map of Davao City. Tap to place your shop, or drag the pin."
        />

        {/*
          Results sit under the search field rather than over it, so a shop
          can change the words and search again without backing out first.
        */}
        {results ? (
          <View className="absolute inset-0 bg-surface pt-18">
            {results.length === 0 ? (
              <View className="gap-1 px-4 pt-2">
                <Text className="text-body font-medium text-text-primary">
                  No place in Davao City matched that
                </Text>
                <Text className="text-caption text-text-secondary">
                  Try a landmark or street nearby, or tap your shop on the map.
                </Text>
                <Pressable
                  onPress={() => setResults(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Close search results"
                  className="gg-touch justify-center"
                  style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
                >
                  <Text className="text-button text-text-primary">Back to map</Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled">
                <View className="flex-row items-center justify-between gap-3 px-4">
                  <Text className="text-caption text-text-secondary">
                    {results.length === 1 ? "1 place in Davao City" : `${results.length} places in Davao City`}
                  </Text>
                  <Pressable
                    onPress={() => setResults(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Close search results and go back to the map"
                    className="gg-touch justify-center"
                    style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
                  >
                    <Text className="text-button text-text-primary">Back to map</Text>
                  </Pressable>
                </View>
                {results.map((place) => (
                  <Pressable
                    key={place.id}
                    onPress={() => choose(place)}
                    accessibilityRole="button"
                    accessibilityLabel={`Put my pin at ${place.label}, ${place.detail}`}
                    className="gg-touch flex-row items-start gap-3 border-t border-outline-subtle px-4 py-3"
                    style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
                  >
                    <View className="pt-0.5">
                      <MapPin size={18} color={colors.textMuted} strokeWidth={2} />
                    </View>
                    <View className="min-w-0 flex-1 gap-0.5">
                      <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
                        {place.label}
                      </Text>
                      <Text className="text-caption text-text-secondary" numberOfLines={1}>
                        {place.detail}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}

        {/*
          Same search the rider Maps tab uses: one field on the tiles, the
          magnifier inset so Android never draws the first letter under it,
          submit on the icon or the keyboard — never on a keystroke.
        */}
        <View pointerEvents="box-none" className="absolute inset-x-0 top-0 p-3">
          <View className="relative justify-center">
            <Pressable
              onPress={() => void runSearch()}
              disabled={searching}
              accessibilityRole="button"
              accessibilityLabel="Search"
              accessibilityState={{ disabled: searching }}
              className="absolute left-0 top-0 z-10 h-12 w-12 items-center justify-center"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            >
              {searching ? (
                <ActivityIndicator size="small" color={colors.textPrimary} />
              ) : (
                <Search size={20} color={colors.textSecondary} strokeWidth={2} />
              )}
            </Pressable>
            <TextInput
              value={query}
              onChangeText={setQuery}
              onFocus={() => onSearchFocusChange?.(true)}
              onBlur={() => onSearchFocusChange?.(false)}
              placeholder={searchPlaceholder}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Search for your shop's address"
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              underlineColorAndroid="transparent"
              onSubmitEditing={() => void runSearch()}
              className="gg-field"
              style={{
                ...singleLineFieldTextStyle,
                paddingStart: 48,
                paddingLeft: 48,
                paddingEnd: searchEndInset,
                paddingRight: searchEndInset,
              }}
            />
            {query ? (
              <Pressable
                onPress={() => {
                  setQuery("");
                  setResults(null);
                  setSearchError(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Clear the search"
                className="absolute right-0 top-0 z-10 h-12 w-12 items-center justify-center"
                style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
              >
                <X size={18} color={colors.textMuted} strokeWidth={2} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {showLocate && !results ? (
          <LocateButton locating={locating} onPress={() => void locate()} />
        ) : null}
      </View>

      {/* What the pin currently is, stated plainly under the map. */}
      <View className="gg-page pt-3">
        {locateError ? (
          <View className="pb-3">
            <ErrorNotice
              message={locateError.message}
              announce
              onRetry={
                locateError.remedy === "retry"
                  ? () => void locate()
                  : locateError.remedy === "settings"
                    ? () => void Linking.openSettings().catch(() => undefined)
                    : undefined
              }
              retryLabel={locateError.remedy === "settings" ? "Open settings" : "Try again"}
            />
          </View>
        ) : null}

        {searchError ? (
          <View className="pb-3">
            <ErrorNotice
              message={searchError}
              announce
              onRetry={canRetry ? () => void runSearch() : undefined}
              retryLabel="Search again"
            />
          </View>
        ) : null}

        <View className="gg-panel gap-3">
          {status ? <PinStatusLine status={status} /> : null}

          {placed && !isOutside ? <PinNudge onNudge={nudge} /> : null}

          {placed ? (
            <View className="gap-2">
              <Text className="text-caption text-text-secondary">Address at this pin</Text>
              <TextInput
                value={reading ? "" : (pin?.label ?? "")}
                onChangeText={(label) => pin && onChange({ ...pin, label })}
                editable={!reading}
                multiline
                numberOfLines={2}
                placeholder={reading ? "" : "Street and barangay a rider reads at your door"}
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Address at this pin"
                underlineColorAndroid="transparent"
                className="min-h-14 rounded-field border border-outline bg-surface text-body text-text-primary"
                style={{
                  ...multilineFieldTextStyle,
                  paddingLeft: spacing.lg,
                  paddingRight: spacing.lg,
                  paddingTop: spacing.md,
                  paddingBottom: spacing.md,
                }}
              />
            </View>
          ) : null}

          <Text className="text-caption text-text-secondary">{PIN_CONSEQUENCE}</Text>
          <WhyWeAsk readable>{WHY_WE_ASK.shopPin}</WhyWeAsk>
        </View>
      </View>
    </View>
  );
}

/**
 * Use my location, on the map it moves, under the search field. A pill with
 * its words always showing — an icon alone was a guess on the client's map.
 * Charcoal on surface: the screen's one yellow action is Save.
 */
function LocateButton({ locating, onPress }: { locating: boolean; onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <View pointerEvents="box-none" className="absolute left-3 top-18">
      <Pressable
        onPress={onPress}
        disabled={locating}
        accessibilityRole="button"
        accessibilityLabel="Use my location"
        accessibilityHint="Puts your shop pin where this phone is"
        accessibilityState={{ disabled: locating, busy: locating }}
        className="min-h-11 flex-row items-center gap-2 overflow-hidden rounded-pill border border-outline bg-surface-high px-4 shadow-sheet"
      >
        {({ pressed }) => (
          <>
            {locating ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <LocateFixed size={18} color={colors.textPrimary} strokeWidth={2} />
            )}
            <Text className="text-body font-medium text-text-primary">
              {locating ? "Finding you…" : "Use my location"}
            </Text>
            {pressed && !locating ? <View pointerEvents="none" className="gg-pressed absolute inset-0" /> : null}
          </>
        )}
      </Pressable>
    </View>
  );
}

const NUDGES: { direction: NudgeDirection; Icon: LucideIcon; label: string }[] = [
  { direction: "north", Icon: ArrowUp, label: "Move the pin up" },
  { direction: "south", Icon: ArrowDown, label: "Move the pin down" },
  { direction: "west", Icon: ArrowLeft, label: "Move the pin left" },
  { direction: "east", Icon: ArrowRight, label: "Move the pin right" },
];

/**
 * Four small, neutral steps for the pin, in reach of a keyboard and a screen
 * reader. Outlined charcoal: Save stays the only yellow on the screen.
 */
function PinNudge({ onNudge }: { onNudge: (direction: NudgeDirection) => void }) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center gap-2" testID="shop-pin-nudge">
      <Text className="min-w-0 flex-1 text-caption text-text-secondary">
        Move the pin a little
      </Text>
      {NUDGES.map(({ direction, Icon, label }) => (
        <Pressable
          key={direction}
          onPress={() => onNudge(direction)}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={`Moves your shop pin about ${NUDGE_METERS} metres`}
          className="h-11 w-11 items-center justify-center overflow-hidden rounded-field border border-outline bg-surface"
        >
          {({ pressed }) => (
            <>
              <Icon size={18} color={colors.textPrimary} strokeWidth={2} />
              {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0" /> : null}
            </>
          )}
        </Pressable>
      ))}
    </View>
  );
}

/** One line about the pin: icon, label and colour together, never colour alone. */
function PinStatusLine({ status }: { status: PinStatus }) {
  const colors = useThemeColors();
  const tint =
    status.tone === "warning" ? colors.warning : status.tone === "hint" ? colors.info : colors.textMuted;
  return (
    <View
      testID="shop-pin-status"
      className="flex-row items-start gap-3"
      accessibilityLiveRegion="polite"
    >
      <View className="pt-0.5">
        {status.tone === "busy" ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : status.tone === "warning" ? (
          <AlertTriangle size={18} color={tint} strokeWidth={2} />
        ) : (
          <Hand size={18} color={tint} strokeWidth={2} />
        )}
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-medium text-text-primary">{status.title}</Text>
        {status.detail ? (
          <Text className={status.tone === "warning" ? "text-caption text-warning" : "text-caption text-text-secondary"}>
            {status.detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

import { AlertTriangle, Hand, MapPin, Search, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";

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
import { WHY_WE_ASK } from "@/lib/legal";
import { buildShopMapHtml, PIN_ZOOM, type ShopMapEvent } from "@/lib/mapHtml";
import {
  isFarFromDavao,
  isPlaced,
  PIN_CONSEQUENCE,
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
};

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
  const [reading, setReading] = useState(false);
  const [lookup, setLookup] = useState<"no_street" | "failed" | null>(null);
  const [outside, setOutside] = useState(false);
  // Set by a search result, and forgotten the moment the shop moves the pin.
  const [chosen, setChosen] = useState<{ precision: PinPrecision; name: string } | null>(null);

  // Every search and every pin move takes a ticket. An answer that comes back
  // for an older ticket is dropped — it named a point the shop has left, and
  // applying it moved the pin back.
  const ticket = useRef(0);
  const take = () => {
    ticket.current += 1;
    const mine = ticket.current;
    return () => ticket.current === mine;
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
    (next: ShopPin | null, recentreZoom: number | null) => {
      frame.current?.post(
        JSON.stringify({
          theme,
          pin: next ? { lat: next.lat, lng: next.lng } : null,
          label: next?.label ?? "",
          recentre: recentreZoom != null,
          zoom: recentreZoom ?? undefined,
        }),
      );
    },
    [theme],
  );

  // A pin the shop moved, a label it corrected, or a theme change: all of them
  // are the same push. Recentring is not — the map only jumps when a search
  // result put the pin somewhere the shop cannot see.
  useEffect(() => {
    push(pin, null);
  }, [pin, push]);

  const onEvent = useCallback(
    (event: ShopMapEvent) => {
      if (event.type !== "pin") return;
      const isCurrent = take();
      const { lat, lng } = event;
      setChosen(null);
      setLookup(null);
      // A search still out is for somewhere the shop has stopped looking.
      setSearching(false);
      setResults(null);
      // The old label described the old point, so it goes with it. The panel
      // says the address is being looked up rather than showing a stale one.
      onChange({ lat, lng, label: "" });
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

  /**
   * Search runs on submit and never on a keystroke. OpenStreetMap's geocoder
   * forbids autocomplete outright, and it is a donated service — a request per
   * letter typed is how a free service stops being one.
   */
  const runSearch = useCallback(async () => {
    if (!isSearchable(query)) {
      setSearchError("Type at least three letters of the street or landmark, then search.");
      return;
    }
    const isCurrent = take();
    setSearching(true);
    setSearchError(null);
    const result = await searchPlaces(query, { isCurrent });
    if (!isCurrent()) return;
    setSearching(false);
    if (!result.ok) {
      setResults(null);
      setSearchError(geocodeFailureMessage(result.reason));
      return;
    }
    setResults(result.value);
  }, [query]);

  const choose = useCallback(
    (place: GeocodePlace) => {
      take();
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
      push(next, RESULT_ZOOM[place.precision]);
    },
    [onChange, push],
  );

  const placed = isPlaced(pin);
  const status = pinStatus({
    placed,
    reading,
    outside: outside || isFarFromDavao(pin),
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
          onReady={() => push(pin, pin ? PIN_ZOOM : null)}
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
                <Text className="text-caption text-text-muted">
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
                  <Text className="text-caption text-text-muted">
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
                      <Text className="text-caption text-text-muted" numberOfLines={1}>
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
      </View>

      {/* What the pin currently is, stated plainly under the map. */}
      <View className="gg-page pt-3">
        {searchError ? (
          <View className="pb-3">
            <ErrorNotice message={searchError} />
          </View>
        ) : null}

        <View className="gg-panel gap-3">
          {status ? <PinStatusLine status={status} /> : null}

          {placed ? (
            <View className="gap-2">
              <Text className="text-caption text-text-muted">Address at this pin</Text>
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

          <Text className="text-caption text-text-muted">{PIN_CONSEQUENCE}</Text>
          <WhyWeAsk>{WHY_WE_ASK.shopPin}</WhyWeAsk>
        </View>
      </View>
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

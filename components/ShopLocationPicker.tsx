import { Crosshair, MapPin, Search, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { MapFrame, type MapFrameHandle } from "@/components/MapFrame";
import { ErrorNotice } from "@/components/ErrorNotice";
import { multilineFieldTextStyle, singleLineFieldTextStyle, spacing } from "@/constants/theme";
import {
  geocodeFailureMessage,
  isSearchable,
  reverseLabel,
  searchPlaces,
  type GeocodePlace,
} from "@/lib/geocode";
import { buildShopMapHtml, type ShopMapEvent } from "@/lib/mapHtml";
import { coordinateText, isFarFromDavao, isPlaced, PIN_CONSEQUENCE, type ShopPin } from "@/lib/shopLocation";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";

type Props = {
  pin: ShopPin | null;
  /** Fired on every change — a moved pin, a chosen result, a corrected label. */
  onChange: (pin: ShopPin) => void;
};

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
 * label, never the other way round.
 */
export function ShopLocationPicker({ pin, onChange }: Props) {
  const colors = useThemeColors();
  const theme = useThemeName();
  const frame = useRef<MapFrameHandle>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodePlace[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);

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
    (next: ShopPin | null, shouldRecentre: boolean) => {
      frame.current?.post(
        JSON.stringify({
          theme,
          pin: next ? { lat: next.lat, lng: next.lng } : null,
          label: next?.label ?? "",
          recentre: shouldRecentre,
        }),
      );
    },
    [theme],
  );

  // A pin the shop moved, a label it corrected, or a theme change: all of them
  // are the same push. Recentring is not — the map only jumps when a search
  // result put the pin somewhere the shop cannot see.
  useEffect(() => {
    push(pin, false);
  }, [pin, push]);

  /** A pin the shop just moved: name it, then let them correct the name. */
  const nameThePin = useCallback(
    async (lat: number, lng: number) => {
      setNaming(true);
      const result = await reverseLabel(lat, lng);
      setNaming(false);
      if (result.ok && result.value) {
        onChange({ lat, lng, label: result.value });
      }
    },
    [onChange],
  );

  const onEvent = useCallback(
    (event: ShopMapEvent) => {
      if (event.type !== "pin") return;
      // The old label described the old point, so it goes with it. The panel
      // says the address is being looked up rather than showing a stale one.
      onChange({ lat: event.lat, lng: event.lng, label: "" });
      void nameThePin(event.lat, event.lng);
    },
    [nameThePin, onChange],
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
    setSearching(true);
    setSearchError(null);
    const result = await searchPlaces(query);
    setSearching(false);
    if (!result.ok) {
      setResults(null);
      setSearchError(geocodeFailureMessage(result.reason));
      return;
    }
    if (!result.value.length) {
      setResults([]);
      setSearchError(null);
      return;
    }
    setResults(result.value);
  }, [query]);

  const choose = useCallback(
    (place: GeocodePlace) => {
      const next: ShopPin = { lat: place.lat, lng: place.lng, label: place.detail };
      setResults(null);
      setQuery("");
      onChange(next);
      // The one place the map is allowed to move itself: the shop asked for
      // somewhere it is not currently looking.
      push(next, true);
    },
    [onChange, push],
  );

  const placed = isPlaced(pin);
  const searchEndInset = query ? 48 : spacing.lg;

  return (
    <View className="flex-1">
      {/* The map owns the middle of the screen, so panning never fights a list. */}
      <View className="mx-4 flex-1 overflow-hidden rounded-card border border-outline">
        <MapFrame
          ref={frame}
          html={initialHtml}
          onReady={() => push(pin, Boolean(pin))}
          onEvent={onEvent}
          accessibilityLabel="Map of Davao City. Tap to place your shop, or drag the pin."
        />

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
              placeholder="Street, barangay or landmark"
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

        {/*
          Results take the whole map rather than a strip across the top of it.
          A capped strip cut its last row in half against the tiles, which reads
          as a rendering fault rather than as a list that scrolls.
        */}
        {results ? (
          <View className="absolute inset-0 bg-surface">
            {results.length === 0 ? (
              <View className="gap-1 p-4">
                <Text className="text-body font-medium text-text-primary">
                  No match for that address
                </Text>
                <Text className="text-caption text-text-muted">
                  Try the barangay or a landmark nearby, or close this and tap your shop on the
                  map.
                </Text>
                <Pressable
                  onPress={() => setResults(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Close search results"
                  className="gg-touch justify-center"
                  style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
                >
                  <Text className="text-button text-text-primary">Close</Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled">
                <View className="flex-row items-center justify-between gap-3 px-4 py-3">
                  <Text className="text-overline text-text-muted">
                    {results.length === 1 ? "1 MATCH" : `${results.length} MATCHES`}
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
                    accessibilityLabel={`Put my pin at ${place.detail}`}
                    className="gg-touch flex-row items-start gap-3 border-b border-outline-subtle px-4 py-3"
                    style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
                  >
                    <View className="pt-0.5">
                      <MapPin size={18} color={colors.textMuted} strokeWidth={2} />
                    </View>
                    <View className="min-w-0 flex-1 gap-0.5">
                      <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
                        {place.label}
                      </Text>
                      <Text className="text-caption text-text-muted" numberOfLines={2}>
                        {place.detail}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}
      </View>

      {/* What the pin currently is, stated plainly under the map. */}
      <View className="gg-page pt-3">
        {searchError ? (
          <View className="pb-3">
            <ErrorNotice message={searchError} />
          </View>
        ) : null}

        <View className="gg-panel gap-3">
          <View className="flex-row items-center gap-2">
            <Crosshair size={16} color={colors.textMuted} strokeWidth={2} />
            <Text className="min-w-0 flex-1 text-caption text-text-muted">
              {placed && pin ? coordinateText(pin) : "No pin placed yet"}
            </Text>
          </View>

          {placed ? (
            <View className="gap-2">
              <Text className="text-caption text-text-muted">Address at this pin</Text>
              <TextInput
                value={naming ? "" : (pin?.label ?? "")}
                onChangeText={(label) => pin && onChange({ ...pin, label })}
                editable={!naming}
                multiline
                numberOfLines={2}
                placeholder={naming ? "Finding the address…" : "The address a rider reads at your door"}
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
          ) : (
            <Text className="text-body text-text-secondary">
              Search the map for your street, or tap your shop on it.
            </Text>
          )}

          <Text className="text-caption text-text-muted">{PIN_CONSEQUENCE}</Text>
          {isFarFromDavao(pin) ? (
            <Text className="text-caption text-warning">
              That pin is outside Davao City. GRIDGO only dispatches riders here — check it
              before you save.
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ====================================================
// FuelAmpel — StationMapView Component (v3)
//
// Changes vs v2:
//  - Issue #2: TouchableOpacity hitSlop + style padding on every Marker
//    → reliable 44pt touch zone per iOS HIG / Material Design guidelines
//  - Issue #3 (visual): Cheapest/Nearest markers get a glowing ring effect.
//    Regular open dots upgraded to a more vibrant blue-gray.
//    Legend panel upgraded with glassmorphism border + category icons.
//    Detail card gets a colored accent top-border.
//  - Issue #4: "Locate Me" FAB button (target icon).
//    Appears after user pans the map. Tapping flies back to currentLocation.
//    Automatically hides on any programmatic flyTo.
// ====================================================

import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, ActivityIndicator, Linking, PanResponder,
} from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import type * as GeoJSON from 'geojson';
import { Station, GeoLocation } from '../utils/types';
import { formatFuelType } from '../utils/formatters';
import type { FuelType } from '../utils/types';
import { CorridorStation } from '../utils/routeCorridor';
import { t } from '../utils/i18n';
import { useUserStore } from '../store/userStore';

// ─── CARTO Dark Matter GL (vector) — free, no API key ───────────────────────
// Vector tiles: crisp at any zoom/DPI, customisable via MapLibre style spec.
// Replaces the previous hand-written raster JSON (PNG tiles were blurry on
// high-DPI screens and not customisable).
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// ─── Station Marker: dot ● + price label ──────────────────────────────────────
//
// v3 visual upgrades:
//   - Cheapest:  green dot (14px) + green glow ring + green-bordered pill
//   - Nearest:   indigo dot (14px) + indigo glow ring + indigo-bordered pill
//   - Open:      upgraded to #60A5FA (vivid blue-gray, was pale #94A3B8)
//   - Closed:    unchanged (faded gray dot, no pill)
//
// Touch target: 8px padding on all sides + hitSlop 20/20/16/16 = ~46pt tappable area

function StationMarker({
  price, isOpen, isCheapest, isNearest,
}: {
  price: number | null;
  isOpen: boolean;
  isCheapest: boolean;
  isNearest: boolean;
}) {
  const dotSize   = (isCheapest || isNearest) ? 14 : 10;
  const dotRadius = dotSize / 2;

  const dotColor =
    !isOpen    ? '#4B5563'   :
    isCheapest ? '#22C55E'   :
    isNearest  ? '#6366F1'   :
                 '#60A5FA'   ; // vivid blue for regular open (was pale #94A3B8)

  const pillBorderColor =
    isCheapest ? 'rgba(34,197,94,0.65)'  :
    isNearest  ? 'rgba(99,102,241,0.65)' :
                 'rgba(255,255,255,0.14)';

  const glowColor =
    isCheapest ? '#22C55E' :
    isNearest  ? '#6366F1' :
                 undefined;

  const dotStyle: any = {
    width: dotSize,
    height: dotSize,
    borderRadius: dotRadius,
    backgroundColor: dotColor,
  };

  // Glow ring: outer halo simulated via boxShadow-equivalent (elevation + shadow*)
  if (glowColor && isOpen) {
    dotStyle.shadowColor   = glowColor;
    dotStyle.shadowOpacity = 0.85;
    dotStyle.shadowRadius  = 6;
    dotStyle.shadowOffset  = { width: 0, height: 0 };
    dotStyle.elevation     = 6;
  }

  // Closed: show just a faded dot, no price label
  if (!isOpen) {
    return (
      <View style={[markerStyles.root, { opacity: 0.38 }]}>
        <View style={dotStyle} />
      </View>
    );
  }

  return (
    <View style={markerStyles.root}>
      <View style={dotStyle} />
      <View style={[markerStyles.pill, { borderColor: pillBorderColor }]}>
        <Text style={markerStyles.priceText}>
          {price !== null ? price.toFixed(3) : '—'}
        </Text>
      </View>
    </View>
  );
}

const markerStyles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  // Minimum 44x44pt touch target — satisfies Android Material + iOS HIG guidelines.
  // Padding provides real rendered area (hitSlop alone can be clipped by MarkerView bounds).
  touchTarget: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  pill: {
    backgroundColor: 'rgba(8,10,18,0.90)',
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  priceText: {
    color: '#F9FAFB',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
});

// ─── Bottom detail card ────────────────────────────────────────────────────────
function StationDetailCard({
  station, fuelType, isCheapest, isNearest, isCorridor, onClose, onNavigate,
}: {
  station: Station;
  fuelType: FuelType;
  isCheapest: boolean;
  isNearest: boolean;
  isCorridor: boolean;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const slideAnim = useRef(new Animated.Value(120)).current;
  const dragY     = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 180,
    }).start();
  }, [station.id]);

  // Swipe-down-to-dismiss: pan handler on the drag handle
  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, { dy }) => dy > 8,
    onPanResponderMove: (_, { dy }) => { if (dy > 0) dragY.setValue(dy); },
    onPanResponderRelease: (_, { dy }) => {
      if (dy > 60) {
        onClose();
      } else {
        Animated.spring(dragY, {
          toValue: 0, useNativeDriver: true, damping: 20, stiffness: 300,
        }).start();
      }
    },
  })).current;

  const accentColor =
    isCheapest ? '#22C55E' :
    isCorridor ? '#F59E0B' :
    isNearest  ? '#6366F1' :
                 'rgba(255,255,255,0.09)';

  return (
    <Animated.View
      style={[cardStyles.card, { transform: [{ translateY: Animated.add(slideAnim, dragY) }] }]}
    >
      {/* Accent top border */}
      <View style={[cardStyles.accentBar, { backgroundColor: accentColor }]} />

      {/* Drag handle — receives pan responder for swipe-to-dismiss */}
      <View style={cardStyles.handleHitArea} {...panResponder.panHandlers}>
        <View style={cardStyles.handle} />
      </View>

      {/* Badge row */}
      <View style={cardStyles.badgeRow}>
        {isCheapest && (
          <View style={[cardStyles.badge, { backgroundColor: 'rgba(34,197,94,0.15)', borderColor: 'rgba(34,197,94,0.4)' }]}>
            <Text style={[cardStyles.badgeText, { color: '#4ADE80' }]}>💰 {t('cheapest')}</Text>
          </View>
        )}
        {isCorridor && (
          <View style={[cardStyles.badge, { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: 'rgba(245,158,11,0.4)' }]}>
            <Text style={[cardStyles.badgeText, { color: '#FCD34D' }]}>🚗 Auf dem Weg</Text>
          </View>
        )}
        {isNearest && (
          <View style={[cardStyles.badge, { backgroundColor: 'rgba(99,102,241,0.15)', borderColor: 'rgba(99,102,241,0.4)' }]}>
            <Text style={[cardStyles.badgeText, { color: '#A5B4FC' }]}>📍 {t('nearest')}</Text>
          </View>
        )}
      </View>

      {/* Header */}
      <View style={cardStyles.header}>
        <View style={{ flex: 1 }}>
          <Text style={cardStyles.name} numberOfLines={1}>{station.brand || station.name}</Text>
          <Text style={cardStyles.address} numberOfLines={1}>
            {station.street} · {station.place}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onClose}
          style={cardStyles.closeBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={cardStyles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Stats row */}
      <View style={cardStyles.row}>
        <View style={cardStyles.stat}>
          <Text style={cardStyles.statVal}>
            {station.price !== null ? `${station.price.toFixed(3)} €` : '—'}
          </Text>
          <Text style={cardStyles.statLbl}>{formatFuelType(fuelType)}</Text>
        </View>
        <View style={cardStyles.divider} />
        <View style={cardStyles.stat}>
          <Text style={cardStyles.statVal}>{station.dist.toFixed(1)} km</Text>
          <Text style={cardStyles.statLbl}>{t('distance')}</Text>
        </View>
        <View style={cardStyles.divider} />
        <View style={cardStyles.stat}>
          <Text style={[cardStyles.statVal, { color: station.isOpen ? '#4ADE80' : '#EF4444' }]}>
            {station.isOpen ? t('open') : t('closed')}
          </Text>
          <Text style={cardStyles.statLbl}>{t('status')}</Text>
        </View>
      </View>

      {/* Navigate button: opens station in the device's default maps app */}
      <TouchableOpacity style={cardStyles.navBtn} onPress={onNavigate} activeOpacity={0.8}>
        <Text style={cardStyles.navBtnText}>🧭  {t('navigate')}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1A1D26',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 0,  // replaced by accentBar
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 20,
  },
  accentBar: {
    height: 3,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginBottom: 6,
  },
  handle: {
    width: 32,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  badge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 10, fontWeight: '700' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  name:         { color: '#F9FAFB', fontSize: 14, fontWeight: '800' },
  address:      { color: '#6B7280', fontSize: 11, marginTop: 1 },
  closeBtn:     { padding: 4 },
  closeBtnText: { color: '#4B5563', fontSize: 15, fontWeight: '700' },
  row:    { flexDirection: 'row', alignItems: 'center' },
  stat:   { flex: 1, alignItems: 'center', gap: 2 },
  statVal:{ color: '#F9FAFB', fontSize: 13, fontWeight: '800' },
  statLbl:{ color: '#4B5563', fontSize: 10 },
  navBtn: {
    marginTop: 12,
    backgroundColor: 'rgba(99,102,241,0.12)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.35)',
    paddingVertical: 11,
    alignItems: 'center',
  },
  navBtnText: { color: '#A5B4FC', fontWeight: '700', fontSize: 13 },
  handleHitArea: {
    paddingVertical: 8,   // expands pan-responder area without changing visual handle size
    marginTop: -8,
  },
  divider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.07)' },
});

// ─── Main map component ────────────────────────────────────────────────────────
interface StationMapViewProps {
  stations: Station[];
  currentLocation: GeoLocation | null;
  fuelType: FuelType;
  nearestStation: Station | null;
  cheapestStation: Station | null;
  corridorStation?: CorridorStation | null;
  /** Label shown in map overlay (e.g. "GPS", "PLZ 40210", "Home") */
  locationLabel?: string;
  /** Callback fired when a station card is opened or closed */
  onSelectionChange?: (hasSelection: boolean) => void;
}

export function StationMapView({
  stations, currentLocation, fuelType, nearestStation, cheapestStation, corridorStation, locationLabel, onSelectionChange,
}: StationMapViewProps) {
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [showLocateFAB, setShowLocateFAB] = useState(false);
  // Map loading overlay: shown until tiles finish loading (covers the blank grey flash)
  const [mapReady, setMapReady] = useState(false);
  const mapOverlayOpacity = useRef(new Animated.Value(1)).current;
  const cameraRef = useRef<MapLibreGL.CameraRef | null>(null);
  const isProgrammaticMoveRef = useRef(false);
  // Tracks the last known map center [lng, lat] — used in dismissCard to prevent drift
  // when resetting camera padding (padding reset without centerCoordinate shifts the view).
  const cameraCenterRef = useRef<[number, number]>(
    currentLocation ? [currentLocation.lng, currentLocation.lat] : [10.0, 51.1635]
  );
  // Bug-fix: prevents MapView.onPress from immediately dismissing a card we just opened
  // via ShapeSource.onPress (event bubbling). Set for 80ms after each marker tap.
  const justSelectedRef = useRef(false);
  // UX guard: ignores map background taps during card slide-in animation (~350ms)
  const isAnimatingRef = useRef(false);
  // Store actions
  const recordNavigatedToStation = useUserStore(s => s.recordNavigatedToStation);
  // i18n reactive dependency — re-renders map when language changes
  const _lang = useUserStore(s => s.language); // eslint-disable-line @typescript-eslint/no-unused-vars

  // Notify parent when card opens/closes (used for FAB auto-hide)
  useEffect(() => {
    onSelectionChange?.(selectedStation !== null);
  }, [selectedStation, onSelectionChange]);


  // ── Dual GeoJSON sources for zero-flicker selection highlight ──────────────
  // mainGeoJSON: ALL stations with cheapest/nearest/open/closed state.
  //   Does NOT include selectedStation state — so selection changes don't trigger
  //   a full N-feature ShapeSource update.
  const mainGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: stations.map(s => ({
      type: 'Feature',
      id: s.id,
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      properties: {
        stationId: s.id,
        price: s.price !== null ? s.price.toFixed(3) : '',
        state: !s.isOpen              ? 'closed'
             : cheapestStation?.id === s.id ? 'cheapest'
             : corridorStation?.id === s.id ? 'corridor'
             : nearestStation?.id  === s.id ? 'nearest'
             : 'open',
      },
    })),
  }), [stations, cheapestStation, nearestStation, corridorStation]);

  // selectedGeoJSON: at most 1 feature — only the selected station.
  //   Separate ShapeSource means deselecting triggers a minimal 0-feature update.
  const selectedGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: selectedStation ? [{
      type: 'Feature',
      id: selectedStation.id,
      geometry: { type: 'Point', coordinates: [selectedStation.lng, selectedStation.lat] },
      properties: {
        stationId: selectedStation.id,
        price: selectedStation.price !== null ? selectedStation.price.toFixed(3) : '',
      },
    }] : [],
  }), [selectedStation]);

  // Freeze initial map center — computed ONCE on mount from the currentLocation
  // prop. Using useMemo([]) prevents re-binding the Camera on every re-render,
  // which was the root cause of the map snapping back to the user's location
  // whenever selectedStation state changed and triggered a re-render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialCenter = useMemo<[number, number]>(() =>
    currentLocation ? [currentLocation.lng, currentLocation.lat] : [10.0, 51.1635],
  []); // Empty deps intentional — read currentLocation only at mount time

  // Camera init is handled inside handleMapReady (onDidFinishLoadingMap callback).
  // Removed 100ms setTimeout approach: Camera ref is guaranteed bound only when
  // the map style has fully loaded, which is exactly when onDidFinishLoadingMap fires.

  // ── Camera: follow currentLocation changes (e.g. user searches new PLZ) ──
  // prevLocationRef skips the very first run (already handled by initialCenter above).
  // Subsequent changes fly the camera to the new area and hide the Locate Me FAB.
  const prevLocationRef = useRef<GeoLocation | null>(null);

  useEffect(() => {
    if (!currentLocation) return;
    // First call after mount: record initial location, no camera move
    if (!prevLocationRef.current) {
      prevLocationRef.current = currentLocation;
      return;
    }
    // Skip re-renders where location hasn't actually changed
    const prev = prevLocationRef.current;
    if (prev.lat === currentLocation.lat && prev.lng === currentLocation.lng) return;

    // Location changed — fly camera to new area; Locate Me FAB not needed
    prevLocationRef.current = currentLocation;
    isProgrammaticMoveRef.current = true;
    setShowLocateFAB(false);
    cameraRef.current?.setCamera({
      centerCoordinate: [currentLocation.lng, currentLocation.lat],
      zoomLevel: 12,
      animationDuration: 600,
    });
    setTimeout(() => { isProgrammaticMoveRef.current = false; }, 700);
  }, [currentLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Centralized card dismissal — resets both state AND camera padding
  // IMPORTANT: always pass centerCoordinate so MapLibre doesn't recalculate the
  // visual centre from the padding change (which would cause the map to drift down).
  const dismissCard = useCallback(() => {
    setSelectedStation(null);
    cameraRef.current?.setCamera({
      centerCoordinate: cameraCenterRef.current,
      padding: { paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 },
      animationDuration: 0,  // instant — no visible drift
    });
  }, []);

  const handleMarkerPress = useCallback((station: Station) => {
    setSelectedStation(station);
    // UX guard: block map background tap dismiss during card slide-in (~350ms)
    isAnimatingRef.current = true;
    setTimeout(() => { isAnimatingRef.current = false; }, 400);
    isProgrammaticMoveRef.current = true;
    if (cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [station.lng, station.lat],
        zoomLevel: 14,
        animationDuration: 400,
        // Shift visual centre upward so selected station clears the bottom detail card.
        // paddingBottom ≈ card height (150px) ensures station is in the visible map area.
        padding: { paddingTop: 0, paddingRight: 0, paddingBottom: 160, paddingLeft: 0 },
      });
    }
    setTimeout(() => { isProgrammaticMoveRef.current = false; }, 500);
  }, []);

  // Navigate to selected station via device maps app
  const handleNavigate = useCallback(() => {
    if (!selectedStation) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${selectedStation.lat},${selectedStation.lng}`;
    Linking.openURL(url).catch(err =>
      console.warn('[StationMapView] Failed to open maps URL:', err)
    );
    recordNavigatedToStation();
    console.log(`[StationMapView] Navigate to: ${selectedStation.id} (${selectedStation.brand})`);
  }, [selectedStation, recordNavigatedToStation]);

  // Called after any camera movement (user pan or programmatic)
  const handleRegionDidChange = useCallback((feature: any) => {
    // feature.properties.isUserInteraction is true only for gesture-driven moves
    const isGesture = feature?.properties?.isUserInteraction === true;
    if (isGesture && !isProgrammaticMoveRef.current) {
      setShowLocateFAB(true);
    }
    // Track current geographic center so dismissCard can lock it when resetting padding
    const coords = feature?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length === 2) {
      cameraCenterRef.current = [coords[0], coords[1]];
    }
  }, []);

  const handleLocateMe = useCallback(() => {
    if (!cameraRef.current) return;
    isProgrammaticMoveRef.current = true;
    setShowLocateFAB(false);
    // fitBounds: re-frame all loaded stations (same as initial view)
    if (stations.length > 0) {
      const lats = stations.map(s => s.lat);
      const lngs = stations.map(s => s.lng);
      if (currentLocation) { lats.push(currentLocation.lat); lngs.push(currentLocation.lng); }
      cameraRef.current.fitBounds(
        [Math.min(...lngs) - 0.008, Math.min(...lats) - 0.008],
        [Math.max(...lngs) + 0.008, Math.max(...lats) + 0.008],
        [60, 30, 60, 30],
        600,
      );
    } else if (currentLocation) {
      cameraRef.current.setCamera({
        centerCoordinate: [currentLocation.lng, currentLocation.lat],
        zoomLevel: 13,
        animationDuration: 600,
      });
    }
    setTimeout(() => { isProgrammaticMoveRef.current = false; }, 700);
  }, [stations, currentLocation]);

  // onDidFinishLoadingMap: fires ONCE when the map style + camera are fully initialised.
  // At this point cameraRef is guaranteed bound — safe to call setCamera / fitBounds.
  const handleMapReady = useCallback(() => {
    if (mapReady) return;

    if (cameraRef.current) {
      if (stations.length > 0) {
        // fitBounds(SW, NE, padding, duration) — MapLibre React Native convention
        const lats = stations.map(s => s.lat);
        const lngs = stations.map(s => s.lng);
        if (currentLocation) { lats.push(currentLocation.lat); lngs.push(currentLocation.lng); }
        cameraRef.current.fitBounds(
          [Math.min(...lngs) - 0.008, Math.min(...lats) - 0.008],  // SW [lng, lat]
          [Math.max(...lngs) + 0.008, Math.max(...lats) + 0.008],  // NE [lng, lat]
          [60, 30, 60, 30],   // padding: [top, right, bottom, left] px
          0,                  // instant on first paint
        );
      } else if (currentLocation) {
        cameraRef.current.setCamera({
          centerCoordinate: [currentLocation.lng, currentLocation.lat],
          zoomLevel: 13,
          animationDuration: 0,
        });
      }
    }

    Animated.timing(mapOverlayOpacity, {
      toValue: 0,
      duration: 350,
      useNativeDriver: true,
    }).start(() => setMapReady(true));
  }, [mapReady, mapOverlayOpacity, stations, currentLocation]);

  // ── Re-fitBounds when new stations arrive after initial map load ──────────
  // e.g. user searches a new PLZ — new stations are fetched, we re-frame the map.
  // Guard: only fire after mapReady (cameraRef is bound) and when stations change.
  const prevStationsLengthRef = useRef(0);
  useEffect(() => {
    if (!mapReady || stations.length === 0 || !cameraRef.current) return;
    // Skip if station count hasn't changed (e.g. fuel-type switch just re-prices same set)
    if (stations.length === prevStationsLengthRef.current && prevStationsLengthRef.current > 0) return;
    prevStationsLengthRef.current = stations.length;

    const lats = stations.map(s => s.lat);
    const lngs = stations.map(s => s.lng);
    if (currentLocation) { lats.push(currentLocation.lat); lngs.push(currentLocation.lng); }
    isProgrammaticMoveRef.current = true;
    setShowLocateFAB(false);
    cameraRef.current.fitBounds(
      [Math.min(...lngs) - 0.008, Math.min(...lats) - 0.008],
      [Math.max(...lngs) + 0.008, Math.max(...lats) + 0.008],
      [60, 30, 60, 30],
      500,
    );
    setTimeout(() => { isProgrammaticMoveRef.current = false; }, 600);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations, mapReady]);

  // attributionPosition.bottom rises when the detail card is open (~130px card height)
  const attrBottom = selectedStation ? 134 : 8;

  // FAB position: rises above the detail card when it's open
  const fabBottom = selectedStation ? 150 : 24;

  return (
    <View style={mapStyles.container}>
      <MapLibreGL.MapView
        style={mapStyles.map}
        mapStyle={MAP_STYLE}
        logoEnabled={false}
        attributionEnabled={true}
        attributionPosition={{ bottom: attrBottom, right: 8 }}
        compassEnabled={true}
        pitchEnabled={false}
        rotateEnabled={false}
        onRegionDidChange={handleRegionDidChange}
        onDidFinishLoadingMap={handleMapReady}
        onPress={() => {
          // Guard 1: ShapeSource tap just happened (justSelectedRef) — skip dismiss
          // Guard 2: Card is still animating in (isAnimatingRef) — skip dismiss
          if (justSelectedRef.current || isAnimatingRef.current) return;
          if (selectedStation) dismissCard();
        }}
      >
        <MapLibreGL.Camera
          ref={cameraRef}
          animationMode="flyTo"
          animationDuration={600}
          // Clamp zoom range: prevents zoom-out to world view (9=city) and
          // zoom-in beyond street-number level (17). Applied at Camera level.
          minZoomLevel={9}
          maxZoomLevel={17}
          // NOTE: No declarative centerCoordinate — camera is driven imperatively
          // via useEffect (initial) and setCamera() (on marker press / locate-me).
          // Declarative binding caused the map to snap back to user location on
          // every re-render (e.g. when selectedStation state changed).
        />

        {/* User location dot */}
        <MapLibreGL.UserLocation visible={true} />

        {/* Station markers — dual ShapeSource architecture:
            - stationsSource: ALL stations (cheapest/nearest/open/closed colors)
              useMemo-d on [stations, cheapest, nearest] only, never on selectedStation
              → selection changes do NOT trigger a full N-feature GL update
            - selectedSource: the 1 selected station (gold highlight)
              Separate source means deselection = 0-feature update, zero flicker         */}
        {stations.length > 0 && (
          <MapLibreGL.ShapeSource
            id="stationsSource"
            shape={mainGeoJSON}
            hitbox={{ width: 44, height: 44 }}
            onPress={(e) => {
              // Set guard for 80ms: prevents MapView.onPress from immediately
              // dismissing the card we're about to open (event propagation bug).
              justSelectedRef.current = true;
              setTimeout(() => { justSelectedRef.current = false; }, 80);
              const feat = e?.features?.[0];
              if (!feat) return;
              const sid = feat.properties?.stationId;
              const station = stations.find(s => s.id === sid);
              if (station) handleMarkerPress(station);
            }}
          >
            {/* Main dot layer: cheapest=green, nearest=indigo, open=blue, closed=gray */}
            <MapLibreGL.CircleLayer
              id="stationDots"
              style={{
                circleRadius: ['match', ['get', 'state'],
                  'cheapest', 13,
                  'corridor', 13,
                  'nearest',  13,
                  'closed',   8,
                  10
                ] as any,
                circleColor: ['match', ['get', 'state'],
                  'cheapest', '#22C55E',
                  'corridor', '#F59E0B',
                  'nearest',  '#6366F1',
                  'closed',   '#374151',
                  '#60A5FA'
                ] as any,
                circleOpacity: ['match', ['get', 'state'], 'closed', 0.4, 1.0] as any,
                circleStrokeWidth: 1.5,
                circleStrokeColor: 'rgba(255,255,255,0.2)',
                circlePitchAlignment: 'map',
              }}
            />
            {/* Price labels on all open stations */}
            <MapLibreGL.SymbolLayer
              id="stationLabels"
              filter={['!=', ['get', 'state'], 'closed'] as any}
              style={{
                textField: ['get', 'price'] as any,
                textSize: 9,
                textColor: '#FFFFFF',
                // CARTO Dark Matter uses Open Sans — Noto Sans Bold is not in this tile stack
                textFont: ['Open Sans Bold', 'Arial Unicode MS Bold'],
                textAnchor: 'center',
                textIgnorePlacement: true,
                textAllowOverlap: true,
              } as any}
            />
          </MapLibreGL.ShapeSource>
        )}

        {/* Selected station overlay — separate source for zero-flicker swap */}
        <MapLibreGL.ShapeSource
          id="selectedSource"
          shape={selectedGeoJSON}
        >
          {/* Gold outer glow ring */}
          <MapLibreGL.CircleLayer
            id="selectedGlow"
            style={{
              circleRadius: 22,
              circleColor: 'rgba(251,191,36,0.15)',
              circleBlur: 1.2,
            }}
          />
          {/* Gold solid dot */}
          <MapLibreGL.CircleLayer
            id="selectedDot"
            style={{
              circleRadius: 14,
              circleColor: '#FBBF24',
              circleStrokeWidth: 2,
              circleStrokeColor: 'rgba(255,255,255,0.5)',
              circlePitchAlignment: 'map',
            }}
          />
          {/* Selected price label (darker text on gold) */}
          <MapLibreGL.SymbolLayer
            id="selectedLabel"
            style={{
              textField: ['get', 'price'] as any,
              textSize: 9,
              textColor: '#1A1D26',
              textFont: ['Open Sans Bold', 'Arial Unicode MS Bold'],
              textAnchor: 'center',
              textIgnorePlacement: true,
              textAllowOverlap: true,
            } as any}
          />
        </MapLibreGL.ShapeSource>
      </MapLibreGL.MapView>

      {/* ── Legend — top-right ─────────────────────────────────────────────── */}
      <View style={mapStyles.legend}>
        <View style={mapStyles.legendItem}>
          <View style={[mapStyles.legendDot, { backgroundColor: '#22C55E', shadowColor: '#22C55E', shadowOpacity: 0.7, shadowRadius: 4, elevation: 4 }]} />
          <Text style={mapStyles.legendText}>{t('cheapest')}</Text>
        </View>
        <View style={mapStyles.legendItem}>
          <View style={[mapStyles.legendDot, { backgroundColor: '#F59E0B', shadowColor: '#F59E0B', shadowOpacity: 0.7, shadowRadius: 4, elevation: 4 }]} />
          <Text style={mapStyles.legendText}>Auf dem Weg</Text>
        </View>
        <View style={mapStyles.legendItem}>
          <View style={[mapStyles.legendDot, { backgroundColor: '#6366F1', shadowColor: '#6366F1', shadowOpacity: 0.7, shadowRadius: 4, elevation: 4 }]} />
          <Text style={mapStyles.legendText}>{t('nearest')}</Text>
        </View>
        <View style={mapStyles.legendItem}>
          <View style={[mapStyles.legendDot, { backgroundColor: '#60A5FA' }]} />
          <Text style={mapStyles.legendText}>{t('open')}</Text>
        </View>
        <View style={mapStyles.legendItem}>
          <View style={[mapStyles.legendDot, { backgroundColor: '#4B5563' }]} />
          <Text style={mapStyles.legendText}>{t('closed')}</Text>
        </View>
        {/* Current location label */}
        {locationLabel && (
          <View style={mapStyles.legendDivider} />
        )}
        {locationLabel && (
          <View style={mapStyles.legendItem}>
            <Text style={mapStyles.legendLocIcon}>📍</Text>
            <Text style={[mapStyles.legendText, { color: '#A5B4FC' }]} numberOfLines={1}>{locationLabel}</Text>
          </View>
        )}
      </View>

      {/* ── Locate Me FAB — appears after user pans ────────────────────────── */}
      {showLocateFAB && (
        <TouchableOpacity
          style={[mapStyles.locateFAB, { bottom: fabBottom }]}
          onPress={handleLocateMe}
          activeOpacity={0.8}
          accessibilityLabel={t('returnToLoc')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={mapStyles.locateFABIcon}>⊕</Text>
        </TouchableOpacity>
      )}

      {/* ── Bottom detail card ─────────────────────────────────────────────── */}
      {selectedStation && (
        <StationDetailCard
          station={selectedStation}
          fuelType={fuelType}
          isCheapest={cheapestStation?.id === selectedStation.id}
          isNearest={nearestStation?.id === selectedStation.id}
          isCorridor={corridorStation?.id === selectedStation.id}
          onClose={dismissCard}
          onNavigate={handleNavigate}
        />
      )}

      {/* ── Map loading overlay — fades out when tiles finish rendering ────── */}
      {!mapReady && (
        <Animated.View style={[mapStyles.loadingOverlay, { opacity: mapOverlayOpacity }]}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={mapStyles.loadingOverlayText}>{t('mapLoading')}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const mapStyles = StyleSheet.create({
  container: { flex: 1 },
  map:       { flex: 1 },

  // Legend (glassmorphism style)
  legend: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(13,15,20,0.88)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
    padding: 10,
    gap: 7,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
    maxWidth: 120,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendDot:  { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: '#9CA3AF', fontSize: 11, fontWeight: '600', flexShrink: 1 },
  legendDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 2 },
  legendLocIcon: { fontSize: 10 },

  // Map loading overlay
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0D0F14',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  loadingOverlayText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '500',
  },

  // Locate Me FAB
  locateFAB: {
    position: 'absolute',
    right: 14,
    backgroundColor: 'rgba(13,15,20,0.92)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.45)',
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  locateFABIcon: {
    color: '#A5B4FC',
    fontSize: 22,
    fontWeight: '300',
    lineHeight: 26,
  },
});

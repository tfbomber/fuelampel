// ====================================================
// FuelAmpel — StationMapView Component (v2)
//
// Changes vs v1:
//  - Station markers redesigned: dot (●) + price label side-by-side
//    Dot = precise geo anchor, label = dark pill with 3-decimal price
//    Cheapest dot: 12px green with glow; Nearest: 12px indigo; Others: 10px gray
//    Closed stations: entire marker at 40% opacity
//  - Bottom detail card height compressed (~110px → was ~148px)
//  - attributionPosition.bottom updated to match new card height
//  - All German text translated to English
// ====================================================

import React, { useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated,
} from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { Station, GeoLocation } from '../utils/types';
import { formatFuelType } from '../utils/formatters';
import type { FuelType } from '../utils/types';

// ─── CARTO Dark Matter — free, no API key ────────────────────────────────────
const CARTO_DARK_STYLE = {
  version: 8,
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '\u00a9 OpenStreetMap contributors \u00a9 CARTO',
    },
  },
  layers: [{
    id: 'carto-dark-tiles',
    type: 'raster',
    source: 'carto-dark',
  }],
} as const;

// ─── Station Marker: dot ● + price label ──────────────────────────────────────
//
// Layout:  [●]─[dark pill: "1.234"]
//
// anchor: { x: 0, y: 0.5 } → dot left-edge = geo-coordinate
// At zoom 12, 5px offset ≈ 5–8m real distance (within GPS accuracy tolerance).
//
// Sizing rationale:
//   - Dot: 10px (regular) / 12px (cheapest+nearest) → compact, low overlap
//   - Pill: ~43px wide, 16px tall → 40% smaller than previous block markers
//   - Letter-spacing -0.3 on "1.234" to squeeze width without sacrificing readability
//   - Closed stations: full component at 40% opacity, no pill (dot only)
//     → removes clutter for irrelevant stations, keeps them visible for reference

function StationMarker({
  price, isOpen, isCheapest, isNearest,
}: {
  price: number | null;
  isOpen: boolean;
  isCheapest: boolean;
  isNearest: boolean;
}) {
  const dotSize    = (isCheapest || isNearest) ? 12 : 10;
  const dotRadius  = dotSize / 2;

  const dotColor =
    !isOpen    ? '#4B5563'   :
    isCheapest ? '#22C55E'   :
    isNearest  ? '#6366F1'   :
                 '#94A3B8'   ; // light blue-gray for regular open

  const pillBorderColor =
    isCheapest ? 'rgba(34,197,94,0.5)'  :
    isNearest  ? 'rgba(99,102,241,0.5)' :
                 'rgba(255,255,255,0.12)';

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
  if (glowColor && isOpen) {
    dotStyle.shadowColor   = glowColor;
    dotStyle.shadowOpacity = 0.7;
    dotStyle.shadowRadius  = 4;
    dotStyle.elevation     = 4;
  }

  // Closed: show just a faded dot, no price label
  if (!isOpen) {
    return (
      <View style={[markerStyles.root, { opacity: 0.4 }]}>
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
  pill: {
    backgroundColor: 'rgba(8,10,18,0.86)',
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

// ─── Bottom detail card (compressed) ─────────────────────────────────────────
function StationDetailCard({
  station, fuelType, onClose,
}: {
  station: Station;
  fuelType: FuelType;
  onClose: () => void;
}) {
  const slideAnim = useRef(new Animated.Value(110)).current;

  React.useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 180,
    }).start();
  }, [station.id]);

  return (
    <Animated.View style={[cardStyles.card, { transform: [{ translateY: slideAnim }] }]}>
      {/* Drag handle */}
      <View style={cardStyles.handle} />

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
          <Text style={cardStyles.statLbl}>Distance</Text>
        </View>
        <View style={cardStyles.divider} />
        <View style={cardStyles.stat}>
          <Text style={[cardStyles.statVal, { color: station.isOpen ? '#22C55E' : '#EF4444' }]}>
            {station.isOpen ? 'Open' : 'Closed'}
          </Text>
          <Text style={cardStyles.statLbl}>Status</Text>
        </View>
      </View>
    </Animated.View>
  );
}

// Compressed card: total height ~108px (was ~148px)
const cardStyles = StyleSheet.create({
  card: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1A1D26',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: 20,
    paddingTop: 8,        // was 12
    paddingBottom: 16,    // was 24
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  handle: {
    width: 32,
    height: 3,            // was 4
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,      // was 14
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,     // was 16
  },
  name:         { color: '#F9FAFB', fontSize: 14, fontWeight: '800' },
  address:      { color: '#6B7280', fontSize: 11, marginTop: 1 },
  closeBtn:     { padding: 4 },
  closeBtnText: { color: '#4B5563', fontSize: 15, fontWeight: '700' },
  row:    { flexDirection: 'row', alignItems: 'center' },
  stat:   { flex: 1, alignItems: 'center', gap: 2 },
  statVal:{ color: '#F9FAFB', fontSize: 13, fontWeight: '800' },
  statLbl:{ color: '#4B5563', fontSize: 10 },
  divider:{ width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.07)' },
});

// ─── Main map component ────────────────────────────────────────────────────────
interface StationMapViewProps {
  stations: Station[];
  currentLocation: GeoLocation | null;
  fuelType: FuelType;
  // regionMedian removed — not used after v2 marker redesign
  nearestStation: Station | null;
  cheapestStation: Station | null;
}

export function StationMapView({
  stations, currentLocation, fuelType, nearestStation, cheapestStation,
}: StationMapViewProps) {
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const cameraRef = useRef<MapLibreGL.CameraRef | null>(null);

  const center: [number, number] = currentLocation
    ? [currentLocation.lng, currentLocation.lat]
    : [10.0, 51.1635];

  const handleMarkerPress = useCallback((station: Station) => {
    setSelectedStation(station);
    if (cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [station.lng, station.lat],
        zoomLevel: 13,
        animationDuration: 400,
      });
    }
  }, []);

  // attributionPosition.bottom matches compressed card height (~110px)
  const attrBottom = selectedStation ? 112 : 8;

  return (
    <View style={mapStyles.container}>
      <MapLibreGL.MapView
        style={mapStyles.map}
        mapStyle={CARTO_DARK_STYLE}
        logoEnabled={false}
        attributionEnabled={true}
        attributionPosition={{ bottom: attrBottom, right: 8 }}
        compassEnabled={true}
      >
        <MapLibreGL.Camera
          ref={cameraRef}
          centerCoordinate={center}
          zoomLevel={12}
          animationMode="flyTo"
          animationDuration={600}
        />

        {/* User location dot */}
        <MapLibreGL.UserLocation visible={true} />

        {/* Station markers — dot + label design */}
        {stations.map(station => {
          const isCheapest = cheapestStation?.id === station.id;
          const isNearest  = nearestStation?.id  === station.id;
          return (
            <MapLibreGL.MarkerView
              key={station.id}
              coordinate={[station.lng, station.lat]}
              anchor={{ x: 0, y: 0.5 }}
            >
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => handleMarkerPress(station)}
              >
                <StationMarker
                  price={station.price}
                  isOpen={station.isOpen}
                  isCheapest={isCheapest}
                  isNearest={isNearest}
                />
              </TouchableOpacity>
            </MapLibreGL.MarkerView>
          );
        })}
      </MapLibreGL.MapView>

      {/* Legend — top-right */}
      <View style={mapStyles.legend}>
        <View style={mapStyles.legendItem}>
          <View style={[mapStyles.legendDot, { backgroundColor: '#22C55E' }]} />
          <Text style={mapStyles.legendText}>Cheapest</Text>
        </View>
        <View style={mapStyles.legendItem}>
          <View style={[mapStyles.legendDot, { backgroundColor: '#6366F1' }]} />
          <Text style={mapStyles.legendText}>Nearest</Text>
        </View>
        <View style={mapStyles.legendItem}>
          <View style={[mapStyles.legendDot, { backgroundColor: '#4B5563' }]} />
          <Text style={mapStyles.legendText}>Closed</Text>
        </View>
      </View>

      {/* Bottom detail card */}
      {selectedStation && (
        <StationDetailCard
          station={selectedStation}
          fuelType={fuelType}
          onClose={() => setSelectedStation(null)}
        />
      )}
    </View>
  );
}

const mapStyles = StyleSheet.create({
  container: { flex: 1 },
  map:       { flex: 1 },
  legend: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(13,15,20,0.88)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: 10,
    gap: 6,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:  { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: '#9CA3AF', fontSize: 11, fontWeight: '600' },
});

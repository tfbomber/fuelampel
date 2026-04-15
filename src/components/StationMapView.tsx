// ====================================================
// FuelAmpel — StationMapView Component
//
// Map view for the Stations tab.
// Uses MapLibre GL + CARTO Dark Matter tiles (free, no API key).
// Renders price bubble markers per station.
// Tap a marker → shows bottom detail card.
// ====================================================

import React, { useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, Animated,
} from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { Station, GeoLocation } from '../utils/types';
import { formatFuelType } from '../utils/formatters';
import type { FuelType } from '../utils/types';

// ─── CARTO Dark Matter — free, no API key ─────────────────────────────────────
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

// ─── Price bubble marker ───────────────────────────────────────────────────────
function PriceBubble({
  price, isOpen, isCheapest, isNearest,
}: {
  price: number | null;
  isOpen: boolean;
  isCheapest: boolean;
  isNearest: boolean;
}) {
  const bgColor =
    !isOpen           ? '#374151'     :
    isCheapest        ? '#22C55E'     :
    isNearest         ? '#6366F1'     :
                        '#1E2130'     ;

  const borderColor =
    isCheapest ? '#4ADE80' :
    isNearest  ? '#818CF8' :
    isOpen     ? 'rgba(255,255,255,0.18)' :
                 'rgba(255,255,255,0.06)';

  return (
    <View style={[bubbleStyles.root, { backgroundColor: bgColor, borderColor }]}>
      <Text style={[bubbleStyles.price, !isOpen && bubbleStyles.priceClosed]}>
        {price !== null ? price.toFixed(3) : '—'}
      </Text>
      {!isOpen && <Text style={bubbleStyles.closedTag}>closed</Text>}
    </View>
  );
}

const bubbleStyles = StyleSheet.create({
  root: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    minWidth: 52,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  price:       { color: '#F9FAFB', fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  priceClosed: { color: '#6B7280' },
  closedTag:   { color: '#4B5563', fontSize: 8, fontWeight: '600', marginTop: 1 },
});

// ─── Bottom detail card ───────────────────────────────────────────────────────
function StationDetailCard({
  station,
  fuelType,
  onClose,
}: {
  station: Station;
  fuelType: FuelType;
  onClose: () => void;
}) {
  const slideAnim = useRef(new Animated.Value(120)).current;

  React.useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 160,
    }).start();
  }, [station.id]);

  return (
    <Animated.View style={[cardStyles.card, { transform: [{ translateY: slideAnim }] }]}>
      <View style={cardStyles.handle} />
      <View style={cardStyles.header}>
        <View style={{ flex: 1 }}>
          <Text style={cardStyles.name} numberOfLines={1}>{station.brand || station.name}</Text>
          <Text style={cardStyles.address} numberOfLines={1}>
            {station.street} · {station.place}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} style={cardStyles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={cardStyles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

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
          <Text style={cardStyles.statLbl}>Entfernung</Text>
        </View>
        <View style={cardStyles.divider} />
        <View style={cardStyles.stat}>
          <Text style={[cardStyles.statVal, { color: station.isOpen ? '#22C55E' : '#EF4444' }]}>
            {station.isOpen ? 'Offen' : 'Geschlossen'}
          </Text>
          <Text style={cardStyles.statLbl}>Status</Text>
        </View>
      </View>
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
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  header:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16 },
  name:         { color: '#F9FAFB', fontSize: 15, fontWeight: '800' },
  address:      { color: '#6B7280', fontSize: 12, marginTop: 2 },
  closeBtn:     { padding: 4 },
  closeBtnText: { color: '#4B5563', fontSize: 16, fontWeight: '700' },
  row:    { flexDirection: 'row', alignItems: 'center' },
  stat:   { flex: 1, alignItems: 'center', gap: 3 },
  statVal:{ color: '#F9FAFB', fontSize: 14, fontWeight: '800' },
  statLbl:{ color: '#4B5563', fontSize: 10 },
  divider:{ width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.07)' },
});

// ─── Main map component ────────────────────────────────────────────────────────
const { height: SCREEN_H } = Dimensions.get('window');

interface StationMapViewProps {
  stations: Station[];
  currentLocation: GeoLocation | null;
  fuelType: FuelType;
  regionMedian: number;
  nearestStation: Station | null;
  cheapestStation: Station | null;
}

export function StationMapView({
  stations, currentLocation, fuelType, regionMedian, nearestStation, cheapestStation,
}: StationMapViewProps) {
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const cameraRef = useRef<MapLibreGL.CameraRef | null>(null);

  const center: [number, number] = currentLocation
    ? [currentLocation.lng, currentLocation.lat]
    : [10.0, 51.1635]; // Germany center fallback

  const handleMarkerPress = useCallback((station: Station) => {
    setSelectedStation(station);
    // Pan map to give space for the bottom card
    if (cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [station.lng, station.lat],
        zoomLevel: 13,
        animationDuration: 400,
      });
    }
  }, []);

  return (
    <View style={mapStyles.container}>
      <MapLibreGL.MapView
        style={mapStyles.map}
        mapStyle={CARTO_DARK_STYLE}
        logoEnabled={false}
        attributionEnabled={true}
        attributionPosition={{ bottom: selectedStation ? 148 : 8, right: 8 }}
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

        {/* Station markers */}
        {stations.map(station => {
          const isCheapest = cheapestStation?.id === station.id;
          const isNearest  = nearestStation?.id  === station.id;
          return (
            <MapLibreGL.MarkerView
              key={station.id}
              coordinate={[station.lng, station.lat]}
              anchor={{ x: 0.5, y: 1 }}
            >
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => handleMarkerPress(station)}
              >
                <PriceBubble
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

      {/* Legend */}
      <View style={mapStyles.legend}>
        <View style={mapStyles.legendItem}>
          <View style={[mapStyles.legendDot, { backgroundColor: '#22C55E' }]} />
          <Text style={mapStyles.legendText}>Günstigste</Text>
        </View>
        <View style={mapStyles.legendItem}>
          <View style={[mapStyles.legendDot, { backgroundColor: '#6366F1' }]} />
          <Text style={mapStyles.legendText}>Nächste</Text>
        </View>
        <View style={mapStyles.legendItem}>
          <View style={[mapStyles.legendDot, { backgroundColor: '#374151' }]} />
          <Text style={mapStyles.legendText}>Geschlossen</Text>
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

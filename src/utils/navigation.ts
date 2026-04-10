// ====================================================
// FuelAmpel — Google Maps Navigation Helper
// Opens Google Maps (app or web) for turn-by-turn nav.
// ====================================================

import { Linking, Platform, Alert } from 'react-native';

/**
 * Open Google Maps navigation to a destination.
 * Tries the native Google Maps app first, falls back to browser.
 *
 * @param lat  Destination latitude
 * @param lng  Destination longitude
 * @param label  Human-readable place name (shown in Maps)
 */
export async function openGoogleMapsNavigation(
  lat: number,
  lng: number,
  label: string
): Promise<void> {
  const encoded = encodeURIComponent(label);

  // Android: geo: URI opens Google Maps with a pin at the location.
  // The user sees the station on the map and can tap "Directions" to start routing.
  // This avoids auto-launching navigation, which feels abrupt.
  const androidUrl = `geo:${lat},${lng}?q=${lat},${lng}(${encoded})`;

  // iOS: comgooglemaps:// shows the location without auto-starting navigation
  const iosUrl = `comgooglemaps://?q=${lat},${lng}&zoom=15`;

  // Universal web fallback: opens Google Maps showing a pin at the location
  const webUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&query_place_name=${encoded}`;

  try {
    const nativeUrl = Platform.OS === 'android' ? androidUrl : iosUrl;
    const canOpen = await Linking.canOpenURL(nativeUrl);

    if (canOpen) {
      console.log(`[Navigation] Opening Google Maps (pin view) for: ${label}`);
      await Linking.openURL(nativeUrl);
    } else {
      console.log(`[Navigation] Falling back to Google Maps web for: ${label}`);
      await Linking.openURL(webUrl);
    }
  } catch (err) {
    console.error('[Navigation] Failed to open maps:', err);
    Alert.alert(
      'Navigation Error',
      'Could not open Google Maps. Please install Google Maps and try again.'
    );
  }
}

/**
 * Get direct Google Maps URL for display purposes (e.g. sharing).
 */
export function getGoogleMapsUrl(lat: number, lng: number, label: string): string {
  return (
    `https://www.google.com/maps/search/?api=1` +
    `&query=${lat},${lng}` +
    `&query_place_name=${encodeURIComponent(label)}`
  );
}

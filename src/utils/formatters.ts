// ====================================================
// FuelAmpel — Formatters
// Pure utility functions. No side effects.
// ====================================================

/**
 * Format a fuel price in Euro/Liter display format.
 * e.g. 1.739 → "1.73 9" (German notation with superscript last digit)
 * For MVP: simple 3-decimal display.
 */
export function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return 'N/A';
  return `${price.toFixed(3)} €`;
}

/**
 * Format a saving in cents per liter.
 * e.g. 0.035 → "3.5¢"
 */
export function formatSaving(savingEuro: number): string {
  const cents = savingEuro * 100;
  if (cents <= 0) return '0¢';
  return `${cents.toFixed(1)}¢`;
}

/**
 * Format distance in km with one decimal.
 * e.g. 1.234 → "1.2 km"
 */
export function formatDistance(km: number | null | undefined): string {
  if (km === null || km === undefined) return '—';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/**
 * Format remaining km estimate.
 * e.g. 123 → "~123 km"
 */
export function formatRemainingKm(km: number): string {
  return `~${Math.round(km)} km`;
}

/**
 * Format a timestamp to a relative time string.
 * e.g. "3 min ago", "2h ago"
 */
export function formatRelativeTime(unixTimestampMs: number): string {
  const diffMs = Date.now() - unixTimestampMs;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.floor(diffMin / 60);
  return `${diffH}h ago`;
}

/**
 * Map fuel type key to human-readable label.
 */
export function formatFuelType(type: 'e5' | 'e10' | 'diesel'): string {
  const labels: Record<string, string> = {
    e5: 'Super',
    e10: 'Super E10',
    diesel: 'Diesel',
  };
  return labels[type] ?? type.toUpperCase();
}

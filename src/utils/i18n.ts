// ====================================================
// FuelAmpel — i18n utility (v1)
// Lightweight dictionary-based translation.
// Default language: German ('de')
// ====================================================

export type Language = 'de' | 'en';

const translations = {
  de: {
    // Settings
    language:          'Sprache',
    fuelType:          'Kraftstoffart',
    areas:             'Gebiete (Zuhause & Arbeit)',
    homeArea:          'Heimatgebiet',
    workArea:          'Arbeitsgebiet (optional)',
    refuelingStyle:    'Tankverhalten',
    vehicleType:       'Fahrzeugtyp',
    fullTankCost:      'Tankkosten (voll)',
    shadowTank:        'Schattentank',
    avgConsumption:    'Durchschnittsverbrauch (L/100km)',
    tankCapacity:      'Tankgröße (Liter)',
    fullTankRange:     'Reichweite bei vollem Tank (km)',
    fullTankRangeHint: 'Zeigt „≈ ZZZ km" statt %. Leer lassen oder 0 zum Zurücksetzen.',
    refuelReset:       '⛽  Ich habe getankt — Tank zurücksetzen',
    tankReset:         '✓ Tank zurückgesetzt!',
    about:             'Über die App',
    dangerZone:        'Gefahrenzone',
    fullReset:         '🔄  Alles zurücksetzen',
    fullResetDesc:     'Löscht alle Daten — kehrt zum Einrichtungsbildschirm zurück',
    saved:             '✓ Gespeichert',
    addrPlaceholder:   'Adresse, Stadt oder PLZ…',
    // Refueling styles
    whenNearlyEmpty:   'Kurz vor leer',
    bestPriceAlways:   'Immer günstigster Preis',
    // Car types
    carSmall:          'Klein (<45 L)',
    carFamily:         'Familie (45–65 L)',
    carLarge:          'Groß / SUV (65L+)',
    carUnknown:        'Nicht sicher',
    // Fuel amounts
    below40:           '< 40 €',
    from40to60:        '40 – 60 €',
    from60to80:        '60 – 80 €',
    above80:           '80 € +',
    dontRemember:      'Weiß nicht mehr',
    // Home screen
    viewStations:      '→  Stationen anzeigen',
    iRefueled:         '⛽  Ich habe getankt',
    checkingPrices:    'Preise werden geladen...',
    couldNotLoad:      'Daten konnten nicht geladen werden',
    bestOptionNearby:  'Beste Option in der Nähe',
    locationDenied:    '📍 Standortzugriff verweigert. Bitte in den Systemeinstellungen aktivieren.',
    systemSettings:    '❯ System',
    setupSmartTank:    '💡 SmartTank nicht konfiguriert — Tippe hier, um dein Heimatgebiet einzurichten und smarte Tankprognosen zu aktivieren.',
    setupCta:          'Einrichten ›',
    estimateOutdated:  '🔄  Schätzung möglicherweise veraltet — Hast du getankt?',
    yesReset:          'Ja, zurücksetzen',
    undoLabel:         '↺ Rückgängig',
    // Map
    cheapest:          'Günstigster',
    nearest:           'Nächster',
    open:              'Geöffnet',
    closed:            'Geschlossen',
    distance:          'Entfernung',
    status:            'Status',
    returnToLoc:       'Zum Standort zurückkehren',
    // Language names
    langDe:            'Deutsch',
    langEn:            'English',
  },
  en: {
    language:          'Language',
    fuelType:          'Fuel Type',
    areas:             'Areas (Home & Work)',
    homeArea:          'Home area',
    workArea:          'Work area (optional)',
    refuelingStyle:    'Refueling Style',
    vehicleType:       'Vehicle Type',
    fullTankCost:      'Full Tank Cost',
    shadowTank:        'Shadow Tank',
    avgConsumption:    'Avg. Consumption (L/100km)',
    tankCapacity:      'Tank Capacity (litres)',
    fullTankRange:     'Range on full tank (km)',
    fullTankRangeHint: 'Sets the Tank Bar to show "≈ ZZZ km" instead of %. Enter 0 or leave blank to revert.',
    refuelReset:       '⛽  I refueled — Reset Tank',
    tankReset:         '✓ Tank reset!',
    about:             'About',
    dangerZone:        'Danger Zone',
    fullReset:         '🔄  Full Reset / Start Over',
    fullResetDesc:     'Clears everything — returns to setup screen',
    saved:             '✓ Saved',
    addrPlaceholder:   'Address, city or postal code…',
    whenNearlyEmpty:   'When nearly empty',
    bestPriceAlways:   'Best price always',
    carSmall:          'Small  (< 45 L)',
    carFamily:         'Family  (45–65 L)',
    carLarge:          'Large / SUV  (65L+)',
    carUnknown:        'Not sure',
    below40:           '< 40 €',
    from40to60:        '40 – 60 €',
    from60to80:        '60 – 80 €',
    above80:           '80 € +',
    dontRemember:      "Don't remember",
    viewStations:      '→  View stations',
    iRefueled:         '⛽  I refueled',
    checkingPrices:    'Checking prices...',
    couldNotLoad:      'Could not load data',
    bestOptionNearby:  'Best Option Nearby',
    locationDenied:    '📍 Location access denied. Please enable in system settings.',
    systemSettings:    '❯ System',
    setupSmartTank:    '💡 SmartTank not configured — tap here to set your home region and enable smart fuel predictions.',
    setupCta:          'Set up ›',
    estimateOutdated:  '🔄  Estimate may be outdated — did you refuel?',
    yesReset:          'Yes, reset',
    undoLabel:         '↺ Undo',
    cheapest:          'Cheapest',
    nearest:           'Nearest',
    open:              'Open',
    closed:            'Closed',
    distance:          'Distance',
    status:            'Status',
    returnToLoc:       'Return to my location',
    langDe:            'Deutsch',
    langEn:            'English',
  },
} as const;

export type TranslationKey = keyof typeof translations['de'];

// Module-level active language — synced by userStore on boot/change
let _lang: Language = 'de';

export function setAppLanguage(lang: Language): void {
  _lang = lang;
}

export function getAppLanguage(): Language {
  return _lang;
}

/** Main translation function */
export function t(key: TranslationKey): string {
  const val = (translations[_lang] as Record<string, string>)[key];
  if (val !== undefined) return val;
  // Fallback to German
  return (translations['de'] as Record<string, string>)[key] ?? key;
}

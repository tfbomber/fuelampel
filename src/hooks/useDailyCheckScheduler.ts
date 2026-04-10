// ====================================================
// FuelAmpel — useDailyCheckScheduler Hook
//
// Automatically reschedules the 16:00 daily check
// notification whenever SmartTankState changes.
//
// Mount this once in _layout.tsx — it runs silently
// in the background whenever the app is open.
// ====================================================

import { useEffect } from 'react';
import { useUserStore } from '../store/userStore';
import { scheduleDailyCheck } from '../core/dailyCheck';

export function useDailyCheckScheduler(): void {
  const smartTank = useUserStore((s) => s.smartTank);

  useEffect(() => {
    // Fire async without blocking render
    scheduleDailyCheck(smartTank).catch((err) => {
      console.warn('[useDailyCheckScheduler] Unexpected error:', err);
    });
  }, [smartTank]);
  // Effect fires whenever smartTank reference changes (Zustand updates the ref on any state change).
  // This covers: app open, post-refuel, post-manual-adjust, post-onboarding.
}

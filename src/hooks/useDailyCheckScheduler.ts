// ====================================================
// FuelAmpel — useDailyCheckScheduler Hook
//
// Automatically reschedules the 11:30 daily check
// notification whenever SmartTankState changes.
//
// Mount this once in _layout.tsx — it runs silently
// in the background whenever the app is open.
// ====================================================

import { useEffect } from 'react';
import { useUserStore } from '../store/userStore';
import { useFuelStore } from '../store/fuelStore';
import { scheduleDailyCheck } from '../core/dailyCheck';

export function useDailyCheckScheduler(): void {
  const smartTank = useUserStore((s) => s.smartTank);
  const lastNotifiedMs = useUserStore((s) => s.lastNotifiedMs);
  const notificationWeekCount = useUserStore((s) => s.notificationWeekCount);
  const notificationWeekStartMs = useUserStore((s) => s.notificationWeekStartMs);
  const recordNotificationSent = useUserStore((s) => s.recordNotificationSent);

  const decision = useFuelStore((s) => s.decision);
  const corridorStation = useFuelStore((s) => s.corridorStation);

  useEffect(() => {
    const notifState = {
      lastNotifiedMs,
      weekCount: notificationWeekCount,
      weekStartMs: notificationWeekStartMs,
    };

    // Fire async without blocking render
    scheduleDailyCheck(
      smartTank,
      decision,
      corridorStation,
      notifState,
      recordNotificationSent
    ).catch((err) => {
      console.warn('[useDailyCheckScheduler] Unexpected error:', err);
    });
  }, [smartTank, decision]); // deliberately omit notifState dependencies to avoid cycle
}

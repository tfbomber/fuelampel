// ====================================================
// FuelAmpel — useDailyCheckScheduler Hook
//
// Automatically reschedules the 11:30 daily check
// notification whenever SmartTankState changes.
//
// Mount this once in _layout.tsx — it runs silently
// in the background whenever the app is open.
//
// v3 (2026-04-29):
//   - Signature aligned with dailyCheck v3:
//     decision + corridorStation params REMOVED.
//     The scheduler now depends only on SmartTank state.
//   - This prevents the scheduler from accidentally
//     pulling stale price-based decision data into
//     notification content (BUG-01 prevention).
// ====================================================

import { useEffect } from 'react';
import { useUserStore } from '../store/userStore';
import { scheduleDailyCheck } from '../core/dailyCheck';

export function useDailyCheckScheduler(): void {
  const smartTank             = useUserStore((s) => s.smartTank);
  const lastNotifiedMs        = useUserStore((s) => s.lastNotifiedMs);
  const notificationWeekCount = useUserStore((s) => s.notificationWeekCount);
  const notificationWeekStartMs = useUserStore((s) => s.notificationWeekStartMs);
  const recordNotificationSent  = useUserStore((s) => s.recordNotificationSent);

  useEffect(() => {
    const notifState = {
      lastNotifiedMs,
      weekCount: notificationWeekCount,
      weekStartMs: notificationWeekStartMs,
    };

    // Fire async without blocking render
    scheduleDailyCheck(
      smartTank,
      notifState,
      recordNotificationSent,
    ).catch((err) => {
      console.warn('[useDailyCheckScheduler] Unexpected error:', err);
    });
  }, [smartTank]); // NOTE: deliberately omit notifState to avoid reschedule-on-record cycle
  // SmartTank is the only meaningful trigger: level/consumption changes
  // are what determine whether a notification should fire.
}

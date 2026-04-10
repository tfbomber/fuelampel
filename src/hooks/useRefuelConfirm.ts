// ====================================================
// FuelAmpel — useRefuelConfirm Hook  (v2: fixed)
//
// Fix: select Zustand values individually (not as an
// object) to avoid new reference on every render,
// which was causing the infinite re-render loop.
// ====================================================

import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useUserStore } from '../store/userStore';
import { computeRefuelUrgency } from '../core/smartTank';
import {
  REFUEL_CONFIRM_NAVIGATION_DELAY_MS,
  REFUEL_LOW_ALERT_THRESHOLD_PCT,
  REFUEL_TIMEOUT_PAST_ZERO_MS,
} from '../utils/constants';

/** Banner type shown inline in the Home tab (null = no banner). */
export type RefuelBannerType = 'low_alert' | 'timeout' | null;

export function useRefuelConfirm(): { banner: RefuelBannerType } {
  const notifScheduled  = useRef(false);
  const lastBannerMs    = useRef<number>(0);

  // KEY FIX: select each field individually so Zustand returns the same
  // reference when nothing changes — object selectors always return new refs.
  const smartTank               = useUserStore(s => s.smartTank);
  const pendingRefuelConfirm    = useUserStore(s => s.smartTank?.pendingRefuelConfirm ?? false);
  const lastNavigatedMs         = useUserStore(s => s.smartTank?.lastNavigatedToStationMs ?? null);

  // ── A. Post-navigation push notification (20 min after Go to station) ──────
  useEffect(() => {
    if (!pendingRefuelConfirm) {
      notifScheduled.current = false;
      return;
    }
    if (notifScheduled.current) return;
    if (!lastNavigatedMs) return;

    const elapsed = Date.now() - lastNavigatedMs;
    const delay   = Math.max(0, REFUEL_CONFIRM_NAVIGATION_DELAY_MS - elapsed);

    notifScheduled.current = true;

    const timer = setTimeout(async () => {
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '⛽ Aufgetankt?',
            body: 'Du warst gerade an einer Tankstelle. Tank voll gemacht?',
            data: { type: 'refuel_confirm' },
          },
          trigger: null, // immediate
        });
        console.log('[useRefuelConfirm] Post-navigation confirm notification sent');
      } catch (err) {
        console.warn('[useRefuelConfirm] Notification failed:', err);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [pendingRefuelConfirm, lastNavigatedMs]);

  // ── B & C. Inline banner selection (computed during render, no side effects) ─

  let banner: RefuelBannerType = null;

  if (smartTank) {
    const { levelPercent, daysUntilEmpty } = computeRefuelUrgency(smartTank);
    const now = Date.now();

    // B: Low-tank banner — only if cooldown elapsed
    if (
      levelPercent < REFUEL_LOW_ALERT_THRESHOLD_PCT &&
      now - lastBannerMs.current > 48 * 60 * 60 * 1000
    ) {
      // NOTE: lastBannerMs.current set in the parent (index.tsx) after
      // the banner is acted upon, to avoid setting a ref in render body.
      banner = 'low_alert';
    }
    // C: Timeout banner — predicted tank empty > 2 days ago
    else if (
      daysUntilEmpty <= 0 &&
      smartTank.lastConfirmedMs + REFUEL_TIMEOUT_PAST_ZERO_MS < now
    ) {
      banner = 'timeout';
    }
  }

  return { banner };
}

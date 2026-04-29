// ====================================================
// FuelAmpel — Daily Check Scheduler (v3 — Zone-Based)
//
// Schedules a local push notification for 11:30 based
// on the PROJECTED tank level at that time.
//
// 11:30 rationale: before the 12:00 upward price adjustment
// window (German regulation 2026-04-01).
//
// v3 redesign (2026-04-29):
//   - BUG-01 FIX: Notification content is NO LONGER generated
//     from the current decision object. The old approach froze
//     price data, station names, and time recommendations at
//     schedule time (e.g. 21:00), but notifications fire
//     hours later (11:30) when prices may have completely changed.
//   - Notifications are now ZONE-BASED TRIGGERS only:
//     they tell the user the tank level zone and prompt them
//     to open the app for fresh, real-time recommendations.
//   - BUG-06 FIX: resolveWhen() output is no longer embedded
//     in notifications (it used current hour at schedule time,
//     not delivery time — always wrong).
//   - Planning zone: notifications DISABLED. Planning zone
//     recommendations depend on price data which becomes stale.
//     Only Low (≤30%) and Critical (≤15%) zones notify.
//   - Gate model simplified: zone-based (SmartTank only),
//     no price/decision dependency. Decision object no longer
//     needed for scheduling.
//
// Called whenever SmartTankState changes:
//   - On app open
//   - After recordSmartRefuel
//   - After adjustLevelManually
//   - After fuelStore.refresh()
//
// No network required — uses only local SmartTank data.
// When user taps notification → app opens → live GPS + API fetch.
// ====================================================

import * as Notifications from 'expo-notifications';
import { SmartTankState } from '../utils/types';
import { estimateLevelPercent, classifyZone, computeConfidence } from './smartTank';
import {
  NOTIFICATION_COOLDOWN_MS,
  NOTIFICATION_WEEKLY_CAP,
  CONFIDENCE_MED,
} from '../utils/constants';

const DAILY_NOTIF_ID = 'fuelampel-daily-11h30';

// ─── Internal: project future level ──────────────────────────────────────────

/**
 * Estimate tank level at a future point in time by pretending
 * `shiftMs` additional milliseconds have elapsed since last confirmation.
 *
 * This works because estimateLevelPercent() computes decay from
 * (Date.now() - lastConfirmedMs). We simply age the lastConfirmedMs back.
 */
function projectLevelAtMs(state: SmartTankState, targetMs: number): number {
  const shiftMs = Math.max(0, targetMs - Date.now());
  const fakeState: SmartTankState = {
    ...state,
    lastConfirmedMs: state.lastConfirmedMs - shiftMs,
  };
  return estimateLevelPercent(fakeState);
}

// ─── Internal: target time computation ────────────────────────────────────────

/**
 * Returns the next 11:30 (local time).
 * If it's already past 11:30 today, returns tomorrow's 11:30.
 *
 * Rationale: 11:30 is just before the 12:00 upward price adjustment
 * window mandated by German fuel regulation 2026-04-01.
 */
function getNextNotifTime(): Date {
  const now = new Date();
  const target = new Date();
  target.setHours(11, 30, 0, 0);
  if (now >= target) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

// ─── Internal: zone-based notification content ───────────────────────────────

/**
 * Build notification content from zone + projected level ONLY.
 *
 * v3 design: NO price data, NO station names, NO resolveWhen() output.
 * Notifications are triggers — they prompt the user to open the app
 * for real-time, freshly-fetched recommendations.
 *
 * This prevents BUG-01 (stale price data frozen at schedule time)
 * and BUG-06 (resolveWhen output based on wrong hour).
 */
function buildContent(
  zone: 'Low' | 'Critical',
  projectedPct: number,
): Notifications.NotificationContentInput {
  const pct = Math.round(projectedPct);

  if (zone === 'Critical') {
    return {
      title: '🔴 Tank fast leer — Jetzt tanken!',
      body: `Dein Tank wird auf ~${pct}% geschätzt. App öffnen für günstige Preise in der Nähe.`,
      data: { type: 'daily_check', zone: 'Critical' },
      sound: true,
    };
  }

  // Low zone
  return {
    title: '🟡 Bald tanken?',
    body: `Tank bei ~${pct}% — App öffnen für aktuelle Preise und Empfehlung.`,
    data: { type: 'daily_check', zone: 'Low' },
    sound: false,
  };
}

// ─── Internal: zone-based gate check ─────────────────────────────────────────

interface ZoneGateResult {
  allowed: boolean;
  reason: string;
}

/**
 * Simplified zone-based gate.
 *
 * v3: No price/decision dependency. Only checks:
 *   Gate 1 — Zone: must be Low or Critical (Planning = disabled, Safe = silent)
 *   Gate 2 — Trust: SmartTank confidence must be sufficient
 *   Gate 3 — Budget: cooldown (4h always) + weekly cap (≤3)
 *
 * Planning zone is intentionally excluded:
 *   Planning zone recommendations depend on real-time price data.
 *   A notification scheduled at 21:00 for 11:30 cannot contain
 *   valid price-based advice — by then prices have changed.
 *   Users in Planning zone see in-app guidance when they open the app.
 */
function shouldScheduleNotification(
  projectedZone: 'Low' | 'Critical',
  smartTank: SmartTankState,
  notifState: { lastNotifiedMs: number; weekCount: number; weekStartMs: number },
): ZoneGateResult {
  const isCritical = projectedZone === 'Critical';

  // Gate 2: Trust — SmartTank confidence must be sufficient
  // Critical bypasses: we must warn even with uncertain estimates
  if (!isCritical) {
    const confidence = computeConfidence(smartTank);
    if (confidence < CONFIDENCE_MED) {
      return { allowed: false, reason: `confidence_too_low (${confidence.toFixed(2)} < ${CONFIDENCE_MED})` };
    }
  }

  // Gate 3: Budget
  const now = Date.now();

  // Cooldown: always applies (even Critical)
  if (now - notifState.lastNotifiedMs < NOTIFICATION_COOLDOWN_MS) {
    const hoursLeft = ((NOTIFICATION_COOLDOWN_MS - (now - notifState.lastNotifiedMs)) / 3_600_000).toFixed(1);
    return { allowed: false, reason: `cooldown_active (${hoursLeft}h remaining)` };
  }

  // Weekly cap: all zones (including Critical) to prevent spam
  const weekReset = now - notifState.weekStartMs >= 7 * 24 * 60 * 60 * 1000;
  const effectiveCount = weekReset ? 0 : notifState.weekCount;
  if (effectiveCount >= NOTIFICATION_WEEKLY_CAP) {
    return { allowed: false, reason: `weekly_budget_exhausted (${effectiveCount}/${NOTIFICATION_WEEKLY_CAP})` };
  }

  return { allowed: true, reason: 'all_gates_passed' };
}

// ─── Public: scheduleDailyCheck ───────────────────────────────────────────────

/**
 * Schedule (or cancel) the 11:30 daily check notification.
 *
 * Logic (v3 — Zone-Based):
 *   1. Always cancel existing daily notification.
 *   2. Require SmartTank (tank level source of truth).
 *   3. Project tank level at next 11:30.
 *   4. Zone = Safe → silent (no notification).
 *      Zone = Planning → silent (price data would be stale at delivery time).
 *      Zone = Low / Critical → proceed.
 *   5. Run zone-based gate (confidence + cooldown + weekly cap).
 *   6. Build content from zone + projected level ONLY (no prices/stations).
 *   7. Schedule notification. Record budget usage.
 *
 * @param smartTank      Current SmartTank state (required)
 * @param notifState     Notification budget state
 * @param onNotificationSent  Callback to record budget usage
 */
export async function scheduleDailyCheck(
  smartTank: SmartTankState | null,
  notifState?: { lastNotifiedMs: number; weekCount: number; weekStartMs: number },
  onNotificationSent?: (isCritical: boolean) => void,
): Promise<void> {
  // Step 1: Always cancel existing to avoid duplicates
  try {
    await Notifications.cancelScheduledNotificationAsync(DAILY_NOTIF_ID);
  } catch {
    // Ignore: notification may not exist yet
  }

  if (!smartTank) {
    console.log('[DailyCheck] SmartTank not initialized — skipping schedule');
    return;
  }

  // Step 2: Project level at next 11:30
  const target = getNextNotifTime();
  const projectedLevel = projectLevelAtMs(smartTank, target.getTime());
  const zone = classifyZone(projectedLevel);

  const pctStr = Math.round(projectedLevel);
  console.log(
    `[DailyCheck] Next notif = ${target.toLocaleString()}, ` +
    `projected level = ${pctStr}% → zone = ${zone}`
  );

  // Step 3: Zone gate
  // Safe → always silent
  if (zone === 'Safe') {
    console.log('[DailyCheck] Zone is Safe — silent, no notification scheduled');
    return;
  }
  // Planning → silent (stale price data risk — BUG-01 prevention)
  if (zone === 'Planning') {
    console.log(
      '[DailyCheck] Zone is Planning — notification suppressed. ' +
      'Planning-zone advice depends on real-time price data which would be stale at delivery. ' +
      'In-app guidance is shown when user opens the app.'
    );
    return;
  }

  // Step 4: notifState guard
  if (!notifState || !onNotificationSent) {
    console.log('[DailyCheck] Missing notifState/callback — skipping (no ungated fallback)');
    return;
  }

  // Step 5: Zone-based gate (confidence + cooldown + weekly cap)
  const gate = shouldScheduleNotification(zone, smartTank, notifState);
  if (!gate.allowed) {
    console.log(`[DailyCheck] Gate blocked: ${gate.reason} — no notification scheduled`);
    return;
  }

  // Step 6: Build content (zone + projected level ONLY — no prices, no stations, no resolveWhen)
  const content = buildContent(zone, projectedLevel);

  // Step 7: Schedule
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: DAILY_NOTIF_ID,
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: target,
      },
    });
    console.log(
      `[DailyCheck] ✅ Notification scheduled for ${target.toLocaleString()} ` +
      `— zone=${zone}, ~${pctStr}%`
    );
    onNotificationSent(zone === 'Critical');
  } catch (err) {
    console.warn('[DailyCheck] ❌ Failed to schedule notification:', err);
  }
}

// ─── Public: cancelDailyCheck ─────────────────────────────────────────────────

/** Explicitly cancel the daily check notification (e.g., after full tank reset). */
export async function cancelDailyCheck(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(DAILY_NOTIF_ID);
    console.log('[DailyCheck] Daily notification cancelled');
  } catch {
    // Already cancelled or never scheduled — ignore
  }
}

// ====================================================
// FuelAmpel — Daily Check Scheduler (v2 — 4-Gate)
//
// Schedules a local push notification for 16:00 based
// on the PROJECTED tank level at that time.
//
// v2 upgrades (Phase 8):
//   - Integrates shouldNotify() 4-Gate model (Need/Value/Trust/Budget)
//   - Uses buildNotificationPayload() for corridor-aware rich content
//   - Records notification budget via onNotificationSent() callback
//   - Fallback to v1 hardcoded strings when decision is unavailable
//
// Called whenever SmartTankState or DecisionResult changes:
//   - On app open
//   - After recordSmartRefuel
//   - After adjustLevelManually
//   - After fuelStore.refresh()
//
// No network required — uses only cached decision + local SmartTank data.
// When user taps the notification → app opens → live GPS + API fetch.
// ====================================================

import * as Notifications from 'expo-notifications';
import { SmartTankState, DecisionResult } from '../utils/types';
import { estimateLevelPercent, classifyZone } from './smartTank';
import { shouldNotify, buildNotificationPayload } from './notificationLogic';
import { CorridorStation } from '../utils/routeCorridor';

const DAILY_NOTIF_ID = 'fuelampel-daily-16h';

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
 * Returns the next 16:00 (local time).
 * If it's already past 16:00 today, returns tomorrow's 16:00.
 */
function getNext16h(): Date {
  const now = new Date();
  const target = new Date();
  target.setHours(16, 0, 0, 0);
  if (now >= target) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

// ─── Internal: build notification content ────────────────────────────────────

function buildContent(
  zone: 'Low' | 'Critical',
  projectedPct: number,
): Notifications.NotificationContentInput {
  const pct = Math.round(projectedPct);

  if (zone === 'Critical') {
    return {
      title: '🔴 Tank fast leer — Jetzt tanken!',
      body: `Dein Tank wird auf ~${pct}% geschätzt. Bitte rechtzeitig tanken.`,
      data: { type: 'daily_check', zone: 'Critical' },
      sound: true,
    };
  }

  return {
    title: '🟡 Jetzt tanken?',
    body: `Tank bei ~${pct}% — App öffnen für die besten Preise in der Nähe.`,
    data: { type: 'daily_check', zone: 'Low' },
    sound: false,
  };
}

// ─── Public: scheduleDailyCheck ───────────────────────────────────────────────

/**
 * Schedule (or cancel) the 16:00 daily check notification.
 *
 * Logic (v2 - 4-Gate):
 *   1. Always cancel existing daily notification.
 *   2. Project tank level at next 16:00.
 *   3. Classify projected zone.
 *   4. Zone = Safe or Planning → stay silent (do not schedule).
 *   5. Zone = Low or Critical:
 *      - If decision available: run 4-Gate check (`shouldNotify`). If blocked, stay silent.
 *      - If decision missing (fallback): schedule v1 notification.
 *   6. Record notification sent (if scheduled).
 */
export async function scheduleDailyCheck(
  smartTank: SmartTankState | null,
  decision?: DecisionResult | null,
  corridorStation?: CorridorStation | null,
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

  // Step 2: Project level at next 16:00
  const target = getNext16h();
  const projectedLevel = projectLevelAtMs(smartTank, target.getTime());
  const zone = classifyZone(projectedLevel);

  const pctStr = Math.round(projectedLevel);
  console.log(
    `[DailyCheck] Next 16:00 = ${target.toLocaleString()}, ` +
    `projected level = ${pctStr}% → zone = ${zone}`
  );

  // Step 3: Only notify for Low or Critical
  if (zone !== 'Low' && zone !== 'Critical') {
    console.log(`[DailyCheck] Zone is ${zone} — silent, no notification scheduled`);
    return;
  }

  // Step 4: Notification Content & Gate Check
  let content: Notifications.NotificationContentInput;

  if (decision && notifState && onNotificationSent) {
    const gate = shouldNotify(decision, notifState);
    if (!gate.allowed) {
      console.log(`[DailyCheck] 4-Gate blocked: ${gate.reason} — no notification scheduled`);
      return;
    }
    const payload = buildNotificationPayload(decision, corridorStation, smartTank);
    content = {
      title: payload.title,
      body: payload.body,
      data: { type: 'daily_check', zone },
      sound: zone === 'Critical',
    };
  } else {
    // Fallback to v1 hardcoded strings
    content = buildContent(zone, projectedLevel);
  }

  // Step 5: Schedule the notification
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
      `[DailyCheck] ✅ Notification scheduled for ${target.toLocaleString()} — zone=${zone}, ~${pctStr}%`
    );
    // Record that we scheduled a notification
    if (onNotificationSent) {
      onNotificationSent(zone === 'Critical');
    }
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

// ====================================================
// FuelAmpel — Daily Check Scheduler (v2 — 4-Gate)
//
// Schedules a local push notification for 11:30 based
// on the PROJECTED tank level at that time.
//
// 11:30 rationale: before the 12:00 upward price adjustment
// window (German regulation 2026-04-01). This ensures users
// get planning advice while prices may still fall.
//
// v2 upgrades (Phase 8):
//   - Integrates shouldNotify() 4-Gate model (Need/Value/Trust/Budget)
//   - Uses buildNotificationPayload() for corridor-aware rich content
//   - Records notification budget via onNotificationSent() callback
//   - Fallback to hardcoded strings when decision is unavailable
//
// v2.5.0 upgrades:
//   - Notification time changed: 16:00 → 11:30 (2026-04-01 regulation)
//   - Planning zone (plan_soon) now passes through to 4-Gate
//   - buildContent handles Planning zone with softer message
//
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
 * window mandated by German fuel regulation 2026-04-01. Notifying
 * here gives users time to refuel before prices may rise.
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

// ─── Internal: build notification content ────────────────────────────────────

function buildContent(
  zone: 'Low' | 'Critical' | 'Planning',
  projectedPct: number,
  when?: string,
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

  if (zone === 'Planning') {
    return {
      title: '⛽ Tanken planen — FuelAmpel',
      body: when ?? `Tank bei ~${pct}% — heute wäre ein guter Zeitpunkt.`,
      data: { type: 'daily_check', zone: 'Planning' },
      sound: false,
    };
  }

  return {
    title: '🟡 Bald tanken?',
    body: `Tank bei ~${pct}% — App öffnen für die besten Preise in der Nähe.`,
    data: { type: 'daily_check', zone: 'Low' },
    sound: false,
  };
}

// ─── Public: scheduleDailyCheck ───────────────────────────────────────────────

/**
 * Schedule (or cancel) the 11:30 daily check notification.
 *
 * Logic (v2 - 4-Gate):
 *   1. Always cancel existing daily notification.
 *   2. Project tank level at next 11:30.
 *   3. Classify projected zone.
 *   4. Zone = Safe → silent.
 *      Zone = Planning: only proceed if current decision.mode is plan_soon.
 *   5. Zone = Low or Critical: always proceed.
 *   6. Run 4-Gate (shouldNotify). If blocked, stay silent.
 *      Fallback: if no decision, use hardcoded strings.
 *   7. Record notification sent (if scheduled).
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

  // Step 2: Project level at next 11:30
  const target = getNextNotifTime();
  const projectedLevel = projectLevelAtMs(smartTank, target.getTime());
  const zone = classifyZone(projectedLevel);

  const pctStr = Math.round(projectedLevel);
  console.log(
    `[DailyCheck] Next notif = ${target.toLocaleString()}, ` +
    `projected level = ${pctStr}% → zone = ${zone}`
  );

  // Step 3: Determine if we should proceed
  const isPlanSoonDecision = decision?.mode === 'plan_soon';
  if (zone === 'Safe') {
    console.log(`[DailyCheck] Zone is Safe — silent, no notification scheduled`);
    return;
  }
  if (zone === 'Planning' && !isPlanSoonDecision) {
    console.log(`[DailyCheck] Zone is Planning but no plan_soon decision — silent`);
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
    // No decision or notifState available — cannot run 4-Gate checks.
    // Skip notification rather than bypass all anti-spam protections.
    console.log('[DailyCheck] Missing decision/notifState — skipping (no ungated fallback)');
    return;
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

// ====================================================
// FuelAmpel — Daily Check Scheduler (v1)
//
// Schedules a local push notification for 16:00 based
// on the PROJECTED tank level at that time.
//
// Called whenever SmartTankState changes:
//   - On app open
//   - After recordSmartRefuel
//   - After adjustLevelManually
//
// No network required — uses only local SmartTank data.
// When user taps the notification → app opens → live GPS + API fetch.
// ====================================================

import * as Notifications from 'expo-notifications';
import { SmartTankState } from '../utils/types';
import { estimateLevelPercent, classifyZone } from './smartTank';

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
      body: `Dein Tank wird auf ca. ${pct}% geschätzt. Bitte jetzt tanken, bevor er leer ist.`,
      data: { type: 'daily_check', zone: 'Critical' },
      sound: true,
    };
  }

  return {
    title: '🟡 Guter Moment zum Tanken?',
    body: `Tank bei ca. ${pct}% — jetzt App öffnen für die besten Preise in der Nähe.`,
    data: { type: 'daily_check', zone: 'Low' },
    sound: false, // Low zone: deliver quietly
  };
}

// ─── Public: scheduleDailyCheck ───────────────────────────────────────────────

/**
 * Schedule (or cancel) the 16:00 daily check notification.
 *
 * Logic:
 *   1. Always cancel existing daily notification.
 *   2. Project tank level at next 16:00.
 *   3. Classify projected zone.
 *   4. Zone = Low or Critical → schedule notification.
 *   5. Zone = Safe or Planning → stay silent (do not schedule).
 *
 * @param smartTank  Current SmartTankState (null = onboarding not done, skip)
 */
export async function scheduleDailyCheck(smartTank: SmartTankState | null): Promise<void> {
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

  // Step 4: Schedule the notification
  const content = buildContent(zone, projectedLevel);

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

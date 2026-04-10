// ====================================================
// FuelAmpel — Notification Logic  (vNext)
// 4-Gate model: Need + Value + Trust + Budget
//
// Push is the last resort. Inline UI is preferred.
// Critical zone bypasses budget cap, not cooldown.
// ====================================================

import {
  NOTIFICATION_COOLDOWN_MS,
  MIN_SAVINGS_FOR_NOTIFICATION,
  NOTIFICATION_WEEKLY_CAP,
} from '../utils/constants';
import { DecisionResult, SmartTankState } from '../utils/types';
import { computeRefuelUrgency } from '../core/smartTank';
import { CorridorStation } from '../utils/routeCorridor';

// ─── Notification State (persisted in userStore) ──────────────────────────────

export interface NotificationState {
  lastNotifiedMs: number;
  /** Number of non-Critical push notifications sent in the current week window. */
  weekCount: number;
  /** Timestamp of when the current 7-day window started (resets on Monday 00:00). */
  weekStartMs: number;
}

// ─── Gate Result ─────────────────────────────────────────────────────────────

export interface GateResult {
  allowed: boolean;
  /** Machine-readable reason for logging/debug. */
  reason: 'all_gates_passed'
    | 'need_not_met'
    | 'skip_recommendation'
    | 'value_insufficient'
    | 'confidence_too_low'
    | 'cooldown_active'
    | 'weekly_budget_exhausted';
}

// ─── Week Window Helper ───────────────────────────────────────────────────────

function isNewWeek(weekStartMs: number): boolean {
  return Date.now() - weekStartMs >= 7 * 24 * 60 * 60 * 1000;
}

// ─── Main Gate Function ────────────────────────────────────────────────────────

/**
 * Decide whether to send a push notification now.
 *
 * Gate 1 — Need:    Zone must be Low or Critical; Planning/Safe blocked (in-app only).
 * Gate 2 — Value:   Savings must exceed threshold (Critical: €0, others: MIN_SAVINGS).
 * Gate 3 — Trust:   Confidence must be medium/high (Critical bypasses).
 * Gate 4 — Budget:  Cooldown (4h always) + weekly cap (≤3; Critical bypasses cap).
 */
export function shouldNotify(
  decision: DecisionResult,
  notifState: NotificationState,
): GateResult {
  const isCritical = decision.zone === 'Critical';

  // ── Gate 1: Need ────────────────────────────────────────────────────────────
  if (decision.zone === 'Safe' || decision.zone === 'Planning') {
    return { allowed: false, reason: 'need_not_met' };
  }
  if (decision.recommendation === 'Skip') {
    return { allowed: false, reason: 'skip_recommendation' };
  }

  // ── Gate 2: Value ───────────────────────────────────────────────────────────
  const minSaving = isCritical ? 0 : MIN_SAVINGS_FOR_NOTIFICATION;
  if (decision.saving_estimate < minSaving) {
    return { allowed: false, reason: 'value_insufficient' };
  }

  // ── Gate 3: Trust (Critical bypasses) ──────────────────────────────────────
  if (!isCritical && decision.confidenceLevel === 'low') {
    return { allowed: false, reason: 'confidence_too_low' };
  }

  // ── Gate 4: Budget ──────────────────────────────────────────────────────────
  const now = Date.now();

  // Cooldown always applies (even Critical)
  if (now - notifState.lastNotifiedMs < NOTIFICATION_COOLDOWN_MS) {
    return { allowed: false, reason: 'cooldown_active' };
  }

  // Weekly cap — Critical bypasses
  if (!isCritical) {
    const weekReset = isNewWeek(notifState.weekStartMs);
    const effectiveCount = weekReset ? 0 : notifState.weekCount;
    if (effectiveCount >= NOTIFICATION_WEEKLY_CAP) {
      return { allowed: false, reason: 'weekly_budget_exhausted' };
    }
  }

  console.log(`[NotificationLogic] All 4 gates passed. Zone=${decision.zone}, Confidence=${decision.confidenceLevel}`);
  return { allowed: true, reason: 'all_gates_passed' };
}

// ─── Notification Payload Builder ─────────────────────────────────────────────

/**
 * Build the notification payload.
 * Prefers a corridor station (on-route) over the generic decision station.
 */
export function buildNotificationPayload(
  decision: DecisionResult,
  corridorStation?: CorridorStation | null,
  smartTank?: SmartTankState | null,
): { title: string; body: string } {
  const urgency = smartTank ? computeRefuelUrgency(smartTank) : null;
  const daysLabel = urgency
    ? urgency.daysUntilEmpty < 1
      ? 'today'
      : `~${urgency.daysUntilEmpty.toFixed(0)} day(s) left`
    : '';

  if (corridorStation && corridorStation.netSavingEur > 0) {
    const saving = corridorStation.netSavingEur.toFixed(2);
    const detour = corridorStation.detourKm;
    const name   = corridorStation.brand || corridorStation.name;
    const price  = corridorStation.price?.toFixed(3) ?? '—';

    return {
      title: '⛽️ Refuel on your way — FuelAmpel',
      body: `${name} en route: ${price} €/L · saves ~${saving} € · only ${detour} km detour${daysLabel ? ` · Tank lasts ${daysLabel}` : ''}`,
    };
  }

  return {
    title: `⛽️ FuelAmpel — Time to refuel`,
    body: decision.reason + (daysLabel ? ` (${daysLabel})` : ''),
  };
}

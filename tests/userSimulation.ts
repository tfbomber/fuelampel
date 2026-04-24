// ====================================================
// FuelAmpel — User Behavior Simulation (Pure Functions)
// Run: npx tsx tests/userSimulation.ts
//
// Simulates 6 user personas over 30 days each,
// exercises SmartTank decay, zone classification,
// notification gates, and refuel events.
// ====================================================

// ─── Constants (mirrored from src/utils/constants.ts) ─────────────────────────

const DEFAULT_AVG_CONSUMPTION = 7.5;
const DEFAULT_TANK_CAPACITY = 50;
const SMART_TANK_CONSERVATIVE_FACTOR = 1.10;
const SMART_TANK_DEFAULT_COMMUTE_DAYS = 5.0;
const SMART_TANK_EMA_ALPHA = 0.25;
const ZONE_CRITICAL_MAX_PCT = 15;
const ZONE_LOW_MAX_PCT = 30;
const ZONE_PLANNING_MAX_PCT = 50;
const URGENCY_ACTION_DAYS = 1.5;
const URGENCY_MONITOR_DAYS = 3.5;
const NOTIFICATION_COOLDOWN_MS = 4 * 3_600_000;
const NOTIFICATION_WEEKLY_CAP = 3;
const MIN_SAVINGS_FOR_NOTIFICATION = 0.02;
const CONFIDENCE_HIGH = 0.70;
const CONFIDENCE_MED = 0.40;

const CAR_TYPE_TANK_CAPACITY: Record<string, number> = { small: 40, regular: 55, large: 70, unknown: 50 };
const CAR_TYPE_AVG_CONSUMPTION: Record<string, number> = { small: 6.5, regular: 7.5, large: 9.0, unknown: 7.5 };

// ─── Core Types ───────────────────────────────────────────────────────────────

type DecisionZone = 'Critical' | 'Low' | 'Planning' | 'Safe';
type RefuelingStyle = 'convenient' | 'nearEmpty';

interface SimTankState {
  levelPercent: number;
  lastConfirmedMs: number;
  lastConfirmedBy: 'refuel' | 'manual' | 'low_alert_confirm';
  confidence: number;
  refuelIntervalEMA: number | null;
  dailyKmEMA: number;
  consumptionPer100km: number;
  tankCapacityL: number;
  totalRangeKm: number | null;
  commuteDaysPerWeekEMA: number;
  refuelCount: number;
}

interface NotifState {
  lastNotifiedMs: number;
  weekCount: number;
  weekStartMs: number;
}

// ─── Core Engine Functions (extracted from smartTank.ts) ──────────────────────

function classifyZone(pct: number): DecisionZone {
  if (pct <= ZONE_CRITICAL_MAX_PCT) return 'Critical';
  if (pct <= ZONE_LOW_MAX_PCT) return 'Low';
  if (pct <= ZONE_PLANNING_MAX_PCT) return 'Planning';
  return 'Safe';
}

function estimateDailyKm(state: SimTankState): number {
  let baseDailyKm: number;
  if (state.refuelIntervalEMA !== null) {
    const usableL = state.tankCapacityL * 0.85;
    const fullRangeKm = (usableL / state.consumptionPer100km) * 100;
    baseDailyKm = fullRangeKm / state.refuelIntervalEMA;
  } else {
    baseDailyKm = state.dailyKmEMA;
  }
  return baseDailyKm * SMART_TANK_CONSERVATIVE_FACTOR;
}

function estimateLevelPercent(state: SimTankState, nowMs: number): number {
  const totalKmEstimate = estimateDailyKm(state);
  const daysSinceConfirmed = (nowMs - state.lastConfirmedMs) / 86_400_000;
  const fullRangeKm = (state.tankCapacityL / state.consumptionPer100km) * 100;
  const kmConsumed = daysSinceConfirmed * totalKmEstimate;
  const litresConsumed = (kmConsumed / 100) * state.consumptionPer100km;
  const litresUsedPct = (litresConsumed / state.tankCapacityL) * 100;
  return Math.max(0, Math.round((state.levelPercent - litresUsedPct) * 10) / 10);
}

function computeRefuelUrgency(state: SimTankState, nowMs: number) {
  const levelPercent = estimateLevelPercent(state, nowMs);
  const totalKmEstimate = estimateDailyKm(state);
  const litresRemaining = (levelPercent / 100) * state.tankCapacityL;
  const kmRemaining = (litresRemaining / state.consumptionPer100km) * 100;
  const daysUntilEmpty = totalKmEstimate > 0 ? kmRemaining / totalKmEstimate : 999;
  const readiness = daysUntilEmpty < URGENCY_ACTION_DAYS ? 'Action' :
                    daysUntilEmpty < URGENCY_MONITOR_DAYS ? 'Monitor' : 'NotNeeded';
  return { levelPercent, daysUntilEmpty, readiness };
}

function computeConfidence(state: SimTankState, nowMs: number): number {
  const baseMap: Record<string, number> = { refuel: 1.0, manual: 0.8, low_alert_confirm: 0.5 };
  const base = baseMap[state.lastConfirmedBy] ?? 0.5;
  const hoursElapsed = (nowMs - state.lastConfirmedMs) / 3_600_000;
  const ageFactor = Math.max(0.15, 1.0 - hoursElapsed / (7 * 24));
  let bonus = 0;
  if (state.refuelIntervalEMA !== null) bonus += 0.15;
  return Math.min(1.0, Math.max(0.0, base * ageFactor + bonus));
}

function recordRefuel(state: SimTankState, litresAdded: number, nowMs: number): SimTankState {
  const actualLitres = litresAdded === 0 ? state.tankCapacityL : Math.min(litresAdded, state.tankCapacityL);
  let newIntervalEMA = state.refuelIntervalEMA;
  if (state.refuelCount > 0) {
    const intervalDays = (nowMs - state.lastConfirmedMs) / 86_400_000;
    if (intervalDays >= 0.5 && intervalDays <= 60) {
      newIntervalEMA = newIntervalEMA === null ? intervalDays :
        SMART_TANK_EMA_ALPHA * intervalDays + (1 - SMART_TANK_EMA_ALPHA) * newIntervalEMA;
    }
  }
  let newDailyKmEMA = state.dailyKmEMA;
  if (state.refuelCount > 0) {
    const periodDays = (nowMs - state.lastConfirmedMs) / 86_400_000;
    if (periodDays >= 0.5) {
      const kmDriven = (actualLitres / state.consumptionPer100km) * 100;
      const actualDaily = kmDriven / periodDays;
      newDailyKmEMA = SMART_TANK_EMA_ALPHA * actualDaily + (1 - SMART_TANK_EMA_ALPHA) * newDailyKmEMA;
    }
  }
  return {
    ...state,
    levelPercent: 100,
    lastConfirmedMs: nowMs,
    lastConfirmedBy: 'refuel',
    confidence: 1.0,
    refuelIntervalEMA: newIntervalEMA,
    dailyKmEMA: newDailyKmEMA,
    refuelCount: state.refuelCount + 1,
  };
}

function shouldNotify(zone: DecisionZone, confidence: number, saving: number,
                      mode: string, notifState: NotifState, nowMs: number): { allowed: boolean; reason: string } {
  const isCritical = zone === 'Critical';
  const isPlanSoon = mode === 'plan_soon';
  const isUrgent = zone === 'Low' || zone === 'Critical';
  if (!isUrgent && !isPlanSoon) return { allowed: false, reason: 'need_not_met' };
  const confLevel = confidence >= CONFIDENCE_HIGH ? 'high' : confidence >= CONFIDENCE_MED ? 'medium' : 'low';
  if (!isCritical && confLevel === 'low') return { allowed: false, reason: 'confidence_too_low' };
  if (nowMs - notifState.lastNotifiedMs < NOTIFICATION_COOLDOWN_MS) return { allowed: false, reason: 'cooldown_active' };
  if (!isCritical) {
    const weekReset = nowMs - notifState.weekStartMs >= 7 * 86_400_000;
    const effectiveCount = weekReset ? 0 : notifState.weekCount;
    if (effectiveCount >= NOTIFICATION_WEEKLY_CAP) return { allowed: false, reason: 'weekly_budget_exhausted' };
  }
  return { allowed: true, reason: 'all_gates_passed' };
}

// ─── Persona Definitions ─────────────────────────────────────────────────────

interface Persona {
  name: string;
  description: string;
  carType: string;
  commuteOnewayKm: number;
  commuteDaysPerWeek: number;
  extraWeeklyKm: number; // weekend/errands
  refuelingStyle: RefuelingStyle;
  refuelAtPercent: number; // persona refuels when tank drops to this %
  initialPct: number;
  irregularDays?: number[]; // DOW (0=Sun) with long trips
  irregularTripKm?: number;
  appOpenFrequency: 'daily' | 'every_other_day' | 'twice_weekly';
}

const PERSONAS: Persona[] = [
  {
    name: 'Anna — Daily Commuter',
    description: 'Regular 9-5, 30km round trip, family car, refuels when low',
    carType: 'regular', commuteOnewayKm: 15, commuteDaysPerWeek: 5,
    extraWeeklyKm: 40, refuelingStyle: 'nearEmpty', refuelAtPercent: 15,
    initialPct: 70, appOpenFrequency: 'daily',
  },
  {
    name: 'Tom — Short Commuter',
    description: '10km round trip, small car, city driver, refuels at half tank',
    carType: 'small', commuteOnewayKm: 5, commuteDaysPerWeek: 5,
    extraWeeklyKm: 20, refuelingStyle: 'convenient', refuelAtPercent: 40,
    initialPct: 60, appOpenFrequency: 'every_other_day',
  },
  {
    name: 'Klaus — Heavy Commuter',
    description: '80km round trip, large SUV, autobahn, refuels weekly',
    carType: 'large', commuteOnewayKm: 40, commuteDaysPerWeek: 5,
    extraWeeklyKm: 30, refuelingStyle: 'nearEmpty', refuelAtPercent: 20,
    initialPct: 90, appOpenFrequency: 'daily',
  },
  {
    name: 'Lisa — Business Traveler',
    description: 'Irregular 300km trips 2x/week, moderate car, no fixed pattern',
    carType: 'regular', commuteOnewayKm: 10, commuteDaysPerWeek: 3,
    extraWeeklyKm: 10, refuelingStyle: 'convenient', refuelAtPercent: 25,
    initialPct: 50,
    irregularDays: [1, 3], irregularTripKm: 300,
    appOpenFrequency: 'daily',
  },
  {
    name: 'Jürgen — Weekend Driver',
    description: 'Barely drives weekdays, 150km weekend trips, old habits',
    carType: 'regular', commuteOnewayKm: 0, commuteDaysPerWeek: 0,
    extraWeeklyKm: 0, refuelingStyle: 'nearEmpty', refuelAtPercent: 15,
    initialPct: 80,
    irregularDays: [6, 0], irregularTripKm: 75,
    appOpenFrequency: 'twice_weekly',
  },
  {
    name: 'EDGE — Skip Onboarding',
    description: 'Skipped onboarding, no home address, unknown car, starts at default 50%',
    carType: 'unknown', commuteOnewayKm: 0, commuteDaysPerWeek: 0,
    extraWeeklyKm: 50, refuelingStyle: 'nearEmpty', refuelAtPercent: 20,
    initialPct: 50, appOpenFrequency: 'twice_weekly',
  },
];

// ─── Simulation Engine ───────────────────────────────────────────────────────

interface DayLog {
  day: number;
  dow: string;
  realKmDriven: number;
  realTankPct: number;
  estimatedPct: number;
  driftPct: number; // estimated - real
  zone: DecisionZone;
  daysUntilEmpty: number;
  confidence: number;
  notifFired: boolean;
  notifReason: string;
  refueled: boolean;
  appOpened: boolean;
}

function simulatePersona(p: Persona, simDays: number): DayLog[] {
  const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const capacity = CAR_TYPE_TANK_CAPACITY[p.carType] ?? 50;
  const consumption = CAR_TYPE_AVG_CONSUMPTION[p.carType] ?? 7.5;
  const commuteDaily = p.commuteOnewayKm > 0
    ? (p.commuteOnewayKm * 2 * p.commuteDaysPerWeek) / 7
    : 15; // engine fallback

  // Create initial SmartTank state
  let tank: SimTankState = {
    levelPercent: p.initialPct,
    lastConfirmedMs: 0,
    lastConfirmedBy: 'manual',
    confidence: 1.0,
    refuelIntervalEMA: null,
    dailyKmEMA: commuteDaily,
    consumptionPer100km: consumption,
    tankCapacityL: capacity,
    totalRangeKm: null,
    commuteDaysPerWeekEMA: p.commuteDaysPerWeek || SMART_TANK_DEFAULT_COMMUTE_DAYS,
    refuelCount: 0,
  };

  let notifState: NotifState = { lastNotifiedMs: -999_999_999, weekCount: 0, weekStartMs: 0 };

  // Track REAL fuel level (ground truth)
  let realLitres = (p.initialPct / 100) * capacity;
  const logs: DayLog[] = [];

  for (let day = 0; day < simDays; day++) {
    const nowMs = day * 86_400_000; // simulate from epoch
    const dow = day % 7; // 0=Mon in our sim
    const dowName = DOW_NAMES[(dow + 1) % 7]; // adjust

    // ── Real driving (ground truth) ──
    const isWeekday = dow < 5;
    let realKmToday = 0;
    if (isWeekday && p.commuteOnewayKm > 0) {
      realKmToday += p.commuteOnewayKm * 2;
    }
    realKmToday += p.extraWeeklyKm / 7;
    if (p.irregularDays?.includes(dow) && p.irregularTripKm) {
      realKmToday += p.irregularTripKm;
    }

    const litresUsedToday = (realKmToday / 100) * consumption;
    realLitres = Math.max(0, realLitres - litresUsedToday);
    const realPct = Math.round((realLitres / capacity) * 1000) / 10;

    // ── Engine estimate ──
    const estPct = estimateLevelPercent(tank, nowMs);
    const urgency = computeRefuelUrgency(tank, nowMs);
    const zone = classifyZone(estPct);
    const confidence = computeConfidence(tank, nowMs);

    // ── App open check ──
    const opensApp =
      p.appOpenFrequency === 'daily' ? true :
      p.appOpenFrequency === 'every_other_day' ? day % 2 === 0 :
      dow === 1 || dow === 4; // twice weekly: Mon + Thu

    // ── Notification check (simulated at 11:30) ──
    const mode = zone === 'Safe' ? 'normal' :
                 zone === 'Planning' ? 'plan_soon' : 'refuel_soon';
    const notifCheck = shouldNotify(zone, confidence, 0.03, mode, notifState, nowMs);
    if (notifCheck.allowed) {
      notifState = { ...notifState, lastNotifiedMs: nowMs, weekCount: notifState.weekCount + 1 };
    }

    // ── Refuel decision (based on REAL level, like a real user would) ──
    let refueled = false;
    if (realPct <= p.refuelAtPercent) {
      realLitres = capacity; // fill up
      tank = recordRefuel(tank, 0, nowMs); // full tank
      refueled = true;
    }

    const drift = Math.round((estPct - realPct) * 10) / 10;
    logs.push({
      day, dow: dowName, realKmDriven: Math.round(realKmToday * 10) / 10,
      realTankPct: realPct, estimatedPct: estPct, driftPct: drift,
      zone, daysUntilEmpty: Math.round(urgency.daysUntilEmpty * 10) / 10,
      confidence: Math.round(confidence * 100) / 100,
      notifFired: notifCheck.allowed, notifReason: notifCheck.reason,
      refueled, appOpened: opensApp,
    });
  }
  return logs;
}

// ─── Report Generator ─────────────────────────────────────────────────────────

function generateReport(): string {
  const SIM_DAYS = 30;
  let report = `# FuelAmpel — User Behavior Simulation Report\n`;
  report += `Generated: ${new Date().toISOString()}\n`;
  report += `Simulation Period: ${SIM_DAYS} days per persona\n\n`;

  for (const p of PERSONAS) {
    const logs = simulatePersona(p, SIM_DAYS);
    report += `---\n\n## ${p.name}\n`;
    report += `> ${p.description}\n\n`;
    report += `| Param | Value |\n|---|---|\n`;
    report += `| Car Type | ${p.carType} (${CAR_TYPE_TANK_CAPACITY[p.carType]}L / ${CAR_TYPE_AVG_CONSUMPTION[p.carType]}L/100km) |\n`;
    report += `| Commute | ${p.commuteOnewayKm}km one-way × ${p.commuteDaysPerWeek}d/week |\n`;
    report += `| Style | ${p.refuelingStyle} (refuels at ≤${p.refuelAtPercent}%) |\n`;
    report += `| Initial | ${p.initialPct}% |\n`;
    if (p.irregularDays) report += `| Irregular | ${p.irregularTripKm}km on DOW ${p.irregularDays.join(',')} |\n`;
    report += `\n`;

    // Summary stats
    const refuelDays = logs.filter(l => l.refueled);
    const notifDays = logs.filter(l => l.notifFired);
    const drifts = logs.map(l => l.driftPct);
    const maxDrift = Math.max(...drifts.map(Math.abs));
    const avgDrift = Math.round(drifts.reduce((a, b) => a + b, 0) / drifts.length * 10) / 10;
    const zoneHist: Record<string, number> = {};
    logs.forEach(l => { zoneHist[l.zone] = (zoneHist[l.zone] || 0) + 1; });

    report += `### Summary\n`;
    report += `| Metric | Value |\n|---|---|\n`;
    report += `| Refuels | ${refuelDays.length}× (days: ${refuelDays.map(l => l.day).join(', ') || 'none'}) |\n`;
    report += `| Notifications | ${notifDays.length}× |\n`;
    report += `| Avg Drift | ${avgDrift > 0 ? '+' : ''}${avgDrift}% (est vs real) |\n`;
    report += `| Max Drift | ±${maxDrift}% |\n`;
    report += `| Zone Distribution | ${Object.entries(zoneHist).map(([k, v]) => `${k}:${v}d`).join(' · ')} |\n`;
    report += `| Final Real | ${logs[logs.length - 1].realTankPct}% |\n`;
    report += `| Final Estimated | ${logs[logs.length - 1].estimatedPct}% |\n`;
    report += `\n`;

    // Day-by-day table (key days only)
    report += `### Day Log\n`;
    report += `| Day | DOW | Driven | Real% | Est% | Drift | Zone | DaysLeft | Conf | Notif | Refuel |\n`;
    report += `|-----|-----|--------|-------|------|-------|------|----------|------|-------|--------|\n`;
    for (const l of logs) {
      const flag = l.refueled ? '⛽' : l.notifFired ? '🔔' : '';
      report += `| ${l.day} | ${l.dow} | ${l.realKmDriven} | ${l.realTankPct} | ${l.estimatedPct} | ${l.driftPct > 0 ? '+' : ''}${l.driftPct} | ${l.zone} | ${l.daysUntilEmpty} | ${l.confidence} | ${l.notifFired ? l.notifReason : '—'} | ${flag} |\n`;
    }
    report += `\n`;

    // Issues detected
    const issues: string[] = [];
    if (maxDrift > 20) issues.push(`⚠️ HIGH DRIFT: Max ${maxDrift}% divergence between estimate and reality`);
    if (notifDays.length === 0 && refuelDays.length > 0) issues.push(`⚠️ SILENT: User refueled ${refuelDays.length}× but received 0 notifications`);
    if (notifDays.length > 8) issues.push(`⚠️ SPAM: ${notifDays.length} notifications in 30 days (>8)`);
    const falseLow = logs.filter(l => l.zone === 'Critical' && l.realTankPct > 20);
    if (falseLow.length > 0) issues.push(`⚠️ FALSE ALARM: ${falseLow.length} days classified Critical but real tank >20%`);
    const missedCritical = logs.filter(l => l.realTankPct <= 10 && l.zone === 'Safe');
    if (missedCritical.length > 0) issues.push(`🔴 MISSED CRITICAL: ${missedCritical.length} days with real tank ≤10% but zone=Safe`);
    const zombieTank = logs.filter(l => l.realTankPct <= 0);
    if (zombieTank.length > 0) issues.push(`🔴 EMPTY TANK: User ran out of fuel on day ${zombieTank[0].day}`);

    if (issues.length > 0) {
      report += `### ⚠️ Issues Detected\n`;
      issues.forEach(i => report += `- ${i}\n`);
    } else {
      report += `### ✅ No Issues Detected\n`;
    }
    report += `\n`;
  }

  return report;
}

// ─── Run ──────────────────────────────────────────────────────────────────────

const report = generateReport();
const fs = require('fs');
const outPath = require('path').join(__dirname, '..', 'tests', 'simulation_report.md');
fs.writeFileSync(outPath, report, 'utf-8');
console.log(`✅ Report written to ${outPath}`);
console.log(report);

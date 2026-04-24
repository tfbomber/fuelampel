// FuelAmpel — User Journey Simulation v2
// Focuses on NATURAL usage patterns, not just engine math.
// Run: npx tsx tests/userJourneyTest.ts

import * as fs from 'fs';

// ── Inline engine math (avoids React Native imports) ────────────────────────

const ZONE_CRITICAL = 15, ZONE_LOW = 30, ZONE_PLANNING = 50;
const EMA_ALPHA = 0.25, CONSERVATIVE = 1.10;
const CONF_HIGH = 0.70, CONF_MED = 0.40;
const COOLDOWN_MS = 4*3600*1000, WEEKLY_CAP = 3;
const MIN_SAVING = 0.02;

interface SmartTank {
  levelPct: number; lastConfirmedMs: number; lastConfirmedBy: string;
  confidence: number; tankCapL: number; consumptionL100: number;
  dailyKmEMA: number; refuelIntervalEMA: number|null;
  refuelHistory: {ts:number, litres:number}[];
}

interface NotifState { lastMs: number; weekCount: number; weekStartMs: number; }
interface Decision { zone: string; mode: string; rec: string; saving: number; conf: string; when?: string; }

function classifyZone(pct: number) {
  if (pct <= ZONE_CRITICAL) return 'Critical';
  if (pct <= ZONE_LOW) return 'Low';
  if (pct <= ZONE_PLANNING) return 'Planning';
  return 'Safe';
}

function estimateLevel(st: SmartTank, nowMs: number): number {
  const days = (nowMs - st.lastConfirmedMs) / 86400000;
  let dailyKm = st.dailyKmEMA;
  if (st.refuelIntervalEMA !== null) {
    const usableL = st.tankCapL * 0.85;
    const fullRange = (usableL / st.consumptionL100) * 100;
    dailyKm = fullRange / st.refuelIntervalEMA;
  }
  dailyKm *= CONSERVATIVE;
  const kmDriven = days * dailyKm;
  const litresUsed = (kmDriven / 100) * st.consumptionL100;
  const pctUsed = (litresUsed / st.tankCapL) * 100;
  return Math.max(0, Math.round((st.levelPct - pctUsed) * 10) / 10);
}

function computeConf(st: SmartTank, nowMs: number): number {
  const baseMap: Record<string,number> = { refuel: 1.0, manual: 0.8, low_alert: 0.5 };
  const base = baseMap[st.lastConfirmedBy] ?? 0.5;
  const hours = (nowMs - st.lastConfirmedMs) / 3600000;
  const age = Math.max(0.15, 1.0 - hours / (7*24));
  let bonus = 0;
  if (st.refuelIntervalEMA !== null) bonus += 0.15;
  return Math.min(1, Math.max(0, base * age + bonus));
}

function shouldNotify(d: Decision, ns: NotifState, nowMs: number): {ok:boolean, reason:string} {
  const isCrit = d.zone === 'Critical';
  const isPlan = d.mode === 'plan_soon' && d.rec !== 'Skip';
  if (d.zone === 'Safe') return {ok:false, reason:'safe_zone'};
  if (!isCrit && d.zone !== 'Low' && !isPlan) return {ok:false, reason:'need_not_met'};
  if (d.rec === 'Skip' && !isPlan) return {ok:false, reason:'skip_rec'};
  if (!isCrit && d.conf === 'low') return {ok:false, reason:'low_confidence'};
  if (nowMs - ns.lastMs < COOLDOWN_MS) return {ok:false, reason:'cooldown'};
  const weekReset = nowMs - ns.weekStartMs >= 7*86400000;
  const cnt = weekReset ? 0 : ns.weekCount;
  if (cnt >= WEEKLY_CAP) return {ok:false, reason:'weekly_cap'};
  return {ok:true, reason:'passed'};
}

function makeDecision(estPct: number, conf: number, style: string): Decision {
  const zone = classifyZone(estPct);
  const confLevel = conf >= CONF_HIGH ? 'high' : conf >= CONF_MED ? 'medium' : 'low';
  const mode = zone === 'Safe' ? 'normal' : zone === 'Planning' ? 'plan_soon' : 'refuel_soon';
  let rec = 'Skip', saving = 0.03; // assume average saving available
  if (zone === 'Critical') { rec = 'Go'; saving = 0.05; }
  else if (zone === 'Low') { rec = confLevel === 'low' ? 'Wait' : 'Go'; saving = 0.04; }
  else if (zone === 'Planning') { rec = 'Wait'; saving = 0.02; }
  const when = mode === 'plan_soon' ? 'Später heute oder morgen erneut prüfen.' : undefined;
  return { zone, mode, rec, saving, conf: confLevel, when };
}

function recordRefuel(st: SmartTank, litres: number, nowMs: number): SmartTank {
  const actual = litres === 0 ? st.tankCapL : Math.min(litres, st.tankCapL);
  let newInterval = st.refuelIntervalEMA;
  let newDailyKm = st.dailyKmEMA;
  const last = st.refuelHistory[st.refuelHistory.length - 1];
  if (last) {
    const days = (nowMs - last.ts) / 86400000;
    if (days >= 0.5 && days <= 60) {
      newInterval = newInterval === null ? days : EMA_ALPHA * days + (1-EMA_ALPHA) * newInterval;
    }
    if (days >= 0.5) {
      const kmDriven = (actual / st.consumptionL100) * 100;
      const dailyKm = kmDriven / days;
      newDailyKm = EMA_ALPHA * dailyKm + (1-EMA_ALPHA) * newDailyKm;
    }
  }
  return {
    ...st, levelPct: 100, lastConfirmedMs: nowMs, lastConfirmedBy: 'refuel',
    confidence: 1.0, refuelIntervalEMA: newInterval, dailyKmEMA: newDailyKm,
    refuelHistory: [...st.refuelHistory, {ts: nowMs, litres: actual}].slice(-10),
  };
}

// ── Journey Event Types ─────────────────────────────────────────────────────

type JourneyEvent =
  | { type: 'open_app' }
  | { type: 'refuel'; litres: number }
  | { type: 'manual_adjust'; pct: number }
  | { type: 'skip_day' }
  | { type: 'change_setting'; key: string; value: any };

interface Persona {
  name: string; desc: string;
  tankCapL: number; consumptionL100: number;
  dailyKmWeekday: number; dailyKmWeekend: number;
  style: string; initialPct: number;
  irregularKm?: {dow: number[]; km: number};
  journeyOverrides?: Record<number, JourneyEvent[]>;  // day → events
  appOpenPattern: 'daily' | 'every_other' | 'weekday_only' | 'random_3pw' | 'rarely';
  refuelTriggerPct: number;
}

// ── 10 Personas ─────────────────────────────────────────────────────────────

const PERSONAS: Persona[] = [
  // GROUP A: Normal usage (70% of users)
  {
    name: 'Anna — Daily Commuter', desc: 'Opens app every morning, 30km RT commute',
    tankCapL: 55, consumptionL100: 7.5, dailyKmWeekday: 35, dailyKmWeekend: 5,
    style: 'nearEmpty', initialPct: 70, appOpenPattern: 'daily', refuelTriggerPct: 18,
  },
  {
    name: 'Tom — Casual Checker', desc: 'Opens app every other day, short commute',
    tankCapL: 40, consumptionL100: 6.5, dailyKmWeekday: 15, dailyKmWeekend: 8,
    style: 'convenient', initialPct: 65, appOpenPattern: 'every_other', refuelTriggerPct: 35,
  },
  {
    name: 'Sandra — Weekday Only', desc: 'Only uses app on work days',
    tankCapL: 50, consumptionL100: 7.0, dailyKmWeekday: 25, dailyKmWeekend: 10,
    style: 'nearEmpty', initialPct: 55, appOpenPattern: 'weekday_only', refuelTriggerPct: 20,
  },
  // GROUP B: Non-standard patterns (25% of users)
  {
    name: 'Klaus — Heavy SUV', desc: 'Long autobahn commute, high consumption',
    tankCapL: 70, consumptionL100: 9.0, dailyKmWeekday: 85, dailyKmWeekend: 5,
    style: 'nearEmpty', initialPct: 90, appOpenPattern: 'daily', refuelTriggerPct: 15,
  },
  {
    name: 'Lisa — Business Traveler', desc: 'Irregular 300km trips, opens app randomly',
    tankCapL: 55, consumptionL100: 7.5, dailyKmWeekday: 20, dailyKmWeekend: 5,
    style: 'convenient', initialPct: 50, appOpenPattern: 'random_3pw',
    irregularKm: {dow: [1,3], km: 300}, refuelTriggerPct: 25,
  },
  {
    name: 'Jürgen — Weekend Driver', desc: 'Barely drives weekdays, 150km weekend trips',
    tankCapL: 55, consumptionL100: 7.5, dailyKmWeekday: 0, dailyKmWeekend: 75,
    style: 'nearEmpty', initialPct: 80, appOpenPattern: 'rarely', refuelTriggerPct: 15,
  },
  {
    name: 'Meike — New Mom (Erratic)', desc: 'Drives 2-3 random days, forgets app exists',
    tankCapL: 45, consumptionL100: 6.8, dailyKmWeekday: 12, dailyKmWeekend: 20,
    style: 'convenient', initialPct: 60, appOpenPattern: 'rarely', refuelTriggerPct: 30,
    journeyOverrides: {
      5: [{type:'manual_adjust', pct: 40}], // adjusts slider on day 5
      15: [{type:'change_setting', key:'style', value:'nearEmpty'}],
    },
  },
  // GROUP C: Edge cases (5% of users)
  {
    name: 'EDGE — Skip Onboarding', desc: 'Skipped setup, no home address, default everything',
    tankCapL: 50, consumptionL100: 7.5, dailyKmWeekday: 10, dailyKmWeekend: 5,
    style: 'nearEmpty', initialPct: 50, appOpenPattern: 'daily', refuelTriggerPct: 20,
  },
  {
    name: 'EDGE — Refuel Immediately', desc: 'Starts at 5%, refuels day 0',
    tankCapL: 55, consumptionL100: 7.5, dailyKmWeekday: 30, dailyKmWeekend: 5,
    style: 'nearEmpty', initialPct: 5, appOpenPattern: 'daily', refuelTriggerPct: 18,
    journeyOverrides: {0: [{type:'refuel', litres: 0}]},
  },
  {
    name: 'EDGE — Never Refuels In App', desc: 'Uses app to check prices only, never taps refuel',
    tankCapL: 50, consumptionL100: 7.5, dailyKmWeekday: 25, dailyKmWeekend: 10,
    style: 'nearEmpty', initialPct: 70, appOpenPattern: 'every_other', refuelTriggerPct: -1, // never
  },
];

// ── Simulation Engine ───────────────────────────────────────────────────────

const DAYS = 30;
const DOW_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function shouldOpenApp(p: Persona, day: number, dow: number): boolean {
  switch (p.appOpenPattern) {
    case 'daily': return true;
    case 'every_other': return day % 2 === 0;
    case 'weekday_only': return dow >= 1 && dow <= 5;
    case 'random_3pw': return [1,3,5].includes(dow) || Math.random() < 0.15;
    case 'rarely': return day % 5 === 0 || Math.random() < 0.1;
  }
}

function getDrivenKm(p: Persona, dow: number): number {
  const isWeekend = dow === 0 || dow === 6;
  let km = isWeekend ? p.dailyKmWeekend : p.dailyKmWeekday;
  if (p.irregularKm && p.irregularKm.dow.includes(dow)) km += p.irregularKm.km;
  // Add ±15% natural variance
  km *= 0.85 + Math.random() * 0.30;
  return Math.round(km * 10) / 10;
}

interface DayLog {
  day: number; dow: string; drivenKm: number;
  realPct: number; estPct: number; drift: number;
  zone: string; daysLeft: number; conf: number;
  appOpened: boolean; notifResult: string;
  events: string[];
}

function simulate(p: Persona): { logs: DayLog[]; issues: string[] } {
  const startMs = Date.now() - DAYS * 86400000;
  let st: SmartTank = {
    levelPct: p.initialPct, lastConfirmedMs: startMs, lastConfirmedBy: 'manual',
    confidence: 0.8, tankCapL: p.tankCapL, consumptionL100: p.consumptionL100,
    dailyKmEMA: (p.dailyKmWeekday * 5 + p.dailyKmWeekend * 2) / 7 || 15,
    refuelIntervalEMA: null, refuelHistory: [],
  };
  let ns: NotifState = { lastMs: 0, weekCount: 0, weekStartMs: startMs };
  let realLitres = (p.initialPct / 100) * p.tankCapL;

  const logs: DayLog[] = [];
  const issues: string[] = [];
  let totalNotifs = 0, totalRefuels = 0;
  let maxDrift = 0, falseAlarmDays = 0, missedCritDays = 0;

  for (let d = 0; d < DAYS; d++) {
    const nowMs = startMs + d * 86400000 + 10 * 3600000; // 10:00 AM
    const dow = new Date(nowMs).getDay();
    const events: string[] = [];

    // 1. Real driving happens
    const driven = getDrivenKm(p, dow);
    const litresUsed = (driven / 100) * p.consumptionL100;
    realLitres = Math.max(0, realLitres - litresUsed);
    const realPct = Math.round((realLitres / p.tankCapL) * 1000) / 10;

    // 2. Check journey overrides
    const overrides = p.journeyOverrides?.[d] ?? [];
    for (const ev of overrides) {
      if (ev.type === 'refuel') {
        st = recordRefuel(st, ev.litres, nowMs);
        realLitres = p.tankCapL;
        events.push('⛽ forced refuel');
        totalRefuels++;
      } else if (ev.type === 'manual_adjust') {
        st = { ...st, levelPct: ev.pct, lastConfirmedMs: nowMs, lastConfirmedBy: 'manual', confidence: 0.8 };
        events.push(`🔧 manual → ${ev.pct}%`);
      } else if (ev.type === 'change_setting') {
        events.push(`⚙️ ${ev.key}=${ev.value}`);
      }
    }

    // 3. Natural refuel trigger (user refuels IRL when real tank is low)
    if (p.refuelTriggerPct > 0 && realPct <= p.refuelTriggerPct && !overrides.some(e=>e.type==='refuel')) {
      // User refuels IRL. Do they also tap "Ich habe getankt"?
      const appOpen = shouldOpenApp(p, d, dow);
      if (appOpen) {
        st = recordRefuel(st, 0, nowMs);
        events.push('⛽ refuel (tapped in app)');
      } else {
        events.push('⛽ refuel IRL (app NOT opened)');
      }
      realLitres = p.tankCapL;
      totalRefuels++;
    }

    // 4. App open → engine runs
    const appOpened = shouldOpenApp(p, d, dow);
    const estPct = estimateLevel(st, nowMs);
    const conf = computeConf(st, nowMs);
    const decision = makeDecision(estPct, conf, p.style);

    // 5. Notification check (happens at 11:30 regardless of app open)
    const notifCheck = shouldNotify(decision, ns, nowMs);
    let notifResult = notifCheck.reason;
    if (notifCheck.ok) {
      totalNotifs++;
      const isCrit = decision.zone === 'Critical';
      const weekReset = nowMs - ns.weekStartMs >= 7*86400000;
      ns = {
        lastMs: nowMs,
        weekCount: isCrit ? ns.weekCount : (weekReset ? 1 : ns.weekCount + 1),
        weekStartMs: weekReset ? nowMs : ns.weekStartMs,
      };
      events.push('🔔');
    }

    // 6. Metrics
    const drift = Math.round((estPct - realPct) * 10) / 10;
    if (Math.abs(drift) > maxDrift) maxDrift = Math.abs(drift);
    const fullRange = (p.tankCapL / p.consumptionL100) * 100;
    const kmLeft = (estPct / 100) * fullRange;
    const dailyKm = st.dailyKmEMA * CONSERVATIVE;
    const daysLeft = dailyKm > 0 ? Math.round((kmLeft / dailyKm) * 10) / 10 : 999;

    if (decision.zone === 'Critical' && realPct > 20) falseAlarmDays++;
    if (realPct <= 10 && decision.zone === 'Safe') missedCritDays++;

    logs.push({
      day: d, dow: DOW_NAMES[dow], drivenKm: driven,
      realPct, estPct, drift,
      zone: decision.zone, daysLeft, conf: Math.round(conf*100)/100,
      appOpened, notifResult, events,
    });
  }

  // Issue detection
  if (maxDrift > 20) issues.push(`⚠️ HIGH DRIFT: Max ${maxDrift.toFixed(1)}% divergence`);
  if (totalNotifs > 8) issues.push(`⚠️ SPAM: ${totalNotifs} notifications in 30 days`);
  if (totalNotifs === 0 && totalRefuels > 0) issues.push(`⚠️ SILENT: ${totalRefuels} refuels but 0 notifications`);
  if (falseAlarmDays > 2) issues.push(`⚠️ FALSE ALARM: ${falseAlarmDays} days Critical but real >20%`);
  if (missedCritDays > 0) issues.push(`🔴 MISSED CRITICAL: ${missedCritDays} days real ≤10% but zone=Safe`);

  // UX journey checks
  const neverOpenedAndLow = logs.filter(l => !l.appOpened && l.realPct < 20).length;
  if (neverOpenedAndLow > 3) issues.push(`📱 UX GAP: ${neverOpenedAndLow} days with low tank but app not opened`);

  const staleEstDays = logs.filter(l => Math.abs(l.drift) > 15).length;
  if (staleEstDays > 5) issues.push(`📊 STALE MODEL: ${staleEstDays} days with >15% drift`);

  return { logs, issues };
}

// ── Report Generation ───────────────────────────────────────────────────────

function generateReport(): string {
  const lines: string[] = [];
  lines.push('# FuelAmpel — User Journey Test Report');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Period: ${DAYS} days per persona | 10 personas | 3 groups\n`);

  const summaryRows: string[][] = [];
  summaryRows.push(['Persona','Refuels','Notifs','MaxDrift','Issues']);

  for (const p of PERSONAS) {
    const { logs, issues } = simulate(p);

    const refuels = logs.filter(l => l.events.some(e => e.includes('⛽'))).length;
    const notifs = logs.filter(l => l.events.some(e => e.includes('🔔'))).length;
    const maxDrift = Math.max(...logs.map(l => Math.abs(l.drift)));
    const zoneDistrib: Record<string,number> = {};
    logs.forEach(l => { zoneDistrib[l.zone] = (zoneDistrib[l.zone]||0) + 1; });

    summaryRows.push([
      p.name.split('—')[0].trim(),
      `${refuels}`,
      `${notifs}`,
      `${maxDrift.toFixed(1)}%`,
      issues.length > 0 ? `${issues.length} ⚠️` : '✅',
    ]);

    lines.push(`---\n\n## ${p.name}`);
    lines.push(`> ${p.desc}\n`);
    lines.push(`| Param | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Tank | ${p.tankCapL}L / ${p.consumptionL100}L/100km |`);
    lines.push(`| Driving | WD:${p.dailyKmWeekday}km WE:${p.dailyKmWeekend}km |`);
    lines.push(`| Style | ${p.style} |`);
    lines.push(`| App Pattern | ${p.appOpenPattern} |`);
    lines.push(`| Refuel Trigger | ≤${p.refuelTriggerPct}% |\n`);

    lines.push('### Summary');
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Refuels | ${refuels}× |`);
    lines.push(`| Notifications | ${notifs}× |`);
    lines.push(`| Max Drift | ${maxDrift.toFixed(1)}% |`);
    lines.push(`| Zones | ${Object.entries(zoneDistrib).map(([k,v])=>`${k}:${v}d`).join(' · ')} |`);
    lines.push(`| Final Real | ${logs[logs.length-1].realPct}% |`);
    lines.push(`| Final Est | ${logs[logs.length-1].estPct}% |\n`);

    // Compact day log (key days only: refuel, notification, zone change, big drift)
    lines.push('### Key Days');
    lines.push('| Day | DOW | Driven | Real% | Est% | Drift | Zone | App | Events |');
    lines.push('|-----|-----|--------|-------|------|-------|------|----|--------|');

    let prevZone = '';
    for (const l of logs) {
      const isKeyDay = l.events.length > 0
        || l.zone !== prevZone
        || Math.abs(l.drift) > 15
        || l.day === 0
        || l.day === DAYS - 1;
      if (isKeyDay) {
        lines.push(
          `| ${l.day} | ${l.dow} | ${l.drivenKm} | ${l.realPct} | ${l.estPct} | ${l.drift>0?'+':''}${l.drift} | ${l.zone} | ${l.appOpened?'✅':'—'} | ${l.events.join(' ')||'—'} |`
        );
      }
      prevZone = l.zone;
    }

    if (issues.length > 0) {
      lines.push('\n### Issues');
      issues.forEach(i => lines.push(`- ${i}`));
    } else {
      lines.push('\n### ✅ No issues detected');
    }
    lines.push('');
  }

  // Executive summary
  const execLines = ['# Executive Summary\n'];
  execLines.push('| ' + summaryRows[0].join(' | ') + ' |');
  execLines.push('|' + summaryRows[0].map(() => '---').join('|') + '|');
  for (let i = 1; i < summaryRows.length; i++) {
    execLines.push('| ' + summaryRows[i].join(' | ') + ' |');
  }

  return execLines.join('\n') + '\n\n' + lines.join('\n');
}

// ── Run ─────────────────────────────────────────────────────────────────────

const report = generateReport();
const outPath = 'tests/journey_report.md';
fs.writeFileSync(outPath, report, 'utf-8');
console.log(`✅ Report written to ${outPath} (${report.length} chars)`);

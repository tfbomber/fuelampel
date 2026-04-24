# Executive Summary

| Persona | Refuels | Notifs | MaxDrift | Issues |
|---|---|---|---|---|
| Anna | 1 | 0 | 83.5% | 2 ⚠️ |
| Tom | 1 | 0 | 65.5% | 2 ⚠️ |
| Sandra | 1 | 2 | 81.2% | 1 ⚠️ |
| Klaus | 2 | 2 | 93.0% | 2 ⚠️ |
| Lisa | 5 | 6 | 100.0% | 3 ⚠️ |
| Jürgen | 1 | 10 | 89.1% | 4 ⚠️ |
| Meike | 1 | 4 | 70.7% | 1 ⚠️ |
| EDGE | 1 | 3 | 81.0% | 1 ⚠️ |
| EDGE | 2 | 2 | 99.0% | 2 ⚠️ |
| EDGE | 0 | 14 | 3.0% | 2 ⚠️ |

# FuelAmpel — User Journey Test Report
Generated: 2026-04-24T08:37:03.448Z
Period: 30 days per persona | 10 personas | 3 groups

---

## Anna — Daily Commuter
> Opens app every morning, 30km RT commute

| Param | Value |
|---|---|
| Tank | 55L / 7.5L/100km |
| Driving | WD:35km WE:5km |
| Style | nearEmpty |
| App Pattern | daily |
| Refuel Trigger | ≤18% |

### Summary
| Metric | Value |
|---|---|
| Refuels | 1× |
| Notifications | 0× |
| Max Drift | 83.5% |
| Zones | Safe:18d · Planning:8d · Low:4d |
| Final Real | 44.9% |
| Final Est | 40.5% |

### Key Days
| Day | DOW | Driven | Real% | Est% | Drift | Zone | App | Events |
|-----|-----|--------|-------|------|-------|------|----|--------|
| 0 | Wed | 37.5 | 64.9 | 68.3 | +3.4 | Safe | ✅ | — |
| 5 | Mon | 33.3 | 50.7 | 48.5 | -2.2 | Planning | ✅ | — |
| 10 | Sat | 5.3 | 30.9 | 28.7 | -2.2 | Low | ✅ | — |
| 14 | Wed | 30.2 | 16.5 | 100 | +83.5 | Safe | ✅ | ⛽ refuel (tapped in app) |
| 27 | Tue | 30.3 | 54.7 | 48.5 | -6.2 | Planning | ✅ | — |
| 29 | Thu | 32.3 | 44.9 | 40.5 | -4.4 | Planning | ✅ | — |

### Issues
- ⚠️ HIGH DRIFT: Max 83.5% divergence
- ⚠️ SILENT: 1 refuels but 0 notifications

---

## Tom — Casual Checker
> Opens app every other day, short commute

| Param | Value |
|---|---|
| Tank | 40L / 6.5L/100km |
| Driving | WD:15km WE:8km |
| Style | convenient |
| App Pattern | every_other |
| Refuel Trigger | ≤35% |

### Summary
| Metric | Value |
|---|---|
| Refuels | 1× |
| Notifications | 0× |
| Max Drift | 65.5% |
| Zones | Safe:23d · Planning:7d |
| Final Real | 67.3% |
| Final Est | 65.1% |

### Key Days
| Day | DOW | Driven | Real% | Est% | Drift | Zone | App | Events |
|-----|-----|--------|-------|------|-------|------|----|--------|
| 0 | Wed | 13.9 | 62.7 | 64 | +1.3 | Safe | ✅ | — |
| 7 | Wed | 13.4 | 48.5 | 47.8 | -0.7 | Planning | — | — |
| 14 | Wed | 16.5 | 34.5 | 100 | +65.5 | Safe | ✅ | ⛽ refuel (tapped in app) |
| 29 | Thu | 14.2 | 67.3 | 65.1 | -2.2 | Safe | — | — |

### Issues
- ⚠️ HIGH DRIFT: Max 65.5% divergence
- ⚠️ SILENT: 1 refuels but 0 notifications

---

## Sandra — Weekday Only
> Only uses app on work days

| Param | Value |
|---|---|
| Tank | 50L / 7L/100km |
| Driving | WD:25km WE:10km |
| Style | nearEmpty |
| App Pattern | weekday_only |
| Refuel Trigger | ≤20% |

### Summary
| Metric | Value |
|---|---|
| Refuels | 1× |
| Notifications | 2× |
| Max Drift | 81.2% |
| Zones | Safe:18d · Planning:8d · Low:4d |
| Final Real | 49.1% |
| Final Est | 45.8% |

### Key Days
| Day | DOW | Driven | Real% | Est% | Drift | Zone | App | Events |
|-----|-----|--------|-------|------|-------|------|----|--------|
| 0 | Wed | 28.4 | 51 | 53.7 | +2.7 | Safe | ✅ | — |
| 2 | Fri | 22 | 44.5 | 47.3 | +2.8 | Planning | ✅ | 🔔 |
| 3 | Sat | 9.3 | 43.2 | 44.1 | +0.9 | Planning | — | 🔔 |
| 8 | Thu | 24.4 | 28.6 | 28.2 | -0.4 | Low | ✅ | — |
| 12 | Mon | 24.1 | 18.8 | 100 | +81.2 | Safe | ✅ | ⛽ refuel (tapped in app) |
| 28 | Wed | 21.3 | 52.8 | 49 | -3.8 | Planning | ✅ | — |
| 29 | Thu | 26.5 | 49.1 | 45.8 | -3.3 | Planning | ✅ | — |

### Issues
- ⚠️ HIGH DRIFT: Max 81.2% divergence

---

## Klaus — Heavy SUV
> Long autobahn commute, high consumption

| Param | Value |
|---|---|
| Tank | 70L / 9L/100km |
| Driving | WD:85km WE:5km |
| Style | nearEmpty |
| App Pattern | daily |
| Refuel Trigger | ≤15% |

### Summary
| Metric | Value |
|---|---|
| Refuels | 2× |
| Notifications | 2× |
| Max Drift | 93.0% |
| Zones | Safe:18d · Planning:6d · Low:4d · Critical:2d |
| Final Real | 31.8% |
| Final Est | 37.7% |

### Key Days
| Day | DOW | Driven | Real% | Est% | Drift | Zone | App | Events |
|-----|-----|--------|-------|------|-------|------|----|--------|
| 0 | Wed | 77.2 | 80.1 | 86.3 | +6.2 | Safe | ✅ | — |
| 5 | Mon | 73.6 | 46.6 | 42.4 | -4.2 | Planning | ✅ | — |
| 7 | Wed | 84.3 | 26.3 | 24.8 | -1.5 | Low | ✅ | — |
| 9 | Fri | 72.7 | 7 | 100 | +93 | Safe | ✅ | ⛽ refuel (tapped in app) |
| 11 | Sun | 5 | 98.7 | 82.4 | -16.3 | Safe | ✅ | — |
| 15 | Thu | 94.3 | 55.2 | 47.3 | -7.9 | Planning | ✅ | — |
| 17 | Sat | 4.5 | 42.8 | 29.7 | -13.1 | Low | ✅ | — |
| 18 | Sun | 4.8 | 42.2 | 20.9 | -21.3 | Low | ✅ | — |
| 19 | Mon | 95.4 | 30 | 12.1 | -17.9 | Critical | ✅ | 🔔 |
| 20 | Tue | 90.4 | 18.3 | 3.3 | -15 | Critical | ✅ | 🔔 |
| 21 | Wed | 83.9 | 7.6 | 100 | +92.4 | Safe | ✅ | ⛽ refuel (tapped in app) |
| 28 | Wed | 85.1 | 41.6 | 45.5 | +3.9 | Planning | ✅ | — |
| 29 | Thu | 76.3 | 31.8 | 37.7 | +5.9 | Planning | ✅ | — |

### Issues
- ⚠️ HIGH DRIFT: Max 93.0% divergence
- 🔴 MISSED CRITICAL: 2 days real ≤10% but zone=Safe

---

## Lisa — Business Traveler
> Irregular 300km trips, opens app randomly

| Param | Value |
|---|---|
| Tank | 55L / 7.5L/100km |
| Driving | WD:20km WE:5km |
| Style | convenient |
| App Pattern | random_3pw |
| Refuel Trigger | ≤25% |

### Summary
| Metric | Value |
|---|---|
| Refuels | 5× |
| Notifications | 6× |
| Max Drift | 100.0% |
| Zones | Safe:21d · Planning:6d · Low:3d |
| Final Real | 97.6% |
| Final Est | 86.6% |

### Key Days
| Day | DOW | Driven | Real% | Est% | Drift | Zone | App | Events |
|-----|-----|--------|-------|------|-------|------|----|--------|
| 0 | Wed | 366.6 | 0 | 100 | +100 | Safe | ✅ | ⛽ refuel (tapped in app) |
| 5 | Mon | 297.9 | 53.3 | 88.2 | +34.9 | Safe | ✅ | — |
| 6 | Tue | 21.3 | 50.4 | 85.9 | +35.5 | Safe | — | — |
| 7 | Wed | 324.8 | 6.1 | 100 | +93.9 | Safe | ✅ | ⛽ refuel (tapped in app) |
| 9 | Fri | 18.4 | 94.7 | 73.3 | -21.4 | Safe | ✅ | — |
| 10 | Sat | 5.2 | 94 | 59.9 | -34.1 | Safe | — | — |
| 11 | Sun | 5.2 | 93.3 | 46.6 | -46.7 | Planning | — | 🔔 |
| 12 | Mon | 345.5 | 46.2 | 33.2 | -13 | Planning | ✅ | 🔔 |
| 13 | Tue | 20.3 | 43.4 | 19.9 | -23.5 | Low | — | — |
| 14 | Wed | 287.4 | 4.2 | 100 | +95.8 | Safe | ✅ | ⛽ refuel (tapped in app) |
| 16 | Fri | 18 | 95 | 73.3 | -21.7 | Safe | ✅ | — |
| 17 | Sat | 5.6 | 94.3 | 59.9 | -34.4 | Safe | ✅ | — |
| 18 | Sun | 5.1 | 93.6 | 46.6 | -47 | Planning | — | 🔔 |
| 19 | Mon | 300.4 | 52.6 | 33.2 | -19.4 | Planning | ✅ | 🔔 |
| 20 | Tue | 19.4 | 50 | 19.9 | -30.1 | Low | — | — |
| 21 | Wed | 292.7 | 10.1 | 100 | +89.9 | Safe | ✅ | ⛽ refuel (tapped in app) |
| 23 | Fri | 18.1 | 94.7 | 73.3 | -21.4 | Safe | ✅ | — |
| 24 | Sat | 5.4 | 94 | 59.9 | -34.1 | Safe | — | — |
| 25 | Sun | 4.5 | 93.3 | 46.6 | -46.7 | Planning | — | 🔔 |
| 26 | Mon | 321.6 | 49.5 | 33.2 | -16.3 | Planning | ✅ | 🔔 |
| 27 | Tue | 22.1 | 46.5 | 19.9 | -26.6 | Low | — | — |
| 28 | Wed | 279.1 | 8.4 | 100 | +91.6 | Safe | ✅ | ⛽ refuel (tapped in app) |
| 29 | Thu | 17.4 | 97.6 | 86.6 | -11 | Safe | — | — |

### Issues
- ⚠️ HIGH DRIFT: Max 100.0% divergence
- 🔴 MISSED CRITICAL: 4 days real ≤10% but zone=Safe
- 📊 STALE MODEL: 21 days with >15% drift

---

## Jürgen — Weekend Driver
> Barely drives weekdays, 150km weekend trips

| Param | Value |
|---|---|
| Tank | 55L / 7.5L/100km |
| Driving | WD:0km WE:75km |
| Style | nearEmpty |
| App Pattern | rarely |
| Refuel Trigger | ≤15% |

### Summary
| Metric | Value |
|---|---|
| Refuels | 1× |
| Notifications | 10× |
| Max Drift | 89.1% |
| Zones | Safe:9d · Planning:7d · Low:4d · Critical:10d |
| Final Real | 89.1% |
| Final Est | 0% |

### Key Days
| Day | DOW | Driven | Real% | Est% | Drift | Zone | App | Events |
|-----|-----|--------|-------|------|-------|------|----|--------|
| 0 | Wed | 0 | 80 | 78.7 | -1.3 | Safe | ✅ | — |
| 9 | Fri | 0 | 61.2 | 49.7 | -11.5 | Planning | — | — |
| 16 | Fri | 0 | 40.6 | 27.2 | -13.4 | Low | — | — |
| 20 | Tue | 0 | 20.4 | 14.4 | -6 | Critical | ✅ | 🔔 |
| 21 | Wed | 0 | 20.4 | 11.2 | -9.2 | Critical | — | 🔔 |
| 22 | Thu | 0 | 20.4 | 7.9 | -12.5 | Critical | — | 🔔 |
| 23 | Fri | 0 | 20.4 | 4.7 | -15.7 | Critical | — | 🔔 |
| 24 | Sat | 84.6 | 8.9 | 1.5 | -7.4 | Critical | — | ⛽ refuel IRL (app NOT opened) 🔔 |
| 25 | Sun | 79.7 | 89.1 | 0 | -89.1 | Critical | ✅ | 🔔 |
| 26 | Mon | 0 | 89.1 | 0 | -89.1 | Critical | — | 🔔 |
| 27 | Tue | 0 | 89.1 | 0 | -89.1 | Critical | — | 🔔 |
| 28 | Wed | 0 | 89.1 | 0 | -89.1 | Critical | — | 🔔 |
| 29 | Thu | 0 | 89.1 | 0 | -89.1 | Critical | — | 🔔 |

### Issues
- ⚠️ HIGH DRIFT: Max 89.1% divergence
- ⚠️ SPAM: 10 notifications in 30 days
- ⚠️ FALSE ALARM: 9 days Critical but real >20%
- 📊 STALE MODEL: 6 days with >15% drift

---

## Meike — New Mom (Erratic)
> Drives 2-3 random days, forgets app exists

| Param | Value |
|---|---|
| Tank | 45L / 6.8L/100km |
| Driving | WD:12km WE:20km |
| Style | convenient |
| App Pattern | rarely |
| Refuel Trigger | ≤30% |

### Summary
| Metric | Value |
|---|---|
| Refuels | 1× |
| Notifications | 4× |
| Max Drift | 70.7% |
| Zones | Safe:20d · Planning:6d · Low:4d |
| Final Real | 67.7% |
| Final Est | 64.4% |

### Key Days
| Day | DOW | Driven | Real% | Est% | Drift | Zone | App | Events |
|-----|-----|--------|-------|------|-------|------|----|--------|
| 0 | Wed | 10.6 | 58.4 | 59 | +0.6 | Safe | ✅ | — |
| 4 | Sun | 17.9 | 49.4 | 49.5 | +0.1 | Planning | ✅ | — |
| 5 | Mon | 11.7 | 47.7 | 40 | -7.7 | Planning | ✅ | 🔧 manual → 40% 🔔 |
| 6 | Tue | 10.6 | 46.1 | 37.6 | -8.5 | Planning | — | 🔔 |
| 7 | Wed | 11.8 | 44.3 | 35.3 | -9 | Planning | — | 🔔 |
| 8 | Thu | 10.5 | 42.7 | 32.9 | -9.8 | Planning | — | 🔔 |
| 10 | Sat | 18.4 | 38.2 | 28.1 | -10.1 | Low | ✅ | — |
| 14 | Wed | 11.8 | 29.3 | 100 | +70.7 | Safe | ✅ | ⛽ refuel (tapped in app) |
| 15 | Thu | 10.6 | 98.4 | 97.6 | -0.8 | Safe | ✅ | ⚙️ style=nearEmpty |
| 29 | Thu | 10.4 | 67.7 | 64.4 | -3.3 | Safe | — | — |

### Issues
- ⚠️ HIGH DRIFT: Max 70.7% divergence

---

## EDGE — Skip Onboarding
> Skipped setup, no home address, default everything

| Param | Value |
|---|---|
| Tank | 50L / 7.5L/100km |
| Driving | WD:10km WE:5km |
| Style | nearEmpty |
| App Pattern | daily |
| Refuel Trigger | ≤20% |

### Summary
| Metric | Value |
|---|---|
| Refuels | 1× |
| Notifications | 3× |
| Max Drift | 81.0% |
| Zones | Planning:14d · Low:9d · Safe:7d |
| Final Real | 92.4% |
| Final Est | 91.5% |

### Key Days
| Day | DOW | Driven | Real% | Est% | Drift | Zone | App | Events |
|-----|-----|--------|-------|------|-------|------|----|--------|
| 0 | Wed | 10 | 48.5 | 49.4 | +0.9 | Planning | ✅ | 🔔 |
| 1 | Thu | 8.6 | 47.2 | 48 | +0.8 | Planning | ✅ | 🔔 |
| 2 | Fri | 11.4 | 45.5 | 46.6 | +1.1 | Planning | ✅ | 🔔 |
| 14 | Wed | 9.5 | 30.8 | 29.6 | -1.2 | Low | ✅ | — |
| 23 | Fri | 9.1 | 19 | 100 | +81 | Safe | ✅ | ⛽ refuel (tapped in app) |
| 29 | Thu | 10.2 | 92.4 | 91.5 | -0.9 | Safe | ✅ | — |

### Issues
- ⚠️ HIGH DRIFT: Max 81.0% divergence

---

## EDGE — Refuel Immediately
> Starts at 5%, refuels day 0

| Param | Value |
|---|---|
| Tank | 55L / 7.5L/100km |
| Driving | WD:30km WE:5km |
| Style | nearEmpty |
| App Pattern | daily |
| Refuel Trigger | ≤18% |

### Summary
| Metric | Value |
|---|---|
| Refuels | 2× |
| Notifications | 2× |
| Max Drift | 99.0% |
| Zones | Safe:18d · Planning:6d · Low:4d · Critical:2d |
| Final Real | 92% |
| Final Est | 93.1% |

### Key Days
| Day | DOW | Driven | Real% | Est% | Drift | Zone | App | Events |
|-----|-----|--------|-------|------|-------|------|----|--------|
| 0 | Wed | 29.3 | 1 | 100 | +99 | Safe | ✅ | ⛽ forced refuel |
| 15 | Thu | 26.6 | 51.9 | 48.6 | -3.3 | Planning | ✅ | — |
| 21 | Wed | 31.5 | 33.5 | 28 | -5.5 | Low | ✅ | — |
| 25 | Sun | 4.6 | 23.8 | 14.3 | -9.5 | Critical | ✅ | 🔔 |
| 26 | Mon | 32 | 19.4 | 10.9 | -8.5 | Critical | ✅ | 🔔 |
| 27 | Tue | 27.8 | 15.6 | 100 | +84.4 | Safe | ✅ | ⛽ refuel (tapped in app) |
| 29 | Thu | 29.4 | 92 | 93.1 | +1.1 | Safe | ✅ | — |

### Issues
- ⚠️ HIGH DRIFT: Max 99.0% divergence
- 🔴 MISSED CRITICAL: 1 days real ≤10% but zone=Safe

---

## EDGE — Never Refuels In App
> Uses app to check prices only, never taps refuel

| Param | Value |
|---|---|
| Tank | 50L / 7.5L/100km |
| Driving | WD:25km WE:10km |
| Style | nearEmpty |
| App Pattern | every_other |
| Refuel Trigger | ≤-1% |

### Summary
| Metric | Value |
|---|---|
| Refuels | 0× |
| Notifications | 14× |
| Max Drift | 3.0% |
| Zones | Safe:6d · Planning:6d · Low:4d · Critical:14d |
| Final Real | 0% |
| Final Est | 0% |

### Key Days
| Day | DOW | Driven | Real% | Est% | Drift | Zone | App | Events |
|-----|-----|--------|-------|------|-------|------|----|--------|
| 0 | Wed | 26.1 | 66.1 | 68.6 | +2.5 | Safe | ✅ | — |
| 6 | Tue | 23.5 | 47.8 | 48.1 | +0.3 | Planning | ✅ | — |
| 12 | Mon | 25.4 | 28.4 | 27.6 | -0.8 | Low | ✅ | — |
| 16 | Fri | 25.9 | 12.5 | 13.9 | +1.4 | Critical | ✅ | 🔔 |
| 17 | Sat | 10.5 | 10.9 | 10.5 | -0.4 | Critical | — | 🔔 |
| 18 | Sun | 10.4 | 9.4 | 7.1 | -2.3 | Critical | ✅ | 🔔 |
| 19 | Mon | 28.3 | 5.1 | 3.6 | -1.5 | Critical | — | 🔔 |
| 20 | Tue | 26.5 | 1.1 | 0.2 | -0.9 | Critical | ✅ | 🔔 |
| 21 | Wed | 25.7 | 0 | 0 | 0 | Critical | — | 🔔 |
| 22 | Thu | 22.3 | 0 | 0 | 0 | Critical | ✅ | 🔔 |
| 23 | Fri | 23.4 | 0 | 0 | 0 | Critical | — | 🔔 |
| 24 | Sat | 10.3 | 0 | 0 | 0 | Critical | ✅ | 🔔 |
| 25 | Sun | 9.1 | 0 | 0 | 0 | Critical | — | 🔔 |
| 26 | Mon | 25.6 | 0 | 0 | 0 | Critical | ✅ | 🔔 |
| 27 | Tue | 25.9 | 0 | 0 | 0 | Critical | — | 🔔 |
| 28 | Wed | 22.4 | 0 | 0 | 0 | Critical | ✅ | 🔔 |
| 29 | Thu | 26.7 | 0 | 0 | 0 | Critical | — | 🔔 |

### Issues
- ⚠️ SPAM: 14 notifications in 30 days
- 📱 UX GAP: 8 days with low tank but app not opened

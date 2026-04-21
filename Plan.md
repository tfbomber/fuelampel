# FuelAmpel UI/UX Polish Plan

## Goal
- Improve clarity and polish without changing the core recommendation, SmartTank, or station logic.
- Prefer lighter UX fixes over new features or structural refactors.

## This Pass
1. Reduce visual noise on the Home screen by showing only the highest-priority inline banner.
2. Make manual tank correction easier to discover with lightweight inline guidance.
3. Remove duplicate view-toggle controls on the Stations screen.
4. Localize a few obvious hardcoded user-facing strings in shared surfaces.
5. Keep all logic paths and decision behavior unchanged.

## Explicit Non-Goals
- No algorithm changes in `decisionEngine` or SmartTank.
- No new onboarding fields or settings.
- No heavy component architecture changes.

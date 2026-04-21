import sys
import re

file_path = 'd:/Stock Analysis/Fuel Ampel/FuelAmpelApp/app/settings.tsx'

with open(file_path, 'r', encoding='utf-8', newline='') as f:
    content = f.read()

# 1. Add useFuelStore import
import_target = "import { useUserStore } from '../src/store/userStore';"
import_replacement = "import { useUserStore } from '../src/store/userStore';\nimport { useFuelStore } from '../src/store/fuelStore';"
if import_target in content:
    content = content.replace(import_target, import_replacement)

# 2. Add smartTank, initSmartTank, recomputeDecision to the component
store_target = """  const {
    language, setLanguage,
    fuelType, setFuelType,
    refuelingStyle, setRefuelingStyle,
    carType, setCarType,
    lastRefuelAmount, setLastRefuelAmount,
    commonAreas, setCommonAreas,
    shadowTank, setAvgConsumption, setTankCapacity, setTotalRangeKm,
    recordRefuel, fullReset,
  } = useUserStore();"""
  
store_replacement = """  const {
    language, setLanguage,
    fuelType, setFuelType,
    refuelingStyle, setRefuelingStyle,
    carType, setCarType,
    lastRefuelAmount, setLastRefuelAmount,
    commonAreas, setCommonAreas,
    shadowTank, setAvgConsumption, setTankCapacity, setTotalRangeKm,
    recordRefuel, fullReset,
    smartTank, initSmartTank,
  } = useUserStore();
  
  const recomputeDecision = useFuelStore(s => s.recomputeDecision);"""
if store_target in content:
    content = content.replace(store_target, store_replacement)

# 3. Add areaDirty state and modify updateHome/work/clear
area_target = """  // Local resolved areas (mirrors store, updated on pick)
  const [homeArea, setHomeArea] = useState<CommonArea | null>(commonAreas[0] ?? null);
  const [workArea, setWorkArea] = useState<CommonArea | null>(commonAreas[1] ?? null);

  function updateHome(area: CommonArea) {
    setHomeArea(area);
    setCommonAreas(workArea ? [area, workArea] : [area]);
  }
  function clearHome() {
    setHomeArea(null);
    setCommonAreas(workArea ? [workArea] : []);
  }
  function updateWork(area: CommonArea) {
    setWorkArea(area);
    if (homeArea) setCommonAreas([homeArea, area]);
  }
  function clearWork() {
    setWorkArea(null);
    if (homeArea) setCommonAreas([homeArea]);
  }"""
  
area_replacement = """  // Local resolved areas (mirrors store, updated on pick)
  const [homeArea, setHomeArea] = useState<CommonArea | null>(commonAreas[0] ?? null);
  const [workArea, setWorkArea] = useState<CommonArea | null>(commonAreas[1] ?? null);
  const [areaDirty, setAreaDirty] = useState(false);

  function updateHome(area: CommonArea) {
    setHomeArea(area);
    setAreaDirty(true);
    setGlobalDirty(true);
  }
  function clearHome() {
    setHomeArea(null);
    setAreaDirty(true);
    setGlobalDirty(true);
  }
  function updateWork(area: CommonArea) {
    setWorkArea(area);
    setAreaDirty(true);
    setGlobalDirty(true);
  }
  function clearWork() {
    setWorkArea(null);
    setAreaDirty(true);
    setGlobalDirty(true);
  }"""
if area_target in content:
    content = content.replace(area_target, area_replacement)

# 4. Modify handleGlobalSave
save_target = """  function handleGlobalSave() {
    let hasError = false;
    if (consumptionDirty) {
      const val = parseFloat(consumptionInput);
      if (isNaN(val) || val < 3 || val > 25) {
        Alert.alert(t('alertInvalidValue'), t('alertConsumptionRange')); hasError = true;
      } else { setAvgConsumption(val); setConsumptionDirty(false); }
    }
    if (capacityDirty) {
      const val = parseFloat(capacityInput);
      if (isNaN(val) || val < 20 || val > 120) {
        Alert.alert(t('alertInvalidValue'), t('alertCapacityRange')); hasError = true;
      } else { setTankCapacity(val); setCapacityDirty(false); }
    }
    if (rangeDirty) {
      const trimmed = rangeInput.trim();
      if (trimmed === '' || trimmed === '0') {
        setTotalRangeKm(null); setRangeDirty(false);
      } else {
        const val = parseFloat(trimmed);
        if (isNaN(val) || val < 50 || val > 2000) {
          Alert.alert(t('alertInvalidValue'), t('alertRangeInputRange')); hasError = true;
        } else { setTotalRangeKm(val); setRangeDirty(false); }
      }
    }
    if (!hasError) {
      setGlobalDirty(false);
      if (globalSavedTimerRef.current) clearTimeout(globalSavedTimerRef.current);
      setGlobalSaved(true);
      globalSavedTimerRef.current = setTimeout(() => setGlobalSaved(false), 2000);
      console.log('[Settings] Global save committed.');
    }
  }"""

save_replacement = """  function handleGlobalSave() {
    let hasError = false;

    // ── 1. Save Gebiete ─────────────────────────────────────────────
    if (areaDirty) {
      const areas: CommonArea[] = [];
      if (homeArea) areas.push(homeArea);
      if (workArea) areas.push(workArea);
      setCommonAreas(areas);
      setAreaDirty(false);
      console.log('[Settings] Gebiete saved:', areas.map(a => a.displayName).join(', '));

      if (!smartTank && homeArea) {
        initSmartTank(homeArea, workArea ?? undefined);
        console.log('[Settings] SmartTank initialized from Settings on first Gebiete save.');
      }
    }

    if (consumptionDirty) {
      const val = parseFloat(consumptionInput);
      if (isNaN(val) || val < 3 || val > 25) {
        Alert.alert(t('alertInvalidValue'), t('alertConsumptionRange')); hasError = true;
      } else { setAvgConsumption(val); setConsumptionDirty(false); }
    }
    if (capacityDirty) {
      const val = parseFloat(capacityInput);
      if (isNaN(val) || val < 20 || val > 120) {
        Alert.alert(t('alertInvalidValue'), t('alertCapacityRange')); hasError = true;
      } else { setTankCapacity(val); setCapacityDirty(false); }
    }
    if (rangeDirty) {
      const trimmed = rangeInput.trim();
      if (trimmed === '' || trimmed === '0') {
        setTotalRangeKm(null); setRangeDirty(false);
      } else {
        const val = parseFloat(trimmed);
        if (isNaN(val) || val < 50 || val > 2000) {
          Alert.alert(t('alertInvalidValue'), t('alertRangeInputRange')); hasError = true;
        } else { setTotalRangeKm(val); setRangeDirty(false); }
      }
    }
    if (!hasError) {
      setGlobalDirty(false);
      if (globalSavedTimerRef.current) clearTimeout(globalSavedTimerRef.current);
      setGlobalSaved(true);
      globalSavedTimerRef.current = setTimeout(() => setGlobalSaved(false), 2000);
      recomputeDecision();
      console.log('[Settings] Global save committed. Decision recomputed.');
    }
  }"""

if save_target in content:
    content = content.replace(save_target, save_replacement)

with open(file_path, 'w', encoding='utf-8', newline='') as f:
    f.write(content)
print('settings.tsx patched successfully.')

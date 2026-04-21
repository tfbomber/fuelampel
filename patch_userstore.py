import sys
import re

file_path = 'd:/Stock Analysis/Fuel Ampel/FuelAmpelApp/src/store/userStore.ts'

with open(file_path, 'r', encoding='utf-8', newline='') as f:
    content = f.read()

target = r"      setAvgConsumption: \(l100km\) => \{\r?\n        const updated = updateConsumption\(get\(\)\.shadowTank, l100km\);\r?\n        console\.log\(`\[UserStore\] Avg consumption → \$\{updated\.avgConsumptionPer100km\} L/100km`\);\r?\n        set\(\{ shadowTank: updated \}\);\r?\n      \},"

replacement = """      setAvgConsumption: (l100km) => {
        const updated = updateConsumption(get().shadowTank, l100km);
        console.log(`[UserStore] Avg consumption → ${updated.avgConsumptionPer100km} L/100km`);
        set((state) => ({
          shadowTank: updated,
          smartTank: state.smartTank
            ? { ...state.smartTank, consumptionPer100km: l100km }
            : state.smartTank,
        }));
      },"""

if re.search(target, content):
    content = re.sub(target, replacement, content)
    with open(file_path, 'w', encoding='utf-8', newline='') as f:
        f.write(content)
    print('userStore patched successfully.')
else:
    print('Target not found in userStore.ts!')
    

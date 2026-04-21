import sys
import re

file_path = 'd:/Stock Analysis/Fuel Ampel/FuelAmpelApp/app.json'

with open(file_path, 'r', encoding='utf-8', newline='') as f:
    content = f.read()

# Replace version
content = re.sub(r'"version":\s*"1\.6\.0"', '"version": "1.6.1"', content)

# Replace versionCode
content = re.sub(r'"versionCode":\s*31', '"versionCode": 32', content)

with open(file_path, 'w', encoding='utf-8', newline='') as f:
    f.write(content)
print('app.json bumped successfully.')

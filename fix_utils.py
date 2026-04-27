import re

path = r'c:\Users\Admin\Documents\impostor-game\js\utils.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

print('Read', len(content), 'chars')
lines = content.split('\n')
for i, line in enumerate(lines[110:118], start=111):
    print(f'Line {i}: {repr(line)}')

new_fn = '''function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, """)
    .replace(/'/g, "&#39;");
}'''

content = re.sub(
    r'function escapeHtml\(value\) \{.*?\n\}',
    new_fn,
    content,
    flags=re.DOTALL
)

# Write to temp first, then move
temp_path = path + '.tmp'
with open(temp_path, 'w', encoding='utf-8') as f:
    f.write(content)

import os
os.replace(temp_path, path)

# Verify
with open(path, 'r', encoding='utf-8') as f:
    verify = f.read()
idx = verify.find('escapeHtml')
print('After write, escapeHtml context:', repr(verify[idx:idx+80]))
print('Fixed successfully')


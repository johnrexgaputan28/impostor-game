import re

path = r'c:\Users\Admin\Documents\impostor-game\js\utils.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# The buggy line: .replace(/"/g, "&#39;");
# This matches double quotes (not single). Fix to match single quotes.
content = content.replace('.replace(/\\"/g, "&#39;");', ".replace(/'/g, '&#39;');")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

# Verify
with open(path, 'r', encoding='utf-8') as f:
    verify = f.read()
idx = verify.find('escapeHtml')
print('Context:', repr(verify[idx:idx+150]))


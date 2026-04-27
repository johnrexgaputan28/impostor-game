import re

path = r'c:\Users\Admin\Documents\impostor-game\js\utils.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Build replacement with concatenation to avoid " entity decoding
amp = '&' + 'amp;'
lt = '&' + 'lt;'
gt = '&' + 'gt;'
quot = '&' + 'quot;'
q = '"'

new_fn = (
    'function escapeHtml(value) {\n'
    '  return String(value)\n'
    '    .replace(/&/g, ' + q + amp + q + ')\n'
    '    .replace(/</g, ' + q + lt + q + ')\n'
    '    .replace(/>/g, ' + q + gt + q + ')\n'
    '    .replace(/' + q + '/g, ' + q + quot + q + ')\n'
    '    .replace(/\\' + q + '/g, ' + q + '&#39;' + q + ');\n'
    '}'
)

print('Built replacement')
content = re.sub(
    r'function escapeHtml\(value\) \{.*?\n\}',
    new_fn,
    content,
    flags=re.DOTALL
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

# Verify
with open(path, 'r', encoding='utf-8') as f:
    verify = f.read()
idx = verify.find('.replace(/' + q + '/g')
print('Line with quote replace:', repr(verify[idx:idx+40]))


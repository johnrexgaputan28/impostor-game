import re

path = r'c:\Users\Admin\Documents\impostor-game\js\utils.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Build replacement programmatically to avoid quote mangling
q = '"'
amp = '&amp;'
lt = '<'
gt = '>'
quot = '"'
new_fn = (
    'function escapeHtml(value) {\n'
    '  return String(value)\n'
    '    .replace(/&/g, ' + q + amp + q + ')\n'
    '    .replace(/</g, ' + q + lt + q + ')\n'
    '    .replace(/>/g, ' + q + gt + q + ')\n'
    '    .replace(/' + q + '/g, ' + q + quot + q + ')\n'
    '    .replace(/\'/g, ' + q + '&#39;' + q + ');\n'
    '}'
)

print('Replacement string:')
print(new_fn)

content = re.sub(
    r'function escapeHtml\(value\) \{.*?\n\}',
    new_fn,
    content,
    flags=re.DOTALL
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

with open(path, 'r', encoding='utf-8') as f:
    verify = f.read()
idx = verify.find('escapeHtml')
print('After write, context:')
print(repr(verify[idx:idx+120]))


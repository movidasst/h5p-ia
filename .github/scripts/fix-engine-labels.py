from pathlib import Path

# Patch index.html: expose the real provider/model names instead of stale aliases.
p = Path('index.html')
s = p.read_text(encoding='utf-8')
old = '<div class="field"><label for="engine">Modelo IA</label><select id="engine" class="control"><option value="gemini-2.5-flash" selected>Gemini Flash</option><option value="gemini-2.5-pro">Gemini Pro</option></select></div>'
new = '<div class="field"><label for="engine">Proveedor y modelo de IA</label><select id="engine" class="control"><option value="gemini-3.6-flash" selected>Google Gemini 3.6 Flash</option><option value="gemini-3.7-flash">Google Gemini 3.7 Flash</option><option value="gemini-3.5-flash">Google Gemini 3.5 Flash</option></select><div class="hint">La generación automática de esta versión usa Google Gemini API. ChatGPT/OpenAI no está conectado automáticamente.</div></div>'
if old not in s:
    raise SystemExit('engine selector block not found in index.html')
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')

# Patch app.js: use a current real model id as the browser default and reset state when model changes.
p = Path('app.js')
s = p.read_text(encoding='utf-8')
s2 = s.replace("const model = $('engine').value || 'gemini-2.5-flash';", "const model = $('engine').value || 'gemini-3.6-flash';", 1)
if s2 == s:
    raise SystemExit('default engine line not found in app.js')
s = s2
needle = "  $('lang').addEventListener('change', resetAfterInputChange);"
replacement = needle + "\n  $('engine').addEventListener('change', resetAfterInputChange);"
if needle not in s:
    raise SystemExit('bind lang line not found in app.js')
s = s.replace(needle, replacement, 1)
p.write_text(s, encoding='utf-8')

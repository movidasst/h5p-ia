from pathlib import Path

p = Path('app.js')
s = p.read_text(encoding='utf-8')

# Remove the Moodle preview block that depended on local_h5pia 1.3.x.
marker = '// H5PIA_PREVIEW_V130'
if marker in s:
    start = s.index(marker)
    end = s.index('function bind()', start)
    s = s[:start] + s[end:]

# Drive endpoint + cache of the exact validated package.
anchor = "const MAX_SOURCE_FILE_BYTES = 12 * 1024 * 1024;"
assert anchor in s, 'MAX_SOURCE_FILE_BYTES anchor missing'
if 'const H5P_DRIVE_SCRIPT_URL' not in s:
    addition = anchor + "\nconst H5P_DRIVE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbweUDHocCNItLciLJr9ujg-FHIYU0h-733c2E1esv3TbC7rz4OEYAWS6K2QtGmO9g72/exec';\nconst H5P_DRIVE_MAX_BYTES = 15 * 1024 * 1024;\nlet lastValidatedH5p = null;"
    s = s.replace(anchor, addition, 1)

start = s.index('async function downloadH5P()')
end = s.index('\nasync function publishToMoodle()', start)
replacement = r'''async function blobToBase64ForDrive(blob) {
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>{
      const raw = String(reader.result || '');
      resolve(raw.includes(',') ? raw.split(',')[1] : raw);
    };
    reader.onerror = ()=>reject(new Error('No se pudo preparar el archivo H5P para Drive.'));
    reader.readAsDataURL(blob);
  });
}

async function saveValidatedH5pToDrive(blob, filename) {
  if (!blob || !filename) throw new Error('No hay un H5P validado para respaldar.');
  if (blob.size > H5P_DRIVE_MAX_BYTES) throw new Error('El H5P supera 15 MB y no puede enviarse por este respaldo de Drive.');
  if (!sb) throw new Error('Sesión administrativa no disponible.');
  const {data:{session}} = await sb.auth.getSession();
  if (!session?.access_token) throw new Error('La sesión administrativa expiró.');
  const base64 = await blobToBase64ForDrive(blob);
  const body = new URLSearchParams({
    action:'upload_h5p',
    access_token:session.access_token,
    file_name:filename,
    title:proposal?.title || filename.replace(/\.h5p$/i,''),
    library:selectedLibrary?.machineName || '',
    topic:$('topic')?.value?.trim() || '',
    generated_at:new Date().toISOString(),
    file_base64:base64
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(()=>controller.abort(), 65000);
  try {
    const response = await fetch(H5P_DRIVE_SCRIPT_URL, {
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
      body,
      redirect:'follow',
      signal:controller.signal
    });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); }
    catch (_) { throw new Error('Google Drive devolvió una respuesta no válida.'); }
    if (!response.ok || data?.result !== 'success' || !data?.file_id) {
      throw new Error(data?.message || ('No se pudo guardar la copia en Drive · HTTP ' + response.status));
    }
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Google Drive tardó demasiado en guardar la copia. El archivo local sigue disponible.');
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function downloadBlobLocally(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

function ensureDriveRetryButton() {
  let button = document.getElementById('driveRetryBtn');
  if (button) return button;
  const actions = document.querySelector('.final-actions');
  if (!actions) return null;
  button = document.createElement('button');
  button.id = 'driveRetryBtn';
  button.type = 'button';
  button.className = 'final-btn';
  button.style.cssText = 'border:1px solid #dbe5ec;background:#fff;color:#007b85;';
  button.textContent = '☁ Guardar copia en Drive';
  button.hidden = true;
  button.addEventListener('click', async ()=>{
    if (!lastValidatedH5p) return;
    try {
      setBusy(button, true, 'Guardando en Drive…');
      const saved = await saveValidatedH5pToDrive(lastValidatedH5p.blob, lastValidatedH5p.filename);
      button.hidden = true;
      showStatus($('finalStatus'), '✓ Copia guardada en Drive · ' + (saved.file_name || lastValidatedH5p.filename), 'ok');
    } catch (error) {
      showStatus($('finalStatus'), error.message || 'No se pudo guardar la copia en Drive.', 'warn');
    } finally { setBusy(button, false); }
  });
  actions.appendChild(button);
  return button;
}

async function downloadH5P() {
  const button = $('downloadH5pBtn');
  try {
    setBusy(button, true, 'Validando y preparando…');
    showStatus($('finalStatus'), 'Preparando el paquete H5P validado…');
    const auth = await bridgeAuth();
    const response = await fetch(BRIDGE_URL, {method:'POST',headers:auth.headers,body:JSON.stringify(bridgePayload('download',auth.token))});
    if (!response.ok) {
      const data = await response.json().catch(()=>({}));
      throw new Error(data.error || ('No se pudo preparar el paquete · HTTP ' + response.status));
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = match?.[1] || (safeFilename(proposal.title) + '.h5p');

    // Local delivery happens first. Drive can never block the user's file.
    downloadBlobLocally(blob, filename);
    lastValidatedH5p = {blob, filename};
    const retry = ensureDriveRetryButton();
    if (retry) retry.hidden = true;

    try {
      showStatus($('finalStatus'), '✓ H5P descargado. Guardando una copia del mismo archivo en Drive…', 'ok');
      const saved = await saveValidatedH5pToDrive(blob, filename);
      showStatus($('finalStatus'), '✓ H5P descargado y copia guardada en Drive · ' + (saved.file_name || filename), 'ok');
    } catch (driveError) {
      if (retry) retry.hidden = false;
      showStatus($('finalStatus'), '✓ El H5P se descargó correctamente. Drive no pudo guardar la copia: ' + (driveError.message || 'error desconocido') + '. Puedes reintentar sin regenerar.', 'warn');
    }
  } catch (error) {
    showStatus($('finalStatus'), error.message || 'No se pudo descargar el H5P.', 'err');
  } finally { setBusy(button, false); }
}
'''
s = s[:start] + replacement + s[end:]

boot_old = "function boot(detail) {\n  if (sb) return;\n  sb = detail.sb;\n  bind();\n  syncRegistry();\n}"
boot_new = "function boot(detail) {\n  if (sb) return;\n  sb = detail.sb;\n  const publish = $('publishBtn');\n  if (publish) publish.hidden = true;\n  ensureDriveRetryButton();\n  bind();\n  syncRegistry();\n}"
assert boot_old in s, 'boot anchor missing'
s = s.replace(boot_old, boot_new, 1)

s = s.replace("Moodle está listo para validar el archivo o publicarlo en el Banco de contenido.", "El generador está listo para validar y preparar el archivo H5P.")
s = s.replace("Falta tener activo el puente H5P IA de Moodle para descargar o publicar.", "Falta el empaquetador actual para preparar el archivo H5P.")
p.write_text(s, encoding='utf-8')

ip = Path('index.html')
h = ip.read_text(encoding='utf-8')
h = h.replace('<strong>4</strong> Descarga o publica', '<strong>4</strong> Valida y descarga')
h = h.replace('Enviar a Moodle', 'Envío directo desactivado')
ip.write_text(h, encoding='utf-8')

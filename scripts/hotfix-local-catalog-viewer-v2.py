from pathlib import Path
import re

APP = Path('app.js')
INDEX = Path('index.html')
CATALOG = Path('catalog-h5p.js')

s = APP.read_text(encoding='utf-8')
if 'H5P_CATALOG_VIEWER_HOTFIX_V2' in s:
    print('Hotfix V2 already applied')
    raise SystemExit(0)

# 1) Always keep the activity catalog visible. Remote Moodle registry becomes optional enrichment only.
old_enabled = """function enabledLibraries() {\n  return (registry?.libraries || []).filter(x => x.runnable && x.enabled && Array.isArray(x.semantics));\n}"""
new_enabled = """// H5P_CATALOG_VIEWER_HOTFIX_V2 — local catalog always visible; Moodle is optional technical enrichment.\nfunction localCatalogLibraries() {\n  const names = Object.keys(window.H5P_CATALOG || {});\n  return names.map((machineName,index)=>({\n    id:'local:' + machineName,\n    machineName,\n    title:window.H5P_NAMES_ES?.[machineName] || machineName,\n    majorVersion:0,\n    minorVersion:0,\n    patchVersion:0,\n    runnable:true,\n    enabled:true,\n    semantics:[],\n    localCatalog:true,\n    localOrder:index\n  }));\n}\n\nfunction enabledLibraries() {\n  const remote=(registry?.libraries || []).filter(x => x.runnable && x.enabled && Array.isArray(x.semantics));\n  return [...remote, ...localCatalogLibraries()];\n}"""
if old_enabled not in s:
    raise SystemExit('enabledLibraries anchor not found')
s = s.replace(old_enabled, new_enabled, 1)

start = s.index('async function syncRegistry() {')
end = s.index('\nfunction populateLibrarySelect()', start)
new_sync = r'''async function syncRegistry() {
  // The local catalog is primary. Never remove the activity types because Moodle is unavailable.
  registry = {libraries:[], localFallback:true};
  populateLibrarySelect();
  $('moodleDot').className = 'dot ok';
  $('moodleStatus').textContent = `Catálogo H5P local · ${latestLibraries().length} tipos disponibles`;
  $('syncBtn').textContent = 'Actualizar catálogo';
  bridgeReady = false;
  bridgeSupportsAssets = false;
  updateFinalButtons();

  // Optional background enrichment: if the old technical registry is reachable,
  // use its exact versions/semantics without making the UI depend on it.
  try {
    const response = await fetch(REGISTRY_URL, {headers:{Accept:'application/json'}, cache:'no-store'});
    if (!response.ok) return;
    const remote = await response.json();
    if (!Array.isArray(remote?.libraries)) return;
    registry = remote;
    populateLibrarySelect();
    $('moodleDot').className = 'dot ok';
    $('moodleStatus').textContent = `Catálogo H5P listo · ${latestLibraries().length} tipos disponibles`;
    await checkBridge();
  } catch (_) {
    // Deliberately silent: Moodle availability must not remove the catalog or viewer.
  }
}'''
s = s[:start] + new_sync + s[end:]

# Wording must describe the app, not a mandatory Moodle connection.
replacements = {
    'Comparará tu tema con las actividades que realmente están instaladas en Moodle y propondrá la más adecuada.': 'Comparará tu tema con las actividades disponibles en el catálogo H5P y propondrá la más adecuada.',
    'Elige la mejor SOLO entre estas librerías instaladas:': 'Elige la mejor SOLO entre estas librerías disponibles:',
    'La IA propuso una actividad que no está instalada en Moodle.': 'La IA propuso una actividad que no está disponible en el catálogo H5P.'
}
for a,b in replacements.items():
    s=s.replace(a,b)

# 2) Viewer runtime: service worker only needs to be ACTIVE because playback now occurs in a newly loaded iframe.
start = s.index('async function ensureH5pPreviewServiceWorker() {')
end = s.index('\nasync function ensureH5pViewerRuntime()', start)
new_sw = r'''async function ensureH5pPreviewServiceWorker() {
  if (!('serviceWorker' in navigator) || !('caches' in window)) throw new Error('Este navegador no admite la vista previa H5P local.');
  let registration = await navigator.serviceWorker.register('/h5p-preview-sw.js', {scope:'/'});
  registration = await navigator.serviceWorker.ready;
  if (!registration.active) {
    await new Promise((resolve,reject)=>{
      const worker=registration.installing || registration.waiting;
      if (!worker) return reject(new Error('No se pudo activar el visualizador local.'));
      const timer=setTimeout(()=>reject(new Error('El visualizador local tardó demasiado en activarse.')),5000);
      worker.addEventListener('statechange',()=>{
        if(worker.state==='activated'){clearTimeout(timer);resolve();}
      });
    });
  }
  if (!registration.active) throw new Error('No se pudo activar el visualizador local.');
  return registration;
}'''
s = s[:start] + new_sw + s[end:]

# Parent page only needs JSZip + active SW. H5P itself runs isolated in h5p-viewer-frame.html.
start = s.index('async function ensureH5pViewerRuntime() {')
end = s.index('\nasync function assertH5pZipBlob', start)
new_runtime = r'''async function ensureH5pViewerRuntime() {
  if (h5pViewerRuntimePromise) return h5pViewerRuntimePromise;
  h5pViewerRuntimePromise = (async()=>{
    await Promise.all([
      ensureH5pPreviewServiceWorker(),
      loadViewerScript('h5pViewerJsZip', H5P_VIEWER_JSZIP, ()=>Boolean(window.JSZip))
    ]);
    if (!window.JSZip) throw new Error('El descompresor H5P local no está disponible.');
  })().catch(error=>{
    h5pViewerRuntimePromise = null;
    throw error;
  });
  return h5pViewerRuntimePromise;
}'''
s = s[:start] + new_runtime + s[end:]

# Add iframe styling.
s=s.replace(
    '.h5p-viewer-container{width:100%;min-height:260px}.h5p-viewer-loading',
    '.h5p-viewer-container{width:100%;min-height:260px}.h5p-viewer-iframe{display:block;width:100%;min-height:70vh;border:0;background:#fff}.h5p-viewer-loading',
    1
)

# 3) Isolated playback. Await a real READY/ERROR result so blank output cannot be reported as success.
start = s.index('async function openH5pViewer(blob, filename, meta={}) {')
end = s.index('\nasync function previewGeneratedH5p()', start)
new_open = r'''async function openH5pViewer(blob, filename, meta={}) {
  ensureH5pViewerUI();
  await ensureH5pViewerRuntime();
  const overlay=$('h5pLocalViewerOverlay');
  const container=$('h5pLocalViewerContainer');
  if (!overlay || !container) throw new Error('No se pudo iniciar la interfaz del visualizador.');
  overlay.hidden=false;
  document.body.style.overflow='hidden';
  $('h5pLocalViewerTitle').textContent=filename || 'Vista previa H5P';
  $('h5pLocalViewerSub').textContent='H5P Standalone · visor aislado · sin publicar';
  $('h5pLocalViewerMeta').textContent='Validando estructura y preparando archivos temporales…';
  container.innerHTML='<div class="h5p-viewer-loading">Descomprimiendo y validando H5P…</div>';

  let info;
  try {
    info=await cacheH5pPackage(blob,(done,total)=>{
      const loading=container.querySelector('.h5p-viewer-loading');
      if (loading && (done===total || done%25===0)) loading.textContent=`Preparando archivos… ${done}/${total}`;
    });
    activeH5pViewerPackage={blob,filename:filename || 'actividad.h5p',source:meta.source || 'unknown',info};

    const frame=document.createElement('iframe');
    frame.className='h5p-viewer-iframe';
    frame.title='Actividad H5P interactiva';
    frame.setAttribute('allow','fullscreen; autoplay; microphone; camera');
    const frameUrl=new URL('/h5p-viewer-frame.html',location.origin);
    frameUrl.searchParams.set('base',info.basePath);

    const result=new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{
        window.removeEventListener('message',onMessage);
        reject(new Error('El reproductor H5P no terminó de iniciar. Se evitó mostrar una vista previa en blanco.'));
      },20000);
      function onMessage(event){
        if(event.origin!==location.origin || event.source!==frame.contentWindow) return;
        const data=event.data;
        if(data?.source!=='movidasst-h5p-viewer') return;
        if(data.type==='ready'){
          clearTimeout(timeout);window.removeEventListener('message',onMessage);resolve(data);
        } else if(data.type==='error'){
          clearTimeout(timeout);window.removeEventListener('message',onMessage);reject(new Error(data.message || 'El reproductor H5P informó un error.'));
        }
      }
      window.addEventListener('message',onMessage);
    });

    container.replaceChildren(frame);
    frame.src=frameUrl.toString();
    const ready=await result;
    activeH5pViewerPlayer=frame;
    $('h5pLocalViewerMeta').textContent=`✓ Reproducción iniciada · ${ready.mainLibrary || info.mainLibrary} · ${info.files} archivos · ${Math.max(1,Math.round(info.extractedBytes/1024))} KB descomprimidos. Prueba botones, respuestas, imágenes y retroalimentación.`;
  } catch(error) {
    const safe=String(error.message || 'No se pudo visualizar el H5P.');
    container.innerHTML='<div class="h5p-viewer-loading">⚠ '+safe.replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))+'</div>';
    $('h5pLocalViewerMeta').textContent='El archivo no fue publicado ni enviado a ningún LMS.';
    throw error;
  }
}'''
s = s[:start] + new_open + s[end:]

APP.write_text(s, encoding='utf-8')

# Update visible copy so Moodle never appears as a required connection.
h = INDEX.read_text(encoding='utf-8')
h = h.replace('Herramienta privada de La Movida SST para crear actividades H5P con IA y Moodle 5.2.', 'Herramienta privada de La Movida SST para crear, visualizar, validar y descargar actividades H5P con IA.')
h = h.replace('Academia Movida SST · Moodle 5.2', 'Academia Movida SST · H5P con IA')
h = h.replace('Conectando con Moodle…', 'Cargando catálogo H5P local…')
h = h.replace('<button id="syncBtn" class="text-btn">Actualizar</button>', '<button id="syncBtn" class="text-btn">Actualizar catálogo</button>')
h = h.replace('Solo verás actividades instaladas en tu Moodle.', 'Elige entre todos los tipos de actividad disponibles en el catálogo H5P.')
INDEX.write_text(h, encoding='utf-8')

# Remove stale fallback wording from the pedagogical catalog.
c = CATALOG.read_text(encoding='utf-8')
c = c.replace('Actividad H5P instalada en tu Moodle. La aplicación puede utilizar su estructura técnica aunque todavía no tenga una ficha pedagógica específica.', 'Actividad H5P disponible en el catálogo local. La aplicación puede utilizar su ficha pedagógica aunque todavía no tenga una descripción específica.')
CATALOG.write_text(c, encoding='utf-8')

print('Hotfix V2 applied')

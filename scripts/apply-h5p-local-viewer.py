from pathlib import Path

p = Path('app.js')
s = p.read_text(encoding='utf-8')

SENTINEL = 'H5P_LOCAL_VIEWER_V1'
if SENTINEL in s:
    print('Local H5P viewer already installed')
    raise SystemExit(0)

if 'H5PIA_PREVIEW_V130' in s:
    raise SystemExit('Refusing to patch: obsolete Moodle preview block is still present')

anchor = 'let lastValidatedH5p = null;'
if anchor not in s:
    raise SystemExit('lastValidatedH5p anchor missing')
constants = r'''let lastValidatedH5p = null;

// H5P_LOCAL_VIEWER_V1 — browser-only H5P viewer. Never publishes to Moodle.
const H5P_VIEWER_CACHE = 'movidasst-h5p-preview-v1';
const H5P_VIEWER_PREFIX = '/__h5p_preview__';
const H5P_VIEWER_JSZIP = '/assets/vendor/jszip-3.10.1.min.js';
const H5P_VIEWER_MAIN = '/assets/h5p-standalone/main.bundle.js';
const H5P_VIEWER_FRAME = '/assets/h5p-standalone/frame.bundle.js';
const H5P_VIEWER_CSS = '/assets/h5p-standalone/styles/h5p.css';
const H5P_VIEWER_MAX_COMPRESSED = 40 * 1024 * 1024;
const H5P_VIEWER_MAX_EXTRACTED = 160 * 1024 * 1024;
const H5P_VIEWER_MAX_FILE = 60 * 1024 * 1024;
const H5P_VIEWER_MAX_FILES = 5000;
let h5pViewerRuntimePromise = null;
let activeH5pViewerPackage = null;
let activeH5pViewerPlayer = null;'''
s = s.replace(anchor, constants, 1)

# Any content or asset change invalidates the cached package.
s = s.replace('generatedParams = null;\n  clearAssetUploads();', 'generatedParams = null;\n  lastValidatedH5p = null;\n  clearAssetUploads();', 1)
s = s.replace('generatedParams = params;\n', 'generatedParams = params;\n    lastValidatedH5p = null;\n', 1)
s = s.replace('assetUploads.set(spec.id,asset);\n  renderAssetPanel();', 'assetUploads.set(spec.id,asset);\n  lastValidatedH5p = null;\n  renderAssetPanel();', 1)

viewer_code = r'''

function h5pPackageFingerprint() {
  if (!generatedParams || !selectedLibrary || !proposal) return '';
  const assets = bridgeAssets().map(a => ({
    id:a.id,
    path:a.path,
    mimeType:a.mimeType,
    size:a.dataBase64?.length || 0,
    head:String(a.dataBase64 || '').slice(0,48),
    tail:String(a.dataBase64 || '').slice(-48)
  }));
  return JSON.stringify({library:selectedLibrary.id,title:proposal.title,params:generatedParams,assets});
}

function h5pMimeType(path) {
  const ext = String(path || '').split('.').pop().toLowerCase();
  return ({
    json:'application/json; charset=utf-8',
    js:'application/javascript; charset=utf-8',
    mjs:'application/javascript; charset=utf-8',
    css:'text/css; charset=utf-8',
    html:'text/html; charset=utf-8',
    htm:'text/html; charset=utf-8',
    txt:'text/plain; charset=utf-8',
    xml:'application/xml; charset=utf-8',
    svg:'image/svg+xml', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', gif:'image/gif', avif:'image/avif',
    mp3:'audio/mpeg', wav:'audio/wav', ogg:'audio/ogg', m4a:'audio/mp4', aac:'audio/aac',
    mp4:'video/mp4', webm:'video/webm', mov:'video/quicktime',
    woff:'font/woff', woff2:'font/woff2', ttf:'font/ttf', otf:'font/otf', eot:'application/vnd.ms-fontobject',
    vtt:'text/vtt; charset=utf-8', srt:'application/x-subrip; charset=utf-8', pdf:'application/pdf'
  })[ext] || 'application/octet-stream';
}

function h5pSafeZipPath(raw) {
  const path = String(raw || '').replace(/\\/g,'/').replace(/^\.\//,'');
  if (!path || path.startsWith('/') || path.includes('\0')) throw new Error('El H5P contiene una ruta de archivo inválida.');
  const parts = path.split('/');
  if (parts.some(part => part === '..' || part === '')) throw new Error('El H5P contiene una ruta insegura.');
  return parts.join('/');
}

function h5pEncodedPath(path) {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

function loadViewerScript(id, src, ready) {
  if (ready()) return Promise.resolve();
  const existing = document.getElementById(id);
  if (existing) {
    return new Promise((resolve,reject)=>{
      if (ready()) return resolve();
      existing.addEventListener('load',()=>ready()?resolve():reject(new Error('No se pudo iniciar el visualizador H5P.')),{once:true});
      existing.addEventListener('error',()=>reject(new Error('No se pudo cargar el motor del visualizador H5P.')),{once:true});
    });
  }
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.id=id; script.src=src; script.defer=true;
    script.onload=()=>ready()?resolve():reject(new Error('El componente del visualizador se cargó, pero no inició correctamente.'));
    script.onerror=()=>reject(new Error('No se pudo cargar un componente local del visualizador H5P.'));
    document.head.appendChild(script);
  });
}

function ensureViewerPageCss() {
  if (document.getElementById('h5pStandalonePageCss')) return;
  const link=document.createElement('link');
  link.id='h5pStandalonePageCss'; link.rel='stylesheet'; link.href=H5P_VIEWER_CSS;
  document.head.appendChild(link);
}

async function ensureH5pPreviewServiceWorker() {
  if (!('serviceWorker' in navigator) || !('caches' in window)) throw new Error('Este navegador no admite la vista previa H5P local.');
  const registration = await navigator.serviceWorker.register('/h5p-preview-sw.js', {scope:'/'});
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await Promise.race([
      new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true})),
      new Promise(resolve=>setTimeout(resolve,2500))
    ]);
  }
  if (!registration.active && !navigator.serviceWorker.controller) throw new Error('No se pudo activar el visualizador local. Recarga la aplicación una vez.');
}

async function ensureH5pViewerRuntime() {
  if (h5pViewerRuntimePromise) return h5pViewerRuntimePromise;
  h5pViewerRuntimePromise = (async()=>{
    ensureViewerPageCss();
    await Promise.all([
      ensureH5pPreviewServiceWorker(),
      loadViewerScript('h5pViewerJsZip', H5P_VIEWER_JSZIP, ()=>Boolean(window.JSZip)),
      loadViewerScript('h5pViewerStandalone', H5P_VIEWER_MAIN, ()=>Boolean(window.H5PStandalone?.H5P))
    ]);
    if (!window.JSZip || !window.H5PStandalone?.H5P) throw new Error('El motor H5P local no está disponible.');
  })().catch(error=>{
    h5pViewerRuntimePromise = null;
    throw error;
  });
  return h5pViewerRuntimePromise;
}

async function assertH5pZipBlob(blob) {
  if (!(blob instanceof Blob) || blob.size < 4) throw new Error('El archivo H5P está vacío o incompleto.');
  if (blob.size > H5P_VIEWER_MAX_COMPRESSED) throw new Error('El archivo H5P supera 40 MB. Para proteger la memoria del dispositivo, usa un paquete más liviano.');
  const sig = new Uint8Array(await blob.slice(0,4).arrayBuffer());
  if (sig[0]!==0x50 || sig[1]!==0x4b || !((sig[2]===0x03&&sig[3]===0x04)||(sig[2]===0x05&&sig[3]===0x06)||(sig[2]===0x07&&sig[3]===0x08))) {
    throw new Error('El archivo no tiene una estructura ZIP/H5P válida.');
  }
}

function findH5pZipRoot(zip) {
  if (zip.file('h5p.json') && zip.file('content/content.json')) return '';
  const candidates = Object.keys(zip.files)
    .filter(name => !zip.files[name].dir && name.endsWith('/h5p.json'))
    .map(name => name.slice(0,-'h5p.json'.length))
    .filter(prefix => zip.file(prefix+'content/content.json'));
  const unique=[...new Set(candidates)];
  if (unique.length===1) return unique[0];
  throw new Error('El paquete no contiene h5p.json y content/content.json en una estructura reconocible.');
}

async function clearLocalH5pPreviewCache() {
  const cache=await caches.open(H5P_VIEWER_CACHE);
  const keys=await cache.keys();
  await Promise.all(keys.map(key=>cache.delete(key)));
}

async function cacheH5pPackage(blob, onProgress=()=>{}) {
  await assertH5pZipBlob(blob);
  await ensureH5pViewerRuntime();
  let zip;
  try { zip = await window.JSZip.loadAsync(blob, {checkCRC32:true, createFolders:false}); }
  catch (_) { throw new Error('No se pudo descomprimir el H5P o su ZIP está dañado.'); }

  const root=findH5pZipRoot(zip);
  const h5pEntry=zip.file(root+'h5p.json');
  const contentEntry=zip.file(root+'content/content.json');
  let h5pJson, contentJson;
  try { h5pJson=JSON.parse(await h5pEntry.async('string')); }
  catch (_) { throw new Error('h5p.json no contiene JSON válido.'); }
  try { contentJson=JSON.parse(await contentEntry.async('string')); }
  catch (_) { throw new Error('content/content.json no contiene JSON válido.'); }
  if (!h5pJson || typeof h5pJson!=='object' || !h5pJson.mainLibrary) throw new Error('h5p.json no declara la librería principal.');
  if (!contentJson || typeof contentJson!=='object') throw new Error('content/content.json no tiene una estructura válida.');

  const rawNames=Object.keys(zip.files).filter(name=>{
    const entry=zip.files[name];
    return !entry.dir && name.startsWith(root) && !name.includes('__MACOSX/') && !name.endsWith('/.DS_Store') && name!==root+'.DS_Store';
  });
  if (rawNames.length > H5P_VIEWER_MAX_FILES) throw new Error(`El H5P contiene demasiados archivos (${rawNames.length}). Máximo del visor: ${H5P_VIEWER_MAX_FILES}.`);

  const normalized=[];
  for (const rawName of rawNames) {
    const relative=h5pSafeZipPath(rawName.slice(root.length));
    normalized.push({rawName, relative, entry:zip.files[rawName]});
  }
  const pathSet=new Set(normalized.map(x=>x.relative));
  for (const dep of (h5pJson.preloadedDependencies || [])) {
    if (!dep?.machineName || dep.majorVersion===undefined || dep.minorVersion===undefined) continue;
    const libraryJson=`${dep.machineName}-${dep.majorVersion}.${dep.minorVersion}/library.json`;
    if (!pathSet.has(libraryJson)) throw new Error(`El paquete no incluye la librería necesaria ${dep.machineName} ${dep.majorVersion}.${dep.minorVersion}. No puede visualizarse de forma autónoma.`);
  }

  await clearLocalH5pPreviewCache();
  const cache=await caches.open(H5P_VIEWER_CACHE);
  const session=(crypto.randomUUID?.() || (Date.now()+'-'+Math.random())).replace(/[^a-zA-Z0-9-]/g,'');
  const basePath=`${H5P_VIEWER_PREFIX}/${session}`;
  let extracted=0;
  let completed=0;

  const processOne=async item=>{
    let data;
    try { data=await item.entry.async('arraybuffer'); }
    catch (_) { throw new Error(`No se pudo extraer ${item.relative}.`); }
    if (data.byteLength > H5P_VIEWER_MAX_FILE) throw new Error(`El archivo interno ${item.relative} supera 60 MB.`);
    extracted += data.byteLength;
    if (extracted > H5P_VIEWER_MAX_EXTRACTED) throw new Error('El contenido descomprimido supera 160 MB y no es seguro abrirlo en este dispositivo.');
    const url=location.origin+basePath+'/'+h5pEncodedPath(item.relative);
    const headers=new Headers({
      'Content-Type':h5pMimeType(item.relative),
      'Content-Length':String(data.byteLength),
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff'
    });
    await cache.put(new Request(url), new Response(data,{status:200,headers}));
    completed += 1;
    onProgress(completed, normalized.length);
  };

  try {
    for (let i=0;i<normalized.length;i+=8) await Promise.all(normalized.slice(i,i+8).map(processOne));
  } catch (error) {
    await clearLocalH5pPreviewCache().catch(()=>{});
    if (error?.name==='QuotaExceededError') throw new Error('El navegador no tiene espacio temporal suficiente para abrir este H5P.');
    throw error;
  }

  return {basePath, mainLibrary:String(h5pJson.mainLibrary), files:normalized.length, extractedBytes:extracted, h5pJson};
}

function ensureH5pViewerUI() {
  if (document.getElementById('h5pViewerToolPanel')) return;

  const style=document.createElement('style');
  style.id='h5pLocalViewerStyles';
  style.textContent=`
    .h5p-viewer-tool .viewer-actions{display:grid;grid-template-columns:1fr;gap:8px;margin-top:12px}.h5p-viewer-tool .viewer-open{border:1px solid #b8d9dc;background:#f3fbfb;color:#006f78;border-radius:14px;min-height:50px;font-weight:900;padding:10px 14px}
    .h5p-viewer-overlay{position:fixed;inset:0;z-index:1200;background:rgba(0,20,52,.78);display:grid;place-items:center;padding:0}.h5p-viewer-shell{width:100%;height:100dvh;background:#fff;display:grid;grid-template-rows:auto auto 1fr auto;overflow:hidden}
    .h5p-viewer-head{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #dbe5ec;background:#fff}.h5p-viewer-head-text{min-width:0;flex:1}.h5p-viewer-head strong{display:block;color:#00205b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.h5p-viewer-head span{display:block;margin-top:2px;color:#64748b;font-size:.7rem}.h5p-viewer-close{border:1px solid #dbe5ec;background:#fff;color:#00205b;border-radius:10px;min-width:42px;min-height:42px;font-weight:900}
    .h5p-viewer-devices{display:flex;gap:6px;padding:8px 10px;border-bottom:1px solid #e8eef2;background:#f8fafc;overflow-x:auto}.h5p-viewer-devices button{flex:0 0 auto;border:1px solid #dbe5ec;background:#fff;color:#52697a;border-radius:10px;padding:7px 10px;font-size:.72rem;font-weight:850}.h5p-viewer-devices button.active{border-color:#007b85;background:#eaf7f8;color:#006b74}
    .h5p-viewer-stage{min-height:0;overflow:auto;background:#e8eef3;padding:8px;display:flex;justify-content:center;align-items:flex-start}.h5p-viewer-viewport{width:100%;min-height:100%;background:#fff;border-radius:10px;box-shadow:0 4px 20px rgba(0,32,91,.10);transition:max-width .2s ease,width .2s ease}.h5p-viewer-container{width:100%;min-height:260px}.h5p-viewer-loading{padding:28px;text-align:center;color:#64748b;font-weight:800}
    .h5p-viewer-foot{display:grid;gap:7px;padding:9px 11px;border-top:1px solid #dbe5ec;background:#fff}.h5p-viewer-meta{margin:0;color:#64748b;font-size:.7rem;line-height:1.35}.h5p-viewer-foot-actions{display:flex;gap:7px}.h5p-viewer-foot-actions button{flex:1;min-height:44px;border-radius:11px;font-weight:900;padding:8px 11px}.h5p-viewer-foot-close{border:1px solid #dbe5ec;background:#fff;color:#00205b}.h5p-viewer-foot-download{border:0;background:#00205b;color:#fff}
    @media(min-width:680px){.h5p-viewer-tool .viewer-actions{grid-template-columns:1fr 1fr}.h5p-viewer-overlay{padding:18px}.h5p-viewer-shell{width:min(1120px,100%);height:min(94dvh,920px);border-radius:20px;box-shadow:0 28px 80px rgba(0,0,0,.30)}.h5p-viewer-stage{padding:14px}.h5p-viewer-foot{grid-template-columns:1fr auto;align-items:center}.h5p-viewer-foot-actions button{min-width:150px}}
  `;
  document.head.appendChild(style);

  const integration=document.querySelector('.integration');
  const panel=document.createElement('section');
  panel.id='h5pViewerToolPanel'; panel.className='panel h5p-viewer-tool';
  panel.innerHTML=`<div class="panel-head"><span class="number">👁</span><div><h3>Visualizador H5P</h3><p class="panel-sub">Abre y prueba cualquier archivo .h5p directamente en tu navegador. No se sube a Moodle ni al Banco de contenido.</p></div></div><div class="viewer-actions"><button id="openLocalH5pBtn" class="viewer-open" type="button">📂 Abrir archivo .h5p</button><button id="previewGeneratedTopBtn" class="viewer-open" type="button" disabled>✨ Ver H5P generado</button></div><div id="h5pViewerToolStatus" class="status" hidden></div>`;
  if (integration) integration.insertAdjacentElement('afterend',panel); else document.querySelector('.main')?.prepend(panel);

  const input=document.createElement('input');
  input.id='localH5pFileInput'; input.type='file'; input.accept='.h5p,application/zip,application/x-h5p'; input.hidden=true;
  document.body.appendChild(input);

  const overlay=document.createElement('div');
  overlay.id='h5pLocalViewerOverlay'; overlay.className='h5p-viewer-overlay'; overlay.hidden=true;
  overlay.innerHTML=`<section class="h5p-viewer-shell" role="dialog" aria-modal="true" aria-labelledby="h5pLocalViewerTitle"><header class="h5p-viewer-head"><div class="h5p-viewer-head-text"><strong id="h5pLocalViewerTitle">Vista previa H5P</strong><span id="h5pLocalViewerSub">H5P Standalone · ejecución local</span></div><button id="h5pLocalViewerClose" class="h5p-viewer-close" type="button" aria-label="Cerrar">✕</button></header><div class="h5p-viewer-devices"><button type="button" data-viewer-width="390">📱 Móvil</button><button type="button" data-viewer-width="768">▣ Tablet</button><button type="button" data-viewer-width="full" class="active">🖥 Escritorio</button></div><div class="h5p-viewer-stage"><div id="h5pLocalViewerViewport" class="h5p-viewer-viewport"><div id="h5pLocalViewerContainer" class="h5p-viewer-container"><div class="h5p-viewer-loading">Preparando actividad…</div></div></div></div><footer class="h5p-viewer-foot"><p id="h5pLocalViewerMeta" class="h5p-viewer-meta">Vista previa local. Nada se publica en Moodle.</p><div class="h5p-viewer-foot-actions"><button id="h5pLocalViewerFootClose" class="h5p-viewer-foot-close" type="button">Cerrar</button><button id="h5pLocalViewerDownload" class="h5p-viewer-foot-download" type="button">⬇ Descargar este H5P</button></div></footer></section>`;
  document.body.appendChild(overlay);

  const actions=document.querySelector('.final-actions');
  if (actions && !document.getElementById('previewGeneratedH5pBtn')) {
    const button=document.createElement('button');
    button.id='previewGeneratedH5pBtn'; button.type='button'; button.className='final-btn'; button.style.cssText='border:0;background:#007b85;color:#fff;'; button.textContent='👁 Vista previa H5P'; button.disabled=true;
    actions.insertBefore(button,actions.firstChild);
    button.addEventListener('click',previewGeneratedH5p);
  }

  $('openLocalH5pBtn').addEventListener('click',()=>input.click());
  $('previewGeneratedTopBtn').addEventListener('click',previewGeneratedH5p);
  input.addEventListener('change',async()=>{
    const file=input.files?.[0]; input.value='';
    if (!file) return;
    try {
      showStatus($('h5pViewerToolStatus'),'Validando y abriendo el archivo…');
      await openH5pViewer(file,file.name,{source:'local'});
      showStatus($('h5pViewerToolStatus'),'✓ Archivo abierto en el visualizador local.','ok');
    } catch(error) { showStatus($('h5pViewerToolStatus'),error.message || 'No se pudo abrir el H5P.','err'); }
  });
  $('h5pLocalViewerClose').addEventListener('click',closeH5pViewer);
  $('h5pLocalViewerFootClose').addEventListener('click',closeH5pViewer);
  $('h5pLocalViewerDownload').addEventListener('click',()=>{
    if (activeH5pViewerPackage?.blob && activeH5pViewerPackage?.filename) downloadBlobLocally(activeH5pViewerPackage.blob,activeH5pViewerPackage.filename);
  });
  overlay.addEventListener('click',event=>{ if(event.target===overlay) closeH5pViewer(); });
  document.addEventListener('keydown',event=>{ if(event.key==='Escape' && !overlay.hidden) closeH5pViewer(); });
  overlay.querySelectorAll('[data-viewer-width]').forEach(button=>button.addEventListener('click',()=>setH5pViewerWidth(button.dataset.viewerWidth,button)));
  updateH5pViewerButtons();
}

function setH5pViewerWidth(value, activeButton) {
  const viewport=$('h5pLocalViewerViewport');
  if (!viewport) return;
  viewport.style.maxWidth=value==='full' ? '100%' : `${Number(value)}px`;
  document.querySelectorAll('[data-viewer-width]').forEach(btn=>btn.classList.toggle('active',btn===activeButton));
  setTimeout(()=>window.dispatchEvent(new Event('resize')),80);
}

function closeH5pViewer() {
  const overlay=$('h5pLocalViewerOverlay');
  if (overlay) overlay.hidden=true;
  const container=$('h5pLocalViewerContainer');
  if (container) container.replaceChildren();
  activeH5pViewerPlayer=null;
  document.body.style.overflow='';
}

function updateH5pViewerButtons() {
  const ready=Boolean(generatedParams && selectedLibrary && proposal);
  const hasAssets=Boolean(proposal?.assets?.length);
  const canPackage=Boolean(bridgeReady && (!hasAssets || bridgeSupportsAssets));
  const top=$('previewGeneratedTopBtn');
  const final=$('previewGeneratedH5pBtn');
  if (top) top.disabled=!ready || !canPackage;
  if (final) final.disabled=!ready || !canPackage;
}

async function prepareValidatedH5pBlob() {
  if (!generatedParams || !selectedLibrary || !proposal) throw new Error('Primero crea la actividad H5P.');
  const fingerprint=h5pPackageFingerprint();
  if (lastValidatedH5p?.blob && lastValidatedH5p?.fingerprint===fingerprint) return lastValidatedH5p;
  const auth=await bridgeAuth();
  const response=await fetch(BRIDGE_URL,{method:'POST',headers:auth.headers,body:JSON.stringify(bridgePayload('download',auth.token))});
  if (!response.ok) {
    const data=await response.json().catch(()=>({}));
    throw new Error(data.error || ('No se pudo preparar el paquete H5P · HTTP '+response.status));
  }
  const blob=await response.blob();
  await assertH5pZipBlob(blob);
  const disposition=response.headers.get('Content-Disposition') || '';
  const match=disposition.match(/filename="?([^";]+)"?/i);
  const filename=match?.[1] || (safeFilename(proposal.title)+'.h5p');
  lastValidatedH5p={blob,filename,fingerprint};
  return lastValidatedH5p;
}

async function openH5pViewer(blob, filename, meta={}) {
  ensureH5pViewerUI();
  await ensureH5pViewerRuntime();
  const overlay=$('h5pLocalViewerOverlay');
  const container=$('h5pLocalViewerContainer');
  if (!overlay || !container) throw new Error('No se pudo iniciar la interfaz del visualizador.');
  overlay.hidden=false;
  document.body.style.overflow='hidden';
  $('h5pLocalViewerTitle').textContent=filename || 'Vista previa H5P';
  $('h5pLocalViewerSub').textContent='H5P Standalone 3.8.2 · vista local · sin publicar';
  $('h5pLocalViewerMeta').textContent='Validando estructura y preparando archivos temporales…';
  container.innerHTML='<div class="h5p-viewer-loading">Descomprimiendo y validando H5P…</div>';

  let info;
  try {
    info=await cacheH5pPackage(blob,(done,total)=>{
      const loading=container.querySelector('.h5p-viewer-loading');
      if (loading && (done===total || done%25===0)) loading.textContent=`Preparando archivos… ${done}/${total}`;
    });
    container.replaceChildren();
    activeH5pViewerPackage={blob,filename:filename || 'actividad.h5p',source:meta.source || 'unknown',info};
    activeH5pViewerPlayer=new window.H5PStandalone.H5P(container,{
      h5pJsonPath:info.basePath,
      librariesPath:info.basePath,
      frameJs:H5P_VIEWER_FRAME,
      frameCss:H5P_VIEWER_CSS,
      frame:true,
      copyright:true,
      export:false,
      icon:false,
      fullScreen:true,
      reportingIsEnabled:true
    });
    $('h5pLocalViewerMeta').textContent=`✓ Estructura válida · ${info.mainLibrary} · ${info.files} archivos · ${Math.max(1,Math.round(info.extractedBytes/1024))} KB descomprimidos. Prueba botones, respuestas, imágenes y retroalimentación.`;
  } catch(error) {
    container.innerHTML=`<div class="h5p-viewer-loading">⚠ ${String(error.message || 'No se pudo visualizar el H5P.')}</div>`;
    $('h5pLocalViewerMeta').textContent='El archivo no fue publicado ni enviado a Moodle.';
    throw error;
  }
}

async function previewGeneratedH5p() {
  const button=$('previewGeneratedH5pBtn') || $('previewGeneratedTopBtn');
  try {
    if (button) setBusy(button,true,'Preparando vista previa…');
    showStatus($('finalStatus'),'Preparando el mismo paquete que después podrás descargar. No se publicará en Moodle.');
    const pkg=await prepareValidatedH5pBlob();
    await openH5pViewer(pkg.blob,pkg.filename,{source:'generated'});
    showStatus($('finalStatus'),'✓ Vista previa local abierta. El archivo visualizado será el mismo que se descargue y respalde en Drive.','ok');
  } catch(error) {
    showStatus($('finalStatus'),error.message || 'No se pudo abrir la vista previa H5P.','err');
  } finally {
    if (button) setBusy(button,false);
    updateH5pViewerButtons();
  }
}

const h5pViewerBaseUpdateFinalButtons=updateFinalButtons;
updateFinalButtons=function(){
  h5pViewerBaseUpdateFinalButtons();
  ensureH5pViewerUI();
  updateH5pViewerButtons();
};

'''
marker='function bind() {'
if marker not in s:
    raise SystemExit('bind marker missing')
s=s.replace(marker, viewer_code + marker, 1)

# Download uses the exact same cached Blob already visualized, when available.
start=s.index('async function downloadH5P()')
end=s.index('\nasync function publishToMoodle()',start)
replacement=r'''async function downloadH5P() {
  const button=$('downloadH5pBtn');
  try {
    setBusy(button,true,'Preparando…');
    showStatus($('finalStatus'),'Preparando el paquete H5P…');
    const pkg=await prepareValidatedH5pBlob();

    // Delivery to the user is first. Drive can never block the local file.
    downloadBlobLocally(pkg.blob,pkg.filename);
    const retry=ensureDriveRetryButton();
    if (retry) retry.hidden=true;

    try {
      showStatus($('finalStatus'),'✓ H5P descargado. Guardando una copia del mismo archivo en Drive…','ok');
      const saved=await saveValidatedH5pToDrive(pkg.blob,pkg.filename);
      showStatus($('finalStatus'),'✓ H5P descargado y copia guardada en Drive · '+(saved.file_name || pkg.filename),'ok');
    } catch(driveError) {
      if (retry) retry.hidden=false;
      showStatus($('finalStatus'),'✓ El H5P se descargó correctamente. Drive no pudo guardar la copia: '+(driveError.message || 'error desconocido')+'. Puedes reintentar sin regenerar.','warn');
    }
  } catch(error) {
    showStatus($('finalStatus'),error.message || 'No se pudo descargar el H5P.','err');
  } finally {
    setBusy(button,false);
    updateH5pViewerButtons();
  }
}
'''
s=s[:start]+replacement+s[end:]

old_boot="""function boot(detail) {
  if (sb) return;
  sb = detail.sb;
  const publish = $('publishBtn');
  if (publish) publish.hidden = true;
  ensureDriveRetryButton();
  bind();
  syncRegistry();
}"""
new_boot="""function boot(detail) {
  if (sb) return;
  sb = detail.sb;
  const publish = $('publishBtn');
  if (publish) publish.hidden = true;
  ensureDriveRetryButton();
  ensureH5pViewerUI();
  ensureH5pViewerRuntime().catch(error => showStatus($('h5pViewerToolStatus'), error.message || 'El visualizador local no pudo iniciarse.', 'warn'));
  bind();
  syncRegistry();
}"""
if old_boot not in s:
    raise SystemExit('boot anchor missing')
s=s.replace(old_boot,new_boot,1)

s=s.replace('y listo para validación de Moodle.', 'y listo para empaquetar y visualizar.')
s=s.replace('Actividad generada. El siguiente paso valida el paquete con Moodle.', 'Actividad generada. Puedes abrir la vista previa antes de descargar el H5P.')

p.write_text(s,encoding='utf-8')
print('H5P local viewer patch applied')

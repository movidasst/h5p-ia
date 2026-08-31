(() => {
'use strict';
const $ = id => document.getElementById(id);
const MOODLE_URL = 'https://movidasst.org';
const REGISTRY_URL = MOODLE_URL + '/local/h5pia/registry.php';
const BRIDGE_URL = MOODLE_URL + '/local/h5pia/api.php';
let sb = null;
let registry = null;
let proposal = null;
let generatedParams = null;
let bridgeReady = false;
let selectedLibrary = null;
let assetUploads = new Map();
let bridgeSupportsAssets = false;
const MAX_ASSETS = 8;
const MAX_SOURCE_FILE_BYTES = 12 * 1024 * 1024;
const H5P_DRIVE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbweUDHocCNItLciLJr9ujg-FHIYU0h-733c2E1esv3TbC7rz4OEYAWS6K2QtGmO9g72/exec';
const H5P_DRIVE_MAX_BYTES = 15 * 1024 * 1024;
let lastValidatedH5p = null;

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
let activeH5pViewerPlayer = null;

const CATEGORY_ORDER = [
  ['Evaluación y preguntas', ['MultiChoice','TrueFalse','QuestionSet','SingleChoiceSet','Blanks','DragText','DragQuestion','MarkTheWords','Summary','Essay','SortParagraphs','Crossword','Dictation','MultiMediaChoice']],
  ['Imagen y visual', ['ImageHotspots','FindMultipleHotspots','ImageHotspotQuestion','ImagePair','ImageSequencing','ImageSlider','ImageJuxtaposition','Agamotto','Collage']],
  ['Contenido y lecciones', ['InteractiveBook','CoursePresentation','Column','Accordion','Dialogcards','Flashcards','DocumentationTool','Cornell','Timeline','InformationWall','StructureStrip']],
  ['Video, audio y voz', ['InteractiveVideo','Audio','AudioRecorder','SpeakTheWords','SpeakTheWordsSet']],
  ['Escenarios y juegos', ['BranchingScenario','GameMap','MemoryGame','FindTheWords','PersonalityQuiz','GuessTheAnswer']],
  ['Especializadas', ['VirtualTour','ARScavenger','KewArCode','Chart','IFrameEmbed','Questionnaire','TwitterUserFeed','ArithmeticQuiz']]
];

function showStatus(el, message, kind='') {
  el.hidden = !message;
  el.textContent = message || '';
  el.className = 'status' + (kind ? ' ' + kind : '');
}
function setBusy(button, busy, text) {
  if (!button) return;
  if (busy) {
    button.dataset.oldText = button.textContent;
    button.disabled = true;
    button.textContent = text;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.oldText || button.textContent;
  }
}
// H5P_CATALOG_VIEWER_HOTFIX_V2 — local catalog always visible; Moodle is optional technical enrichment.
function localCatalogLibraries() {
  const names = Object.keys(window.H5P_CATALOG || {});
  return names.map((machineName,index)=>({
    id:'local:' + machineName,
    machineName,
    title:window.H5P_NAMES_ES?.[machineName] || machineName,
    majorVersion:0,
    minorVersion:0,
    patchVersion:0,
    runnable:true,
    enabled:true,
    semantics:[],
    localCatalog:true,
    localOrder:index
  }));
}

function enabledLibraries() {
  const remote=(registry?.libraries || []).filter(x => x.runnable && x.enabled && Array.isArray(x.semantics));
  return [...remote, ...localCatalogLibraries()];
}
function latestLibraries() {
  const map = new Map();
  for (const lib of enabledLibraries()) {
    const current = map.get(lib.machineName);
    if (!current || compareVersion(lib, current) > 0) map.set(lib.machineName, lib);
  }
  return [...map.values()];
}
function compareVersion(a,b) {
  return (a.majorVersion-b.majorVersion) || (a.minorVersion-b.minorVersion) || (a.patchVersion-b.patchVersion);
}
function findLatest(machineName) {
  return latestLibraries().filter(x => x.machineName === machineName).sort((a,b)=>compareVersion(b,a))[0] || null;
}
function friendlyMeta(lib) {
  return window.H5P_CATALOG?.[lib.machineName] || window.H5P_CATALOG_FALLBACK?.(lib) || {
    description: 'Actividad H5P instalada en Moodle.', ideal: 'Aprendizaje interactivo.', participant: 'Interactúa con el contenido.', mobile: 'Revisar'
  };
}
function shortMachine(machineName) { return String(machineName || '').replace(/^H5P\./,''); }
function friendlyName(lib) {
  return window.H5P_NAMES_ES?.[lib?.machineName] || lib?.title || lib?.machineName || 'Actividad H5P';
}
function optionLabel(lib) {
  const es = friendlyName(lib);
  const original = lib?.title || lib?.machineName || '';
  return original && original !== es ? `${es} (${original})` : es;
}

function ensureAssetStyles() {
  if (document.getElementById('h5piaAssetStyles')) return;
  const style=document.createElement('style');
  style.id='h5piaAssetStyles';
  style.textContent=`
    .asset-panel{margin-top:14px;padding:14px;border:1px solid #d6e9eb;border-radius:16px;background:#f8fcfc}
    .asset-panel h5{margin:0;color:#00205b;font-size:.95rem}.asset-help{margin:5px 0 12px;color:#5b7181;font-size:.78rem;line-height:1.45}
    .asset-card{display:grid;grid-template-columns:1fr;gap:10px;padding:12px;background:#fff;border:1px solid #dbe5ec;border-radius:14px}.asset-card+.asset-card{margin-top:10px}
    .asset-card strong{color:#00205b}.asset-desc{margin:4px 0 0;color:#5b7181;font-size:.78rem;line-height:1.45}.asset-required{color:#9a3412;font-size:.7rem;font-weight:900}
    .asset-input{width:100%;padding:9px;border:1px dashed #9bc9cd;border-radius:11px;background:#f7fbfc;color:#17324a}
    .asset-preview{width:100%;max-height:240px;object-fit:contain;border-radius:10px;border:1px solid #e2e8f0;background:#f8fafc}
    .asset-state{font-size:.75rem;font-weight:850;color:#64748b}.asset-state.ok{color:#3d7f3f}.asset-state.err{color:#a61b1b}
    .asset-summary{margin-top:10px;padding:9px 11px;border-radius:11px;background:#fff8e5;color:#765700;font-size:.78rem;font-weight:800}
    @media(min-width:680px){.asset-card.has-preview{grid-template-columns:minmax(0,1fr) 180px}.asset-preview{height:140px}}
  `;
  document.head.appendChild(style);
}
function removeAssetPanel() {
  document.getElementById('assetUploadPanel')?.remove();
}
function clearAssetUploads() {
  assetUploads.clear();
  removeAssetPanel();
}
function normalizeAssetSpecs(raw, rec={}) {
  const list=[];
  const seen=new Set();
  if (Array.isArray(raw)) {
    for (const item of raw.slice(0,MAX_ASSETS)) {
      if (!item || typeof item!=='object') continue;
      let id=String(item.id || `asset_${list.length+1}`).toLowerCase().replace(/[^a-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'');
      if (!id) id=`asset_${list.length+1}`;
      while (seen.has(id)) id += '_2';
      seen.add(id);
      const type=['image','audio','video','file'].includes(item.type) ? item.type : 'image';
      const defaultAccept=type==='image' ? 'image/jpeg,image/png,image/webp' : type==='audio' ? 'audio/mpeg,audio/wav,audio/ogg' : type==='video' ? 'video/mp4,video/webm' : '*/*';
      list.push({
        id,
        type,
        label:String(item.label || `${type==='image'?'Imagen':'Recurso'} ${list.length+1}`),
        description:String(item.description || item.purpose || 'Sube el recurso solicitado para completar la actividad.'),
        required:item.required!==false,
        accept:String(item.accept || defaultAccept)
      });
    }
  }
  if (!list.length && rec?.needsMedia) {
    const note=String(rec.mediaNote || 'La actividad necesita un recurso multimedia.');
    const match=note.match(/\b([1-8])\s+im[aá]gen/i);
    const count=match ? Number(match[1]) : 1;
    for (let i=1;i<=count;i++) list.push({id:`image_${i}`,type:'image',label:`Imagen ${i}`,description:note,required:true,accept:'image/jpeg,image/png,image/webp'});
  }
  return list;
}
function requiredAssetsComplete() {
  const specs=proposal?.assets || [];
  return specs.filter(x=>x.required).every(x=>assetUploads.has(x.id));
}
function mimeExtension(mime) {
  return ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','audio/mpeg':'mp3','audio/wav':'wav','audio/ogg':'ogg','video/mp4':'mp4','video/webm':'webm'})[mime] || 'bin';
}
function assetPlaceholder(id) { return `h5pia://${id}`; }
function assetPackagePath(asset) {
  const folder=asset.type==='image'?'images':asset.type==='audio'?'audios':asset.type==='video'?'videos':'files';
  return `${folder}/${asset.id}.${mimeExtension(asset.mimeType)}`;
}
function blobToBase64(blob) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(',')[1] || '');
    reader.onerror=()=>reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(blob);
  });
}
function loadImage(url) {
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error('La imagen no pudo abrirse.'));
    img.src=url;
  });
}
async function prepareImage(spec,file) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error('Usa una imagen JPG, PNG o WEBP.');
  const source=URL.createObjectURL(file);
  try {
    const img=await loadImage(source);
    const max=1600;
    const scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
    const width=Math.max(1,Math.round(img.naturalWidth*scale));
    const height=Math.max(1,Math.round(img.naturalHeight*scale));
    const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height;
    const ctx=canvas.getContext('2d'); ctx.drawImage(img,0,0,width,height);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('No se pudo optimizar la imagen.')),'image/jpeg',0.86));
    const base64=await blobToBase64(blob);
    return {id:spec.id,type:'image',label:spec.label,description:spec.description,originalName:file.name,mimeType:'image/jpeg',base64,width,height,size:blob.size,preview:`data:image/jpeg;base64,${base64}`};
  } finally { URL.revokeObjectURL(source); }
}
async function prepareGenericAsset(spec,file) {
  const base64=await blobToBase64(file);
  return {id:spec.id,type:spec.type,label:spec.label,description:spec.description,originalName:file.name,mimeType:file.type || 'application/octet-stream',base64,size:file.size,preview:''};
}
async function handleAssetFile(spec,file) {
  if (!file) return;
  if (file.size>MAX_SOURCE_FILE_BYTES) throw new Error('El archivo supera 12 MB. Usa una versión más liviana.');
  const asset=spec.type==='image' ? await prepareImage(spec,file) : await prepareGenericAsset(spec,file);
  if (asset.base64.length>9_000_000) throw new Error('El archivo sigue siendo demasiado grande después de procesarlo.');
  assetUploads.set(spec.id,asset);
  lastValidatedH5p = null;
  renderAssetPanel();
}
function renderAssetPanel() {
  removeAssetPanel();
  const specs=proposal?.assets || [];
  if (!specs.length) { updateConfirmAvailability(); return; }
  ensureAssetStyles();
  const body=$('proposalPanel').querySelector('.proposal-body');
  const actionRow=body?.querySelector('.action-row');
  if (!body || !actionRow) return;
  const panel=document.createElement('div'); panel.id='assetUploadPanel'; panel.className='asset-panel';
  const title=document.createElement('h5'); title.textContent='📎 Recursos necesarios antes de crear'; panel.appendChild(title);
  const help=document.createElement('p'); help.className='asset-help'; help.textContent='La IA indicó exactamente qué necesita. Sube cada archivo; podrás revisarlo antes de continuar.'; panel.appendChild(help);
  for (const spec of specs) {
    const uploaded=assetUploads.get(spec.id);
    const card=document.createElement('div'); card.className='asset-card'+(uploaded?.preview?' has-preview':'');
    const info=document.createElement('div');
    const strong=document.createElement('strong'); strong.textContent=spec.label; info.appendChild(strong);
    if (spec.required) { const r=document.createElement('span'); r.className='asset-required'; r.textContent=' · OBLIGATORIO'; info.appendChild(r); }
    const desc=document.createElement('p'); desc.className='asset-desc'; desc.textContent=spec.description; info.appendChild(desc);
    const input=document.createElement('input'); input.type='file'; input.accept=spec.accept; input.className='asset-input'; input.setAttribute('aria-label',`Subir ${spec.label}`);
    input.addEventListener('change',async()=>{
      const file=input.files?.[0];
      const state=info.querySelector('.asset-state');
      if (state) { state.textContent='Procesando…'; state.className='asset-state'; }
      try { await handleAssetFile(spec,file); }
      catch(error) { if (state) { state.textContent=error.message; state.className='asset-state err'; } }
    });
    info.appendChild(input);
    const state=document.createElement('div'); state.className='asset-state'+(uploaded?' ok':''); state.textContent=uploaded ? `✓ Cargada · ${uploaded.width?uploaded.width+'×'+uploaded.height+' · ':''}${Math.max(1,Math.round(uploaded.size/1024))} KB` : 'Pendiente de subir'; info.appendChild(state);
    card.appendChild(info);
    if (uploaded?.preview) { const img=document.createElement('img'); img.src=uploaded.preview; img.alt=`Vista previa: ${spec.label}`; img.className='asset-preview'; card.appendChild(img); }
    panel.appendChild(card);
  }
  const done=specs.filter(x=>!x.required || assetUploads.has(x.id)).length;
  const summary=document.createElement('div'); summary.className='asset-summary'; summary.textContent=requiredAssetsComplete() ? `✓ Recursos listos (${done}/${specs.length}). Ya puedes confirmar y crear.` : `Faltan recursos obligatorios. Cargados ${done}/${specs.length}.`; panel.appendChild(summary);
  body.insertBefore(panel,actionRow);
  updateConfirmAvailability();
}
function updateConfirmAvailability() {
  const button=$('confirmBtn');
  if (!button || !proposal) return;
  const specs=proposal.assets || [];
  const complete=requiredAssetsComplete();
  button.disabled=specs.length>0 && !complete;
  button.textContent=specs.length>0 && !complete ? 'Completa los recursos para continuar' : '✓ Confirmar y crear';
}
function geminiAssets() {
  return [...assetUploads.values()].map(a=>({id:a.id,label:a.label,description:a.description,mimeType:a.mimeType,data:a.base64}));
}
function bridgeAssets() {
  return [...assetUploads.values()].map(a=>({id:a.id,type:a.type,label:a.label,mimeType:a.mimeType,dataBase64:a.base64,originalName:a.originalName,path:assetPackagePath(a),placeholder:assetPlaceholder(a.id)}));
}
function assetManifest() {
  return (proposal?.assets || []).map(spec=>{
    const a=assetUploads.get(spec.id);
    return {id:spec.id,label:spec.label,description:spec.description,placeholder:assetPlaceholder(spec.id),mimeType:a?.mimeType || null,packagePath:a?assetPackagePath(a):null};
  });
}

async function syncRegistry() {
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
}
function populateLibrarySelect() {
  const libs = latestLibraries();
  const select = $('library');
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Selecciona una actividad…';
  select.appendChild(placeholder);
  const ai = document.createElement('option');
  ai.value = '__AUTO__';
  ai.textContent = '✨ Que la IA elija la mejor actividad';
  select.appendChild(ai);
  const used = new Set();
  for (const [label, tokens] of CATEGORY_ORDER) {
    const group = document.createElement('optgroup');
    group.label = label;
    const matches = libs.filter(lib => tokens.some(token => shortMachine(lib.machineName).toLowerCase() === token.toLowerCase()));
    matches.sort((a,b)=>friendlyName(a).localeCompare(friendlyName(b),'es'));
    for (const lib of matches) {
      const option = document.createElement('option');
      option.value = lib.machineName;
      option.textContent = optionLabel(lib);
      group.appendChild(option);
      used.add(lib.machineName);
    }
    if (group.children.length) select.appendChild(group);
  }
  const remaining = libs.filter(lib => !used.has(lib.machineName)).sort((a,b)=>friendlyName(a).localeCompare(friendlyName(b),'es'));
  if (remaining.length) {
    const group = document.createElement('optgroup');
    group.label = 'Otras actividades instaladas';
    for (const lib of remaining) {
      const option = document.createElement('option');
      option.value = lib.machineName;
      option.textContent = optionLabel(lib);
      group.appendChild(option);
    }
    select.appendChild(group);
  }
  select.disabled = false;
}

function onLibraryChange() {
  resetAfterInputChange();
  const value = $('library').value;
  if (!value) {
    selectedLibrary = null;
    $('libraryInfo').hidden = true;
    return;
  }
  if (value === '__AUTO__') {
    selectedLibrary = null;
    $('libraryInfo').hidden = false;
    $('libraryInfoTitle').textContent = '✨ La IA elegirá por ti';
    $('libraryInfoDescription').textContent = 'Comparará tu tema con las actividades disponibles en el catálogo H5P y propondrá la más adecuada.';
    $('libraryInfoMeta').textContent = 'Tú verás la propuesta antes de crear nada.';
    return;
  }
  selectedLibrary = findLatest(value);
  if (!selectedLibrary) {
    $('libraryInfo').hidden = true;
    return;
  }
  const meta = friendlyMeta(selectedLibrary);
  $('libraryInfo').hidden = false;
  $('libraryInfoTitle').textContent = friendlyName(selectedLibrary);
  $('libraryInfoDescription').textContent = `Qué hace: ${meta.description}`;
  $('libraryInfoMeta').textContent = `Ideal para: ${meta.ideal} · El participante: ${meta.participant} · Nombre H5P: ${selectedLibrary.title || selectedLibrary.machineName}`;
}

function resetAfterInputChange() {
  proposal = null;
  generatedParams = null;
  lastValidatedH5p = null;
  clearAssetUploads();
  $('proposalPanel').hidden = true;
  $('resultPanel').hidden = true;
  showStatus($('proposalStatus'), '');
  showStatus($('creationStatus'), '');
  showStatus($('finalStatus'), '');
}

function uniqueInstalledForPrompt() {
  return latestLibraries().map(lib => {
    const meta = friendlyMeta(lib);
    return {machineName:lib.machineName,title:friendlyName(lib),technicalTitle:lib.title,description:meta.description,ideal:meta.ideal,mobile:meta.mobile};
  });
}

function proposalPrompt() {
  const topic = $('topic').value.trim();
  const choice = $('library').value;
  if (!choice) throw new Error('Primero elige un tipo de actividad.');
  if (!topic) throw new Error('Escribe el tema de la actividad.');
  const audience = $('audience').value.trim() || 'Trabajadores';
  const level = $('level').value;
  const lang = $('lang').value;
  const instructions = $('instructions').value.trim();
  const selectionRule = choice === '__AUTO__'
    ? `Elige la mejor SOLO entre estas librerías disponibles:
${JSON.stringify(uniqueInstalledForPrompt())}`
    : `Debes utilizar exactamente esta librería: ${choice}. No la cambies.`;
  return `Actúa como diseñador instruccional experto en H5P, microlearning y experiencia móvil.

TEMA: ${topic}
PÚBLICO: ${audience}
NIVEL: ${level}
IDIOMA: ${lang}
INSTRUCCIONES ADICIONALES: ${instructions || 'Ninguna'}

${selectionRule}

En esta etapa prepara únicamente una propuesta concreta para que el usuario la apruebe; no construyas todavía el contenido H5P final.
Devuelve SOLO JSON válido con esta estructura exacta:
{
  "machineName":"H5P.X",
  "title":"título breve",
  "objective":"objetivo de aprendizaje claro",
  "summary":"explica en una o dos frases qué actividad vas a construir",
  "structure":["elemento 1","elemento 2","elemento 3"],
  "assets":[
    {
      "id":"image_1",
      "type":"image",
      "label":"Imagen 1 — nombre claro",
      "description":"Explica exactamente qué imagen debe subir el usuario y qué debe verse",
      "required":true,
      "accept":"image/jpeg,image/png,image/webp"
    }
  ],
  "needsMedia":true,
  "mediaNote":"resumen breve de los recursos solicitados"
}

REGLAS DE RECURSOS:
- Si no necesita archivos, devuelve assets:[] y needsMedia:false.
- Si necesita 2 imágenes, crea DOS objetos distintos, por ejemplo image_1 e image_2; nunca lo resumas en un solo texto.
- Cada recurso debe tener una descripción específica para que el usuario sepa exactamente qué subir.
- Para comparaciones antes/después o escenas diferentes, describe por separado qué debe verse en cada imagen.
- Máximo ${MAX_ASSETS} recursos.

La estructura debe ser concreta: número de preguntas, decisiones, hotspots, tarjetas, secciones, etc. No uses markdown.`;
}

async function callGemini(prompt, assets=[]) {
  if (!sb) throw new Error('La sesión de IA todavía no está disponible. Recarga la página.');
  const model = $('engine').value || 'gemini-3.6-flash';
  const {data, error} = await sb.functions.invoke('gemini-h5p', {body:{model,prompt,assets}});
  if (error) {
    let detail='';
    try {
      if (error.context?.clone) {
        const payload=await error.context.clone().json();
        detail=payload?.message || payload?.details?.error?.message || payload?.error || '';
      }
    } catch (_) {}
    throw new Error(detail || error.message || 'No se pudo consultar la IA.');
  }
  if (!data?.ok) throw new Error(data?.message || data?.error || 'La IA devolvió una respuesta inválida.');
  const output = typeof data.output === 'string' ? data.output : JSON.stringify(data.output);
  try { return JSON.parse(output); }
  catch (_) { throw new Error('La IA no devolvió JSON válido. Prueba otra vez.'); }
}

async function createProposal(event) {
  const button = event?.currentTarget?.id === 'anotherBtn' ? $('anotherBtn') : $('proposalBtn');
  const requestedChoice = $('library').value;
  showStatus($('proposalStatus'), '');
  $('proposalPanel').hidden = true;
  $('resultPanel').hidden = true;
  clearAssetUploads();
  try {
    const prompt = proposalPrompt();
    setBusy(button, true, 'Pensando una propuesta…');
    showStatus($('proposalStatus'), 'La IA está diseñando una propuesta. Todavía no se está creando el H5P.');
    const rec = await callGemini(prompt);
    if ($('library').value !== requestedChoice) {
      throw new Error('Cambiaste el tipo de actividad mientras la IA preparaba la propuesta. Pulsa de nuevo Ver propuesta.');
    }
    if (!rec || typeof rec !== 'object') throw new Error('Propuesta inválida.');
    const recommended = findLatest(rec.machineName);
    if (!recommended) throw new Error('La IA propuso una actividad que no está disponible en el catálogo H5P.');
    if (requestedChoice !== '__AUTO__' && rec.machineName !== requestedChoice) {
      throw new Error('La IA cambió el tipo de actividad solicitado. Vuelve a intentar.');
    }
    const normalizedAssets=normalizeAssetSpecs(rec.assets,rec);
    const makeProposal=()=>({
      machineName: rec.machineName,
      title: String(rec.title || recommended.title || 'Actividad H5P'),
      objective: String(rec.objective || ''),
      summary: String(rec.summary || ''),
      structure: Array.isArray(rec.structure) ? rec.structure.map(String).slice(0,8) : [],
      assets: normalizedAssets,
      needsMedia: normalizedAssets.length>0,
      mediaNote: String(rec.mediaNote || '')
    });
    selectedLibrary = recommended;
    proposal = makeProposal();
    if (requestedChoice === '__AUTO__') {
      const meta = friendlyMeta(recommended);
      $('libraryInfo').hidden = false;
      $('libraryInfoTitle').textContent = `✨ La IA propone: ${friendlyName(recommended)}`;
      $('libraryInfoDescription').textContent = `Qué hace: ${meta.description}`;
      $('libraryInfoMeta').textContent = 'El selector sigue en modo automático. Puedes pulsar Proponer otra sin quedar atado a esta actividad.';
    }
    renderProposal();
    showStatus($('proposalStatus'), proposal.assets.length ? 'Propuesta lista. Ahora sube los recursos solicitados y luego confirma.' : 'Propuesta lista. Revísala y confirma solo si te convence.', 'ok');
    $('proposalPanel').scrollIntoView({behavior:'smooth', block:'nearest'});
  } catch (error) {
    showStatus($('proposalStatus'), error.message || 'No se pudo crear la propuesta.', 'err');
  } finally {
    setBusy(button, false);
  }
}

function renderProposal() {
  if (!proposal || !selectedLibrary) return;
  $('proposalPanel').hidden = false;
  $('proposalType').textContent = friendlyName(selectedLibrary);
  $('proposalTitle').textContent = proposal.title;
  $('proposalSummary').textContent = proposal.summary;
  $('proposalObjective').textContent = proposal.objective || 'La IA lo definirá durante la creación.';
  $('proposalStructure').innerHTML = '';
  for (const item of proposal.structure) {
    const li = document.createElement('li');
    li.textContent = item;
    $('proposalStructure').appendChild(li);
  }
  $('mediaNotice').hidden = !proposal.assets.length;
  $('mediaNotice').textContent = proposal.assets.length ? `Esta actividad necesita ${proposal.assets.length} recurso${proposal.assets.length===1?'':'s'}. Súbelos debajo para continuar.` : '';
  renderAssetPanel();
  updateConfirmAvailability();
}

function generationPrompt() {
  if (!proposal || !selectedLibrary) throw new Error('Primero confirma una propuesta.');
  const manifest=assetManifest();
  return `Actúa como generador técnico de contenido H5P y analista multimodal.
Genera SOLO el objeto JSON de parámetros compatible con la librería indicada.

LIBRERÍA: ${selectedLibrary.machineName} ${selectedLibrary.majorVersion}.${selectedLibrary.minorVersion}
TEMA: ${$('topic').value.trim()}
TÍTULO APROBADO: ${proposal.title}
OBJETIVO APROBADO: ${proposal.objective}
PROPUESTA APROBADA: ${proposal.summary}
ESTRUCTURA APROBADA: ${JSON.stringify(proposal.structure)}
PÚBLICO: ${$('audience').value.trim() || 'Trabajadores'}
NIVEL: ${$('level').value}
IDIOMA: ${$('lang').value}
MATERIAL/INSTRUCCIONES: ${$('instructions').value.trim() || 'Ninguno'}

RECURSOS CARGADOS:
${JSON.stringify(manifest,null,2)}

REGLAS:
- Respeta exactamente semantics.
- Mobile first.
- Cumple la propuesta aprobada.
- Incluye retroalimentación educativa cuando la librería lo permita.
- Las imágenes/archivos adjuntos forman parte real de la actividad: analízalos antes de generar.
- Si debes referenciar un archivo dentro de los parámetros H5P, usa EXACTAMENTE el placeholder indicado en RECURSOS CARGADOS (por ejemplo h5pia://image_1). No inventes URLs ni otras rutas.
- Si la actividad consiste en identificar elementos visuales, usa lo que realmente observas en la imagen y genera coordenadas/zonas coherentes con esa imagen cuando semantics lo requiera.
- No devuelvas markdown ni texto adicional.

SEMANTICS:
${JSON.stringify(selectedLibrary.semantics || [], null, 2)}`;
}

async function confirmAndCreate() {
  const button = $('confirmBtn');
  showStatus($('creationStatus'), '');
  try {
    if (!requiredAssetsComplete()) throw new Error('Faltan recursos obligatorios. Sube todos los archivos indicados antes de continuar.');
    setBusy(button, true, proposal?.assets?.length ? 'Analizando recursos y creando…' : 'Creando H5P…');
    showStatus($('creationStatus'), proposal?.assets?.length ? 'La IA está analizando los archivos que subiste y construyendo la actividad…' : 'Creando el contenido con la estructura que aprobaste…');
    const params = await callGemini(generationPrompt(), geminiAssets());
    if (params?._h5pia_error) throw new Error(params.message || 'No se pudo completar esta actividad.');
    if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('La IA no generó un objeto H5P válido.');
    generatedParams = params;
    lastValidatedH5p = null;
    $('resultJson').value = JSON.stringify(generatedParams, null, 2);
    $('resultPanel').hidden = false;
    $('resultTitle').textContent = '✓ ' + proposal.title;
    $('resultSummary').textContent = `${friendlyName(selectedLibrary)} · contenido generado${proposal.assets.length?` con ${proposal.assets.length} recurso${proposal.assets.length===1?'':'s'}`:''} y listo para empaquetar y visualizar.`;
    showStatus($('creationStatus'), 'Actividad generada. Puedes abrir la vista previa antes de descargar el H5P.', 'ok');
    updateFinalButtons();
    $('resultPanel').scrollIntoView({behavior:'smooth', block:'start'});
  } catch (error) {
    showStatus($('creationStatus'), error.message || 'No se pudo crear la actividad.', 'err');
  } finally {
    setBusy(button, false);
  }
}

async function checkBridge() {
  bridgeReady = false;
  if (!sb) return;
  try {
    const {data:{session}} = await sb.auth.getSession();
    if (!session?.access_token) return;
    const response = await fetch(BRIDGE_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer ' + session.access_token},
      body:JSON.stringify({action:'status',accessToken:session.access_token})
    });
    if (!response.ok) return;
    const data = await response.json();
    bridgeReady = Boolean(data?.ok && data?.canPackage && data?.canPublish);
    bridgeSupportsAssets = Boolean(data?.canAssets);
  } catch (_) {
    bridgeReady = false;
  }
  updateFinalButtons();
}

function updateFinalButtons() {
  const ready = Boolean(generatedParams && selectedLibrary);
  const hasAssets=Boolean(proposal?.assets?.length);
  const bridgeOk=bridgeReady && (!hasAssets || bridgeSupportsAssets);
  $('downloadH5pBtn').disabled = !ready || !bridgeOk;
  $('publishBtn').disabled = !ready || !bridgeOk;
  if (ready && !bridgeReady) {
    showStatus($('finalStatus'), 'El contenido está generado. Falta el empaquetador actual para preparar el archivo H5P.', 'warn');
  } else if (ready && hasAssets && !bridgeSupportsAssets) {
    showStatus($('finalStatus'), 'La actividad usa archivos. Actualiza el puente H5P IA de Moodle a la versión 1.2.0 para incluirlos dentro del .H5P.', 'warn');
  } else if (ready && bridgeOk) {
    showStatus($('finalStatus'), 'El generador está listo para validar y preparar el archivo H5P.', 'ok');
  }
}

function bridgePayload(action, accessToken) {
  if (!generatedParams || !selectedLibrary || !proposal) throw new Error('Primero crea la actividad.');
  return {action,accessToken,libraryId:selectedLibrary.id,title:proposal.title,language:$('lang').value,params:generatedParams,assets:bridgeAssets()};
}
async function bridgeAuth() {
  if (!sb) throw new Error('Sesión no disponible.');
  const {data:{session}} = await sb.auth.getSession();
  if (!session?.access_token) throw new Error('Tu sesión expiró. Vuelve a ingresar.');
  return {token:session.access_token,headers:{'Content-Type':'application/json','Authorization':'Bearer ' + session.access_token}};
}

async function blobToBase64ForDrive(blob) {
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

async function publishToMoodle() {
  const button = $('publishBtn');
  try {
    setBusy(button, true, 'Publicando…');
    showStatus($('finalStatus'), 'Moodle está validando y publicando la actividad…');
    const auth = await bridgeAuth();
    const response = await fetch(BRIDGE_URL, {method:'POST',headers:auth.headers,body:JSON.stringify(bridgePayload('publish',auth.token))});
    const data = await response.json().catch(()=>({}));
    if (!response.ok || !data?.ok) throw new Error(data.error || ('No se pudo publicar · HTTP ' + response.status));
    const url = data.published?.viewUrl;
    showStatus($('finalStatus'), '✓ Publicada en el Banco de contenido de Moodle.' + (url ? ' Puedes abrirla desde Moodle.' : ''), 'ok');
    if (url) {
      const link = document.createElement('a');
      link.href = url; link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'Abrir en Moodle';
      link.style.cssText = 'display:inline-block;margin-top:8px;color:#007b85;font-weight:900';
      $('finalStatus').appendChild(document.createElement('br'));
      $('finalStatus').appendChild(link);
    }
  } catch (error) {
    showStatus($('finalStatus'), error.message || 'No se pudo publicar en Moodle.', 'err');
  } finally { setBusy(button, false); }
}

function safeFilename(value) {
  return String(value || 'actividad-h5p').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80) || 'actividad-h5p';
}
function downloadJson() {
  if (!generatedParams) return;
  const blob = new Blob([JSON.stringify(generatedParams,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=safeFilename(proposal?.title)+'.json'; a.click(); URL.revokeObjectURL(url);
}




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
}
async function ensureH5pViewerRuntime() {
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
    .h5p-viewer-stage{min-height:0;overflow:auto;background:#e8eef3;padding:8px;display:flex;justify-content:center;align-items:flex-start}.h5p-viewer-viewport{width:100%;min-height:100%;background:#fff;border-radius:10px;box-shadow:0 4px 20px rgba(0,32,91,.10);transition:max-width .2s ease,width .2s ease}.h5p-viewer-container{width:100%;min-height:260px}.h5p-viewer-iframe{display:block;width:100%;min-height:70vh;border:0;background:#fff}.h5p-viewer-loading{padding:28px;text-align:center;color:#64748b;font-weight:800}
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

function bind() {
  $('syncBtn').addEventListener('click', syncRegistry);
  $('library').addEventListener('change', onLibraryChange);
  $('topic').addEventListener('input', resetAfterInputChange);
  $('instructions').addEventListener('input', resetAfterInputChange);
  $('audience').addEventListener('input', resetAfterInputChange);
  $('level').addEventListener('change', resetAfterInputChange);
  $('lang').addEventListener('change', resetAfterInputChange);
  $('engine').addEventListener('change', resetAfterInputChange);
  $('proposalBtn').addEventListener('click', createProposal);
  $('anotherBtn').addEventListener('click', createProposal);
  $('confirmBtn').addEventListener('click', confirmAndCreate);
  $('downloadH5pBtn').addEventListener('click', downloadH5P);
  $('publishBtn').addEventListener('click', publishToMoodle);
  $('downloadJsonBtn').addEventListener('click', downloadJson);
}

function boot(detail) {
  if (sb) return;
  sb = detail.sb;
  const publish = $('publishBtn');
  if (publish) publish.hidden = true;
  ensureDriveRetryButton();
  ensureH5pViewerUI();
  ensureH5pViewerRuntime().catch(error => showStatus($('h5pViewerToolStatus'), error.message || 'El visualizador local no pudo iniciarse.', 'warn'));
  bind();
  syncRegistry();
}
window.addEventListener('h5p-auth-ready', event => boot(event.detail));
})();

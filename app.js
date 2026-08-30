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
function enabledLibraries() {
  return (registry?.libraries || []).filter(x => x.runnable && x.enabled && Array.isArray(x.semantics));
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
  $('moodleDot').className = 'dot';
  $('moodleStatus').textContent = 'Conectando con Moodle…';
  $('library').disabled = true;
  try {
    const response = await fetch(REGISTRY_URL, {headers:{Accept:'application/json'}, cache:'no-store'});
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json()).error || ''; } catch (_) {}
      throw new Error(detail || ('HTTP ' + response.status));
    }
    registry = await response.json();
    if (!Array.isArray(registry?.libraries)) throw new Error('respuesta_invalida');
    populateLibrarySelect();
    $('moodleDot').className = 'dot ok';
    $('moodleStatus').textContent = `Moodle conectado · ${registry.families ?? latestLibraries().length} tipos H5P disponibles`;
    await checkBridge();
  } catch (error) {
    registry = null;
    $('library').innerHTML = '<option value="">No se pudieron cargar las actividades</option>';
    $('library').disabled = true;
    $('moodleDot').className = 'dot err';
    $('moodleStatus').textContent = 'No se pudo conectar con Moodle. Pulsa Actualizar.';
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
    $('libraryInfoDescription').textContent = 'Comparará tu tema con las actividades que realmente están instaladas en Moodle y propondrá la más adecuada.';
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
    ? `Elige la mejor SOLO entre estas librerías instaladas:
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
    if (!recommended) throw new Error('La IA propuso una actividad que no está instalada en Moodle.');
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
    $('resultJson').value = JSON.stringify(generatedParams, null, 2);
    $('resultPanel').hidden = false;
    $('resultTitle').textContent = '✓ ' + proposal.title;
    $('resultSummary').textContent = `${friendlyName(selectedLibrary)} · contenido generado${proposal.assets.length?` con ${proposal.assets.length} recurso${proposal.assets.length===1?'':'s'}`:''} y listo para validación de Moodle.`;
    showStatus($('creationStatus'), 'Actividad generada. El siguiente paso valida el paquete con Moodle.', 'ok');
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
    showStatus($('finalStatus'), 'El contenido está generado. Falta tener activo el puente H5P IA de Moodle para descargar o publicar.', 'warn');
  } else if (ready && hasAssets && !bridgeSupportsAssets) {
    showStatus($('finalStatus'), 'La actividad usa archivos. Actualiza el puente H5P IA de Moodle a la versión 1.2.0 para incluirlos dentro del .H5P.', 'warn');
  } else if (ready && bridgeOk) {
    showStatus($('finalStatus'), 'Moodle está listo para validar el archivo o publicarlo en el Banco de contenido.', 'ok');
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

async function downloadH5P() {
  const button = $('downloadH5pBtn');
  try {
    setBusy(button, true, 'Validando y preparando…');
    showStatus($('finalStatus'), 'Moodle está validando el paquete H5P…');
    const auth = await bridgeAuth();
    const response = await fetch(BRIDGE_URL, {method:'POST',headers:auth.headers,body:JSON.stringify(bridgePayload('download',auth.token))});
    if (!response.ok) {
      const data = await response.json().catch(()=>({}));
      throw new Error(data.error || ('Moodle rechazó el paquete · HTTP ' + response.status));
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = match?.[1] || (safeFilename(proposal.title) + '.h5p');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    showStatus($('finalStatus'), '✓ Archivo .H5P validado por Moodle y descargado.', 'ok');
  } catch (error) {
    showStatus($('finalStatus'), error.message || 'No se pudo descargar el H5P.', 'err');
  } finally { setBusy(button, false); }
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


// H5PIA_PREVIEW_V130 — temporary Moodle-rendered preview, no Content Bank entry.
let bridgeSupportsPreview = false;
let activePreviewItemId = 0;
let activePreviewUrl = '';
let previewApprovedFingerprint = '';

function previewFingerprint() {
  if (!generatedParams || !selectedLibrary || !proposal) return '';
  return JSON.stringify({
    library:selectedLibrary.id,
    title:proposal.title,
    params:generatedParams,
    assets:bridgeAssets().map(a=>({id:a.id,mimeType:a.mimeType,path:a.path,dataBase64:a.dataBase64}))
  });
}

function ensureH5pPreviewUI() {
  if (document.getElementById('previewH5pBtn')) return;
  const actions = document.querySelector('.final-actions');
  if (!actions) return;
  const previewBtn = document.createElement('button');
  previewBtn.id = 'previewH5pBtn';
  previewBtn.type = 'button';
  previewBtn.className = 'final-btn';
  previewBtn.textContent = '👁 Vista previa H5P';
  previewBtn.style.cssText = 'border:0;background:#007b85;color:#fff;';
  previewBtn.disabled = true;
  actions.insertBefore(previewBtn, actions.firstChild);

  const style = document.createElement('style');
  style.id = 'h5piaPreviewStyles';
  style.textContent = [
    '.h5pia-preview-overlay{position:fixed;inset:0;z-index:1000;background:rgba(2,18,46,.72);display:grid;place-items:center;padding:10px}',
    '.h5pia-preview-shell{width:min(100%,1050px);height:min(94vh,900px);background:#fff;border-radius:18px;overflow:hidden;display:grid;grid-template-rows:auto 1fr auto;box-shadow:0 24px 70px rgba(0,0,0,.28)}',
    '.h5pia-preview-head{display:flex;gap:10px;align-items:center;padding:12px 14px;border-bottom:1px solid #dbe5ec;background:#f8fafc}',
    '.h5pia-preview-head strong{color:#00205b}.h5pia-preview-head span{display:block;color:#64748b;font-size:.72rem;margin-top:2px}',
    '.h5pia-preview-close{margin-left:auto;border:1px solid #dbe5ec;background:#fff;color:#00205b;border-radius:10px;padding:8px 11px;font-weight:900}',
    '.h5pia-preview-frame-wrap{min-height:0;background:#eef2f6;padding:8px;overflow:hidden}',
    '.h5pia-preview-frame{width:100%;height:100%;min-height:58vh;border:0;border-radius:10px;background:#fff}',
    '.h5pia-preview-foot{padding:10px 12px;border-top:1px solid #dbe5ec;background:#fff;display:grid;gap:8px}',
    '.h5pia-preview-note{margin:0;color:#64748b;font-size:.75rem;line-height:1.4}.h5pia-preview-actions{display:grid;grid-template-columns:1fr;gap:8px}',
    '.h5pia-preview-actions button{min-height:46px;border-radius:12px;font-weight:900;padding:9px 12px}.h5pia-preview-correct{border:1px solid #dbe5ec;background:#fff;color:#00205b}.h5pia-preview-approve{border:0;background:#70ad47;color:#fff}',
    '@media(min-width:680px){.h5pia-preview-overlay{padding:22px}.h5pia-preview-foot{grid-template-columns:1fr auto;align-items:center}.h5pia-preview-actions{grid-template-columns:auto auto}.h5pia-preview-frame{min-height:65vh}}'
  ].join('\n');
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'h5pPreviewOverlay';
  overlay.className = 'h5pia-preview-overlay';
  overlay.hidden = true;
  overlay.innerHTML = [
    '<section class="h5pia-preview-shell" role="dialog" aria-modal="true" aria-labelledby="h5pPreviewTitle">',
    '<header class="h5pia-preview-head"><div><strong id="h5pPreviewTitle">Vista previa H5P</strong><span>Renderizada por el motor real de Moodle · no se publica en el Banco de contenido</span></div><button id="h5pPreviewClose" class="h5pia-preview-close" type="button">✕ Cerrar</button></header>',
    '<div class="h5pia-preview-frame-wrap"><iframe id="h5pPreviewFrame" class="h5pia-preview-frame" title="Vista previa de la actividad H5P"></iframe></div>',
    '<footer class="h5pia-preview-foot"><p class="h5pia-preview-note">Interactúa con la actividad como lo haría un participante. Si algo está mal, cierra la vista previa y corrige o genera de nuevo. Solo publica cuando la hayas aprobado.</p><div class="h5pia-preview-actions"><button id="h5pPreviewCorrect" class="h5pia-preview-correct" type="button">Cerrar para corregir</button><button id="h5pPreviewApprove" class="h5pia-preview-approve" type="button">✓ Se ve bien · aprobar</button></div></footer>',
    '</section>'
  ].join('');
  document.body.appendChild(overlay);
  previewBtn.addEventListener('click', createH5pPreview);
  $('h5pPreviewClose').addEventListener('click', ()=>{ overlay.hidden=true; });
  $('h5pPreviewCorrect').addEventListener('click', ()=>{ previewApprovedFingerprint=''; overlay.hidden=true; updateFinalButtons(); });
  $('h5pPreviewApprove').addEventListener('click', ()=>{
    previewApprovedFingerprint = previewFingerprint();
    overlay.hidden = true;
    showStatus($('finalStatus'), '✓ Vista previa aprobada. Ahora puedes descargar o publicar en Moodle.', 'ok');
    updateFinalButtons();
  });
}

async function cleanupActiveH5pPreview() {
  const itemid = activePreviewItemId;
  activePreviewItemId = 0;
  activePreviewUrl = '';
  const frame = document.getElementById('h5pPreviewFrame');
  if (frame) frame.removeAttribute('src');
  if (!itemid || !sb) return;
  try {
    const auth = await bridgeAuth();
    await fetch(BRIDGE_URL, {method:'POST',headers:auth.headers,body:JSON.stringify({action:'preview_cleanup',accessToken:auth.token,previewItemId:itemid})});
  } catch (_) {}
}

async function createH5pPreview() {
  const button = $('previewH5pBtn');
  if (!generatedParams || !selectedLibrary || !proposal) return;
  try {
    previewApprovedFingerprint = '';
    setBusy(button, true, 'Preparando vista previa…');
    showStatus($('finalStatus'), 'Moodle está validando y preparando una vista previa temporal. No se publicará en el Banco de contenido.');
    const auth = await bridgeAuth();
    const response = await fetch(BRIDGE_URL, {method:'POST',headers:auth.headers,body:JSON.stringify(bridgePayload('preview',auth.token))});
    const data = await response.json().catch(()=>({}));
    if (!response.ok || !data?.ok || !data?.preview?.previewUrl) throw new Error(data.error || 'No se pudo crear la vista previa H5P.');
    activePreviewItemId = Number(data.preview.itemId || 0);
    activePreviewUrl = String(data.preview.previewUrl);
    $('h5pPreviewFrame').src = activePreviewUrl;
    $('h5pPreviewOverlay').hidden = false;
    showStatus($('finalStatus'), 'Vista previa temporal abierta. Revísala y apruébala antes de publicar.', 'ok');
  } catch (error) {
    showStatus($('finalStatus'), error.message || 'No se pudo abrir la vista previa H5P.', 'err');
  } finally {
    setBusy(button, false);
    updateFinalButtons();
  }
}

checkBridge = async function() {
  bridgeReady = false;
  bridgeSupportsAssets = false;
  bridgeSupportsPreview = false;
  if (!sb) return;
  try {
    const {data:{session}} = await sb.auth.getSession();
    if (!session?.access_token) return;
    const response = await fetch(BRIDGE_URL, {method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer ' + session.access_token},body:JSON.stringify({action:'status',accessToken:session.access_token})});
    if (!response.ok) return;
    const data = await response.json();
    bridgeReady = Boolean(data?.ok && data?.canPackage && data?.canPublish);
    bridgeSupportsAssets = Boolean(data?.canAssets);
    bridgeSupportsPreview = Boolean(data?.canPreview);
  } catch (_) {
    bridgeReady = false;
  }
  updateFinalButtons();
};

const h5piaOriginalUpdateFinalButtons = updateFinalButtons;
updateFinalButtons = function() {
  h5piaOriginalUpdateFinalButtons();
  ensureH5pPreviewUI();
  const button = $('previewH5pBtn');
  if (!button) return;
  const ready = Boolean(generatedParams && selectedLibrary);
  const hasAssets = Boolean(proposal?.assets?.length);
  const bridgeOk = bridgeReady && (!hasAssets || bridgeSupportsAssets);
  button.disabled = !ready || !bridgeOk || !bridgeSupportsPreview;
  const approved = Boolean(ready && previewApprovedFingerprint && previewApprovedFingerprint === previewFingerprint());
  $('publishBtn').disabled = !ready || !bridgeOk || !bridgeSupportsPreview || !approved;
  if (ready && bridgeOk && !bridgeSupportsPreview) {
    showStatus($('finalStatus'), 'El H5P está generado. Actualiza el puente Moodle H5P IA a 1.3.0 para activar la vista previa segura antes de publicar.', 'warn');
  } else if (ready && bridgeOk && bridgeSupportsPreview && !approved) {
    showStatus($('finalStatus'), 'Antes de publicar: abre Vista previa H5P, pruébala y pulsa “Se ve bien · aprobar”.', 'warn');
  } else if (approved) {
    showStatus($('finalStatus'), '✓ Vista previa aprobada. Puedes descargar o publicar en Moodle.', 'ok');
  }
};

const h5piaOriginalPublishToMoodle = publishToMoodle;
publishToMoodle = async function() {
  if (previewApprovedFingerprint !== previewFingerprint()) {
    showStatus($('finalStatus'), 'Primero revisa y aprueba la Vista previa H5P. Así evitamos publicar pruebas defectuosas en el Banco de contenido.', 'warn');
    return;
  }
  await h5piaOriginalPublishToMoodle();
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
  bind();
  syncRegistry();
}
window.addEventListener('h5p-auth-ready', event => boot(event.detail));
})();

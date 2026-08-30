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
    matches.sort((a,b)=>(a.title||a.machineName).localeCompare(b.title||b.machineName,'es'));
    for (const lib of matches) {
      const option = document.createElement('option');
      option.value = lib.machineName;
      option.textContent = lib.title || lib.machineName;
      group.appendChild(option);
      used.add(lib.machineName);
    }
    if (group.children.length) select.appendChild(group);
  }
  const remaining = libs.filter(lib => !used.has(lib.machineName)).sort((a,b)=>(a.title||a.machineName).localeCompare(b.title||b.machineName,'es'));
  if (remaining.length) {
    const group = document.createElement('optgroup');
    group.label = 'Otras actividades instaladas';
    for (const lib of remaining) {
      const option = document.createElement('option');
      option.value = lib.machineName;
      option.textContent = lib.title || lib.machineName;
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
  $('libraryInfoTitle').textContent = selectedLibrary.title || selectedLibrary.machineName;
  $('libraryInfoDescription').textContent = meta.description;
  $('libraryInfoMeta').textContent = `Ideal para: ${meta.ideal} · Móvil: ${meta.mobile}`;
}

function resetAfterInputChange() {
  proposal = null;
  generatedParams = null;
  $('proposalPanel').hidden = true;
  $('resultPanel').hidden = true;
  showStatus($('proposalStatus'), '');
  showStatus($('creationStatus'), '');
  showStatus($('finalStatus'), '');
}

function uniqueInstalledForPrompt() {
  return latestLibraries().map(lib => {
    const meta = friendlyMeta(lib);
    return {machineName:lib.machineName,title:lib.title,description:meta.description,ideal:meta.ideal,mobile:meta.mobile};
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
    ? `Elige la mejor SOLO entre estas librerías instaladas:\n${JSON.stringify(uniqueInstalledForPrompt())}`
    : `Debes utilizar exactamente esta librería: ${choice}. No la cambies.`;
  return `Actúa como diseñador instruccional experto en H5P, microlearning y experiencia móvil.\n\nTEMA: ${topic}\nPÚBLICO: ${audience}\nNIVEL: ${level}\nIDIOMA: ${lang}\nINSTRUCCIONES ADICIONALES: ${instructions || 'Ninguna'}\n\n${selectionRule}\n\nTodavía NO generes el contenido H5P. Primero presenta una propuesta concreta para que el usuario la apruebe.\nDevuelve SOLO JSON válido con esta estructura exacta:\n{\n  "machineName":"H5P.X",\n  "title":"título breve",\n  "objective":"objetivo de aprendizaje claro",\n  "summary":"explica en una o dos frases qué actividad vas a construir",\n  "structure":["elemento 1","elemento 2","elemento 3"],\n  "needsMedia":false,\n  "mediaNote":"si necesita imagen, audio o video explica qué debe aportar el usuario; si no, deja vacío"\n}\n\nLa estructura debe ser concreta: número de preguntas, decisiones, hotspots, tarjetas, secciones, etc. No uses markdown.`;
}

async function callGemini(prompt) {
  if (!sb) throw new Error('La sesión de IA todavía no está disponible. Recarga la página.');
  const model = $('engine').value || 'gemini-2.5-flash';
  const {data, error} = await sb.functions.invoke('gemini-h5p', {body:{model,prompt}});
  if (error) throw new Error(error.message || 'No se pudo consultar la IA.');
  if (!data?.ok) throw new Error(data?.error || 'La IA devolvió una respuesta inválida.');
  const output = typeof data.output === 'string' ? data.output : JSON.stringify(data.output);
  try { return JSON.parse(output); }
  catch (_) { throw new Error('La IA no devolvió JSON válido. Prueba otra vez.'); }
}

async function createProposal() {
  const button = $('proposalBtn');
  showStatus($('proposalStatus'), '');
  $('proposalPanel').hidden = true;
  $('resultPanel').hidden = true;
  try {
    const prompt = proposalPrompt();
    setBusy(button, true, 'Pensando una propuesta…');
    showStatus($('proposalStatus'), 'La IA está diseñando una propuesta. Todavía no se está creando el H5P.');
    const rec = await callGemini(prompt);
    if (!rec || typeof rec !== 'object') throw new Error('Propuesta inválida.');
    const recommended = findLatest(rec.machineName);
    if (!recommended) throw new Error('La IA propuso una actividad que no está instalada en Moodle.');
    if ($('library').value !== '__AUTO__' && rec.machineName !== $('library').value) {
      throw new Error('La IA cambió el tipo de actividad solicitado. Vuelve a intentar.');
    }
    selectedLibrary = recommended;
    proposal = {
      machineName: rec.machineName,
      title: String(rec.title || recommended.title || 'Actividad H5P'),
      objective: String(rec.objective || ''),
      summary: String(rec.summary || ''),
      structure: Array.isArray(rec.structure) ? rec.structure.map(String).slice(0,8) : [],
      needsMedia: Boolean(rec.needsMedia),
      mediaNote: String(rec.mediaNote || '')
    };
    if ($('library').value === '__AUTO__') {
      $('library').value = proposal.machineName;
      onLibraryChange();
      proposal = {
        machineName: rec.machineName,
        title: String(rec.title || recommended.title || 'Actividad H5P'),
        objective: String(rec.objective || ''),
        summary: String(rec.summary || ''),
        structure: Array.isArray(rec.structure) ? rec.structure.map(String).slice(0,8) : [],
        needsMedia: Boolean(rec.needsMedia),
        mediaNote: String(rec.mediaNote || '')
      };
      selectedLibrary = recommended;
    }
    renderProposal();
    showStatus($('proposalStatus'), 'Propuesta lista. Revísala y confirma solo si te convence.', 'ok');
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
  $('proposalType').textContent = selectedLibrary.title || proposal.machineName;
  $('proposalTitle').textContent = proposal.title;
  $('proposalSummary').textContent = proposal.summary;
  $('proposalObjective').textContent = proposal.objective || 'La IA lo definirá durante la creación.';
  $('proposalStructure').innerHTML = '';
  for (const item of proposal.structure) {
    const li = document.createElement('li');
    li.textContent = item;
    $('proposalStructure').appendChild(li);
  }
  $('mediaNotice').hidden = !proposal.needsMedia;
  $('mediaNotice').textContent = proposal.needsMedia ? (proposal.mediaNote || 'Esta actividad necesita un recurso multimedia para quedar completa.') : '';
  $('confirmBtn').disabled = proposal.needsMedia;
  $('confirmBtn').textContent = proposal.needsMedia ? 'Necesita recurso multimedia' : '✓ Confirmar y crear';
}

function generationPrompt() {
  if (!proposal || !selectedLibrary) throw new Error('Primero confirma una propuesta.');
  return `Actúa como generador técnico de contenido H5P.\nGenera SOLO el objeto JSON de parámetros compatible con la librería indicada.\n\nLIBRERÍA: ${selectedLibrary.machineName} ${selectedLibrary.majorVersion}.${selectedLibrary.minorVersion}\nTEMA: ${$('topic').value.trim()}\nTÍTULO APROBADO: ${proposal.title}\nOBJETIVO APROBADO: ${proposal.objective}\nPROPUESTA APROBADA: ${proposal.summary}\nESTRUCTURA APROBADA: ${JSON.stringify(proposal.structure)}\nPÚBLICO: ${$('audience').value.trim() || 'Trabajadores'}\nNIVEL: ${$('level').value}\nIDIOMA: ${$('lang').value}\nMATERIAL/INSTRUCCIONES: ${$('instructions').value.trim() || 'Ninguno'}\n\nREGLAS:\n- Respeta exactamente semantics.\n- Mobile first.\n- Cumple la propuesta aprobada.\n- Incluye retroalimentación educativa cuando la librería lo permita.\n- No inventes rutas de archivos multimedia.\n- Si la librería requiere obligatoriamente un archivo que no fue suministrado, devuelve {"_h5pia_error":"media_required","message":"explicación"}.\n- No devuelvas markdown ni texto adicional.\n\nSEMANTICS:\n${JSON.stringify(selectedLibrary.semantics || [], null, 2)}`;
}

async function confirmAndCreate() {
  const button = $('confirmBtn');
  showStatus($('creationStatus'), '');
  try {
    if (proposal?.needsMedia) throw new Error(proposal.mediaNote || 'Esta actividad necesita un recurso multimedia antes de crearla.');
    setBusy(button, true, 'Creando H5P…');
    showStatus($('creationStatus'), 'Creando el contenido con la estructura que aprobaste…');
    const params = await callGemini(generationPrompt());
    if (params?._h5pia_error) throw new Error(params.message || 'Esta actividad requiere un recurso multimedia.');
    if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('La IA no generó un objeto H5P válido.');
    generatedParams = params;
    $('resultJson').value = JSON.stringify(generatedParams, null, 2);
    $('resultPanel').hidden = false;
    $('resultTitle').textContent = '✓ ' + proposal.title;
    $('resultSummary').textContent = `${selectedLibrary.title || selectedLibrary.machineName} · contenido generado y listo para validación de Moodle.`;
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
  } catch (_) {
    bridgeReady = false;
  }
  updateFinalButtons();
}

function updateFinalButtons() {
  const ready = Boolean(generatedParams && selectedLibrary);
  $('downloadH5pBtn').disabled = !ready || !bridgeReady;
  $('publishBtn').disabled = !ready || !bridgeReady;
  if (ready && !bridgeReady) {
    showStatus($('finalStatus'), 'El contenido está generado. Para descargar .H5P y enviarlo a Moodle falta actualizar el puente H5P IA a la versión 1.1.0.', 'warn');
  } else if (ready && bridgeReady) {
    showStatus($('finalStatus'), 'Moodle está listo para validar el archivo o publicarlo en el Banco de contenido.', 'ok');
  }
}

function bridgePayload(action, accessToken) {
  if (!generatedParams || !selectedLibrary || !proposal) throw new Error('Primero crea la actividad.');
  return {action,accessToken,libraryId:selectedLibrary.id,title:proposal.title,language:$('lang').value,params:generatedParams};
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

function bind() {
  $('syncBtn').addEventListener('click', syncRegistry);
  $('library').addEventListener('change', onLibraryChange);
  $('topic').addEventListener('input', resetAfterInputChange);
  $('instructions').addEventListener('input', resetAfterInputChange);
  $('audience').addEventListener('input', resetAfterInputChange);
  $('level').addEventListener('change', resetAfterInputChange);
  $('lang').addEventListener('change', resetAfterInputChange);
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

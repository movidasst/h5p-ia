(() => {
'use strict';
const $=id=>document.getElementById(id);
let registry=null, engine='gemini-flash', creationMode='choose', sb=null;
const engineHelp={
  'gemini-flash':'Gemini Flash automático. Ideal para la mayoría de actividades.',
  'gemini-pro':'Gemini Pro automático. Recomendado para estructuras complejas y escenarios.',
  'manual-chatgpt':'Modo manual: copia el prompt, úsalo en ChatGPT y pega el JSON.',
  'manual-gemini':'Modo manual: copia el prompt, úsalo en tu Gemini y pega el JSON.'
};
function attachEngineButtons(){
  document.querySelectorAll('#enginePills .pill').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('#enginePills .pill').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');engine=b.dataset.engine;
    $('engineHelp').textContent=engineHelp[engine];
    $('engineHelp').className='status '+(engine.startsWith('manual')?'warn':'ok');
  }));
}
function attachCreationModeButtons(){
  document.querySelectorAll('#creationModePills .pill').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('#creationModePills .pill').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');creationMode=b.dataset.creationMode;
    $('recommendBox').hidden=creationMode!=='recommend';
  }));
}
async function syncRegistry(){
  const base=$('moodleUrl').value.replace(/\/$/,'');
  $('registryStatus').textContent='Sincronizando...';$('registryStatus').className='status';
  try{
    const r=await fetch(base+'/local/h5pia/registry.php',{headers:{Accept:'application/json'}});
    if(!r.ok)throw new Error('HTTP '+r.status);
    registry=await r.json();
    if(!registry?.libraries)throw new Error('Respuesta inválida');
    $('familyCount').textContent=registry.families??'—';
    $('versionCount').textContent=registry.versions??registry.libraries.length;
    $('registryStatus').textContent='Sincronizado con '+(registry.moodleRelease||'Moodle')+'.';
    $('registryStatus').className='status ok';fillLibraries();
  }catch(e){$('registryStatus').textContent='No se pudo sincronizar: '+e.message;$('registryStatus').className='status err';}
}
function enabledLibraries(){return (registry?.libraries||[]).filter(x=>x.runnable&&x.enabled);}
function fillLibraries(){
  const groups={};enabledLibraries().forEach(x=>(groups[x.machineName]??=[]).push(x));
  const s=$('library');s.innerHTML='';
  Object.keys(groups).sort().forEach(machineName=>{
    const latest=[...groups[machineName]].sort((a,b)=>b.majorVersion-a.majorVersion||b.minorVersion-a.minorVersion||b.patchVersion-a.patchVersion)[0];
    const o=document.createElement('option');o.value=machineName;o.textContent=(latest.title||machineName)+' · '+machineName;s.appendChild(o);
  });
  fillVersions();renderLibraryInfo();
}
function fillVersions(){
  if(!registry)return;
  const machineName=$('library').value;
  const xs=enabledLibraries().filter(x=>x.machineName===machineName).sort((a,b)=>b.majorVersion-a.majorVersion||b.minorVersion-a.minorVersion||b.patchVersion-a.patchVersion);
  const s=$('version');s.innerHTML='';
  xs.forEach((x,i)=>{const o=document.createElement('option');o.value=x.id;o.textContent=x.version+(i===0?' · recomendada':'');s.appendChild(o);});
}
function selectedLibrary(){if(!registry)return null;return registry.libraries.find(x=>Number(x.id)===Number($('version').value))||null;}
function renderLibraryInfo(){
  const lib=selectedLibrary();if(!lib){$('libraryInfo').hidden=true;return;}
  const meta=window.H5P_CATALOG?.[lib.machineName]||window.H5P_CATALOG_FALLBACK(lib);
  $('libraryInfo').hidden=false;$('libraryTitleText').textContent=lib.title||lib.machineName;
  $('libraryMachineBadge').textContent=lib.machineName+' · '+lib.version;
  $('libraryDescription').textContent=meta.description;$('libraryIdeal').textContent=meta.ideal;
  $('libraryParticipant').textContent=meta.participant;$('libraryMobile').textContent=meta.mobile;
}
function recommendationPrompt(){
  const req=$('activityRequest').value.trim();if(!req)throw new Error('Describe primero qué actividad quieres crear.');
  if(!registry)throw new Error('Primero sincroniza las librerías H5P de Moodle.');
  const unique=[...new Map(enabledLibraries().map(x=>[x.machineName,{machineName:x.machineName,title:x.title,version:x.version}])).values()];
  return `Actúa como diseñador instruccional experto en H5P.\nEl usuario quiere crear esta actividad:\n${req}\n\nOBJETIVO DE APRENDIZAJE:\n${$('objective').value}\n\nPÚBLICO:\n${$('audience').value}\n\nElige SOLO entre estas librerías H5P instaladas:\n${JSON.stringify(unique)}\n\nDevuelve SOLO JSON con esta estructura:\n{"machineName":"H5P.X","reason":"explicación breve","alternatives":["H5P.Y","H5P.Z"]}\n\nPrioriza adecuación pedagógica, facilidad de uso y compatibilidad móvil.`;
}
async function recommendActivity(){
  $('recommendResult').textContent='Analizando la actividad solicitada...';
  try{
    if(!sb)throw new Error('Sesión no disponible.');const prompt=recommendationPrompt();
    if(engine.startsWith('manual')){await navigator.clipboard.writeText(prompt);$('recommendResult').textContent='Prompt copiado. Pégalo en tu IA manual y luego selecciona el H5P recomendado.';return;}
    const model=engine==='gemini-pro'?'gemini-2.5-pro':'gemini-2.5-flash';
    const response=await sb.functions.invoke('gemini-h5p',{body:{model,prompt}});if(response.error)throw response.error;
    const data=response.data;if(!data?.ok)throw new Error(data?.error||'Respuesta inválida');
    const rec=typeof data.output==='string'?JSON.parse(data.output):data.output;
    const exists=enabledLibraries().some(x=>x.machineName===rec.machineName);if(!exists)throw new Error('La recomendación no corresponde a una librería instalada.');
    $('library').value=rec.machineName;fillVersions();renderLibraryInfo();
    const alt=(rec.alternatives||[]).filter(x=>enabledLibraries().some(l=>l.machineName===x)).slice(0,3);
    $('recommendResult').textContent='Recomendado: '+rec.machineName+'. '+(rec.reason||'')+(alt.length?' Alternativas: '+alt.join(', '):'');
  }catch(e){$('recommendResult').textContent='No se pudo recomendar: '+(e?.message||e);}
}
function makePrompt(){
  const lib=selectedLibrary();if(!lib)throw new Error('Primero sincroniza Moodle y selecciona una librería.');
  return `Actúa como diseñador instruccional experto en H5P.\nGenera SOLO JSON válido para los parámetros de la librería indicada.\n\nLIBRERÍA: ${lib.machineName} ${lib.majorVersion}.${lib.minorVersion}\nSOLICITUD DE ACTIVIDAD: ${$('activityRequest').value}\nTÍTULO: ${$('title').value}\nPÚBLICO: ${$('audience').value}\nOBJETIVO: ${$('objective').value}\nNIVEL: ${$('level').value}\nIDIOMA: ${$('lang').value}\nCONTENIDO BASE:\n${$('source').value}\n\nREGLAS:\n- Mobile first.\n- Respeta exactamente la estructura semantics.\n- Cumple la interacción solicitada por el usuario cuando sea compatible con la librería.\n- Retroalimentación breve y educativa.\n- No devuelvas markdown ni explicaciones.\n- Devuelve exclusivamente un objeto JSON.\n\nSEMANTICS:\n${JSON.stringify(lib.semantics||[],null,2)}`;
}
async function copyPrompt(){try{await navigator.clipboard.writeText(makePrompt());$('resultBlock').hidden=false;$('validation').textContent='Prompt copiado.';$('validation').className='status ok';}catch(e){$('resultBlock').hidden=false;$('validation').textContent=e.message;$('validation').className='status err';}}
async function generate(){
  try{
    const prompt=makePrompt();$('resultBlock').hidden=false;
    if(engine.startsWith('manual')){await navigator.clipboard.writeText(prompt);$('validation').textContent='Prompt copiado. Úsalo en '+(engine==='manual-chatgpt'?'ChatGPT':'Gemini')+' y pega aquí el JSON.';$('validation').className='status warn';return;}
    if(!sb)throw new Error('Sesión no disponible.');const model=engine==='gemini-pro'?'gemini-2.5-pro':'gemini-2.5-flash';
    $('validation').textContent='Generando con '+model+'...';$('validation').className='status';
    const {data,error}=await sb.functions.invoke('gemini-h5p',{body:{model,prompt}});if(error)throw error;if(!data?.ok)throw new Error(data?.error||'Respuesta inválida');
    $('result').value=typeof data.output==='string'?data.output:JSON.stringify(data.output,null,2);validateJson();
  }catch(e){$('validation').textContent=e?.message||'No fue posible generar.';$('validation').className='status err';}
}
function validateJson(){try{const x=JSON.parse($('result').value);if(!x||Array.isArray(x))throw new Error('Se esperaba un objeto JSON.');$('validation').textContent='JSON válido. Listo para la capa de empaquetado H5P.';$('validation').className='status ok';return true;}catch(e){$('validation').textContent='JSON inválido: '+e.message;$('validation').className='status err';return false;}}
function downloadDraft(){if(!$('result').value.trim())return;const b=new Blob([$('result').value],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='h5p-borrador.json';a.click();URL.revokeObjectURL(a.href);}
function boot(detail){
  sb=detail.sb;attachEngineButtons();attachCreationModeButtons();
  $('syncBtn').addEventListener('click',syncRegistry);$('library').addEventListener('change',()=>{fillVersions();renderLibraryInfo();});$('version').addEventListener('change',renderLibraryInfo);
  $('recommendBtn').addEventListener('click',recommendActivity);$('copyPromptBtn').addEventListener('click',copyPrompt);$('generateBtn').addEventListener('click',generate);$('validateBtn').addEventListener('click',validateJson);$('downloadBtn').addEventListener('click',downloadDraft);
}
window.addEventListener('h5p-auth-ready',(e)=>{if(!sb)boot(e.detail);});
})();

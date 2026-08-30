(() => {
  'use strict';
  if(!window.H5PIA)return;
  const {$,sb}=window.H5PIA;
  let registry=null;
  let engine='gemini-flash';
  let creationMode='choose';

  const help={
    'gemini-flash':'Gemini Flash automático. Ideal para la mayoría de actividades.',
    'gemini-pro':'Gemini Pro automático. Recomendado para estructuras complejas y escenarios.',
    'manual-chatgpt':'Modo manual: copia el prompt, úsalo en ChatGPT y pega el JSON.',
    'manual-gemini':'Modo manual: copia el prompt, úsalo en tu Gemini y pega el JSON.'
  };

  function setStatus(id,text,kind=''){
    const el=$(id);if(!el)return;
    el.textContent=text;
    el.className='status'+(kind?' '+kind:'');
  }

  document.querySelectorAll('#enginePills .pill').forEach(button=>{
    button.addEventListener('click',()=>{
      document.querySelectorAll('#enginePills .pill').forEach(x=>x.classList.remove('active'));
      button.classList.add('active');
      engine=button.dataset.engine;
      $('engineHelp').textContent=help[engine];
      $('engineHelp').className='status '+(engine.startsWith('manual')?'warn':'ok');
    });
  });

  document.querySelectorAll('#creationModePills .pill').forEach(button=>{
    button.addEventListener('click',()=>{
      document.querySelectorAll('#creationModePills .pill').forEach(x=>x.classList.remove('active'));
      button.classList.add('active');
      creationMode=button.dataset.creationMode;
      $('recommendBox').hidden=creationMode!=='recommend';
    });
  });

  $('syncBtn').addEventListener('click',async()=>{
    const base=$('moodleUrl').value.replace(/\/$/,'');
    setStatus('registryStatus','Sincronizando...');
    try{
      const response=await fetch(base+'/local/h5pia/registry.php',{headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error('HTTP '+response.status);
      registry=await response.json();
      if(!Array.isArray(registry.libraries))throw new Error('Respuesta inválida');
      $('familyCount').textContent=registry.families??'—';
      $('versionCount').textContent=registry.versions??registry.libraries.length;
      setStatus('registryStatus','Sincronizado con '+(registry.moodleRelease||'Moodle')+'.','ok');
      fillLibraries();
    }catch(error){
      setStatus('registryStatus','No se pudo sincronizar: '+(error?.message||error),'err');
    }
  });

  function availableRunnable(){
    return Array.isArray(registry?.libraries)?registry.libraries.filter(x=>x.runnable&&x.enabled):[];
  }

  function compareVersions(a,b){
    return b.majorVersion-a.majorVersion||b.minorVersion-a.minorVersion||b.patchVersion-a.patchVersion;
  }

  function fillLibraries(){
    const groups={};
    availableRunnable().forEach(lib=>{(groups[lib.machineName]??=[]).push(lib);});
    const select=$('library');
    select.innerHTML='';
    Object.keys(groups).sort((a,b)=>a.localeCompare(b,'es')).forEach(machineName=>{
      const latest=[...groups[machineName]].sort(compareVersions)[0];
      const option=document.createElement('option');
      option.value=machineName;
      option.textContent=(latest.title||machineName)+' · '+machineName;
      select.appendChild(option);
    });
    fillVersions();
    renderLibraryInfo();
  }

  function fillVersions(){
    if(!registry)return;
    const machineName=$('library').value;
    const versions=availableRunnable().filter(x=>x.machineName===machineName).sort(compareVersions);
    const select=$('version');
    select.innerHTML='';
    versions.forEach((lib,index)=>{
      const option=document.createElement('option');
      option.value=lib.id;
      option.textContent=lib.version+(index===0?' · recomendada':'');
      select.appendChild(option);
    });
  }

  function selectedLibrary(){
    if(!registry)return null;
    return registry.libraries.find(x=>Number(x.id)===Number($('version').value))||null;
  }

  function renderLibraryInfo(){
    const lib=selectedLibrary();
    if(!lib){$('libraryInfo').hidden=true;return;}
    const catalog=window.H5PCatalog;
    const guide=(catalog?.findGuide(lib))||(catalog?.fallback(lib))||{
      name:lib.title||lib.machineName,what:'Actividad H5P.',ideal:'Uso educativo.',participant:'Interactúa con la actividad.',mobile:'Requiere prueba en móvil.'
    };
    $('libraryInfo').hidden=false;
    $('libraryTitleText').textContent=guide.name||lib.title||lib.machineName;
    $('libraryMachineBadge').textContent=lib.machineName+' · '+lib.version;
    $('libraryDescription').textContent=guide.what;
    $('libraryIdeal').textContent=guide.ideal;
    $('libraryParticipant').textContent=guide.participant;
    $('libraryMobile').textContent=guide.mobile;
  }

  $('library').addEventListener('change',()=>{fillVersions();renderLibraryInfo();});
  $('version').addEventListener('change',renderLibraryInfo);

  function parseModelOutput(raw){
    if(raw&&typeof raw==='object')return raw;
    const text=String(raw||'').trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();
    return JSON.parse(text);
  }

  function chooseAvailableMachine(name){
    const normalized=String(name||'').toLowerCase();
    const libs=availableRunnable();
    return libs.find(x=>x.machineName.toLowerCase()===normalized)?.machineName||null;
  }

  function localFallbackRecommendation(request){
    const text=String(request||'').toLowerCase();
    const candidates=[
      [/360|recorrido virtual|tour virtual/,['H5P.VirtualTour','Virtual Tour']],
      [/decisi|escenario|consecuen|ramific/,['H5P.BranchingScenario','Branching Scenario']],
      [/video/,['H5P.InteractiveVideo','Interactive Video']],
      [/imagen.*peligro|identificar.*imagen|varios.*punto|varios.*peligro/,['H5P.FindMultipleHotspots','Find Multiple Hotspots']],
      [/punto.*imagen|hotspot|explorar.*imagen/,['H5P.ImageHotspots','Image Hotspots']],
      [/arrastrar.*palabra|completar.*arrastr/,['H5P.DragText','Drag the Words']],
      [/arrastrar|clasificar|ubicar/,['H5P.DragQuestion','Drag and Drop']],
      [/verdadero|falso/,['H5P.TrueFalse','True/False']],
      [/completar|espacio.*blanco/,['H5P.Blanks','Fill in the Blanks']],
      [/marcar.*palabra/,['H5P.MarkTheWords','Mark the Words']],
      [/crucigrama/,['H5P.Crossword','Crossword']],
      [/memoria|pareja/,['H5P.MemoryGame','Memory Game']],
      [/encuesta|cuestionario.*opini/,['H5P.Questionnaire','Questionnaire']],
      [/presentacion|diapositiva/,['H5P.CoursePresentation','Course Presentation']],
      [/libro|capitulo/,['H5P.InteractiveBook','Interactive Book']],
      [/mapa|mision|gamific/,['H5P.GameMap','Game Map']],
      [/opcion multiple|seleccion multiple|preguntas/,['H5P.MultiChoice','Multiple Choice']]
    ];
    const libs=availableRunnable();
    for(const [rx,terms] of candidates){
      if(!rx.test(text))continue;
      const found=libs.find(lib=>terms.some(term=>(lib.machineName+' '+lib.title).toLowerCase().includes(term.toLowerCase())));
      if(found)return found.machineName;
    }
    const mc=libs.find(lib=>(lib.machineName+' '+lib.title).toLowerCase().includes('multichoice')||(lib.title||'').toLowerCase().includes('multiple choice'));
    return mc?.machineName||libs[0]?.machineName||null;
  }

  async function recommendActivity(){
    if(!registry){$('recommendResult').textContent='Primero sincroniza las librerías de Moodle.';return;}
    const request=$('activityRequest').value.trim();
    if(!request){$('recommendResult').textContent='Describe primero qué actividad quieres crear.';return;}
    $('recommendResult').textContent='Analizando opciones con Gemini...';
    const available=[...new Map(availableRunnable().map(lib=>[lib.machineName,{machineName:lib.machineName,title:lib.title}])).values()];
    try{
      const {data:{session}}=await sb.auth.getSession();
      if(!session)throw new Error('Sesión expirada.');
      const prompt=`Eres experto en diseño instruccional H5P. Elige SOLO entre las librerías disponibles. Devuelve JSON válido sin markdown con esta forma exacta: {"machineName":"...","reason":"...","alternatives":["...","..."]}.\n\nSOLICITUD DEL USUARIO:\n${request}\n\nLIBRERÍAS DISPONIBLES:\n${JSON.stringify(available)}`;
      const {data,error}=await sb.functions.invoke('gemini-h5p',{body:{model:'gemini-2.5-flash',prompt}});
      if(error)throw error;
      if(!data?.ok)throw new Error(data?.error||'Respuesta inválida');
      const result=parseModelOutput(data.output);
      const machine=chooseAvailableMachine(result.machineName);
      if(!machine)throw new Error('Gemini sugirió una librería no disponible.');
      applyRecommendation(machine,result.reason,result.alternatives||[]);
    }catch(error){
      const machine=localFallbackRecommendation(request);
      if(machine){
        applyRecommendation(machine,'Recomendación local de respaldo porque Gemini no pudo completar la selección en este momento.',[]);
      }else{
        $('recommendResult').textContent='No se pudo recomendar una actividad: '+(error?.message||error);
      }
    }
  }

  function applyRecommendation(machineName,reason,alternatives){
    const option=[...$('library').options].find(o=>o.value===machineName);
    if(!option){$('recommendResult').textContent='La recomendación no está instalada en Moodle.';return;}
    $('library').value=machineName;
    fillVersions();
    renderLibraryInfo();
    let text='Recomendado: '+option.textContent+'. '+(reason||'');
    if(Array.isArray(alternatives)&&alternatives.length)text+=' Alternativas: '+alternatives.join(', ')+'.';
    $('recommendResult').textContent=text;
  }

  $('recommendBtn').addEventListener('click',recommendActivity);

  function makePrompt(){
    const lib=selectedLibrary();
    if(!lib)throw new Error('Primero sincroniza Moodle y selecciona una librería.');
    return `Actúa como diseñador instruccional experto en H5P.\nGenera SOLO JSON válido para los parámetros de la librería indicada.\n\nLIBRERÍA: ${lib.machineName} ${lib.majorVersion}.${lib.minorVersion}\nACTIVIDAD SOLICITADA: ${$('activityRequest').value}\nTÍTULO: ${$('title').value}\nPÚBLICO: ${$('audience').value}\nOBJETIVO: ${$('objective').value}\nNIVEL: ${$('level').value}\nIDIOMA: ${$('lang').value}\nCONTENIDO BASE:\n${$('source').value}\n\nREGLAS:\n- Mobile first.\n- Respeta exactamente la estructura semantics.\n- Retroalimentación breve y educativa.\n- No devuelvas markdown ni explicaciones.\n- Devuelve exclusivamente un objeto JSON.\n\nSEMANTICS:\n${JSON.stringify(lib.semantics||[],null,2)}`;
  }

  $('copyPromptBtn').addEventListener('click',async()=>{
    try{
      await navigator.clipboard.writeText(makePrompt());
      $('resultBlock').hidden=false;
      setStatus('validation','Prompt copiado.','ok');
    }catch(error){
      $('resultBlock').hidden=false;
      setStatus('validation',error?.message||String(error),'err');
    }
  });

  $('generateBtn').addEventListener('click',async()=>{
    try{
      const prompt=makePrompt();
      $('resultBlock').hidden=false;
      if(engine.startsWith('manual')){
        await navigator.clipboard.writeText(prompt);
        setStatus('validation','Prompt copiado. Úsalo en '+(engine==='manual-chatgpt'?'ChatGPT':'Gemini')+' y pega aquí el JSON.','warn');
        return;
      }
      const model=engine==='gemini-pro'?'gemini-2.5-pro':'gemini-2.5-flash';
      setStatus('validation','Generando con '+model+'...');
      const {data:{session}}=await sb.auth.getSession();
      if(!session)throw new Error('Sesión expirada.');
      const {data,error}=await sb.functions.invoke('gemini-h5p',{body:{model,prompt}});
      if(error)throw error;
      if(!data?.ok)throw new Error(data?.error||'Respuesta inválida');
      $('result').value=typeof data.output==='string'?data.output:JSON.stringify(data.output,null,2);
      validateJson();
    }catch(error){
      setStatus('validation',error?.message||'No fue posible generar.','err');
    }
  });

  function validateJson(){
    try{
      const value=JSON.parse($('result').value);
      if(!value||Array.isArray(value))throw new Error('Se esperaba un objeto JSON.');
      setStatus('validation','JSON válido. Listo para la capa de empaquetado H5P.','ok');
      return true;
    }catch(error){
      setStatus('validation','JSON inválido: '+(error?.message||error),'err');
      return false;
    }
  }

  $('validateBtn').addEventListener('click',validateJson);
  $('downloadBtn').addEventListener('click',()=>{
    if(!$('result').value.trim())return;
    const blob=new Blob([$('result').value],{type:'application/json'});
    const anchor=document.createElement('a');
    anchor.href=URL.createObjectURL(blob);
    anchor.download='h5p-borrador.json';
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  });
})();

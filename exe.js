(() => {
'use strict';
const $=id=>document.getElementById(id);
let sb=null;
let project=null;
let busy=false;
let previewMode='desktop';
const ALLOWED_TAGS=new Set(['P','H3','H4','UL','OL','LI','STRONG','EM','BLOCKQUOTE','TABLE','THEAD','TBODY','TR','TH','TD','BR']);

function status(message,kind=''){
  const el=$('exeStatus');
  el.hidden=!message;
  el.textContent=message||'';
  el.className='status'+(kind?' '+kind:'');
}
function setBusy(value,label='Creando recurso…'){
  busy=value;
  const btn=$('exeGenerateBtn');
  if(!btn)return;
  if(value){btn.dataset.old=btn.textContent;btn.textContent=label;btn.disabled=true;}
  else{btn.textContent=btn.dataset.old||'✨ Crear recurso eXeLearning';btn.disabled=false;}
}
function sanitizeHtml(html){
  const template=document.createElement('template');
  template.innerHTML=String(html||'');
  const nodes=[...template.content.querySelectorAll('*')];
  for(const el of nodes){
    if(!ALLOWED_TAGS.has(el.tagName)){
      const fragment=document.createDocumentFragment();
      while(el.firstChild) fragment.appendChild(el.firstChild);
      el.replaceWith(fragment);
      continue;
    }
    for(const attr of [...el.attributes]) el.removeAttribute(attr.name);
  }
  return template.innerHTML.replace(/<p>\s*<\/p>/gi,'').trim()||'<p>Contenido pendiente.</p>';
}
function cleanProject(raw){
  const normalized=window.ExeCore.normalizeProject(raw||{});
  normalized.author=$('exeAuthor')?.value.trim()||'La Movida SST';
  normalized.language=$('exeLanguage')?.value||'es';
  normalized.resourceType=$('exeResourceType')?.value||'auto';
  normalized.pedagogy=$('exePedagogy')?.value||'auto';
  normalized.modules=normalized.resourceType==='course'?Number($('exeModules')?.value||3):null;
  normalized.pages=normalized.pages.map(page=>({...page,blocks:page.blocks.map(block=>({...block,html:sanitizeHtml(block.html)}))}));
  return normalized;
}
function escapeText(value){const div=document.createElement('div');div.textContent=String(value??'');return div.innerHTML;}

function renderProject(){
  const panel=$('exeResultPanel');
  const editor=$('exeEditor');
  if(!project){panel.hidden=true;return;}
  panel.hidden=false;
  $('exeResultTitle').textContent=project.title;
  $('exeResultSummary').textContent=project.summary||'Proyecto eXeLearning generado.';
  editor.innerHTML='';
  project.pages.forEach((page,pindex)=>{
    const pageCard=document.createElement('section');
    pageCard.className='exe-page-card';
    pageCard.dataset.page=String(pindex);
    pageCard.innerHTML=`<div class="exe-page-head"><span>Página ${pindex+1}</span><input class="exe-page-title control" value="${escapeText(page.title)}" aria-label="Título de página ${pindex+1}"><input class="exe-page-purpose control" value="${escapeText(page.purpose||'')}" placeholder="Propósito de esta página" aria-label="Propósito de página ${pindex+1}"></div><div class="exe-blocks"></div>`;
    const blocks=pageCard.querySelector('.exe-blocks');
    page.blocks.forEach((block,bindex)=>{
      const card=document.createElement('article');
      card.className='exe-block-card';
      card.dataset.block=String(bindex);
      card.innerHTML=`<div class="exe-block-head"><span class="exe-kind">${escapeText(block.kind)}</span><input class="exe-block-title control" value="${escapeText(block.title)}" aria-label="Título del bloque"></div><div class="exe-rich" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Contenido editable del bloque">${sanitizeHtml(block.html)}</div>`;
      blocks.appendChild(card);
    });
    editor.appendChild(pageCard);
  });
  $('exeActions').hidden=false;
  $('exePreviewPanel').hidden=true;
  status(`✓ Recurso generado · ${project.pages.length} páginas · ${project.pages.reduce((n,p)=>n+p.blocks.length,0)} bloques editables.`,'ok');
  panel.scrollIntoView({behavior:'smooth',block:'start'});
}
function syncFromEditor(){
  if(!project)return;
  const pageCards=[...$('exeEditor').querySelectorAll('.exe-page-card')];
  pageCards.forEach((pageCard,pindex)=>{
    const page=project.pages[pindex];
    page.title=pageCard.querySelector('.exe-page-title').value.trim().slice(0,180)||`Página ${pindex+1}`;
    page.purpose=pageCard.querySelector('.exe-page-purpose').value.trim().slice(0,700);
    const blockCards=[...pageCard.querySelectorAll('.exe-block-card')];
    blockCards.forEach((card,bindex)=>{
      const block=page.blocks[bindex];
      block.title=card.querySelector('.exe-block-title').value.trim().slice(0,180)||`Contenido ${bindex+1}`;
      block.html=sanitizeHtml(card.querySelector('.exe-rich').innerHTML);
    });
  });
  project=cleanProject(project);
}
async function createProject(){
  if(busy)return;
  const topic=$('exeTopic').value.trim();
  if(topic.length<4){status('Escribe el tema del recurso.','err');$('exeTopic').focus();return;}
  if(!sb){status('La sesión administrativa todavía no está disponible.','err');return;}
  try{
    setBusy(true);
    status('Gemini está diseñando la estructura, los contenidos y las actividades…');
    const payload={
      topic,
      resourceType:$('exeResourceType').value,
      pedagogy:$('exePedagogy').value,
      modules:Number($('exeModules').value||3),
      audience:$('exeAudience').value.trim(),
      duration:$('exeDuration').value.trim(),
      level:$('exeLevel').value,
      language:$('exeLanguage').value,
      instructions:$('exeInstructions').value.trim()
    };
    const {data,error}=await sb.functions.invoke('gemini-exe',{body:payload});
    if(error)throw new Error(error.message||'No se pudo generar el recurso.');
    if(!data?.ok||!data?.project)throw new Error(data?.message||'La IA no devolvió un proyecto válido.');
    project=cleanProject(data.project);
    renderProject();
  }catch(error){status(error?.message||'No se pudo generar el recurso eXeLearning.','err');}
  finally{setBusy(false);}
}
function setPreviewMode(mode){
  previewMode=['desktop','tablet','mobile'].includes(mode)?mode:'desktop';
  const device=$('exePreviewDevice');
  if(device)device.className='preview-device '+previewMode;
  const controls={desktop:$('exePreviewDesktop'),tablet:$('exePreviewTablet'),mobile:$('exePreviewMobile')};
  Object.entries(controls).forEach(([name,button])=>{
    if(!button)return;
    const active=name===previewMode;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  });
  if(project&&$('exePreviewMeta')){
    const labels={desktop:'Escritorio',tablet:'Tablet 768 px',mobile:'Móvil 390 px'};
    $('exePreviewMeta').textContent=`Vista alumno · ${labels[previewMode]} · mismo contenido que se empaquetará · ${project.pages.length} páginas.`;
  }
}
function preview(){
  syncFromEditor();
  const html=window.ExeCore.buildPreviewHtml(project);
  const frame=$('exePreviewFrame');
  frame.srcdoc=html;
  $('exePreviewPanel').hidden=false;
  setPreviewMode(previewMode);
  $('exePreviewPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
function updateModulesVisibility(){
  const isCourse=$('exeResourceType')?.value==='course';
  const field=$('exeModulesField');
  if(field)field.hidden=!isCourse;
}
function downloadBlob(blob,filename){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function screenshotBlob(title){
  const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
  const ctx=canvas.getContext('2d');
  const gradient=ctx.createLinearGradient(0,0,1280,720);gradient.addColorStop(0,'#00205b');gradient.addColorStop(1,'#007b85');ctx.fillStyle=gradient;ctx.fillRect(0,0,1280,720);
  ctx.fillStyle='#fff';ctx.font='800 62px Outfit, Arial';ctx.fillText('La Movida SST',80,120);
  ctx.font='700 48px Outfit, Arial';
  const words=String(title||'Recurso eXeLearning').split(/\s+/);let line='',y=280;
  for(const word of words){const test=line?line+' '+word:word;if(ctx.measureText(test).width>1080&&line){ctx.fillText(line,80,y);line=word;y+=64;}else line=test;}
  if(line)ctx.fillText(line,80,y);
  ctx.font='500 28px Outfit, Arial';ctx.fillText('Recurso editable eXeLearning · www.movidasst.com',80,630);
  return await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
}
function browserXmlCheck(xml){
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  const parserError=doc.querySelector('parsererror');
  if(parserError)throw new Error('El content.xml generado no es XML válido.');
  const root=doc.documentElement;
  if(root.localName!=='ode')throw new Error('El content.xml no tiene raíz ODE.');
}
async function packageElpx(){
  if(!window.JSZip)throw new Error('No se pudo cargar el empaquetador ZIP.');
  syncFromEditor();
  const built=window.ExeCore.buildContentXml(project);
  const report=window.ExeCore.validateContentXml(built.xml);
  if(!report.valid)throw new Error(report.errors.join(' '));
  browserXmlCheck(built.xml);
  const dtdResponse=await fetch('./exe-content.dtd',{cache:'no-store'});
  if(!dtdResponse.ok)throw new Error('No se pudo cargar content.dtd.');
  const dtd=await dtdResponse.text();
  if(!dtd.includes('<!ELEMENT ode'))throw new Error('El content.dtd local no es válido.');
  const zip=new JSZip();
  zip.file('content.xml',built.xml);
  zip.file('content.dtd',dtd);
  zip.file('index.html',window.ExeCore.buildPreviewHtml(project));
  const shot=await screenshotBlob(project.title);if(shot)zip.file('screenshot.png',shot);
  zip.file('README.txt','Proyecto generado por La Movida SST para importar y continuar editando en eXeLearning.\nFormato ODE 2.0 / ELPX.\nwww.movidasst.com\n');
  const blob=await zip.generateAsync({type:'blob',mimeType:'application/x-exelearning-elpx',compression:'DEFLATE',compressionOptions:{level:6}});
  const reopened=await JSZip.loadAsync(await blob.arrayBuffer(),{checkCRC32:true});
  for(const required of ['content.xml','content.dtd','index.html'])if(!reopened.file(required))throw new Error(`El ELPX final no contiene ${required}.`);
  const finalXml=await reopened.file('content.xml').async('string');
  const finalReport=window.ExeCore.validateContentXml(finalXml);
  if(!finalReport.valid)throw new Error('El ELPX final falló la segunda validación: '+finalReport.errors.join(' '));
  return {blob,filename:window.ExeCore.safeName(project.title)+'.elpx',report:finalReport};
}
async function downloadElpx(){
  try{
    status('Validando y empaquetando el proyecto ELPX…');
    const pkg=await packageElpx();
    downloadBlob(pkg.blob,pkg.filename);
    status(`✓ ELPX validado y descargado · ${pkg.report.pages} páginas · ${pkg.report.components} iDevices editables.`,'ok');
  }catch(error){status(error?.message||'No se pudo preparar el ELPX.','err');}
}
async function downloadHtmlZip(){
  try{
    syncFromEditor();
    const zip=new JSZip();
    zip.file('index.html',window.ExeCore.buildPreviewHtml(project));
    zip.file('README.txt','Exportación HTML5 autónoma generada por La Movida SST.');
    const blob=await zip.generateAsync({type:'blob',mimeType:'application/zip',compression:'DEFLATE'});
    downloadBlob(blob,window.ExeCore.safeName(project.title)+'-html5.zip');
    status('✓ HTML5 ZIP descargado.','ok');
  }catch(error){status(error?.message||'No se pudo exportar HTML5.','err');}
}
async function downloadScorm(){
  try{
    syncFromEditor();
    const zip=new JSZip();
    zip.file('index.html',window.ExeCore.buildPreviewHtml(project,{scorm:true}));
    zip.file('imsmanifest.xml',window.ExeCore.buildScormManifest(project));
    const blob=await zip.generateAsync({type:'blob',mimeType:'application/zip',compression:'DEFLATE'});
    const reopened=await JSZip.loadAsync(await blob.arrayBuffer(),{checkCRC32:true});
    if(!reopened.file('imsmanifest.xml')||!reopened.file('index.html'))throw new Error('El SCORM final quedó incompleto.');
    downloadBlob(blob,window.ExeCore.safeName(project.title)+'-scorm12.zip');
    status('✓ SCORM 1.2 validado estructuralmente y descargado.','ok');
  }catch(error){status(error?.message||'No se pudo exportar SCORM 1.2.','err');}
}
function downloadJson(){
  syncFromEditor();
  downloadBlob(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),window.ExeCore.safeName(project.title)+'.json');
}
function boot(detail){
  if(sb)return;
  sb=detail?.sb||window.H5PAuth?.sb||null;
  $('exeGenerateBtn').disabled=!sb;
  if(sb)status('✓ eXeLearning IA listo. Esta pestaña es independiente del generador H5P.','ok');
}
function wire(){
  $('exeGenerateBtn').addEventListener('click',createProject);
  $('exePreviewBtn').addEventListener('click',preview);
  $('exeElpxBtn').addEventListener('click',downloadElpx);
  $('exeHtmlBtn').addEventListener('click',downloadHtmlZip);
  $('exeScormBtn').addEventListener('click',downloadScorm);
  $('exeJsonBtn').addEventListener('click',downloadJson);
  $('exeResourceType').addEventListener('change',updateModulesVisibility);
  $('exePreviewDesktop').addEventListener('click',()=>setPreviewMode('desktop'));
  $('exePreviewTablet').addEventListener('click',()=>setPreviewMode('tablet'));
  $('exePreviewMobile').addEventListener('click',()=>setPreviewMode('mobile'));
  $('exeRefreshPreview').addEventListener('click',preview);
  $('exeClosePreview').addEventListener('click',()=>{$('exePreviewPanel').hidden=true;$('exePreviewFrame').srcdoc='';});
  updateModulesVisibility();
  window.addEventListener('h5p-auth-ready',event=>boot(event.detail));
  if(window.H5PAuth?.sb)boot({sb:window.H5PAuth.sb});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else wire();
})();

((root,factory)=>{
  const api=factory();
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  if(root) root.ExeCore=api;
})(typeof window!=='undefined'?window:globalThis,()=>{
  'use strict';
  const escXml=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  const cdata=value=>String(value??'').replace(/]]>/g,']]]]><![CDATA[>');
  const safeName=value=>String(value||'recurso-exelearning').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90)||'recurso-exelearning';
  function odeId(date=new Date()){
    const iso=date.toISOString().replace(/[-:TZ.]/g,'').slice(0,14);
    const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let suffix='';
    for(let i=0;i<6;i++) suffix+=alphabet[Math.floor(Math.random()*alphabet.length)];
    return iso+suffix;
  }
  function normalizeProject(input){
    const pages=(Array.isArray(input?.pages)?input.pages:[]).slice(0,12).map((page,index)=>({
      title:String(page?.title||`Página ${index+1}`).trim().slice(0,180),
      purpose:String(page?.purpose||'').trim().slice(0,700),
      blocks:(Array.isArray(page?.blocks)?page.blocks:[]).slice(0,8).map((block,bindex)=>({
        title:String(block?.title||`Contenido ${bindex+1}`).trim().slice(0,180),
        kind:String(block?.kind||'explanation').trim().slice(0,60),
        html:String(block?.html||'<p>Contenido pendiente.</p>').trim().slice(0,30000)
      }))
    })).filter(page=>page.blocks.length);
    if(!pages.length) pages.push({title:'Inicio',purpose:'',blocks:[{title:'Contenido',kind:'explanation',html:'<p>Contenido pendiente.</p>'}]});
    return {
      title:String(input?.title||'Recurso eXeLearning').trim().slice(0,180),
      summary:String(input?.summary||'').trim().slice(0,1600),
      objectives:(Array.isArray(input?.objectives)?input.objectives:[]).slice(0,10).map(x=>String(x||'').trim().slice(0,600)).filter(Boolean),
      author:String(input?.author||'La Movida SST').trim().slice(0,180),
      language:String(input?.language||'es').trim().slice(0,20),
      pages
    };
  }
  function textComponent(pageId,blockId,component,index){
    const ideviceId=odeId();
    const html=`<div class="exe-text-template"><div class="textIdeviceContent"><div class="exe-text-activity"><div>${component.html}</div></div></div></div>`;
    const props={
      ideviceId,
      textTextarea:component.html,
      textFeedbackInput:'Mostrar retroalimentación',
      textFeedbackTextarea:'',
      textInfoDurationInput:'',
      textInfoDurationTextInput:'Duración',
      textInfoParticipantsInput:'',
      textInfoParticipantsTextInput:'Agrupamiento'
    };
    return `          <odeComponent>\n            <odePageId>${pageId}</odePageId>\n            <odeBlockId>${blockId}</odeBlockId>\n            <odeIdeviceId>${ideviceId}</odeIdeviceId>\n            <odeIdeviceTypeName>text</odeIdeviceTypeName>\n            <htmlView><![CDATA[${cdata(html)}]]></htmlView>\n            <jsonProperties><![CDATA[${cdata(JSON.stringify(props))}]]></jsonProperties>\n            <odeComponentsOrder>${index+1}</odeComponentsOrder>\n            <odeComponentsProperties>\n              <odeComponentsProperty><key>visibility</key><value>true</value></odeComponentsProperty>\n              <odeComponentsProperty><key>teacherOnly</key><value>false</value></odeComponentsProperty>\n              <odeComponentsProperty><key>identifier</key><value></value></odeComponentsProperty>\n              <odeComponentsProperty><key>cssClass</key><value></value></odeComponentsProperty>\n            </odeComponentsProperties>\n          </odeComponent>`;
  }
  function buildContentXml(input){
    const project=normalizeProject(input);
    const odeProjectId=odeId();
    const odeVersionId=odeId(new Date(Date.now()+1));
    const pageIds=project.pages.map(()=>odeId());
    const pages=project.pages.map((page,index)=>{
      const pageId=pageIds[index];
      const parentId=index===0?'':pageIds[0];
      const blockId=odeId();
      const extra=[];
      if(index===0&&project.objectives.length){
        extra.push({title:'Objetivos de aprendizaje',kind:'objectives',html:`<h3>Objetivos de aprendizaje</h3><ul>${project.objectives.map(x=>`<li>${escXml(x)}</li>`).join('')}</ul>`});
      }
      const components=[...extra,...page.blocks];
      return `    <odeNavStructure>\n      <odePageId>${pageId}</odePageId>\n      <odeParentPageId>${parentId}</odeParentPageId>\n      <pageName>${escXml(page.title)}</pageName>\n      <odeNavStructureOrder>${index===0?1:index}</odeNavStructureOrder>\n      <odeNavStructureProperties>\n        <odeNavStructureProperty><key>titlePage</key><value>${escXml(page.title)}</value></odeNavStructureProperty>\n        <odeNavStructureProperty><key>hidePageTitle</key><value>false</value></odeNavStructureProperty>\n        <odeNavStructureProperty><key>visibility</key><value>true</value></odeNavStructureProperty>\n      </odeNavStructureProperties>\n      <odePagStructures>\n        <odePagStructure>\n          <odePageId>${pageId}</odePageId>\n          <odeBlockId>${blockId}</odeBlockId>\n          <blockName>${escXml(page.title)}</blockName>\n          <iconName></iconName>\n          <odePagStructureOrder>1</odePagStructureOrder>\n          <odePagStructureProperties>\n            <odePagStructureProperty><key>visibility</key><value>true</value></odePagStructureProperty>\n          </odePagStructureProperties>\n          <odeComponents>\n${components.map((component,cindex)=>textComponent(pageId,blockId,component,cindex)).join('\n')}\n          </odeComponents>\n        </odePagStructure>\n      </odePagStructures>\n    </odeNavStructure>`;
    }).join('\n');
    const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE ode SYSTEM "content.dtd">\n<ode xmlns="http://www.intef.es/xsd/ode" version="2.0">\n  <userPreferences>\n    <userPreference><key>theme</key><value>base</value></userPreference>\n  </userPreferences>\n  <odeResources>\n    <odeResource><key>odeId</key><value>${odeProjectId}</value></odeResource>\n    <odeResource><key>odeVersionId</key><value>${odeVersionId}</value></odeResource>\n    <odeResource><key>exe_version</key><value>3.0</value></odeResource>\n  </odeResources>\n  <odeProperties>\n    <odeProperty><key>pp_title</key><value>${escXml(project.title)}</value></odeProperty>\n    <odeProperty><key>pp_lang</key><value>${escXml(project.language)}</value></odeProperty>\n    <odeProperty><key>pp_author</key><value>${escXml(project.author)}</value></odeProperty>\n    <odeProperty><key>pp_addExeLink</key><value>true</value></odeProperty>\n    <odeProperty><key>pp_addPagination</key><value>true</value></odeProperty>\n    <odeProperty><key>pp_addSearchBox</key><value>true</value></odeProperty>\n  </odeProperties>\n  <odeNavStructures>\n${pages}\n  </odeNavStructures>\n</ode>\n`;
    return {xml,project,odeProjectId,odeVersionId};
  }
  function validateContentXml(xml){
    const text=String(xml||'');
    const errors=[];
    if(!text.startsWith('<?xml')) errors.push('Falta la declaración XML.');
    if(!text.includes('<!DOCTYPE ode SYSTEM "content.dtd">')) errors.push('Falta la referencia a content.dtd.');
    if(!text.includes('<ode xmlns="http://www.intef.es/xsd/ode" version="2.0">')) errors.push('El nodo raíz ODE no es válido.');
    const pages=(text.match(/<odeNavStructure>/g)||[]).length;
    const components=(text.match(/<odeComponent>/g)||[]).length;
    if(!pages) errors.push('El proyecto no contiene páginas.');
    if(!components) errors.push('El proyecto no contiene iDevices.');
    if((text.match(/<odeIdeviceTypeName>text<\/odeIdeviceTypeName>/g)||[]).length!==components) errors.push('Hay iDevices no esperados o incompletos.');
    if(/<script\b|javascript:/i.test(text)) errors.push('El contenido contiene código no permitido.');
    return {valid:errors.length===0,errors,pages,components};
  }
  function buildPreviewHtml(input,{scorm=false}={}){
    const project=normalizeProject(input);
    const nav=project.pages.map((p,i)=>`<a href="#page-${i+1}">${escXml(p.title)}</a>`).join('');
    const objectives=project.objectives.length?`<section class="objectives"><h2>Objetivos</h2><ul>${project.objectives.map(x=>`<li>${escXml(x)}</li>`).join('')}</ul></section>`:'';
    const pages=project.pages.map((page,i)=>`<article id="page-${i+1}" class="page"><header><span>Página ${i+1}</span><h2>${escXml(page.title)}</h2>${page.purpose?`<p>${escXml(page.purpose)}</p>`:''}</header>${page.blocks.map(block=>`<section class="block kind-${escXml(block.kind)}"><h3>${escXml(block.title)}</h3>${block.html}</section>`).join('')}</article>`).join('');
    const scormJs=scorm?`<script>(function(){function api(){var w=window;for(var i=0;i<20&&w;i++){if(w.API)return w.API;w=w.parent!==w?w.parent:w.opener;}return null;}var a=api();if(a){try{a.LMSInitialize('');a.LMSSetValue('cmi.core.lesson_status','incomplete');a.LMSCommit('');}catch(e){}}window.finishCourse=function(){var x=api();if(x){try{x.LMSSetValue('cmi.core.lesson_status','completed');x.LMSCommit('');x.LMSFinish('');}catch(e){}}document.getElementById('finishBtn').textContent='Recurso completado';document.getElementById('finishBtn').disabled=true;};})();<\/script>`:'';
    const finish=scorm?`<button id="finishBtn" class="finish" type="button" onclick="finishCourse()">Finalizar recurso</button>`:'';
    return `<!doctype html><html lang="${escXml(project.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escXml(project.title)}</title><style>:root{--navy:#00205b;--teal:#007b85;--line:#dbe5ec;--muted:#64748b}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#17324a;background:#f6f8fb}header.hero{padding:28px max(18px,5vw);background:linear-gradient(135deg,var(--navy),var(--teal));color:#fff}header.hero h1{margin:0 0 8px;font-size:clamp(1.8rem,5vw,3rem)}header.hero p{margin:0;max-width:850px;line-height:1.55}.layout{display:grid;grid-template-columns:230px minmax(0,1fr);gap:22px;max-width:1180px;margin:auto;padding:22px}.nav{position:sticky;top:16px;align-self:start;background:#fff;border:1px solid var(--line);border-radius:16px;padding:12px}.nav a{display:block;padding:9px 10px;border-radius:9px;color:var(--navy);font-weight:700;text-decoration:none}.nav a:hover{background:#edf7f7}.content{min-width:0}.objectives,.page{background:#fff;border:1px solid var(--line);border-radius:18px;padding:20px;margin-bottom:16px}.page>header span{font-size:.75rem;color:var(--teal);font-weight:700}.page>header h2{margin:4px 0 6px;color:var(--navy)}.page>header p{margin:0 0 14px;color:var(--muted)}.block{padding:16px 0;border-top:1px solid #eef2f6}.block:first-of-type{border-top:0}.block h3{color:var(--navy);margin:0 0 10px}.block p,.block li{line-height:1.6}.block table{width:100%;border-collapse:collapse}.block th,.block td{border:1px solid var(--line);padding:8px;text-align:left}.finish{border:0;border-radius:12px;background:var(--navy);color:#fff;padding:12px 16px;font-weight:700}.finish:disabled{opacity:.55}@media(max-width:760px){.layout{grid-template-columns:1fr;padding:12px}.nav{position:static;display:flex;overflow-x:auto;gap:5px}.nav a{white-space:nowrap}.objectives,.page{padding:16px}}</style></head><body><header class="hero"><h1>${escXml(project.title)}</h1><p>${escXml(project.summary)}</p></header><div class="layout"><nav class="nav">${nav}</nav><main class="content">${objectives}${pages}${finish}</main></div>${scormJs}</body></html>`;
  }
  function buildScormManifest(input){
    const project=normalizeProject(input);
    const id='MOVSST-'+odeId();
    return `<?xml version="1.0" encoding="UTF-8"?>\n<manifest identifier="${id}" version="1.0" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>\n  <organizations default="ORG1"><organization identifier="ORG1"><title>${escXml(project.title)}</title><item identifier="ITEM1" identifierref="RES1"><title>${escXml(project.title)}</title></item></organization></organizations>\n  <resources><resource identifier="RES1" type="webcontent" adlcp:scormtype="sco" href="index.html"><file href="index.html"/></resource></resources>\n</manifest>`;
  }
  return {escXml,cdata,safeName,odeId,normalizeProject,buildContentXml,validateContentXml,buildPreviewHtml,buildScormManifest};
});

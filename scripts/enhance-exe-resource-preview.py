from pathlib import Path

html_path = Path('exe.html')
js_path = Path('exe.js')
html = html_path.read_text(encoding='utf-8')
js = js_path.read_text(encoding='utf-8')


def replace_once(text, old, new, label):
    if text.count(old) != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {text.count(old)}')
    return text.replace(old, new, 1)

old_css = "    .preview-wrap{margin-top:12px;border:1px solid var(--line);border-radius:18px;overflow:hidden;background:#fff}.preview-head{display:flex;gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line)}.preview-head strong{color:var(--navy);flex:1}.preview-frame{display:block;width:100%;height:72vh;min-height:520px;border:0;background:#fff}.preview-meta{padding:9px 12px;color:var(--muted);font-size:.73rem;border-top:1px solid var(--line)}"
new_css = "    .preview-wrap{margin-top:12px;border:1px solid var(--line);border-radius:18px;overflow:hidden;background:#fff}.preview-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid var(--line)}.preview-head strong{color:var(--navy);flex:1;min-width:150px}.preview-tools{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.preview-tool{border:1px solid var(--line);background:#fff;color:var(--navy);border-radius:10px;min-height:38px;padding:7px 9px;font-weight:850;font-size:.72rem}.preview-tool.active{background:#e7f5f6;border-color:#9bcdd1;color:var(--teal)}.preview-stage{padding:14px;background:#e9eef3;overflow-x:auto}.preview-device{margin:auto;background:#fff;transition:width .18s ease;box-shadow:0 5px 18px rgba(0,32,91,.10)}.preview-device.desktop{width:100%}.preview-device.tablet{width:min(768px,100%)}.preview-device.mobile{width:min(390px,100%)}.preview-frame{display:block;width:100%;height:680px;border:0;background:#fff}.preview-meta{padding:9px 12px;color:var(--muted);font-size:.73rem;border-top:1px solid var(--line)}"
html = replace_once(html, old_css, new_css, 'preview CSS')

old_audience = '        <div class="field"><label for="exeAudience">Público</label><input id="exeAudience" class="control" value="Trabajadores"></div>'
new_audience = '''        <div class="field"><label for="exeResourceType">Tipo de recurso</label><select id="exeResourceType" class="control"><option value="auto" selected>✨ Automático · que la IA decida</option><option value="unit">📘 Unidad didáctica / Lección</option><option value="microcourse">🎓 Microcurso</option><option value="guide">📚 Guía de estudio</option><option value="case">🧩 Caso práctico</option><option value="workshop">🛠️ Taller / Actividad práctica</option><option value="assessment">📝 Evaluación de conocimientos</option><option value="checklist">✅ Checklist / Lista de comprobación</option><option value="procedure">📋 Procedimiento de trabajo</option><option value="manual">📖 Manual / Documento técnico</option><option value="induction">👷 Inducción de trabajadores</option><option value="scenario">🚨 Lección basada en escenario</option><option value="review">🔄 Repaso / Refuerzo</option><option value="challenge">🏆 Reto gamificado</option><option value="course">📦 Curso completo con módulos</option></select></div>
        <div class="field"><label for="exePedagogy">Enfoque pedagógico</label><select id="exePedagogy" class="control"><option value="auto" selected>Automático · que la IA decida</option><option value="expository">Expositivo</option><option value="cases">Basado en casos</option><option value="scenarios">Basado en escenarios</option><option value="challenges">Aprendizaje por retos</option><option value="microlearning">Microlearning</option><option value="mixed">Mixto</option></select></div>
        <div id="exeModulesField" class="field" hidden><label for="exeModules">Número de módulos</label><select id="exeModules" class="control"><option value="2">2 módulos</option><option value="3" selected>3 módulos</option><option value="4">4 módulos</option><option value="5">5 módulos</option></select></div>
        <div class="field"><label for="exeAudience">Público</label><input id="exeAudience" class="control" value="Trabajadores"></div>'''
html = replace_once(html, old_audience, new_audience, 'resource selectors')

old_preview = '      <div class="preview-wrap"><div class="preview-head"><strong>Vista previa eXeLearning IA</strong><button id="exeClosePreview" class="secondary">Cerrar</button></div><iframe id="exePreviewFrame" class="preview-frame" title="Vista previa del recurso eXeLearning"></iframe><div id="exePreviewMeta" class="preview-meta"></div></div>'
new_preview = '''      <div class="preview-wrap">
        <div class="preview-head"><strong>Vista alumno · eXeLearning IA</strong><div class="preview-tools" role="group" aria-label="Tamaño de vista previa"><button id="exePreviewDesktop" class="preview-tool active" type="button" aria-pressed="true">🖥 Escritorio</button><button id="exePreviewTablet" class="preview-tool" type="button" aria-pressed="false">▣ Tablet</button><button id="exePreviewMobile" class="preview-tool" type="button" aria-pressed="false">📱 Móvil</button><button id="exeRefreshPreview" class="preview-tool" type="button">↻ Actualizar</button><button id="exeClosePreview" class="preview-tool" type="button">Cerrar</button></div></div>
        <div id="exePreviewStage" class="preview-stage"><div id="exePreviewDevice" class="preview-device desktop"><iframe id="exePreviewFrame" class="preview-frame" title="Vista previa del recurso eXeLearning"></iframe></div></div>
        <div id="exePreviewMeta" class="preview-meta"></div>
      </div>'''
html = replace_once(html, old_preview, new_preview, 'preview panel')

old_state = "let project=null;\nlet busy=false;"
new_state = "let project=null;\nlet busy=false;\nlet previewMode='desktop';"
js = replace_once(js, old_state, new_state, 'preview state')

old_clean = "  normalized.language=$('exeLanguage')?.value||'es';\n  normalized.pages=normalized.pages.map(page=>({...page,blocks:page.blocks.map(block=>({...block,html:sanitizeHtml(block.html)}))}));"
new_clean = "  normalized.language=$('exeLanguage')?.value||'es';\n  normalized.resourceType=$('exeResourceType')?.value||'auto';\n  normalized.pedagogy=$('exePedagogy')?.value||'auto';\n  normalized.modules=normalized.resourceType==='course'?Number($('exeModules')?.value||3):null;\n  normalized.pages=normalized.pages.map(page=>({...page,blocks:page.blocks.map(block=>({...block,html:sanitizeHtml(block.html)}))}));"
js = replace_once(js, old_clean, new_clean, 'project metadata')

old_payload = "      topic,\n      audience:$('exeAudience').value.trim(),\n      duration:$('exeDuration').value.trim(),\n      level:$('exeLevel').value,\n      language:$('exeLanguage').value,\n      instructions:$('exeInstructions').value.trim()"
new_payload = "      topic,\n      resourceType:$('exeResourceType').value,\n      pedagogy:$('exePedagogy').value,\n      modules:Number($('exeModules').value||3),\n      audience:$('exeAudience').value.trim(),\n      duration:$('exeDuration').value.trim(),\n      level:$('exeLevel').value,\n      language:$('exeLanguage').value,\n      instructions:$('exeInstructions').value.trim()"
js = replace_once(js, old_payload, new_payload, 'generation payload')

old_preview_fn = '''function preview(){
  syncFromEditor();
  const html=window.ExeCore.buildPreviewHtml(project);
  const frame=$('exePreviewFrame');
  frame.srcdoc=html;
  $('exePreviewPanel').hidden=false;
  $('exePreviewMeta').textContent=`Vista previa del mismo contenido que se empaquetará · ${project.pages.length} páginas.`;
  $('exePreviewPanel').scrollIntoView({behavior:'smooth',block:'start'});
}'''
new_preview_fn = '''function setPreviewMode(mode){
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
}'''
js = replace_once(js, old_preview_fn, new_preview_fn, 'preview logic')

old_wire = '''  $('exeGenerateBtn').addEventListener('click',createProject);
  $('exePreviewBtn').addEventListener('click',preview);
  $('exeElpxBtn').addEventListener('click',downloadElpx);
  $('exeHtmlBtn').addEventListener('click',downloadHtmlZip);
  $('exeScormBtn').addEventListener('click',downloadScorm);
  $('exeJsonBtn').addEventListener('click',downloadJson);
  $('exeClosePreview').addEventListener('click',()=>{$('exePreviewPanel').hidden=true;$('exePreviewFrame').srcdoc='';});
  window.addEventListener('h5p-auth-ready',event=>boot(event.detail));'''
new_wire = '''  $('exeGenerateBtn').addEventListener('click',createProject);
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
  window.addEventListener('h5p-auth-ready',event=>boot(event.detail));'''
js = replace_once(js, old_wire, new_wire, 'wire controls')

html_path.write_text(html,encoding='utf-8')
js_path.write_text(js,encoding='utf-8')
print('eXe resource selector + responsive student preview patch prepared')

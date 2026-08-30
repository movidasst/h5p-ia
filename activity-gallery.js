(() => {
'use strict';

const $=id=>document.getElementById(id);
let selectedMachine='';
let category='all';
let query='';

const LABELS={assessment:'Evaluación',visual:'Imagen y visual',content:'Contenido',multimedia:'Multimedia',gamification:'Juego',scenario:'Escenario',specialized:'Especializada'};
const FRIENDLY={
  'H5P.ARScavenger':'AR Scavenger','H5P.Blanks':'Fill in the Blanks','H5P.Cornell':'Cornell Notes','H5P.Dialogcards':'Dialog Cards','H5P.DragQuestion':'Drag and Drop','H5P.DragText':'Drag the Words','H5P.IFrameEmbed':'Iframe Embedder','H5P.ImageHotspotQuestion':'Find the Hotspot','H5P.KewArCode':'KewAr Code / QR','H5P.MultiMediaChoice':'Multimedia Choice','H5P.SortParagraphs':'Sort the Paragraphs','H5P.TrueFalse':'True / False','H5P.VirtualTour':'Virtual Tour 360'
};

function norm(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');}
function friendly(machine){return FRIENDLY[machine]||String(machine).replace(/^H5P\./,'').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g,'$1 $2');}
function categoryFor(machine){const n=norm(machine);if(/branch|virtualtour|scavenger/.test(n))return'scenario';if(/interactivevideo|audio|coursepresentation|iframe|multimedia/.test(n))return'multimedia';if(/image|hotspot|collage|agamotto|chart|slider|sequenc|juxtaposition/.test(n))return'visual';if(/gamemap|memory|findthewords|advent|personality|crossword/.test(n))return'gamification';if(/multichoice|truefalse|blank|drag|markthewords|questionset|singlechoice|sortparagraph|summary|essay|dictation|questionnaire|speak|arithmetic/.test(n))return'assessment';if(/accordion|column|cornell|documentation|dialog|flashcard|timeline|informationwall|interactivebook|structurestrip|guess/.test(n))return'content';return'specialized';}
function icon(cat){return{assessment:'✓',visual:'◉',content:'≡',multimedia:'▶',gamification:'★',scenario:'↳',specialized:'◆'}[cat]||'H5P';}
function technicalOptions(){return[...$('library').options].filter(o=>/^H5P\./.test(o.value));}
function installedMachines(){return new Set(technicalOptions().map(o=>o.value));}
function installedTitle(machine){const o=technicalOptions().find(x=>x.value===machine);if(!o)return'';return o.textContent.split('·')[0].trim();}
function entries(){
  const catalog=window.H5P_CATALOG||{};
  const installed=installedMachines();
  const source=installed.size?[...installed]:Object.keys(catalog);
  return source.map(machine=>({machine,title:installedTitle(machine)||friendly(machine),meta:catalog[machine]||(window.H5P_CATALOG_FALLBACK?window.H5P_CATALOG_FALLBACK({machineName:machine}):{}),installed:installed.size?installed.has(machine):null}));
}
function render(){
  const grid=$('activityGrid');if(!grid)return;
  const q=norm(query);
  const list=entries().filter(item=>{
    const cat=categoryFor(item.machine);
    if(category!=='all'&&cat!==category)return false;
    if(!q)return true;
    return norm([item.title,item.machine,item.meta.description,item.meta.ideal,item.meta.participant].join(' ')).includes(q);
  }).sort((a,b)=>a.title.localeCompare(b.title,'es'));
  grid.innerHTML='';
  list.forEach(item=>{
    const cat=categoryFor(item.machine);
    const card=document.createElement('article');card.className='activity-card'+(selectedMachine===item.machine?' selected':'');card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-pressed',selectedMachine===item.machine?'true':'false');
    const head=document.createElement('div');head.className='activity-card-head';
    const ico=document.createElement('div');ico.className='activity-icon';ico.textContent=icon(cat);
    const text=document.createElement('div');const h=document.createElement('h4');h.textContent=item.title;const mach=document.createElement('div');mach.className='activity-machine';mach.textContent=item.machine;text.append(h,mach);head.append(ico,text);
    const desc=document.createElement('p');desc.textContent=item.meta.description||'Actividad H5P disponible para crear contenido interactivo.';
    const foot=document.createElement('div');foot.className='activity-card-foot';
    const c=document.createElement('span');c.className='activity-tag';c.textContent=LABELS[cat]||'H5P';
    const m=document.createElement('span');m.className='activity-tag mobile';m.textContent='Móvil: '+(item.meta.mobile||'probar');
    const i=document.createElement('span');i.className='activity-tag installed';i.textContent=item.installed===true?'✓ Instalada':'Pendiente Moodle';
    const b=document.createElement('button');b.type='button';b.className='activity-select';b.textContent=selectedMachine===item.machine?'Seleccionada':'Seleccionar';
    foot.append(c,m,i,b);card.append(head,desc,foot);
    const select=()=>choose(item.machine,item.title);card.addEventListener('click',select);card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});grid.appendChild(card);
  });
  $('activityEmpty').hidden=list.length>0;
  $('activityCount').textContent=list.length+' actividad'+(list.length===1?'':'es')+(installedMachines().size?' instalada'+(list.length===1?'':'s')+' en Moodle':' disponible'+(list.length===1?'':'s')+' para explorar');
}
function applyToTechnical(machine){const select=$('library');const option=[...select.options].find(o=>o.value===machine);if(!option)return false;select.value=machine;select.dispatchEvent(new Event('change',{bubbles:true}));return true;}
function choose(machine,title){
  selectedMachine=machine;render();const status=$('selectedActivityStatus');
  if(applyToTechnical(machine)){status.className='selected-activity ok';status.textContent='✓ Seleccionada: '+title+'. Moodle usará la versión instalada recomendada.';return;}
  status.className='selected-activity';status.textContent='Seleccionaste '+title+'. Sincronizando con Moodle para confirmar la versión instalada...';
  $('syncBtn').click();
}
function tryPending(){if(!selectedMachine)return;if(applyToTechnical(selectedMachine)){const title=installedTitle(selectedMachine)||friendly(selectedMachine);$('selectedActivityStatus').className='selected-activity ok';$('selectedActivityStatus').textContent='✓ Seleccionada: '+title+'. Moodle usará la versión instalada recomendada.';}render();}
function setMode(mode){$('activityChooser').hidden=mode!=='choose';}
function init(){
  if(!$('activityGrid')||!window.H5P_CATALOG)return;
  render();
  $('activitySearch').addEventListener('input',e=>{query=e.target.value;render();});
  document.querySelectorAll('#activityCategories .category-btn').forEach(btn=>btn.addEventListener('click',()=>{category=btn.dataset.category;document.querySelectorAll('#activityCategories .category-btn').forEach(x=>x.classList.toggle('active',x===btn));render();}));
  document.querySelectorAll('#creationModePills .pill').forEach(btn=>btn.addEventListener('click',()=>setMode(btn.dataset.creationMode)));
  $('library').addEventListener('change',()=>{if(/^H5P\./.test($('library').value)){selectedMachine=$('library').value;render();}});
  const observer=new MutationObserver(()=>{tryPending();render();});observer.observe($('library'),{childList:true,subtree:true});
  setMode('choose');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

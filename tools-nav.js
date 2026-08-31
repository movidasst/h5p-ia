(() => {
  'use strict';
  function init(){
    if(document.getElementById('movidaToolTabs')) return;
    const app=document.getElementById('appView');
    const topbar=app?.querySelector('.topbar');
    if(!app||!topbar) return;
    const style=document.createElement('style');
    style.textContent=`
      .movida-tool-tabs{background:#fff;border-bottom:1px solid #dbe5ec}
      .movida-tool-tabs-inner{width:min(100%,980px);margin:auto;display:flex;gap:7px;padding:8px 14px;overflow-x:auto}
      .movida-tool-tab{flex:0 0 auto;min-height:42px;display:inline-flex;align-items:center;justify-content:center;padding:8px 14px;border:1px solid #dbe5ec;border-radius:12px;background:#fff;color:#52697a;text-decoration:none;font-size:.78rem;font-weight:900;white-space:nowrap}
      .movida-tool-tab.active{border-color:#007b85;background:#eaf7f8;color:#006b74}
      .movida-tool-tab:focus-visible{outline:3px solid rgba(0,123,133,.18);outline-offset:2px}
    `;
    document.head.appendChild(style);
    const nav=document.createElement('nav');
    nav.id='movidaToolTabs';
    nav.className='movida-tool-tabs';
    nav.setAttribute('aria-label','Herramientas de creación');
    const path=location.pathname.toLowerCase();
    const exe=path.endsWith('/exe.html');
    nav.innerHTML=`<div class="movida-tool-tabs-inner"><a class="movida-tool-tab ${exe?'':'active'}" href="./" ${exe?'':'aria-current="page"'}>🧩 H5P IA</a><a class="movida-tool-tab ${exe?'active':''}" href="./exe.html" ${exe?'aria-current="page"':''}>📘 eXeLearning IA</a></div>`;
    topbar.insertAdjacentElement('afterend',nav);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();

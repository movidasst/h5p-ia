(() => {
  'use strict';
  const SUPABASE_URL='https://lfdmbkzghnwvsapxypvt.supabase.co';
  const SUPABASE_KEY='sb_publishable_bRnkA6PA8-v073nrw9zxiQ_8rVGiOn1';
  function byId(id){ return document.getElementById(id); }
  function showLogin(message=''){
    byId('loginView').hidden=false;
    byId('appView').hidden=true;
    byId('loginError').hidden=!message;
    byId('loginError').textContent=message;
  }
  function showApp(email){
    byId('loginView').hidden=true;
    byId('appView').hidden=false;
    byId('adminEmail').textContent=email||'Administrador';
  }
  async function initAuth(){
    if(!window.supabase?.createClient){
      showLogin('No se pudo cargar el servicio de autenticación. Recarga la página.');
      return;
    }
    const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    async function ensureAdmin(){
      const {data:{session},error:sessionError}=await sb.auth.getSession();
      if(sessionError || !session){ showLogin(); return false; }
      const {error}=await sb.rpc('admin_gestion_resumen');
      if(error){
        await sb.auth.signOut();
        showLogin('La cuenta existe, pero no tiene permiso administrativo para esta herramienta.');
        return false;
      }
      showApp(session.user.email);
      window.dispatchEvent(new CustomEvent('h5p-auth-ready',{detail:{sb,session}}));
      return true;
    }
    const form=byId('loginForm');
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const button=form.querySelector('button[type="submit"]');
      const oldText=button.textContent;
      button.disabled=true;
      button.textContent='Verificando…';
      byId('loginError').hidden=true;
      try{
        const email=byId('loginEmail').value.trim();
        const password=byId('loginPassword').value;
        const {error}=await sb.auth.signInWithPassword({email,password});
        if(error){ showLogin(error.message||'No fue posible iniciar sesión.'); return; }
        await ensureAdmin();
      }catch(err){
        showLogin(err?.message||'No fue posible iniciar sesión.');
      }finally{
        button.disabled=false;
        button.textContent=oldText;
      }
    });
    byId('logoutBtn').addEventListener('click', async ()=>{
      await sb.auth.signOut();
      showLogin();
    });
    sb.auth.onAuthStateChange((event)=>{ if(event==='SIGNED_OUT') showLogin(); });
    window.H5PAuth={sb,ensureAdmin,getSession:()=>sb.auth.getSession()};
    await ensureAdmin();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initAuth,{once:true});
  else initAuth();
})();

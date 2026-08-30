(() => {
  'use strict';
  const SUPABASE_URL='https://lfdmbkzghnwvsapxypvt.supabase.co';
  const SUPABASE_KEY='sb_publishable_bRnkA6PA8-v073nrw9zxiQ_8rVGiOn1';
  const $=id=>document.getElementById(id);

  if(!window.supabase){
    const box=$('loginError');
    if(box){box.hidden=false;box.textContent='No se pudo cargar el servicio de autenticación. Recarga la página.';}
    return;
  }

  const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

  function showLogin(message=''){
    $('loginView').hidden=false;
    $('appView').hidden=true;
    $('loginError').hidden=!message;
    $('loginError').textContent=message;
  }

  function showApp(email){
    $('loginView').hidden=true;
    $('appView').hidden=false;
    $('adminEmail').textContent=email||'Administrador';
  }

  async function ensureAdmin(){
    const {data:{session}}=await sb.auth.getSession();
    if(!session){showLogin();return false;}
    const {error}=await sb.rpc('admin_gestion_resumen');
    if(error){
      await sb.auth.signOut();
      showLogin('La cuenta existe, pero no tiene permiso administrativo para esta herramienta.');
      return false;
    }
    showApp(session.user.email);
    return true;
  }

  const form=$('loginForm');
  if(form){
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      $('loginError').hidden=true;
      try{
        const {error}=await sb.auth.signInWithPassword({
          email:$('loginEmail').value.trim(),
          password:$('loginPassword').value
        });
        if(error)return showLogin(error.message||'No fue posible iniciar sesión.');
        await ensureAdmin();
      }catch(err){
        showLogin(err?.message||'No fue posible iniciar sesión.');
      }
    });
  }

  const logout=$('logoutBtn');
  if(logout)logout.onclick=async()=>{await sb.auth.signOut();showLogin();};
  sb.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')showLogin();});

  window.H5PIA={$,sb,showLogin,showApp,ensureAdmin};
  ensureAdmin().catch(err=>showLogin(err?.message||'No fue posible comprobar la sesión.'));
})();

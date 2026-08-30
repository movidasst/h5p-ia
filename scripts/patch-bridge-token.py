from pathlib import Path
p=Path('app.js')
s=p.read_text(encoding='utf-8')
s=s.replace("body:JSON.stringify({action:'status'})", "body:JSON.stringify({action:'status',accessToken:session.access_token})")
old="""function bridgePayload(action) {
  if (!generatedParams || !selectedLibrary || !proposal) throw new Error('Primero crea la actividad.');
  return {action,libraryId:selectedLibrary.id,title:proposal.title,language:$('lang').value,params:generatedParams};
}
async function authHeaders() {
  if (!sb) throw new Error('Sesión no disponible.');
  const {data:{session}} = await sb.auth.getSession();
  if (!session?.access_token) throw new Error('Tu sesión expiró. Vuelve a ingresar.');
  return {'Content-Type':'application/json','Authorization':'Bearer ' + session.access_token};
}
"""
new="""function bridgePayload(action, accessToken) {
  if (!generatedParams || !selectedLibrary || !proposal) throw new Error('Primero crea la actividad.');
  return {action,accessToken,libraryId:selectedLibrary.id,title:proposal.title,language:$('lang').value,params:generatedParams};
}
async function bridgeAuth() {
  if (!sb) throw new Error('Sesión no disponible.');
  const {data:{session}} = await sb.auth.getSession();
  if (!session?.access_token) throw new Error('Tu sesión expiró. Vuelve a ingresar.');
  return {token:session.access_token,headers:{'Content-Type':'application/json','Authorization':'Bearer ' + session.access_token}};
}
"""
if old not in s:
    raise SystemExit('Expected compact bridge auth block not found')
s=s.replace(old,new)
s=s.replace("const response = await fetch(BRIDGE_URL, {method:'POST',headers:await authHeaders(),body:JSON.stringify(bridgePayload('download'))});", "const auth = await bridgeAuth();\n    const response = await fetch(BRIDGE_URL, {method:'POST',headers:auth.headers,body:JSON.stringify(bridgePayload('download',auth.token))});")
s=s.replace("const response = await fetch(BRIDGE_URL, {method:'POST',headers:await authHeaders(),body:JSON.stringify(bridgePayload('publish'))});", "const auth = await bridgeAuth();\n    const response = await fetch(BRIDGE_URL, {method:'POST',headers:auth.headers,body:JSON.stringify(bridgePayload('publish',auth.token))});")
p.write_text(s,encoding='utf-8')

from pathlib import Path

path = Path('app.js')
text = path.read_text(encoding='utf-8')

MARKER = '// H5P_VIEWER_DYNAMIC_DEPS_V1'
if MARKER in text:
    print('Dynamic dependency patch already present')
    raise SystemExit(0)

anchor = "\nasync function cacheH5pPackage(blob, onProgress=()=>{}) {"
if anchor not in text:
    raise SystemExit('cacheH5pPackage anchor not found')

helper = r'''

// H5P_VIEWER_DYNAMIC_DEPS_V1 — resolve content libraries that platforms such as Moodle
// can load from their installed registry but h5p-standalone needs declared in h5p.json.
function h5pParseLibraryRef(value) {
  const match=String(value || '').trim().match(/^([A-Za-z0-9_.-]+)\s+(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  return {
    machineName:match[1],
    majorVersion:Number(match[2]),
    minorVersion:Number(match[3])
  };
}

function h5pCollectContentLibraryRefs(value, found=new Map(), seen=new WeakSet()) {
  if (!value || typeof value!=='object') return found;
  if (seen.has(value)) return found;
  seen.add(value);

  if (!Array.isArray(value)) {
    const ref=h5pParseLibraryRef(value.library);
    if (ref) {
      const key=`${ref.machineName}@${ref.majorVersion}.${ref.minorVersion}`;
      found.set(key,ref);
    }
  }

  const children=Array.isArray(value) ? value : Object.values(value);
  for (const child of children) h5pCollectContentLibraryRefs(child,found,seen);
  return found;
}

function h5pAugmentManifestForStandalone(h5pJson, contentJson, pathSet) {
  const manifest={
    ...h5pJson,
    preloadedDependencies:Array.isArray(h5pJson?.preloadedDependencies)
      ? h5pJson.preloadedDependencies.map(dep=>({...dep}))
      : []
  };

  const existing=new Set();
  for (const dep of manifest.preloadedDependencies) {
    if (!dep?.machineName || dep.majorVersion===undefined || dep.minorVersion===undefined) continue;
    existing.add(`${dep.machineName}@${Number(dep.majorVersion)}.${Number(dep.minorVersion)}`);
  }

  const refs=h5pCollectContentLibraryRefs(contentJson);
  const unavailable=[];
  let added=0;

  for (const [key,ref] of refs) {
    if (existing.has(key)) continue;
    const libraryJson=`${ref.machineName}-${ref.majorVersion}.${ref.minorVersion}/library.json`;
    if (!pathSet.has(libraryJson)) {
      unavailable.push(`${ref.machineName} ${ref.majorVersion}.${ref.minorVersion}`);
      continue;
    }
    manifest.preloadedDependencies.push({...ref});
    existing.add(key);
    added++;
  }

  if (unavailable.length) {
    throw new Error(
      'Este H5P usa librerías internas que no vienen dentro del archivo: ' +
      [...new Set(unavailable)].join(', ') +
      '. Moodle puede tenerlas instaladas, pero el visor autónomo necesita que estén incluidas en el paquete.'
    );
  }

  return {manifest,added,detected:refs.size};
}
'''

text = text.replace(anchor, helper + anchor, 1)

old = """  const pathSet=new Set(normalized.map(x=>x.relative));\n  for (const dep of (h5pJson.preloadedDependencies || [])) {"""
new = """  const pathSet=new Set(normalized.map(x=>x.relative));\n  const dependencyResolution=h5pAugmentManifestForStandalone(h5pJson,contentJson,pathSet);\n  h5pJson=dependencyResolution.manifest;\n  for (const dep of (h5pJson.preloadedDependencies || [])) {"""
if old not in text:
    raise SystemExit('pathSet dependency validation anchor not found')
text = text.replace(old,new,1)

old = """  try {\n    for (let i=0;i<normalized.length;i+=8) await Promise.all(normalized.slice(i,i+8).map(processOne));\n  } catch (error) {"""
new = """  try {\n    for (let i=0;i<normalized.length;i+=8) await Promise.all(normalized.slice(i,i+8).map(processOne));\n\n    // Cache a viewer-only manifest with dynamic content dependencies included.\n    // The original .h5p Blob is never modified.\n    const manifestText=JSON.stringify(h5pJson);\n    const manifestBytes=new TextEncoder().encode(manifestText);\n    const manifestUrl=location.origin+basePath+'/'+h5pEncodedPath('h5p.json');\n    await cache.put(\n      new Request(manifestUrl),\n      new Response(manifestBytes,{headers:{\n        'Content-Type':'application/json; charset=utf-8',\n        'Content-Length':String(manifestBytes.byteLength),\n        'Cache-Control':'no-store'\n      }})\n    );\n  } catch (error) {"""
if old not in text:
    raise SystemExit('cache write anchor not found')
text = text.replace(old,new,1)

old = """  return {basePath, mainLibrary:String(h5pJson.mainLibrary), files:normalized.length, extractedBytes:extracted, h5pJson};"""
new = """  return {\n    basePath,\n    mainLibrary:String(h5pJson.mainLibrary),\n    files:normalized.length,\n    extractedBytes:extracted,\n    h5pJson,\n    dynamicDependenciesAdded:dependencyResolution.added\n  };"""
if old not in text:
    raise SystemExit('return anchor not found')
text = text.replace(old,new,1)

old = """    $('h5pLocalViewerMeta').textContent=`✓ Reproducción iniciada · ${ready.mainLibrary || info.mainLibrary} · ${info.files} archivos · ${Math.max(1,Math.round(info.extractedBytes/1024))} KB descomprimidos. Prueba botones, respuestas, imágenes y retroalimentación.`;"""
new = """    const dependencyNote=info.dynamicDependenciesAdded ? ` · ${info.dynamicDependenciesAdded} dependencias internas resueltas` : '';\n    $('h5pLocalViewerMeta').textContent=`✓ Reproducción iniciada · ${ready.mainLibrary || info.mainLibrary} · ${info.files} archivos · ${Math.max(1,Math.round(info.extractedBytes/1024))} KB descomprimidos${dependencyNote}. Prueba botones, respuestas, imágenes y retroalimentación.`;"""
if old not in text:
    raise SystemExit('viewer meta anchor not found')
text = text.replace(old,new,1)

path.write_text(text,encoding='utf-8')
print('H5P dynamic dependency resolution applied')

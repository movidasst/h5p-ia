from pathlib import Path

path = Path('app.js')
text = path.read_text(encoding='utf-8')

MARKER = '// H5P_GENERATOR_MANIFEST_FINALIZER_V1'
if MARKER in text:
    print('Generated H5P manifest finalizer already present')
    raise SystemExit(0)

anchor = "\nasync function prepareValidatedH5pBlob() {"
if anchor not in text:
    raise SystemExit('prepareValidatedH5pBlob anchor not found')

helper = r'''

// H5P_GENERATOR_MANIFEST_FINALIZER_V1 — no generated package may leave the app
// until h5p.json declares every embedded content library actually used by content.json.
async function finalizeGeneratedH5pPackage(blob) {
  await assertH5pZipBlob(blob);
  await ensureH5pViewerRuntime();

  let zip;
  try {
    zip=await window.JSZip.loadAsync(blob,{checkCRC32:true,createFolders:false});
  } catch (_) {
    throw new Error('El paquete generado no se pudo reabrir para validar sus dependencias H5P.');
  }

  const root=findH5pZipRoot(zip);
  const h5pEntry=zip.file(root+'h5p.json');
  const contentEntry=zip.file(root+'content/content.json');
  if (!h5pEntry || !contentEntry) throw new Error('El paquete generado no contiene h5p.json y content/content.json en la estructura esperada.');

  let h5pJson,contentJson;
  try { h5pJson=JSON.parse(await h5pEntry.async('string')); }
  catch (_) { throw new Error('El h5p.json generado no contiene JSON válido.'); }
  try { contentJson=JSON.parse(await contentEntry.async('string')); }
  catch (_) { throw new Error('El content/content.json generado no contiene JSON válido.'); }

  const packagePaths=new Set(
    Object.keys(zip.files)
      .filter(name=>!zip.files[name].dir && name.startsWith(root))
      .map(name=>h5pSafeZipPath(name.slice(root.length)))
  );

  const resolution=h5pAugmentManifestForStandalone(h5pJson,contentJson,packagePaths);
  const manifestText=JSON.stringify(resolution.manifest,null,2)+'\n';
  zip.file(root+'h5p.json',manifestText);

  let finalBlob;
  try {
    finalBlob=await zip.generateAsync({
      type:'blob',
      mimeType:'application/zip',
      compression:'DEFLATE',
      compressionOptions:{level:6},
      platform:'DOS'
    });
  } catch (_) {
    throw new Error('No se pudo cerrar el paquete H5P después de corregir su manifiesto.');
  }

  await assertH5pZipBlob(finalBlob);

  // Segunda lectura obligatoria: el archivo final que verá el usuario debe quedar
  // autocontenido y no requerir otra reparación del manifiesto.
  let verifyZip;
  try {
    verifyZip=await window.JSZip.loadAsync(finalBlob,{checkCRC32:true,createFolders:false});
  } catch (_) {
    throw new Error('La validación final del paquete H5P recompuesto falló.');
  }
  const verifyRoot=findH5pZipRoot(verifyZip);
  let verifyManifest,verifyContent;
  try { verifyManifest=JSON.parse(await verifyZip.file(verifyRoot+'h5p.json').async('string')); }
  catch (_) { throw new Error('El h5p.json final no pudo volver a leerse.'); }
  try { verifyContent=JSON.parse(await verifyZip.file(verifyRoot+'content/content.json').async('string')); }
  catch (_) { throw new Error('El content/content.json final no pudo volver a leerse.'); }

  const verifyPaths=new Set(
    Object.keys(verifyZip.files)
      .filter(name=>!verifyZip.files[name].dir && name.startsWith(verifyRoot))
      .map(name=>h5pSafeZipPath(name.slice(verifyRoot.length)))
  );
  const verifyResolution=h5pAugmentManifestForStandalone(verifyManifest,verifyContent,verifyPaths);
  if (verifyResolution.added!==0) {
    throw new Error('El paquete H5P final todavía tiene dependencias sin declarar y no será entregado.');
  }

  return {
    blob:finalBlob,
    added:resolution.added,
    dependencies:verifyManifest.preloadedDependencies || []
  };
}
'''

text = text.replace(anchor, helper + anchor, 1)

old = """  const blob=await response.blob();\n  await assertH5pZipBlob(blob);"""
new = """  const rawBlob=await response.blob();\n  const finalized=await finalizeGeneratedH5pPackage(rawBlob);\n  const blob=finalized.blob;\n  await assertH5pZipBlob(blob);"""
if old not in text:
    raise SystemExit('raw package anchor not found')
text = text.replace(old,new,1)

old = """  lastValidatedH5p={blob,filename,fingerprint};"""
new = """  lastValidatedH5p={\n    blob,\n    filename,\n    fingerprint,\n    manifestDependenciesAdded:finalized.added,\n    manifestDependencies:finalized.dependencies\n  };"""
if old not in text:
    raise SystemExit('lastValidatedH5p anchor not found')
text = text.replace(old,new,1)

path.write_text(text,encoding='utf-8')
print('Generated H5P manifest finalizer applied')

from pathlib import Path
p=Path('app.js')
s=p.read_text(encoding='utf-8')
old="""async function createProposal() {
  const button = $('proposalBtn');
  showStatus($('proposalStatus'), '');
  $('proposalPanel').hidden = true;
  $('resultPanel').hidden = true;
  clearAssetUploads();
  try {
    const prompt = proposalPrompt();
    setBusy(button, true, 'Pensando una propuesta…');
    showStatus($('proposalStatus'), 'La IA está diseñando una propuesta. Todavía no se está creando el H5P.');
    const rec = await callGemini(prompt);
    if (!rec || typeof rec !== 'object') throw new Error('Propuesta inválida.');
    const recommended = findLatest(rec.machineName);
    if (!recommended) throw new Error('La IA propuso una actividad que no está instalada en Moodle.');
    if ($('library').value !== '__AUTO__' && rec.machineName !== $('library').value) {
      throw new Error('La IA cambió el tipo de actividad solicitado. Vuelve a intentar.');
    }
    const normalizedAssets=normalizeAssetSpecs(rec.assets,rec);
    const makeProposal=()=>({
      machineName: rec.machineName,
      title: String(rec.title || recommended.title || 'Actividad H5P'),
      objective: String(rec.objective || ''),
      summary: String(rec.summary || ''),
      structure: Array.isArray(rec.structure) ? rec.structure.map(String).slice(0,8) : [],
      assets: normalizedAssets,
      needsMedia: normalizedAssets.length>0,
      mediaNote: String(rec.mediaNote || '')
    });
    selectedLibrary = recommended;
    proposal = makeProposal();
    if ($('library').value === '__AUTO__') {
      $('library').value = proposal.machineName;
      onLibraryChange();
      proposal = makeProposal();
      selectedLibrary = recommended;
    }
    renderProposal();
"""
new="""async function createProposal(event) {
  const button = event?.currentTarget?.id === 'anotherBtn' ? $('anotherBtn') : $('proposalBtn');
  const requestedChoice = $('library').value;
  showStatus($('proposalStatus'), '');
  $('proposalPanel').hidden = true;
  $('resultPanel').hidden = true;
  clearAssetUploads();
  try {
    const prompt = proposalPrompt();
    setBusy(button, true, 'Pensando una propuesta…');
    showStatus($('proposalStatus'), 'La IA está diseñando una propuesta. Todavía no se está creando el H5P.');
    const rec = await callGemini(prompt);
    if ($('library').value !== requestedChoice) {
      throw new Error('Cambiaste el tipo de actividad mientras la IA preparaba la propuesta. Pulsa de nuevo Ver propuesta.');
    }
    if (!rec || typeof rec !== 'object') throw new Error('Propuesta inválida.');
    const recommended = findLatest(rec.machineName);
    if (!recommended) throw new Error('La IA propuso una actividad que no está instalada en Moodle.');
    if (requestedChoice !== '__AUTO__' && rec.machineName !== requestedChoice) {
      throw new Error('La IA cambió el tipo de actividad solicitado. Vuelve a intentar.');
    }
    const normalizedAssets=normalizeAssetSpecs(rec.assets,rec);
    const makeProposal=()=>({
      machineName: rec.machineName,
      title: String(rec.title || recommended.title || 'Actividad H5P'),
      objective: String(rec.objective || ''),
      summary: String(rec.summary || ''),
      structure: Array.isArray(rec.structure) ? rec.structure.map(String).slice(0,8) : [],
      assets: normalizedAssets,
      needsMedia: normalizedAssets.length>0,
      mediaNote: String(rec.mediaNote || '')
    });
    selectedLibrary = recommended;
    proposal = makeProposal();
    if (requestedChoice === '__AUTO__') {
      const meta = friendlyMeta(recommended);
      $('libraryInfo').hidden = false;
      $('libraryInfoTitle').textContent = `✨ La IA propone: ${friendlyName(recommended)}`;
      $('libraryInfoDescription').textContent = `Qué hace: ${meta.description}`;
      $('libraryInfoMeta').textContent = 'El selector sigue en modo automático. Puedes pulsar Proponer otra sin quedar atado a esta actividad.';
    }
    renderProposal();
"""
if old not in s:
    raise SystemExit('Target createProposal block not found')
s=s.replace(old,new)
p.write_text(s,encoding='utf-8')

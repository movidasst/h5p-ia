from pathlib import Path

catalog = Path('catalog-h5p.js')
app = Path('app.js')

catalog_text = catalog.read_text(encoding='utf-8')
app_text = app.read_text(encoding='utf-8')

names_block = r'''
window.H5P_NAMES_ES={
'H5P.Accordion':'Acordeón',
'H5P.AdventCalendar':'Calendario de retos',
'H5P.Agamotto':'Secuencia progresiva de imágenes',
'H5P.ARScavenger':'Búsqueda con realidad aumentada',
'H5P.ArithmeticQuiz':'Quiz de cálculo',
'H5P.Audio':'Audio',
'H5P.AudioRecorder':'Grabadora de audio',
'H5P.BranchingScenario':'Escenario ramificado',
'H5P.Chart':'Gráfico',
'H5P.Collage':'Collage de imágenes',
'H5P.Column':'Página de contenidos',
'H5P.Cornell':'Notas Cornell',
'H5P.CoursePresentation':'Presentación interactiva',
'H5P.Crossword':'Crucigrama',
'H5P.Dialogcards':'Tarjetas de diálogo',
'H5P.Dictation':'Dictado',
'H5P.DocumentationTool':'Herramienta de documentación',
'H5P.DragQuestion':'Arrastrar y soltar',
'H5P.DragText':'Arrastrar palabras',
'H5P.Essay':'Respuesta abierta',
'H5P.Blanks':'Completar espacios',
'H5P.FindMultipleHotspots':'Encontrar varios puntos en una imagen',
'H5P.ImageHotspotQuestion':'Encontrar un punto en una imagen',
'H5P.FindTheWords':'Sopa de letras',
'H5P.Flashcards':'Tarjetas de estudio',
'H5P.GameMap':'Mapa de juego',
'H5P.GuessTheAnswer':'Adivina la respuesta',
'H5P.IFrameEmbed':'Recurso web incrustado',
'H5P.ImageHotspots':'Puntos interactivos en una imagen',
'H5P.ImageJuxtaposition':'Comparar dos imágenes',
'H5P.ImagePair':'Emparejar imágenes',
'H5P.ImageSequencing':'Ordenar imágenes',
'H5P.ImageSlider':'Galería de imágenes',
'H5P.InformationWall':'Muro de información',
'H5P.InteractiveBook':'Libro interactivo',
'H5P.InteractiveVideo':'Video interactivo',
'H5P.KewArCode':'Código QR',
'H5P.MarkTheWords':'Marcar palabras',
'H5P.MemoryGame':'Juego de memoria',
'H5P.MultiMediaChoice':'Elección multimedia',
'H5P.MultiChoice':'Opción múltiple',
'H5P.PersonalityQuiz':'Quiz de perfil',
'H5P.QuestionSet':'Conjunto de preguntas',
'H5P.Questionnaire':'Cuestionario / encuesta',
'H5P.SingleChoiceSet':'Preguntas de respuesta única',
'H5P.SortParagraphs':'Ordenar párrafos',
'H5P.SpeakTheWords':'Responder con la voz',
'H5P.SpeakTheWordsSet':'Serie de respuestas con voz',
'H5P.StructureStrip':'Estructura guiada',
'H5P.Summary':'Construir un resumen',
'H5P.Timeline':'Línea de tiempo',
'H5P.TrueFalse':'Verdadero o falso',
'H5P.TwitterUserFeed':'Feed de X / Twitter',
'H5P.VirtualTour':'Recorrido virtual 360°'
};
'''

anchor = "window.H5P_CATALOG_FALLBACK=(lib)=>({description:'Actividad H5P instalada en tu Moodle."
if 'window.H5P_NAMES_ES=' not in catalog_text:
    if anchor not in catalog_text:
        raise SystemExit('Catalog anchor not found')
    catalog_text = catalog_text.replace(anchor, names_block + anchor)

old = "function shortMachine(machineName) { return String(machineName || '').replace(/^H5P\\./,''); }"
new = """function shortMachine(machineName) { return String(machineName || '').replace(/^H5P\\./,''); }\nfunction friendlyName(lib) {\n  return window.H5P_NAMES_ES?.[lib?.machineName] || lib?.title || lib?.machineName || 'Actividad H5P';\n}\nfunction optionLabel(lib) {\n  const es = friendlyName(lib);\n  const original = lib?.title || lib?.machineName || '';\n  return original && original !== es ? `${es} (${original})` : es;\n}"""
if old not in app_text:
    raise SystemExit('shortMachine anchor not found')
app_text = app_text.replace(old, new)

app_text = app_text.replace("matches.sort((a,b)=>(a.title||a.machineName).localeCompare(b.title||b.machineName,'es'));",
                            "matches.sort((a,b)=>friendlyName(a).localeCompare(friendlyName(b),'es'));", 1)
app_text = app_text.replace("option.textContent = lib.title || lib.machineName;",
                            "option.textContent = optionLabel(lib);", 1)
app_text = app_text.replace("const remaining = libs.filter(lib => !used.has(lib.machineName)).sort((a,b)=>(a.title||a.machineName).localeCompare(b.title||b.machineName,'es'));",
                            "const remaining = libs.filter(lib => !used.has(lib.machineName)).sort((a,b)=>friendlyName(a).localeCompare(friendlyName(b),'es'));", 1)
app_text = app_text.replace("option.textContent = lib.title || lib.machineName;",
                            "option.textContent = optionLabel(lib);", 1)

old_info = """  $('libraryInfoTitle').textContent = selectedLibrary.title || selectedLibrary.machineName;\n  $('libraryInfoDescription').textContent = meta.description;\n  $('libraryInfoMeta').textContent = `Ideal para: ${meta.ideal} · Móvil: ${meta.mobile}`;"""
new_info = """  $('libraryInfoTitle').textContent = friendlyName(selectedLibrary);\n  $('libraryInfoDescription').textContent = `Qué hace: ${meta.description}`;\n  $('libraryInfoMeta').textContent = `Ideal para: ${meta.ideal} · El participante: ${meta.participant} · Nombre H5P: ${selectedLibrary.title || selectedLibrary.machineName}`;"""
if old_info not in app_text:
    raise SystemExit('library info block not found')
app_text = app_text.replace(old_info, new_info)

app_text = app_text.replace("return {machineName:lib.machineName,title:lib.title,description:meta.description,ideal:meta.ideal,mobile:meta.mobile};",
                            "return {machineName:lib.machineName,title:friendlyName(lib),technicalTitle:lib.title,description:meta.description,ideal:meta.ideal,mobile:meta.mobile};")
app_text = app_text.replace("$('proposalType').textContent = selectedLibrary.title || proposal.machineName;",
                            "$('proposalType').textContent = friendlyName(selectedLibrary);")

catalog.write_text(catalog_text, encoding='utf-8')
app.write_text(app_text, encoding='utf-8')

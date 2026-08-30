from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')

if 'id="activityChooser"' not in s:
    marker = '        <div id="recommendBox" class="recommend-box" hidden>'
    html = '''        <div id="activityChooser" class="activity-chooser">
          <div class="activity-toolbar">
            <div class="field"><label for="activitySearch">Buscar actividad H5P</label><input id="activitySearch" class="control" type="search" placeholder="Ej. preguntas, imagen, video, arrastrar, escenario..."></div>
            <div id="activityCategories" class="category-row" aria-label="Categorías de actividades">
              <button class="category-btn active" data-category="all">Todas</button>
              <button class="category-btn" data-category="assessment">Evaluación</button>
              <button class="category-btn" data-category="visual">Imagen y visual</button>
              <button class="category-btn" data-category="content">Contenido</button>
              <button class="category-btn" data-category="multimedia">Multimedia</button>
              <button class="category-btn" data-category="gamification">Juegos</button>
              <button class="category-btn" data-category="scenario">Escenarios</button>
              <button class="category-btn" data-category="specialized">Especializadas</button>
            </div>
            <div id="activityCount" class="activity-count">Cargando catálogo...</div>
          </div>
          <div id="activityGrid" class="activity-grid"></div>
          <div id="activityEmpty" class="activity-empty" hidden>No hay actividades que coincidan con la búsqueda.</div>
          <div id="selectedActivityStatus" class="selected-activity">Selecciona una tarjeta para elegir tu actividad H5P.</div>
        </div>

'''
    if marker not in s:
        raise SystemExit('No se encontró recommendBox')
    s = s.replace(marker, html + marker, 1)

if '.activity-chooser{' not in s:
    marker = '    @media(min-width:820px)'
    css = '''    .activity-chooser{margin:14px 0 16px;padding:14px;border:1px solid var(--line);border-radius:18px;background:#f8fbfc}.activity-toolbar{display:grid;gap:10px}.category-row{display:flex;gap:7px;overflow-x:auto;padding:2px 0 5px;scrollbar-width:thin}.category-btn{flex:0 0 auto;border:1px solid var(--line);background:#fff;color:#587082;border-radius:999px;padding:8px 11px;font-size:.76rem;font-weight:850}.category-btn.active{background:var(--navy);border-color:var(--navy);color:#fff}.activity-count{font-size:.76rem;color:var(--muted);font-weight:800}.activity-grid{display:grid;grid-template-columns:1fr;gap:10px;margin-top:11px}.activity-card{position:relative;text-align:left;border:1px solid #dbe6ec;background:#fff;border-radius:16px;padding:14px;transition:.16s;min-width:0}.activity-card:hover{border-color:#99cdd1;box-shadow:0 8px 22px rgba(0,32,91,.08);transform:translateY(-1px)}.activity-card.selected{border:2px solid var(--teal);background:#f0fbfb;box-shadow:0 0 0 3px rgba(0,123,133,.08)}.activity-card-head{display:flex;align-items:flex-start;gap:9px}.activity-icon{width:38px;height:38px;flex:0 0 38px;border-radius:12px;display:grid;place-items:center;background:#e9f6f5;color:var(--teal);font-size:1.05rem;font-weight:900}.activity-card h4{margin:0;color:var(--navy);font-size:.94rem;line-height:1.2}.activity-machine{margin-top:3px;color:#78909f;font-size:.66rem;font-weight:750;word-break:break-all}.activity-card p{margin:9px 0 0;color:#51697b;font-size:.78rem;line-height:1.43}.activity-card-foot{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:11px}.activity-tag{display:inline-flex;align-items:center;padding:4px 7px;border-radius:999px;background:#eef4f7;color:#536f81;font-size:.64rem;font-weight:850}.activity-tag.installed{background:#eaf7e5;color:#4c7c32}.activity-tag.mobile{background:#e7f5f6;color:#006871}.activity-select{margin-left:auto;border:0;border-radius:9px;padding:7px 9px;background:var(--teal);color:#fff;font-size:.7rem;font-weight:900}.activity-card.selected .activity-select{background:var(--navy)}.selected-activity{margin:11px 0 0;padding:11px 12px;border-radius:13px;background:#fff8e5;border:1px solid #f1dc98;color:#725300;font-size:.8rem;font-weight:750}.selected-activity.ok{background:#edf9ef;border-color:#cce9cd;color:#356f38}.activity-empty{padding:22px 10px;text-align:center;color:var(--muted);font-size:.82rem}
    @media(min-width:620px){.activity-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
'''
    if marker not in s:
        raise SystemExit('No se encontró media query principal')
    s = s.replace(marker, css + marker, 1)

if '<script src="./activity-gallery.js"></script>' not in s:
    marker = '<script src="./app.js"></script>'
    if marker not in s:
        raise SystemExit('No se encontró app.js')
    s = s.replace(marker, marker + '\n<script src="./activity-gallery.js"></script>', 1)

p.write_text(s, encoding='utf-8')
print('GALLERY_PATCH_OK')

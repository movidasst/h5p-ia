(() => {
  'use strict';

  const BRAND = {
    name: 'Academia Movida SST',
    slogan: 'De la Reacción a la Prevención',
    web: 'www.movidasst.com',
    author: 'David Linares Brea',
    email: 'info@movidasst.com'
  };

  const PROPOSAL_RULE = `[BRANDING_AUTOMATICO_MOVIDA_SST]\nREGLA INSTITUCIONAL PARA LA PROPUESTA:\n- El título debe comenzar exactamente con: Academia Movida SST ·\n- Mantén el título breve después del prefijo.\n- En el resumen menciona una sola vez: De la Reacción a la Prevención · www.movidasst.com · Elaborado por David Linares Brea · info@movidasst.com.\n- No solicites imágenes ni otros recursos únicamente para branding.\n- No inventes campos H5P ni alteres la lógica pedagógica para insertar la marca.`;

  // Esta instrucción ayuda a la IA, pero el branding final ya no depende de que la IA la obedezca.
  const GENERATION_RULE = `[BRANDING_VISIBLE_MOVIDA_SST]\nCuando semantics lo permita, reserva un campo de texto visible para identificar la actividad como Academia Movida SST. No conviertas el branding en pregunta, respuesta ni puntuación.`;

  function brandedTitle(title) {
    const clean = String(title || '').trim();
    return clean.startsWith(BRAND.name) ? clean : `${BRAND.name} · ${clean || 'Actividad H5P'}`;
  }

  function brandHtml() {
    return `<p><strong>${BRAND.name}</strong><br>${BRAND.slogan}<br>${BRAND.web}<br>Elaborado por ${BRAND.author} · ${BRAND.email}</p>`;
  }

  function advancedTextNode() {
    return {
      params: { text: brandHtml() },
      library: 'H5P.AdvancedText 1.1',
      subContentId: crypto.randomUUID(),
      metadata: {
        contentType: 'Text',
        license: 'U',
        title: BRAND.name,
        authors: [],
        changes: []
      }
    };
  }

  function alreadyBranded(value) {
    try { return JSON.stringify(value).includes(BRAND.name); }
    catch (_) { return false; }
  }

  function prefixVisibleHtml(value) {
    const raw = String(value || '');
    if (raw.includes(BRAND.name)) return raw;
    return `${brandHtml()}${raw}`;
  }

  function applyDeterministicBranding(machineName, params) {
    if (!params || typeof params !== 'object' || Array.isArray(params)) return params;
    if (alreadyBranded(params)) return params;

    switch (machineName) {
      case 'H5P.Accordion': {
        if (!Array.isArray(params.panels)) params.panels = [];
        params.panels.unshift({
          title: `${BRAND.name} · ${BRAND.slogan}`,
          content: advancedTextNode()
        });
        return params;
      }

      case 'H5P.Column': {
        if (!Array.isArray(params.content)) params.content = [];
        params.content.unshift({
          content: advancedTextNode(),
          useSeparator: 'disabled'
        });
        return params;
      }

      case 'H5P.TrueFalse':
      case 'H5P.MultiChoice': {
        if (typeof params.question === 'string') params.question = prefixVisibleHtml(params.question);
        return params;
      }

      case 'H5P.MarkTheWords':
      case 'H5P.DragText': {
        if (typeof params.taskDescription === 'string') params.taskDescription = prefixVisibleHtml(params.taskDescription);
        return params;
      }

      case 'H5P.QuestionSet': {
        if (params.introPage && typeof params.introPage === 'object') {
          params.introPage.showIntroPage = true;
          params.introPage.introduction = prefixVisibleHtml(params.introPage.introduction || '');
        }
        return params;
      }

      default:
        return params;
    }
  }

  function currentMachineName() {
    const select = document.getElementById('library');
    const selected = String(select?.value || '');
    if (selected && selected !== '__AUTO__') return selected;

    const friendly = String(document.getElementById('proposalType')?.textContent || '').trim();
    const names = window.H5P_NAMES_ES || {};
    for (const [machineName, label] of Object.entries(names)) {
      if (String(label).trim() === friendly) return machineName;
    }
    return '';
  }

  function temporarilyAppendRule(rule) {
    const field = document.getElementById('instructions');
    if (!field || field.dataset.movidaBrandingInjected === '1') return;

    const original = field.value;
    const trimmed = original.trim();
    field.dataset.movidaBrandingInjected = '1';
    field.value = `${trimmed}${trimmed ? '\n\n' : ''}${rule}`;

    queueMicrotask(() => {
      field.value = original;
      delete field.dataset.movidaBrandingInjected;
    });
  }

  // El paquete que sale hacia Moodle se corrige de forma determinista.
  // Así la marca no depende de que Gemini decida incluirla o no.
  const originalFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    try {
      const url = typeof input === 'string' ? input : String(input?.url || '');
      if (url.includes('/local/h5pia/api.php') && init?.body && typeof init.body === 'string') {
        const payload = JSON.parse(init.body);
        if (payload && ['download', 'publish', 'preview'].includes(String(payload.action || '')) && payload.params) {
          const machineName = currentMachineName();
          payload.title = brandedTitle(payload.title);
          payload.params = applyDeterministicBranding(machineName, payload.params);
          init = { ...init, body: JSON.stringify(payload) };
        }
      }
    } catch (error) {
      console.warn('Branding H5P: no se pudo aplicar el postprocesado.', error);
    }
    return originalFetch(input, init);
  };

  function installBrandingNotice() {
    const integration = document.querySelector('.integration');
    if (!integration || document.getElementById('movidaBrandingNotice')) return;

    const notice = document.createElement('div');
    notice.id = 'movidaBrandingNotice';
    notice.setAttribute('role', 'note');
    notice.style.cssText = 'display:flex;gap:8px;align-items:flex-start;margin:0 0 12px;padding:10px 12px;border:1px solid #d6e9eb;border-radius:14px;background:#f4fbfb;color:#52697a;font-size:.76rem;line-height:1.45';
    notice.innerHTML = '<span aria-hidden="true" style="font-weight:900;color:#007b85">✓</span><span><strong style="color:#00205b">Branding determinista activo</strong><br>Academia Movida SST · De la Reacción a la Prevención · www.movidasst.com · Elaborado por David Linares Brea · info@movidasst.com</span>';
    integration.insertAdjacentElement('afterend', notice);
  }

  function enablePublishButton() {
    const button = document.getElementById('publishBtn');
    if (!button) return;
    button.hidden = false;
    button.textContent = '↗ Publicar en Banco de contenido';
  }

  document.addEventListener('click', event => {
    const target = event.target?.closest?.('#proposalBtn, #anotherBtn, #confirmBtn');
    if (!target) return;
    temporarilyAppendRule(target.id === 'confirmBtn' ? GENERATION_RULE : PROPOSAL_RULE);
  }, true);

  // app.js oculta el botón durante boot(). Lo mostramos justo después de que
  // todos los listeners de autenticación hayan terminado, sin alterar app.js.
  window.addEventListener('h5p-auth-ready', () => {
    setTimeout(enablePublishButton, 0);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installBrandingNotice, {once:true});
  } else {
    installBrandingNotice();
  }
})();

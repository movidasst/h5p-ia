(() => {
  'use strict';

  const BRANDING_MARKER = '[BRANDING_AUTOMATICO_MOVIDA_SST]';
  const BRANDING_RULE = `${BRANDING_MARKER}
BRANDING INSTITUCIONAL OBLIGATORIO:
- Esta actividad pertenece a Academia Movida SST.
- Identificación institucional: Academia Movida SST.
- Eslogan: De la Reacción a la Prevención.
- Web: www.movidasst.com.
- Crédito obligatorio cuando la estructura H5P lo permita: Elaborado por David Linares Brea · info@movidasst.com.
- El título de la propuesta debe comenzar exactamente con: Academia Movida SST ·
- Mantén el título breve después del prefijo institucional.
- Aplica el branding de forma discreta, profesional, legible y mobile-first; no repitas la marca en cada pregunta.
- Cuando semantics permita campos de introducción, descripción, texto, portada, cierre, caption o equivalente, incluye una identificación breve de Academia Movida SST y, preferentemente en el cierre, el crédito: Elaborado por David Linares Brea · info@movidasst.com.
- Si la librería no dispone de un campo seguro para mostrar branding dentro del contenido, NO inventes campos ni rompas semantics: conserva al menos la identificación en el título del H5P.
- No modifiques respuestas correctas, puntuaciones, retroalimentación, rutas de decisión ni funcionamiento interactivo para insertar branding.
- No conviertas el branding en contenido evaluable.
- Respeta exactamente los campos y tipos definidos por semantics.`;

  function withAutomaticBranding() {
    const field = document.getElementById('instructions');
    if (!field || field.dataset.movidaBrandingInjected === '1') return;

    const original = field.value;
    const trimmed = original.trim();
    field.dataset.movidaBrandingInjected = '1';
    field.value = `${trimmed}${trimmed ? '\n\n' : ''}${BRANDING_RULE}`;

    queueMicrotask(() => {
      field.value = original;
      delete field.dataset.movidaBrandingInjected;
    });
  }

  function installBrandingNotice() {
    const integration = document.querySelector('.integration');
    if (!integration || document.getElementById('movidaBrandingNotice')) return;

    const notice = document.createElement('div');
    notice.id = 'movidaBrandingNotice';
    notice.setAttribute('role', 'note');
    notice.style.cssText = 'display:flex;gap:8px;align-items:flex-start;margin:0 0 12px;padding:10px 12px;border:1px solid #d6e9eb;border-radius:14px;background:#f4fbfb;color:#52697a;font-size:.76rem;line-height:1.45';
    notice.innerHTML = '<span aria-hidden="true" style="font-weight:900;color:#007b85">✓</span><span><strong style="color:#00205b">Branding automático activo</strong><br>Academia Movida SST · De la Reacción a la Prevención · Elaborado por David Linares Brea · info@movidasst.com</span>';
    integration.insertAdjacentElement('afterend', notice);
  }

  document.addEventListener('click', event => {
    const target = event.target?.closest?.('#proposalBtn, #anotherBtn, #confirmBtn');
    if (!target) return;
    withAutomaticBranding();
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installBrandingNotice, {once:true});
  } else {
    installBrandingNotice();
  }
})();

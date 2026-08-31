(() => {
  'use strict';

  // Branding seguro: solo condiciona la PROPUESTA.
  // No toca el prompt técnico de construcción del H5P ni el botón Confirmar y crear.
  const BRANDING_RULE = `[BRANDING_AUTOMATICO_MOVIDA_SST]
REGLA INSTITUCIONAL PARA LA PROPUESTA:
- El título debe comenzar exactamente con: Academia Movida SST ·
- Mantén el título breve después del prefijo.
- En el resumen menciona una sola vez: De la Reacción a la Prevención · www.movidasst.com · Elaborado por David Linares Brea · info@movidasst.com.
- No solicites imágenes ni otros recursos únicamente para branding.
- No inventes campos H5P ni alteres la lógica pedagógica para insertar la marca.`;

  function withProposalBranding() {
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
    notice.innerHTML = '<span aria-hidden="true" style="font-weight:900;color:#007b85">✓</span><span><strong style="color:#00205b">Branding automático seguro</strong><br>Academia Movida SST · De la Reacción a la Prevención · Elaborado por David Linares Brea · info@movidasst.com</span>';
    integration.insertAdjacentElement('afterend', notice);
  }

  document.addEventListener('click', event => {
    const target = event.target?.closest?.('#proposalBtn, #anotherBtn');
    if (!target) return;
    withProposalBranding();
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installBrandingNotice, {once:true});
  } else {
    installBrandingNotice();
  }
})();

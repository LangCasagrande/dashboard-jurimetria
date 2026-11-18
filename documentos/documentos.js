// Interface do gerador de documentos.
(function () {
  const { MODELOS } = window.Modelos, { esc, store, download } = window.LT;
  const $ = id => document.getElementById(id);
  const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  $('modelo').innerHTML = MODELOS.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join('');
  const params = new URLSearchParams(location.search);
  const inicial = MODELOS.some(m => m.id === params.get('modelo')) ? params.get('modelo') : store.get('doc:modelo', MODELOS[0].id);
  $('modelo').value = MODELOS.some(m => m.id === inicial) ? inicial : MODELOS[0].id;

  const modeloAtual = () => MODELOS.find(m => m.id === $('modelo').value);
  const chave = m => `doc:valores:${m.id}`;

  function defaults(m) {
    const f = {};
    m.campos.forEach(c => { if (c.def !== undefined) f[c.id] = c.def === 'hoje' ? hoje() : c.def; });
    return f;
  }

  function campoHtml(c, val) {
    const id = `f_${c.id}`;
    const hint = c.hint ? ` <span class="hint">(${esc(c.hint)})</span>` : '';
    if (c.type === 'checkbox') return `<label class="check"><input type="checkbox" id="${id}" data-campo="${c.id}"${val ? ' checked' : ''}> ${esc(c.label)}</label>`;
    if (c.type === 'textarea') return `<label for="${id}">${esc(c.label)}${hint}</label><textarea id="${id}" data-campo="${c.id}" rows="3">${esc(val || '')}</textarea>`;
    if (c.type === 'select') return `<label for="${id}">${esc(c.label)}</label><select id="${id}" data-campo="${c.id}">${c.options.map(([v, l]) => `<option value="${v}"${v === val ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const type = c.type === 'number' ? 'number" step="any" min="0' : c.type === 'date' ? 'date' : 'text';
    return `<label for="${id}">${esc(c.label)}${hint}</label><input type="${type}" id="${id}" data-campo="${c.id}" value="${esc(val ?? '')}">`;
  }

  function montarFormulario() {
    const m = modeloAtual();
    const valores = { ...defaults(m), ...store.get(chave(m), {}) };
    const grupos = new Map();
    m.campos.forEach(c => { if (!grupos.has(c.group)) grupos.set(c.group, []); grupos.get(c.group).push(c); });
    $('campos').innerHTML = [...grupos].map(([g, cs]) => `<fieldset><legend>${esc(g)}</legend>${cs.map(c => campoHtml(c, valores[c.id])).join('')}</fieldset>`).join('');
    $('base').textContent = `Base legal: ${m.base}`;
    store.set('doc:modelo', m.id);
    renderizar();
  }

  function lerValores() {
    const f = {};
    document.querySelectorAll('[data-campo]').forEach(el => { f[el.dataset.campo] = el.type === 'checkbox' ? el.checked : el.value; });
    return f;
  }

  function renderizar() {
    const m = modeloAtual(), f = lerValores();
    $('doc').innerHTML = m.render(f);
    store.set(chave(m), f);
  }

  $('modelo').addEventListener('change', montarFormulario);
  $('campos').addEventListener('input', renderizar);
  $('campos').addEventListener('change', renderizar);
  $('limpar').addEventListener('click', () => { store.del(chave(modeloAtual())); montarFormulario(); });
  $('imprimir').addEventListener('click', () => window.print());

  $('word').addEventListener('click', () => {
    const m = modeloAtual();
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(m.nome)}</title>
<style>body{font-family:"Times New Roman",serif;font-size:12pt;line-height:1.5;text-align:justify}
h1{font-size:13pt;text-align:center}p{text-indent:2.5em;margin:0 0 10pt}p.right{text-align:right;text-indent:0}
.sign{margin:36pt auto 6pt;text-align:center}.sign .line{border-top:1px solid #000;width:260pt;margin:0 auto}.sign p{text-indent:0;text-align:center}
.ph{background:#fff3c4}</style></head><body>${$('doc').innerHTML}</body></html>`;
    download(`${m.id}.doc`, '﻿' + html, 'application/msword');
  });

  $('copiar').addEventListener('click', async () => {
    const texto = $('doc').innerText.replace(/\n{3,}/g, '\n\n');
    try { await navigator.clipboard.writeText(texto); $('copiar').textContent = 'Copiado!'; }
    catch { $('copiar').textContent = 'Não foi possível copiar'; }
    setTimeout(() => { $('copiar').textContent = 'Copiar texto'; }, 1800);
  });

  montarFormulario();
})();

// Interface do analisador de contratos: leitura de arquivos, regras locais e análise por IA.
import { client, baseParams, explainError, refusalMessage, mountKeyPanel, hasKey } from '../assets/js/ia.js';

const { esc } = window.LT;
const { analisar, norm } = window.RegrasContrato;
const $ = id => document.getElementById(id);
const NIVEL = { alto: ['bad', 'Risco alto'], medio: ['warn', 'Atenção'], baixo: ['', 'Baixo'], info: ['ok', 'Informativo'] };

mountKeyPanel($('ia-chave'));

// ---------- Leitura de arquivos (bibliotecas carregadas só quando necessário) ----------
function loadScript(src) {
  return new Promise((ok, fail) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => fail(new Error(`Falha ao carregar ${src}`));
    document.head.append(s);
  });
}
async function lerArquivo(file) {
  const nome = file.name.toLowerCase();
  if (nome.endsWith('.txt') || file.type === 'text/plain') return file.text();
  if (nome.endsWith('.docx')) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
    const r = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return r.value;
  }
  if (nome.endsWith('.pdf') || file.type === 'application/pdf') {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    const pdfjs = window.pdfjsLib;
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const paginas = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const c = await (await doc.getPage(i)).getTextContent();
      let linha = '', out = '';
      let ultimoY = null;
      for (const it of c.items) {
        const y = it.transform[5];
        if (ultimoY !== null && Math.abs(y - ultimoY) > 2) { out += linha.trim() + '\n'; linha = ''; }
        linha += it.str + (it.hasEOL ? '\n' : ' ');
        ultimoY = y;
      }
      paginas.push(out + linha.trim());
    }
    const texto = paginas.join('\n\n');
    if (texto.replace(/\s/g, '').length < 50) throw new Error('O PDF parece ser uma imagem escaneada, sem texto selecionável.');
    return texto;
  }
  throw new Error('Formato não suportado. Use .txt, .docx ou .pdf.');
}

$('arquivo').addEventListener('change', async () => {
  const f = $('arquivo').files[0];
  if (!f) return;
  $('status').innerHTML = '<span class="spinner"></span> Lendo arquivo...';
  try {
    $('texto').value = await lerArquivo(f);
    $('status').textContent = `${f.name} carregado.`;
    rodarRegras();
  } catch (e) {
    $('status').textContent = e.message;
  }
});

$('exemplo').addEventListener('click', () => { $('texto').value = window.CONTRATO_EXEMPLO; $('consumo').checked = true; rodarRegras(); });

// ---------- Destaque no texto ----------
function textoMarcado(texto, marcas) {
  const ordenadas = marcas.filter(m => m.ini >= 0).sort((a, b) => a.ini - b.ini);
  let html = '', pos = 0;
  for (const m of ordenadas) {
    if (m.ini < pos) continue; // ignora sobreposições
    html += esc(texto.slice(pos, m.ini));
    html += `<mark class="${m.nivel}" id="${m.id}" title="${esc(m.titulo)}">${esc(texto.slice(m.ini, m.fim))}</mark>`;
    pos = m.fim;
  }
  return html + esc(texto.slice(pos));
}
function irPara(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}
document.addEventListener('click', e => { const q = e.target.closest('blockquote[data-ir]'); if (q) irPara(q.dataset.ir); });

function gauge(nota) {
  const cor = nota >= 80 ? 'var(--ok)' : nota >= 55 ? 'var(--warn)' : 'var(--bad)';
  return `<div class="gauge" style="--v:${nota};--c:${cor}" role="img" aria-label="Nota ${nota} de 100"><span>${nota}</span></div>`;
}
function tag(nivel) { const [cls, label] = NIVEL[nivel] || NIVEL.info; return `<span class="tag ${cls}">${label}</span>`; }

// ---------- Análise por regras ----------
function rodarRegras() {
  const texto = $('texto').value;
  if (texto.trim().length < 40) { $('status').textContent = 'Cole um contrato com pelo menos algumas linhas.'; return; }
  const r = analisar(texto, { consumo: $('consumo').checked });
  const marcas = r.achados.map((a, i) => ({ ...a, id: `r-${i}` }));
  $('resultado').hidden = false;
  $('resultado').innerHTML = `
    <div class="grid grid-2">
      <div class="card">
        <h2>Nota de risco (regras)</h2>
        <div class="score">
          ${gauge(r.nota)}
          <div>
            <p style="font-size:1.2rem;font-weight:700;margin:0">${r.faixa}</p>
            <p class="muted" style="margin:.2rem 0 .6rem">${LT.fmtInt(r.palavras)} palavras analisadas · quanto maior a nota, menor o risco</p>
            <div class="counts">${['alto', 'medio', 'baixo', 'info'].map(n => `${tag(n)} <strong>${r.contagem[n]}</strong>`).join(' ')}</div>
          </div>
        </div>
      </div>
      <div class="card">
        <h2>Cláusulas que faltam</h2>
        ${r.ausencias.length ? `<ul>${r.ausencias.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : '<p class="muted">Nenhuma cláusula essencial ausente foi detectada.</p>'}
      </div>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <h2>Pontos encontrados (${r.achados.length})</h2>
        ${marcas.length ? marcas.map(a => `
          <article class="finding ${a.nivel}">
            <h3>${tag(a.nivel)} ${esc(a.titulo)}${a.ocorrencias > 1 ? ` <small class="muted">(${a.ocorrencias} trechos)</small>` : ''}</h3>
            <p style="margin:0">${esc(a.nota)}</p>
            <blockquote data-ir="${a.id}" title="Ver no texto">${esc(a.trecho.length > 280 ? a.trecho.slice(0, 280) + '…' : a.trecho)}</blockquote>
            <p class="meta"><strong>Fundamento:</strong> ${esc(a.base)}</p>
            ${a.positivo ? '' : `<p class="meta"><strong>Sugestão:</strong> ${esc(a.sugestao)}</p>`}
          </article>`).join('') : '<p class="muted">Nenhum ponto de atenção encontrado pelas regras.</p>'}
      </div>
      <div class="card">
        <h2>Texto com destaques</h2>
        <div class="marked" tabindex="0" role="region" aria-label="Texto do contrato com destaques">${textoMarcado(texto, marcas)}</div>
      </div>
    </div>`;
  $('status').textContent = '';
  $('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('analisar').addEventListener('click', rodarRegras);

// ---------- Análise por IA (Claude) ----------
const SCHEMA = {
  type: 'object',
  properties: {
    tipo_contrato: { type: 'string' },
    relacao_consumo: { type: 'boolean' },
    resumo: { type: 'string' },
    nota_risco: { type: 'integer', description: '0 = risco altíssimo, 100 = risco mínimo' },
    clausulas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          trecho: { type: 'string', description: 'Cópia literal e curta do texto do contrato' },
          tema: { type: 'string' },
          risco: { type: 'string', enum: ['alto', 'medio', 'baixo'] },
          explicacao: { type: 'string' },
          fundamento_legal: { type: 'string' },
          sugestao_redacao: { type: 'string' },
        },
        required: ['trecho', 'tema', 'risco', 'explicacao', 'fundamento_legal', 'sugestao_redacao'],
        additionalProperties: false,
      },
    },
    ausencias: { type: 'array', items: { type: 'string' } },
    recomendacoes: { type: 'array', items: { type: 'string' } },
  },
  required: ['tipo_contrato', 'relacao_consumo', 'resumo', 'nota_risco', 'clausulas', 'ausencias', 'recomendacoes'],
  additionalProperties: false,
};

const SYSTEM = `Você é um advogado brasileiro especialista em contratos, revisando um contrato para a parte mais vulnerável (o contratante/consumidor, salvo indicação contrária).
Analise o contrato à luz da legislação federal brasileira vigente (Código Civil, CDC, CPC, leis especiais) e da jurisprudência consolidada do STJ e do STF.
Regras:
- Aponte as cláusulas que trazem risco, desequilíbrio ou possível nulidade, da mais grave para a menos grave.
- "trecho" deve ser uma cópia literal e curta (até 300 caracteres) do texto do contrato, sem alterar nenhuma palavra.
- Em "fundamento_legal", cite apenas dispositivos que você tem certeza de que existem (lei, artigo, inciso). Se não tiver certeza do número, descreva a norma sem inventar número.
- "sugestao_redacao" deve ser uma redação alternativa pronta para substituir a cláusula.
- "ausencias": cláusulas importantes que faltam no contrato.
- Escreva em português do Brasil, em linguagem clara para quem não é advogado.`;

$('analisar-ia').addEventListener('click', async () => {
  const texto = $('texto').value.trim();
  if (texto.length < 40) { $('status').textContent = 'Cole um contrato antes de analisar.'; return; }
  if (!hasKey()) { $('status').textContent = 'Informe sua chave da API em "Configurar a IA".'; document.querySelector('details').open = true; return; }
  const btn = $('analisar-ia');
  btn.disabled = true;
  $('status').innerHTML = '<span class="spinner"></span> O Claude está lendo o contrato. Isso pode levar até um minuto...';
  try {
    const { client: c } = await client();
    const stream = c.beta.messages.stream({
      ...baseParams(),
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: `${$('consumo').checked ? 'A pessoa indicou que é uma relação de consumo.' : 'A pessoa indicou que NÃO é uma relação de consumo.'}\n\n<contrato>\n${texto}\n</contrato>`,
      }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw new Error(refusalMessage(msg));
    if (msg.stop_reason === 'max_tokens') throw new Error('A resposta ficou longa demais e foi cortada. Tente com um trecho menor do contrato.');
    const bloco = msg.content.find(b => b.type === 'text');
    if (!bloco) throw new Error('A resposta veio vazia.');
    renderIA(JSON.parse(bloco.text), texto, msg);
    $('status').textContent = '';
  } catch (e) {
    $('status').textContent = await explainError(e);
  } finally {
    btn.disabled = false;
  }
});

// Localiza o trecho citado pela IA no texto original (tolerante a espaços e acentos).
function localizar(texto, trecho) {
  const i = texto.indexOf(trecho);
  if (i >= 0) return [i, i + trecho.length];
  const alvo = norm(trecho).replace(/\s+/g, ' ').trim().slice(0, 80);
  if (alvo.length < 10) return [-1, -1];
  const mapa = [];
  let compacto = '';
  const tn = norm(texto);
  for (let k = 0; k < tn.length; k++) {
    if (/\s/.test(tn[k]) && compacto.endsWith(' ')) continue;
    compacto += /\s/.test(tn[k]) ? ' ' : tn[k];
    mapa.push(k);
  }
  const j = compacto.indexOf(alvo);
  if (j < 0) return [-1, -1];
  const ini = mapa[j];
  return [ini, Math.min(texto.length, mapa[Math.min(mapa.length - 1, j + norm(trecho).replace(/\s+/g, ' ').trim().length - 1)] + 1)];
}

function renderIA(r, texto, msg) {
  const marcas = r.clausulas.map((c, i) => { const [ini, fim] = localizar(texto, c.trecho); return { ...c, nivel: c.risco, titulo: c.tema, ini, fim, id: `ia-${i}` }; });
  const nota = Math.max(0, Math.min(100, r.nota_risco | 0));
  const faixa = nota >= 80 ? 'Risco baixo' : nota >= 55 ? 'Risco moderado' : 'Risco alto';
  const usado = msg.model && msg.model !== 'claude-opus-5-5' ? ` · respondido por ${esc(msg.model)}` : '';
  $('resultado-ia').hidden = false;
  $('resultado-ia').innerHTML = `
    <div class="card">
      <h2>Análise aprofundada com IA</h2>
      <div class="score">
        ${gauge(nota)}
        <div style="flex:1;min-width:240px">
          <p style="font-size:1.2rem;font-weight:700;margin:0">${faixa} · ${esc(r.tipo_contrato)}</p>
          <p class="muted" style="margin:.2rem 0 .5rem">${r.relacao_consumo ? 'Relação de consumo' : 'Relação civil/empresarial'} · ${LT.fmtInt(msg.usage?.input_tokens)} tokens lidos${usado}</p>
          <p style="margin:0">${esc(r.resumo)}</p>
        </div>
      </div>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <h2>Cláusulas de risco (${marcas.length})</h2>
        ${marcas.map(c => `
          <article class="finding ${c.nivel}">
            <h3>${tag(c.nivel)} ${esc(c.tema)}</h3>
            <p style="margin:0">${esc(c.explicacao)}</p>
            <blockquote ${c.ini >= 0 ? `data-ir="${c.id}" title="Ver no texto"` : ''}>${esc(c.trecho)}</blockquote>
            <p class="meta"><strong>Fundamento:</strong> ${esc(c.fundamento_legal)}</p>
            <p class="meta"><strong>Redação sugerida:</strong> ${esc(c.sugestao_redacao)}</p>
          </article>`).join('')}
      </div>
      <div class="grid" style="gap:16px;align-content:start">
        <div class="card">
          <h2>O que falta</h2>
          ${r.ausencias.length ? `<ul>${r.ausencias.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : '<p class="muted">Nada relevante.</p>'}
          <h2 style="margin-top:1rem">Recomendações</h2>
          <ul>${r.recomendacoes.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
        </div>
        <div class="card">
          <h2>Texto com destaques da IA</h2>
          <div class="marked" tabindex="0" role="region" aria-label="Texto do contrato com destaques">${textoMarcado(texto, marcas)}</div>
        </div>
      </div>
    </div>
    <p class="muted" style="font-size:.85rem;margin-top:.5rem">Gerado por IA: confira os fundamentos legais antes de usar.</p>`;
  $('resultado-ia').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

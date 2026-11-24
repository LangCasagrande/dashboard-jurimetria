// Assistente de legislação: conversa com o Claude em streaming, com pesquisa opcional em fontes oficiais.
import { client, baseParams, explainError, refusalMessage, mountKeyPanel, hasKey, MODEL } from '../assets/js/ia.js';

const { esc } = window.LT;
const $ = id => document.getElementById(id);
mountKeyPanel($('ia-chave'));

const P = 'https://www.planalto.gov.br/ccivil_03/';
const CODIGOS = [
  ['Constituição Federal', 'constituicao/constituicao.htm'],
  ['Código Civil (Lei 10.406/2002)', 'leis/2002/l10406compilada.htm'],
  ['Código de Processo Civil (Lei 13.105/2015)', '_ato2015-2018/2015/lei/l13105.htm'],
  ['Código de Defesa do Consumidor (Lei 8.078/1990)', 'leis/l8078compilado.htm'],
  ['CLT (Decreto-Lei 5.452/1943)', 'decreto-lei/del5452compilado.htm'],
  ['Código Penal (Decreto-Lei 2.848/1940)', 'decreto-lei/del2848compilado.htm'],
  ['Código de Processo Penal (Decreto-Lei 3.689/1941)', 'decreto-lei/del3689compilado.htm'],
  ['LGPD (Lei 13.709/2018)', '_ato2015-2018/2018/lei/l13709.htm'],
  ['ECA (Lei 8.069/1990)', 'leis/l8069compilado.htm'],
  ['Lei do Inquilinato (Lei 8.245/1991)', 'leis/l8245compilado.htm'],
  ['Estatuto da Advocacia (Lei 8.906/1994)', 'leis/l8906.htm'],
  ['Juizados Especiais (Lei 9.099/1995)', 'leis/l9099.htm'],
  ['Código Tributário Nacional (Lei 5.172/1966)', 'leis/l5172compilado.htm'],
  ['Marco Civil da Internet (Lei 12.965/2014)', '_ato2011-2014/2014/lei/l12965.htm'],
];
$('codigos').innerHTML = CODIGOS.map(([n, u]) => `<li><a href="${P + u}" target="_blank" rel="noopener">${esc(n)}</a></li>`).join('');

const SYSTEM = `Você é um assistente jurídico especializado em legislação brasileira, falando com estudantes de Direito e com pessoas leigas.
Regras:
- Responda em português do Brasil, de forma clara e organizada, começando pela resposta direta em uma ou duas frases.
- Fundamente cada afirmação no dispositivo legal (lei, artigo, parágrafo, inciso) e, quando houver, em súmula ou tese de tribunal superior.
- Cite apenas dispositivos que você tem certeza de que existem e estão em vigor. Se não tiver certeza, diga isso e indique onde conferir.
- Quando citar um destes diplomas, inclua o link oficial em Markdown:
${CODIGOS.map(([n, u]) => `  - ${n}: ${P + u}`).join('\n')}
- Se houver ferramenta de pesquisa, use-a para confirmar a redação atual dos artigos e mudanças legislativas recentes.
- Se a pergunta depender de detalhes do caso concreto, diga quais informações mudariam a resposta.
- Não dê a resposta como parecer definitivo: lembre que um advogado deve analisar o caso concreto quando houver decisão a tomar.
- Use Markdown simples: parágrafos, listas e negrito. Nada de tabelas largas.`;

const DOMINIOS = ['planalto.gov.br', 'stf.jus.br', 'stj.jus.br', 'tst.jus.br', 'cnj.jus.br', 'camara.leg.br', 'senado.leg.br', 'in.gov.br'];
const SUGESTOES = [
  'Qual o prazo para desistir de uma compra feita pela internet?',
  'Quando o inquilino pode devolver o imóvel antes do fim do contrato?',
  'Quais são as bases legais para tratar dados pessoais na LGPD?',
  'Como funciona a contagem de prazos processuais no CPC?',
  'O que é a cláusula penal e quando o juiz pode reduzi-la?',
];

let historico = []; // mensagens no formato da API (o conteúdo do assistente volta inteiro, sem edição)
let ocupado = false;

function sugestoes() {
  $('sugestoes').innerHTML = SUGESTOES.map(s => `<button type="button">${esc(s)}</button>`).join('');
}
$('chat').addEventListener('click', e => { const b = e.target.closest('.sugestoes button'); if (b) { $('pergunta').value = b.textContent; $('form').requestSubmit(); } });
sugestoes();

// Markdown mínimo e seguro: escapa tudo e só então aplica a formatação.
function md(texto) {
  const linhas = esc(texto).split('\n');
  let html = '', lista = null, para = [];
  // Links e código são reconhecidos numa única passada; negrito/itálico só no texto comum.
  // (Aplicar substituições em cadeia deixava o autolink reprocessar um href já montado e
  // quebrar o atributo, o que permitia injetar atributos de evento vindos da resposta da IA.)
  const enfase = s => s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
  const URL_RE = 'https?:\\/\\/[^\\s()<>"\']+';
  const TOKEN = new RegExp('`([^`]+)`|\\[([^\\]]+)\\]\\((' + URL_RE + ')\\)|(' + URL_RE + ')', 'g');
  const link = (href, rotulo) => `<a href="${href}" target="_blank" rel="noopener">${rotulo}</a>`;
  const inline = s => {
    let out = '', i = 0;
    for (const m of s.matchAll(TOKEN)) {
      out += enfase(s.slice(i, m.index));
      if (m[1] != null) out += `<code>${m[1]}</code>`;
      else if (m[2] != null) out += link(m[3], enfase(m[2]));
      else out += link(m[4], m[4]);
      i = m.index + m[0].length;
    }
    return out + enfase(s.slice(i));
  };
  const fechaPara = () => { if (para.length) { html += `<p>${inline(para.join(' '))}</p>`; para = []; } };
  const fechaLista = () => { if (lista) { html += `</${lista}>`; lista = null; } };
  for (const l of linhas) {
    const h = l.match(/^(#{1,4})\s+(.*)/), ul = l.match(/^\s*[-*•]\s+(.*)/), ol = l.match(/^\s*\d+[.)]\s+(.*)/), bq = l.match(/^&gt;\s?(.*)/);
    if (h) { fechaPara(); fechaLista(); html += `<h${Math.min(4, h[1].length + 2)}>${inline(h[2])}</h${Math.min(4, h[1].length + 2)}>`; }
    else if (ul || ol) { fechaPara(); const tipo = ul ? 'ul' : 'ol'; if (lista !== tipo) { fechaLista(); html += `<${tipo}>`; lista = tipo; } html += `<li>${inline((ul || ol)[1])}</li>`; }
    else if (bq) { fechaPara(); fechaLista(); html += `<blockquote>${inline(bq[1])}</blockquote>`; }
    else if (!l.trim()) { fechaPara(); fechaLista(); }
    else { fechaLista(); para.push(l); }
  }
  fechaPara(); fechaLista();
  return html;
}

function bolha(classe, html) {
  const d = document.createElement('div');
  d.className = `msg ${classe}`;
  d.innerHTML = html;
  $('chat').append(d);
  d.scrollIntoView({ behavior: 'smooth', block: 'end' });
  return d;
}

$('form').addEventListener('submit', async e => {
  e.preventDefault();
  const pergunta = $('pergunta').value.trim();
  if (!pergunta || ocupado) return;
  if (!hasKey()) { bolha('bot', '<p>Para conversar, informe sua chave da API da Anthropic no painel ao lado.</p>'); return; }
  $('sugestoes')?.remove();
  ocupado = true; $('enviar').disabled = true; $('pergunta').value = '';
  bolha('user', esc(pergunta));
  const div = bolha('bot', '<p class="estado"><span class="spinner"></span> Pensando...</p>');
  const tamanhoAntes = historico.length;
  historico.push({ role: 'user', content: pergunta });

  try {
    const { client: c } = await client();
    const usarPesquisa = $('pesquisa').checked;
    let texto = '', fontes = new Map(), estado = '';
    const pintar = () => {
      div.innerHTML = (texto ? md(texto) : '') + (estado ? `<p class="estado">${estado}</p>` : '');
    };

    // Ferramentas de servidor podem pausar o turno (pause_turn): nesse caso, continuamos a mesma resposta.
    for (let rodada = 0; rodada < 4; rodada++) {
      const stream = c.beta.messages.stream({
        ...baseParams(),
        max_tokens: 16000,
        system: SYSTEM,
        output_config: { effort: 'medium' },
        messages: historico,
        ...(usarPesquisa ? { tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5, allowed_domains: DOMINIOS }] } : {}),
      });
      for await (const ev of stream) {
        if (ev.type === 'content_block_start') {
          if (ev.content_block.type === 'server_tool_use') { estado = '<span class="spinner"></span> Pesquisando fontes oficiais...'; pintar(); }
          else if (ev.content_block.type === 'web_search_tool_result') {
            const r = ev.content_block.content;
            estado = Array.isArray(r) ? `Encontrei ${r.length} resultados. Lendo...` : 'A pesquisa não retornou resultados.';
            pintar();
          } else if (ev.content_block.type === 'thinking') { if (!texto) { estado = '<span class="spinner"></span> Pensando...'; pintar(); } }
        } else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          texto += ev.delta.text; estado = ''; pintar();
        }
      }
      const msg = await stream.finalMessage();
      historico.push({ role: 'assistant', content: msg.content });
      for (const b of msg.content) {
        if (b.type === 'text' && Array.isArray(b.citations)) {
          for (const ci of b.citations) if (ci.url) fontes.set(ci.url, ci.title || ci.url);
        }
      }
      if (msg.stop_reason === 'refusal') { texto += `\n\n${refusalMessage(msg)}`; break; }
      if (msg.stop_reason !== 'pause_turn') {
        if (msg.model && msg.model !== MODEL) estado = `Respondido por ${esc(msg.model)}.`;
        break;
      }
      estado = '<span class="spinner"></span> Continuando a pesquisa...'; pintar();
    }
    pintar();
    if (fontes.size) {
      div.insertAdjacentHTML('beforeend', `<div class="fontes"><strong>Fontes consultadas:</strong><ul>${[...fontes].map(([u, t]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join('')}</ul></div>`);
    }
  } catch (err) {
    historico.length = tamanhoAntes; // descarta a pergunta que não foi respondida
    div.innerHTML = `<p>${esc(await explainError(err))}</p>`;
  } finally {
    ocupado = false; $('enviar').disabled = false; $('pergunta').focus();
  }
});

$('pergunta').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('form').requestSubmit(); } });
$('limpar').addEventListener('click', () => {
  historico = [];
  $('chat').innerHTML = '<div class="sugestoes" id="sugestoes"></div>';
  sugestoes();
});

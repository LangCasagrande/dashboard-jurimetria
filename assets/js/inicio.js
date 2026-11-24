// Página inicial: preenche números e destaques a partir de data/index.json (atualizado a cada coleta).
// Se os dados não carregarem, a página continua legível com os textos padrão do HTML.
(function () {
  const { icone, esc } = window.LT;
  const FERRAMENTAS = [
    ['jurimetria/', 'grafico', 'c-azul', 'Dashboard de jurimetria', 'Volume, ajuizamentos por ano e por mês, classes, assuntos e órgãos julgadores de 90 tribunais, com comparação lado a lado.', 'Dados públicos do CNJ'],
    ['prazos/', 'calendario', 'c-roxo', 'Calculadora de prazos', 'Prazos em dias úteis pelo CPC, com feriados, recesso de 20/12 a 20/01, prazo em dobro e publicação no DJe.', 'Sem cadastro'],
    ['documentos/', 'documento', 'c-verde', 'Gerador de documentos', 'Procuração, contrato de honorários, notificação extrajudicial e declaração de hipossuficiência, prontos para Word.', 'Sem cadastro'],
    ['contratos/', 'lupa', 'c-ambar', 'Analisador de contratos', 'Aponta cláusulas de risco (multa, juros, foro, arbitragem, renovação automática) e dá uma nota de 0 a 100.', 'Regras + IA opcional'],
    ['legislacao/', 'balanca', 'c-roxo', 'Assistente de legislação', 'Perguntas em linguagem simples, respondidas com o artigo de lei e o link para o texto oficial do Planalto.', 'IA com sua chave'],
    ['lgpd/', 'escudo', 'c-verde', 'Kit LGPD', 'Checklist de adequação à Lei 13.709/2018 com nota de maturidade e gerador de política de privacidade.', 'Sem cadastro'],
  ];

  document.querySelectorAll('[data-icone]').forEach(el => { el.innerHTML = icone(el.dataset.icone); });
  const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  document.querySelector('[data-campo="ferramentas"]').innerHTML = FERRAMENTAS.map(([href, , , titulo, texto, tag], i) => `
    <a class="ferramenta" href="${href}">
      <span class="n" aria-hidden="true">${ROMANOS[i]}</span>
      <h3>${titulo}</h3><p>${texto}</p>
      <div class="rod"><span>${tag}</span>${icone('seta', ' width="18" height="18"')}</div>
    </a>`).join('');

  // Artigos do Direito Penal anotado, lidos do índice (o HTML já traz a lista padrão).
  fetch('lei-anotada/dados/indice.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : Promise.reject(r.status))).then(ind => {
    const lista = (ind.artigos || []).filter(a => /^[a-z0-9-]+$/.test(a.id));
    if (lista.length) document.querySelector('[data-campo="artigos"]').innerHTML = lista.map(a => `<li><a href="lei-anotada/?artigo=${a.id}">${esc(a.artigo)} · ${esc(a.rubrica)}</a></li>`).join('');
  }).catch(() => { /* mantém a lista padrão */ });

  const num = (v, casas = 1) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: casas });
  const curto = n => n >= 1e6 ? `${num(n / 1e6)} mi` : n >= 1e3 ? `${num(n / 1e3)} mil` : num(n, 0);
  const preencher = (campo, html) => document.querySelectorAll(`[data-campo="${campo}"]`).forEach(el => { el.innerHTML = html; });

  // "3 em 4" quando uma fração simples descreve bem o percentual; senão, o próprio percentual.
  function fracao(p) {
    let melhor = null;
    for (let d = 2; d <= 5; d++) for (let n = 1; n < d; n++) {
      const erro = Math.abs(100 * n / d - p);
      if (!melhor || erro < melhor.erro) melhor = { n, d, erro };
    }
    return melhor.erro <= 3 ? `${melhor.n} em ${melhor.d}` : `${num(p)}%`;
  }

  fetch('data/index.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : Promise.reject(r.status))).then(indice => {
    const ts = indice.tribunais.filter(t => /^[a-z0-9-]+$/.test(t.alias));
    const comTotal = ts.filter(t => t.total).sort((a, b) => b.total - a.total);
    const total = comTotal.reduce((s, t) => s + t.total, 0);
    if (!total) return;
    const pond = comTotal.filter(t => t.pct_eletronico != null);
    const eletronico = pond.reduce((s, t) => s + t.total * t.pct_eletronico, 0) / pond.reduce((s, t) => s + t.total, 0);

    preencher('total-curto', curto(total));
    preencher('tribunais', String(ts.length));
    preencher('eletronico', `${num(eletronico)}%`);
    const ultima = ts.map(t => t.atualizado_em).filter(Boolean).sort().pop();
    if (ultima) preencher('atualizacao', `última coleta em ${new Date(ultima).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`);

    const max = comTotal[0].total;
    preencher('barras', comTotal.slice(0, 6).map(t => `<div class="tb"><em>${esc(t.sigla)}</em><u style="width:${(100 * t.total / max).toFixed(1)}%"></u><s>${curto(t.total)}</s></div>`).join(''));

    // Destaques
    const porRamo = {};
    for (const t of comTotal) porRamo[t.ramo] = (porRamo[t.ramo] || 0) + t.total;
    const pEst = 100 * (porRamo.Estadual || 0) / total, pFed = 100 * (porRamo.Federal || 0) / total;
    const [maior, segundo] = comTotal;
    const pMaior = 100 * maior.total / total, razao = maior.total / segundo.total;
    const comparacao = razao >= 2 ? `mais que o dobro do segundo colocado, o ${esc(segundo.sigla)}` : `${num(razao)} vezes o segundo colocado, o ${esc(segundo.sigla)}`;
    const digitais = ts.filter(t => t.pct_eletronico === 100).length;
    const menosDigital = pond.slice().sort((a, b) => a.pct_eletronico - b.pct_eletronico)[0];
    const achado = (grande, titulo, texto, medidor) => `<article class="achado"><b>${grande}</b><h3>${titulo}</h3><p>${texto}</p><div class="medidor" aria-hidden="true"><i style="width:${Math.min(100, medidor).toFixed(1)}%"></i></div></article>`;
    preencher('achados', [
      achado(fracao(pEst), 'processos estão na Justiça Estadual', `Os tribunais de justiça dos estados somam ${num(pEst)}% dos registros. A Justiça Federal vem depois, com ${num(pFed)}%.`, pEst),
      achado(`${num(pMaior)}%`, 'da base está em um só tribunal', `O ${esc(maior.sigla)} tem ${curto(maior.total).replace('mi', 'milhões')} de processos, ${comparacao}.`, pMaior),
      achado(String(digitais), 'tribunais já são 100% eletrônicos', menosDigital ? `No outro extremo, o ${esc(menosDigital.sigla)} ainda tem ${num(100 - menosDigital.pct_eletronico)}% dos processos em papel, a maior fatia do país.` : 'Os demais ainda guardam parte dos processos em papel.', 100 * digitais / ts.length),
    ].join(''));
  }).catch(() => { /* mantém os textos padrão */ });
})();

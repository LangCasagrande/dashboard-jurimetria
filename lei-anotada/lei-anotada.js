// Lei anotada: monta a página a partir de lei-anotada/dados/<id>.json e de data/temas.json.
// Regra do projeto: nada é escrito aqui à mão; tudo vem dos dados conferidos, cada item com fonte e data.
(function () {
  const { esc, icone, fmtInt } = window.LT;
  const app = document.getElementById('app');
  const ARTIGOS = { 'cp-157': 'dados/cp-157.json' };
  const id = new URLSearchParams(location.search).get('artigo') || 'cp-157';
  const data = iso => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';
  const RECENTE = /Lei nº 15\.\d{3}, de \d+\/\d+\/202[56]/;

  function selo(v) {
    if (!v) return '';
    const humano = v.revisao_humana
      ? `<span class="selo">${icone('check')}Revisado por ${esc(v.revisao_humana.por)} em ${data(v.revisao_humana.em)}</span>`
      : '<span class="selo pendente" title="Ainda não revisado pelo autor do projeto">Revisão do autor: pendente</span>';
    return `<span class="selos"><span class="selo" title="${esc(v.como)}">${icone('check')}Conferido na fonte oficial em ${data(v.em)}</span>${humano}</span>`;
  }
  const link = (url, txt) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(txt)}</a>`;

  function nivel(rot, anterior) {
    if (rot === 'caput' || rot.startsWith('§')) return 'n1';
    if (rot === 'pena') return 'pena';
    if (/^[a-z]\)$/.test(rot)) return 'n3';
    return 'n2';
  }

  function texto(d) {
    const linhas = d.texto.dispositivos.map(x => {
      const revogado = !x.texto;
      const corpo = revogado ? `${esc(x.rotulo)} – (${esc(x.alteracao)})` : esc(x.texto);
      const alt = !revogado && x.alteracao ? `<span class="alt${RECENTE.test(x.alteracao) ? ' novo' : ''}">${esc(x.alteracao)}</span>` : '';
      return `<div class="disp ${nivel(x.rotulo)}${revogado ? ' revogado' : ''}"><span class="txt">${corpo}</span>${alt}</div>`;
    }).join('');
    return `<section class="bloco" id="texto"><h3>Texto atualizado</h3>
      <p class="sub">Copiado da compilação, sem edição. Em destaque, as alterações de 2025 e 2026.</p>
      <div class="lei">${linhas}
        <p class="lei-fonte">Fonte: ${link(d.texto.url, d.texto.fonte)} · documento atualizado em ${data(d.texto.documento_atualizado_em)} · consultado em ${data(d.texto.consultado_em)}.<br>${esc(d.texto.aviso)}</p>
      </div></section>`;
  }

  function alteracoes(d) {
    return `<section class="bloco" id="alteracoes"><h3>Linha do tempo das alterações</h3>
      <p class="sub">Leis que mudaram o art. 157, conforme as notas da compilação.</p>
      <ol class="tempo">${d.alteracoes.map(a => `<li><b>${esc(a.lei)}</b><time datetime="${a.data}">${data(a.data)}</time><p>${esc(a.o_que)}</p></li>`).join('')}</ol></section>`;
  }

  function juris(d) {
    const sumulas = d.sumulas.map(s => `
      <article class="item${s.cancelada ? ' cancelada' : ''}">
        <div class="topo"><h4>Súmula ${s.numero}/${esc(s.tribunal)}</h4><span class="etiqueta">${esc(s.tema)}</span></div>
        ${s.cancelada ? `<span class="aviso-cancelada">Súmula cancelada: não reflete o entendimento atual.</span>` : ''}
        <blockquote>${esc(s.texto)}</blockquote>
        <div class="meta">${esc(s.dados)}${s.cancelada ? `<br>${esc(s.cancelamento)}` : ''}<br>Fonte: ${link(s.fonte, 'Enunciados das Súmulas do STJ')}</div>
        ${selo(s.verificacao)}
      </article>`).join('');
    const temas = d.temas.map(t => `
      <article class="item">
        <div class="topo"><h4>Tema ${t.numero}/${esc(t.tribunal)}</h4><span class="etiqueta">${esc(t.tipo)}</span></div>
        ${t.questao ? `<p class="meta"><strong>Questão:</strong> ${esc(t.questao)}</p>` : ''}
        <blockquote>${t.tese.map(esc).join('<br><br>')}</blockquote>
        <div class="meta">${esc(t.processo)} · ${esc(t.relator)} · ${esc(t.orgao)} · julgado em ${data(t.julgado_em)} · acórdão publicado em ${data(t.publicado_em)} · trânsito em julgado em ${data(t.transito_em)}${t.sumula_originada ? ` · originou a ${esc(t.sumula_originada)}` : ''}<br>Fonte: ${link(t.fonte, `página oficial do Tema ${t.numero}`)}</div>
        ${selo(t.verificacao)}
      </article>`).join('');
    return `<section class="bloco" id="jurisprudencia"><h3>Súmulas e teses do STJ</h3>
      <p class="sub">Texto literal dos documentos oficiais. Súmulas canceladas aparecem marcadas para evitar o erro comum de citá-las.</p>
      <div class="juris">${sumulas}${temas}</div></section>`;
  }

  function notas(d) {
    const cards = d.notas.map(n => {
      const citacoes = n.citacao
        ? `<details><summary>Ver o trecho da fonte</summary><blockquote>${esc(n.citacao)}${n.precedentes ? `<br><br>${esc(n.precedentes)}` : ''}<cite>${link(n.fonte, n.fonte_nome)}</cite></blockquote></details>`
        : n.citacoes ? `<details><summary>Ver os dispositivos</summary>${n.citacoes.map(c => `<blockquote>${esc(c.texto)}<cite>${link(c.fonte, c.fonte_nome)}</cite></blockquote>`).join('')}</details>` : '';
      return `<article class="nota${n.tipo === 'Atenção' ? ' atencao' : ''}" id="nota-${esc(n.id)}">
        <span class="tipo">${esc(n.tipo)}</span><h4>${esc(n.titulo)}</h4>
        <p class="resumo">${esc(n.resumo)}</p>${citacoes}
        <div class="rodape-nota"><span>Resumo do JusLab.IA a partir das fontes indicadas.</span>${selo(n.verificacao)}</div>
      </article>`;
    }).join('');
    return `<section class="bloco" id="notas"><h3>Notas</h3>
      <p class="sub">Doutrina citada pelo STJ, histórico, vigência e alertas. Cada nota traz o trecho da fonte para conferência.</p>
      <div class="notas">${cards}</div></section>`;
  }

  function jurimetria(d, temas) {
    const tema = temas?.temas?.[d.tema_jurimetria];
    const corpo = !tema?.tribunais?.length
      ? '<p class="muted">Os números deste artigo ainda não foram coletados. O coletor do JusLab.IA busca esses dados na API Pública do DataJud.</p>'
      : (() => {
          const ts = tema.tribunais;
          const total = ts.reduce((s, t) => s + t.total, 0);
          const porAssunto = {};
          for (const t of ts) for (const [c, q] of Object.entries(t.por_assunto)) porAssunto[c] = (porAssunto[c] || 0) + q;
          const max = ts[0].total;
          const ultima = ts.map(t => t.coletado_em).filter(Boolean).sort().pop();
          return `<div class="jur-kpis">
              <div><b>${fmtInt(total)}</b><span>processos com assunto de roubo, somando ${ts.length} tribunais</span></div>
              <div><b>${esc(ts[0].sigla)}</b><span>tribunal com mais processos (${fmtInt(ts[0].total)})</span></div>
              <div><b>${fmtInt(porAssunto['5567'] || 0)}</b><span>com o assunto "Latrocínio"</span></div>
            </div>
            <div class="card"><ol class="barras">${ts.slice(0, 12).map(t => `<li><a href="../jurimetria/#tribunal/${esc(t.alias)}" title="${esc(t.nome)}">${esc(t.sigla)}</a><u style="width:${(100 * t.total / max).toFixed(1)}%"></u><s>${fmtInt(t.total)}</s></li>`).join('')}</ol>
            <p class="muted" style="margin:.9rem 0 0;font-size:.85rem">Assuntos contados: ${Object.entries(tema.assuntos).map(([c, n]) => `${esc(n)} (código ${esc(c)}: ${fmtInt(porAssunto[c] || 0)})`).join('; ')}. Um processo pode ter mais de um desses assuntos, mas entra uma vez só no total do tribunal. Dados coletados até ${data(ultima)}. ${esc(tema.fonte)}</p></div>`;
        })();
    return `<section class="bloco" id="jurimetria"><h3>Jurimetria do artigo</h3>
      <p class="sub">Quantos processos sobre roubo existem na base pública do CNJ, por tribunal.</p>${corpo}</section>`;
  }

  function fontes(d) {
    return `<section class="bloco" id="fontes"><h3>Fontes e verificação</h3>
      <div class="card">
        <p>Cada item desta página foi lido na fonte indicada e copiado sem edição; os resumos das notas são do JusLab.IA e trazem o trecho original para conferência. O selo "Revisão do autor" indica se o autor do projeto já revisou o item pessoalmente.</p>
        <ul class="fontes">
          <li>${link(d.texto.url, 'Código Penal compilado (Câmara dos Deputados, via Normas.leg.br)')}</li>
          <li>${link(d.sumulas[0].fonte, 'Enunciados das Súmulas do STJ (documento oficial)')}</li>
          ${d.temas.map(t => `<li>${link(t.fonte, `Tema ${t.numero}/STJ (página oficial)`)}</li>`).join('')}
          <li>${link(d.notas[0].fonte, 'Informativo de Jurisprudência nº 572 do STJ')}</li>
        </ul>
        <h4 style="margin:1rem 0 .3rem">Ainda não incluído</h4>
        <ul class="pendentes">${d.pendentes.map(p => `<li><strong>${esc(p.o_que)}:</strong> ${esc(p.motivo)}</li>`).join('')}</ul>
      </div></section>`;
  }

  Promise.all([
    fetch(ARTIGOS[id] || ARTIGOS['cp-157'], { cache: 'no-cache' }).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))),
    fetch('../data/temas.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null),
  ]).then(([d, temas]) => {
    document.title = `${d.artigo} do Código Penal (${d.rubrica}) · Lei anotada`;
    app.innerHTML = `
      <div class="cab-artigo">
        <div><h2>${esc(d.artigo)} <span>· ${esc(d.rubrica)}</span></h2><p class="local">${esc(d.lei)}<br>${esc(d.local)}</p></div>
      </div>
      <nav class="sumario" aria-label="Seções do artigo">
        <a href="#texto">Texto</a><a href="#alteracoes">Alterações</a><a href="#jurisprudencia">Súmulas e teses</a><a href="#notas">Notas</a><a href="#jurimetria">Jurimetria</a><a href="#fontes">Fontes</a>
      </nav>
      ${texto(d)}${alteracoes(d)}${juris(d)}${notas(d)}${jurimetria(d, temas)}${fontes(d)}`;
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
  }).catch(e => {
    app.innerHTML = `<div class="notice bad"><strong>Não foi possível carregar o artigo.</strong> ${esc(e.message)}</div>`;
  });
})();

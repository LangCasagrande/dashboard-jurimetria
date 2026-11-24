// Direito Penal anotado: índice de artigos (dados/indice.json) e, para cada artigo, abas com
// Texto da lei, Jurisprudência, Notas da doutrina, Jurimetria e Fontes.
// Regra do projeto: nada é escrito aqui à mão; tudo vem dos dados conferidos, cada item com fonte e data.
(function () {
  const { esc, icone, fmtInt } = window.LT;
  const app = document.getElementById('app');
  const data = iso => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';
  const RECENTE = /Lei nº 15\.\d{3}, de \d+\/\d+\/202[56]/;
  const ABAS = [
    ['texto', 'Texto da lei'], ['jurisprudencia', 'Jurisprudência'], ['doutrina', 'Notas da doutrina'],
    ['jurimetria', 'Jurimetria'], ['fontes', 'Fontes'],
  ];
  const link = (url, txt) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(txt)}</a>`;

  function selo(v) {
    if (!v) return '';
    const humano = v.revisao_humana
      ? `<span class="selo">${icone('check')}Revisado por ${esc(v.revisao_humana.por)} em ${data(v.revisao_humana.em)}</span>`
      : '<span class="selo pendente" title="Ainda não revisado pelo autor do projeto">Revisão do autor: pendente</span>';
    return `<span class="selos"><span class="selo" title="${esc(v.como)}">${icone('check')}Conferido na fonte oficial em ${data(v.em)}</span>${humano}</span>`;
  }

  // ---------- Texto da lei ----------
  function nivel(rot) {
    if (rot === 'caput' || rot.startsWith('§') || rot === 'parágrafo único') return 'n1';
    if (rot === 'pena') return 'pena';
    if (/^[a-z]\)$/.test(rot)) return 'n3';
    return 'n2';
  }
  function vigencias(d) {
    const mapa = {};
    for (const a of d.alteracoes || []) {
      const num = a.lei.match(/[\d.]+\/\d{4}/)?.[0]?.split('/')[0];
      if (!num || !a.publicacao_dou || !a.vigencia) continue;
      if (a.nota_vigencia) { mapa[num] = 'ver a ressalva de vigência na linha do tempo'; continue; }
      mapa[num] = a.vigencia === 'na data da publicação' ? `em vigor desde ${data(a.publicacao_dou)}` : `em vigor ${a.vigencia.replace('(Edição Extra do DOU)', '').trim()} de ${data(a.publicacao_dou)}`;
    }
    return nota => [...new Set([...nota.matchAll(/Lei nº ([\d.]+), de/g)].map(m => m[1]))].map(n => mapa[n] ? `Lei ${n}: ${mapa[n]}` : '').filter(Boolean).join(' · ');
  }
  function blocoTexto(d) {
    const vig = vigencias(d);
    const linhas = d.texto.dispositivos.map(x => {
      const revogado = !x.texto;
      const corpo = revogado ? `${esc(x.rotulo)} – (${esc(x.alteracao)})` : esc(x.texto);
      const notas = [x.alteracao, x.alteracao_paragrafo].filter(Boolean);
      const alt = !revogado && notas.length ? notas.map(n => `<span class="alt${RECENTE.test(n) ? ' novo' : ''}">${esc(n)}${vig(n) ? ` <span class="vig">(${esc(vig(n))})</span>` : ''}</span>`).join('') : '';
      const rubrica = x.rubrica ? `<span class="rubrica-disp">${esc(x.rubrica)}${x.rubrica_alteracao ? ` <small>(${esc(x.rubrica_alteracao)})</small>` : ''}</span>` : '';
      return `${rubrica}<div class="disp ${nivel(x.rotulo)}${revogado ? ' revogado' : ''}" title="${esc(x.referencia || '')}"><span class="ref">${esc(x.referencia || '')}</span><span class="txt">${corpo}</span>${alt}</div>`;
    }).join('');
    const tempo = (d.alteracoes || []).length ? `<section class="bloco"><h3>Linha do tempo das alterações</h3>
      <p class="sub">A data da lei nem sempre é a data em que ela passa a valer: veja a publicação e a vigência.</p>
      <ol class="tempo">${d.alteracoes.map(a => `<li><b>${esc(a.lei)}</b><time datetime="${a.data}">Lei de ${data(a.data)}${a.publicacao_dou ? ` · publicada no DOU de ${data(a.publicacao_dou)}${a.vigencia ? ` · em vigor ${esc(a.vigencia)}` : ''}` : ''}</time><p>${esc(a.o_que)}</p>${a.nota_vigencia ? `<p class="ressalva"><strong>Ressalva de vigência:</strong> ${esc(a.nota_vigencia)}</p>` : ''}</li>`).join('')}</ol></section>` : '';
    return `<section class="bloco"><h3>Texto atualizado</h3>
      <p class="sub">Copiado da compilação, sem edição.${RECENTE.test(JSON.stringify(d.texto.dispositivos || [])) ? ' Em destaque, as alterações de 2025 e 2026.' : ''}</p>
      <div class="lei">${linhas}
        <p class="lei-fonte">Fonte: ${link(d.texto.url, d.texto.fonte)}${d.texto.documento_atualizado_em ? ` · documento atualizado em ${data(d.texto.documento_atualizado_em)}` : ''} · consultado em ${data(d.texto.consultado_em)}.<br>${esc(d.texto.aviso || '')}</p>
      </div></section>${tempo}${blocoNotas(d, 'lei', 'Vigência, alterações e remissões', '')}`;
  }

  // ---------- Jurisprudência ----------
  function blocoJuris(d) {
    const sumulas = (d.sumulas || []).map(s => `
      <article class="item${s.cancelada ? ' cancelada' : ''}">
        <div class="topo"><h4>Súmula ${s.numero}/${esc(s.tribunal)}</h4><span class="etiqueta">${esc(s.tema || '')}</span></div>
        ${s.cancelada ? `<span class="aviso-cancelada">Súmula cancelada: não reflete o entendimento atual.</span>` : ''}
        <blockquote>${esc(s.texto)}</blockquote>
        <div class="meta">${esc(s.dados || '')}${s.cancelada && s.cancelamento ? `<br>${esc(s.cancelamento)}` : ''}<br>Fonte: ${link(s.fonte, s.tribunal === 'STJ' ? 'Enunciados das Súmulas do STJ' : 'fonte oficial')}</div>
        ${selo(s.verificacao)}
      </article>`).join('');
    const temas = (d.temas || []).map(t => `
      <article class="item">
        <div class="topo"><h4>Tema ${t.numero}/${esc(t.tribunal)}</h4><span class="etiqueta">${esc(t.tipo)}</span></div>
        ${t.situacao ? `<span class="situacao">Situação: ${esc(t.situacao)}</span>` : ''}
        ${t.questao ? `<p class="meta"><strong>Questão:</strong> ${esc(t.questao)}</p>` : ''}
        <blockquote>${(t.tese || []).map(esc).join('<br><br>')}</blockquote>
        ${t.observacao ? `<p class="obs"><strong>Atenção:</strong> ${esc(t.observacao)}</p>` : ''}
        <div class="meta">${[t.processo, t.relator, t.orgao].filter(Boolean).map(esc).join(' · ')}${t.julgado_em ? ` · julgado em ${data(t.julgado_em)}` : ''}${t.publicado_em ? ` · acórdão publicado em ${data(t.publicado_em)}` : ''}${t.embargos_em ? ` · embargos de declaração em ${data(t.embargos_em)}` : ''}${t.transito_em ? ` · trânsito em julgado em ${data(t.transito_em)}` : ''}${t.sumula_originada ? ` · originou a ${esc(t.sumula_originada)}` : ''}<br>Fonte: ${link(t.fonte, `página oficial do Tema ${t.numero}`)}</div>
        ${selo(t.verificacao)}
      </article>`).join('');
    const vazio = !sumulas && !temas ? '<p class="muted">Nenhuma súmula ou tese conferida para este artigo até agora.</p>' : '';
    return `<section class="bloco"><h3>Súmulas e teses</h3>
      <p class="sub">Texto literal dos documentos oficiais. Súmulas canceladas aparecem marcadas para evitar o erro comum de citá-las.</p>
      <div class="juris">${sumulas}${temas}</div>${vazio}</section>
      ${blocoNotas(d, 'jurisprudencia', 'Notas de jurisprudência', 'Histórico, informativos e alertas.')}`;
  }

  // ---------- Notas (por aba) ----------
  function cartaoNota(n) {
    const citacoes = n.citacao
      ? `<details><summary>Ver o trecho da fonte</summary><blockquote>${esc(n.citacao)}${n.precedentes ? `<br><br>${esc(n.precedentes)}` : ''}<cite>${link(n.fonte, n.fonte_nome)}</cite></blockquote></details>`
      : n.citacoes ? `<details><summary>Ver os trechos das fontes</summary>${n.citacoes.map(c => `<blockquote>${esc(c.texto)}<cite>${link(c.fonte, c.fonte_nome)}</cite></blockquote>`).join('')}</details>` : '';
    return `<article class="nota${n.tipo === 'Atenção' ? ' atencao' : ''}" id="nota-${esc(n.id)}">
      <span class="tipo">${esc(n.tipo)}</span><h4>${esc(n.titulo)}</h4>
      <p class="resumo">${esc(n.resumo)}</p>
      ${n.interpretacao ? `<div class="interpretacao"><strong>Interpretação do JusLab.IA, não é texto de lei nem tese do tribunal:</strong> ${esc(n.interpretacao)}</div>` : ''}${citacoes}
      <div class="rodape-nota"><span>Resumo do JusLab.IA a partir das fontes indicadas.</span>${selo(n.verificacao)}</div>
    </article>`;
  }
  function blocoNotas(d, aba, titulo, sub) {
    const notas = (d.notas || []).filter(n => (n.aba || 'jurisprudencia') === aba);
    if (!notas.length) return '';
    return `<section class="bloco"><h3>${esc(titulo)}</h3>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}<div class="notas">${notas.map(cartaoNota).join('')}</div></section>`;
  }
  function blocoDoutrina(d) {
    const notas = (d.notas || []).filter(n => n.aba === 'doutrina');
    const pend = (d.pendentes || []).filter(p => /doutrina/i.test(p.o_que));
    return `<div class="aviso-doutrina"><strong>Como funcionam estas notas.</strong> Só entra doutrina que aparece em fonte oficial que pode ser aberta e conferida, como as explicações do STJ nos seus informativos e acórdãos, com o trecho original ao lado. Nada é atribuído a um autor sem que a fonte o cite.</div>
      <section class="bloco"><h3>Notas da doutrina</h3>
      ${notas.length ? `<div class="notas">${notas.map(cartaoNota).join('')}</div>` : '<p class="muted">Ainda não há notas de doutrina conferidas para este artigo.</p>'}</section>
      ${pend.length ? `<p class="muted" style="margin-top:1rem">${pend.map(p => `<strong>${esc(p.o_que)}:</strong> ${esc(p.motivo)}`).join('<br>')}</p>` : ''}`;
  }

  // ---------- Jurimetria ----------
  function blocoJurimetria(d, temas) {
    const tema = temas?.temas?.[d.tema_jurimetria];
    if (!tema?.tribunais?.length) return '<p class="muted">Os números deste artigo ainda não foram coletados. O coletor do JusLab.IA busca esses dados na API Pública do DataJud toda madrugada.</p>';
    const ts = tema.tribunais.filter(t => t.total > 0);
    const total = ts.reduce((s, t) => s + t.total, 0);
    const porAssunto = {};
    for (const t of tema.tribunais) for (const [c, q] of Object.entries(t.por_assunto)) porAssunto[c] = (porAssunto[c] || 0) + q;
    const max = ts[0]?.total || 1;
    const ultima = tema.tribunais.map(t => t.coletado_em).filter(Boolean).sort().pop();
    const n = tema.tribunais.length;
    return `<div class="jur-kpis">
        <div><b>${fmtInt(total)}</b><span>processos com estes assuntos, nos ${n} ${n === 1 ? 'tribunal contado' : 'tribunais contados'}${n < 91 ? ' (de 91)' : ''}</span></div>
        <div><b>${esc(ts[0]?.sigla || '—')}</b><span>tribunal com mais processos${ts[0] ? ` (${fmtInt(ts[0].total)})` : ''}</span></div>
        <div><b>${fmtInt(Object.keys(tema.assuntos).length)}</b><span>códigos de assunto do CNJ contados</span></div>
      </div>
      <div class="card"><ol class="barras">${ts.slice(0, 15).map(t => `<li><a href="../jurimetria/#tribunal/${esc(t.alias)}" title="${esc(t.nome)}">${esc(t.sigla)}</a><u style="width:${(100 * t.total / max).toFixed(1)}%"></u><s>${fmtInt(t.total)}</s></li>`).join('')}</ol>
      <p class="muted" style="margin:.9rem 0 0;font-size:.85rem">Assuntos contados: ${Object.entries(tema.assuntos).map(([c, nome]) => `${esc(nome)} (código ${esc(c)}: ${fmtInt(porAssunto[c] || 0)})`).join('; ')}. Um processo pode ter mais de um desses assuntos, mas entra uma vez só no total do tribunal. Dados coletados até ${data(ultima)}. ${esc(tema.fonte || '')}</p></div>`;
  }

  // ---------- Fontes ----------
  function blocoFontes(d) {
    const fontes = new Map();
    const add = (url, nome) => { if (url && !fontes.has(url)) fontes.set(url, nome); };
    add(d.texto.url, d.texto.fonte);
    for (const s of d.sumulas || []) add(s.fonte, s.tribunal === 'STJ' ? 'Enunciados das Súmulas do STJ (documento oficial)' : `Súmula ${s.numero}/${s.tribunal}`);
    for (const t of d.temas || []) add(t.fonte, `Tema ${t.numero}/${t.tribunal} (página oficial)`);
    for (const n of d.notas || []) { add(n.fonte, n.fonte_nome); for (const c of n.citacoes || []) add(c.fonte, c.fonte_nome); }
    return `<div class="card">
        <p>Cada item foi lido na fonte indicada e copiado sem edição; os resumos das notas são do JusLab.IA e trazem o trecho original para conferência. O selo "Revisão do autor" mostra se o autor do projeto já revisou o item pessoalmente.</p>
        <ul class="fontes">${[...fontes].map(([u, n]) => `<li>${link(u, n || u)}</li>`).join('')}</ul>
        ${(d.pendentes || []).length ? `<h4 style="margin:1rem 0 .3rem">Ainda não incluído</h4><ul class="pendentes">${d.pendentes.map(p => `<li><strong>${esc(p.o_que)}:</strong> ${esc(p.motivo)}</li>`).join('')}</ul>` : ''}
      </div>`;
  }

  // ---------- Montagem ----------
  function abaAtual() { const h = location.hash.replace('#', ''); return ABAS.some(([id]) => id === h) ? h : 'texto'; }

  function render(indice, d, temas, artigoId) {
    document.title = `${d.artigo} · ${d.rubrica} · Direito Penal anotado`;
    const atual = abaAtual();
    const conteudo = { texto: blocoTexto(d), jurisprudencia: blocoJuris(d), doutrina: blocoDoutrina(d), jurimetria: blocoJurimetria(d, temas), fontes: blocoFontes(d) };
    const contagem = { jurisprudencia: (d.sumulas || []).length + (d.temas || []).length + (d.notas || []).filter(n => n.aba === 'jurisprudencia').length, doutrina: (d.notas || []).filter(n => n.aba === 'doutrina').length };
    app.innerHTML = `
      <nav class="artigos" aria-label="Artigos anotados">${indice.artigos.map(a => `<a href="?artigo=${esc(a.id)}#${atual}" ${a.id === artigoId ? 'aria-current="page"' : ''}><b>${esc(a.artigo)}</b><span>${esc(a.rubrica)}</span><small>${esc(a.lei)}</small></a>`).join('')}</nav>
      <div class="cab-artigo">
        <div><h2>${esc(d.artigo)} <span>· ${esc(d.rubrica)}</span></h2><p class="local">${esc(d.lei)}<br>${esc(d.local)}</p></div>
      </div>
      <div class="abas-artigo" role="tablist" aria-label="Seções do artigo">
        ${ABAS.map(([id, nome]) => `<button type="button" role="tab" id="aba-${id}" aria-controls="painel-${id}" aria-selected="${id === atual}" tabindex="${id === atual ? 0 : -1}" data-aba="${id}">${nome}${contagem[id] ? ` <span class="conta">${contagem[id]}</span>` : ''}</button>`).join('')}
      </div>
      ${ABAS.map(([id]) => `<div role="tabpanel" id="painel-${id}" aria-labelledby="aba-${id}" tabindex="0"${id === atual ? '' : ' hidden'}>${conteudo[id]}</div>`).join('')}`;

    const botoes = [...app.querySelectorAll('[role="tab"]')];
    const ativar = (id, focar) => {
      for (const b of botoes) {
        const sel = b.dataset.aba === id;
        b.setAttribute('aria-selected', String(sel)); b.tabIndex = sel ? 0 : -1;
        document.getElementById(`painel-${b.dataset.aba}`).hidden = !sel;
        if (sel && focar) b.focus();
      }
      history.replaceState(null, '', `${location.pathname}${location.search}#${id}`);
      app.querySelectorAll('.artigos a').forEach(a => { a.href = a.href.replace(/#.*$/, '') + `#${id}`; });
    };
    botoes.forEach((b, i) => {
      b.addEventListener('click', () => ativar(b.dataset.aba));
      b.addEventListener('keydown', e => {
        const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (k) { e.preventDefault(); ativar(botoes[(i + k + botoes.length) % botoes.length].dataset.aba, true); }
        if (e.key === 'Home') { e.preventDefault(); ativar(botoes[0].dataset.aba, true); }
        if (e.key === 'End') { e.preventDefault(); ativar(botoes[botoes.length - 1].dataset.aba, true); }
      });
    });
  }

  fetch('dados/indice.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))).then(indice => {
    const pedido = new URLSearchParams(location.search).get('artigo');
    const escolhido = indice.artigos.find(a => a.id === pedido) || indice.artigos[0];
    return Promise.all([
      indice,
      fetch(escolhido.arquivo, { cache: 'no-cache' }).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))),
      fetch('../data/temas.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null),
      escolhido.id,
    ]);
  }).then(([indice, d, temas, id]) => render(indice, d, temas, id)).catch(e => {
    app.innerHTML = `<div class="notice bad"><strong>Não foi possível carregar o artigo.</strong> ${esc(e.message)}</div>`;
  });
})();

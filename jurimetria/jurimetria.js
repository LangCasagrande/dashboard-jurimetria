// Dashboard de jurimetria: lê os JSON pré-calculados pelo coletor (data/) e monta três visões:
// panorama nacional, detalhe de um tribunal e comparação entre tribunais.
(function () {
  const G = window.Graficos;
  const LT = window.LT;
  const esc = LT.esc;
  const app = document.getElementById('app');
  const DADOS = '../data/';
  const PARTES = ['total', 'anual', 'mensal', 'classes', 'assuntos', 'orgaos', 'graus', 'sistemas', 'formatos'];
  const NOMES_PARTES = {
    total: 'total de processos', anual: 'ajuizamentos por ano', mensal: 'ajuizamentos por mês', classes: 'classes', assuntos: 'assuntos',
    orgaos: 'órgãos julgadores', graus: 'graus de jurisdição', sistemas: 'sistemas processuais', formatos: 'formato (eletrônico/físico)',
  };
  const RAMOS = ['Superiores', 'Federal', 'Estadual', 'Trabalho', 'Eleitoral', 'Militar'];
  const NOMES_RAMOS = {
    Superiores: 'Tribunais superiores', Federal: 'Justiça Federal', Estadual: 'Justiça Estadual',
    Trabalho: 'Justiça do Trabalho', Eleitoral: 'Justiça Eleitoral', Militar: 'Justiça Militar estadual',
  };
  const GRAUS = {
    G1: '1º grau', G2: '2º grau', JE: 'Juizado Especial', TR: 'Turma Recursal', SUP: 'Tribunal Superior',
    TRU: 'Turma Regional de Uniformização', TNU: 'Turma Nacional de Uniformização', TRSE: 'Turma Recursal (Estadual)',
    CJF: 'Conselho da Justiça Federal', CSJT: 'Conselho Superior da Justiça do Trabalho', ORIG: 'Competência originária',
  };
  const MAX_COMPARAR = 4;
  const pct = (a, b) => (b ? (100 * a / b) : 0);
  const fmtPct = (v, casas = 1) => (v > 0 && v < 10 ** -casas)
    ? `<${(10 ** -casas).toLocaleString('pt-BR')}%`
    : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: 0 })}%`;
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  // Denominador dos percentuais de uma parte: o total medido na mesma consulta (coletas novas)
  // ou o total geral. Se a parte não cabe no total (dados de momentos diferentes), não mostra %.
  function basePct(d, parte) {
    const lista = d[parte];
    const base = d.totais_partes?.[parte] ?? d.total;
    if (!base || !lista?.length || lista[0].qtd > base) return null;
    return base;
  }
  const fmtData = iso => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  let indice = null;
  const cache = new Map();
  let limpar = []; // desliga observadores de redimensionamento ao trocar de visão

  async function json(url) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status} ao ler ${url}`);
    return r.json();
  }
  // Validação defensiva: só aceita séries com chaves no formato esperado.
  function limparTribunal(d) {
    if (Array.isArray(d.mensal)) d.mensal = d.mensal.filter(p => /^\d{4}-\d{2}$/.test(p.mes) && Number.isFinite(p.qtd));
    if (Array.isArray(d.anual)) d.anual = d.anual.filter(p => /^\d{4}$/.test(p.ano) && Number.isFinite(p.qtd));
    return d;
  }
  function tribunal(alias) {
    if (!cache.has(alias)) cache.set(alias, json(`${DADOS}tribunais/${alias}.json`).then(limparTribunal).catch(e => { cache.delete(alias); throw e; }));
    return cache.get(alias);
  }
  const porAlias = alias => indice.tribunais.find(t => t.alias === alias);

  // ---------- Utilidades de dados ----------
  // A série mensal pode ter registros soltos depois do fim real da base (datas digitadas errado).
  // "Relevante" = mês com pelo menos 5% do maior mês; o último relevante é tratado como incompleto:
  // ou é o mês em que a coleta rodou, ou o mês em que a base pública daquele tribunal para.
  function ultimoRelevante(lista, chave) {
    if (!lista || !lista.length) return null;
    const max = Math.max(...lista.map(p => p.qtd));
    if (max < 100) return null;
    return lista.filter(p => p.qtd >= 0.05 * max).map(p => p[chave]).sort().pop();
  }
  function mesesCompletos(d) {
    const pontos = d.mensal || [];
    const mesColeta = (d.partes_atualizadas_em?.mensal || d.atualizado_em || '').slice(0, 7);
    const ultimo = ultimoRelevante(pontos, 'mes');
    if (!ultimo) return { pontos, parcial: -1, completos: [], insuficiente: Array.isArray(d.mensal), mesColeta };
    const parcial = pontos.findIndex(p => p.mes === ultimo);
    return { pontos, parcial, completos: pontos.slice(0, parcial), ultimo, mesColeta, defasagem: mesesEntre(ultimo, mesColeta) };
  }
  function mesesEntre(a, b) {
    const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number);
    return (yb - ya) * 12 + (mb - ma);
  }
  function ultimos12(d) {
    const { completos } = mesesCompletos(d);
    if (!completos || completos.length < 12) return null;
    const soma = a => a.reduce((s, p) => s + p.qtd, 0);
    const atual = soma(completos.slice(-12));
    const anterior = completos.length >= 24 ? soma(completos.slice(-24, -12)) : null;
    return { atual, anterior, variacao: anterior ? pct(atual - anterior, anterior) : null, ate: completos[completos.length - 1].mes };
  }
  const nomeGrau = g => GRAUS[g] || g;
  const primeiro = (lista, f = x => x.nome) => (lista && lista.length ? f(lista[0]) : '—');
  function pctEletronico(d) {
    const f = Object.fromEntries((d.formatos || []).map(x => [x.nome, x.qtd]));
    const soma = Object.values(f).reduce((a, b) => a + b, 0);
    return soma ? pct(f['Eletrônico'] || 0, soma) : null;
  }

  function csv(linhas) {
    return '﻿' + linhas.map(l => l.map(c => {
      const s = String(c ?? '');
      return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(';')).join('\r\n');
  }

  // ---------- Peças de interface ----------
  function kpi(rotulo, valor, detalhe = '', texto = false) {
    return `<div class="card kpi"><span class="label">${esc(rotulo)}</span><span class="value${texto ? ' texto' : ''}">${valor}</span>${detalhe ? `<span class="detalhe">${detalhe}</span>` : ''}</div>`;
  }
  function cartao(id, titulo, subtitulo = '', classe = '') {
    return `<section class="card ${classe}" id="c-${id}">
      <div class="card-head"><div><h2>${esc(titulo)}</h2>${subtitulo ? `<p class="muted">${subtitulo}</p>` : ''}</div></div>
      <div class="viz-box" id="g-${id}"></div>
      <details class="ver-tabela"><summary>Ver como tabela</summary><div id="t-${id}"></div></details>
    </section>`;
  }
  function faltando(id, parte) {
    const box = document.getElementById(`g-${id}`);
    box.innerHTML = `<p class="muted vazio">Esta estatística (${esc(NOMES_PARTES[parte])}) ainda não foi coletada para este tribunal. A coleta automática tenta de novo toda madrugada.</p>`;
    document.querySelector(`#c-${id} .ver-tabela`)?.remove();
  }
  function grafBarras(id, lista, opts = {}) {
    if (!lista || !lista.length) return faltando(id, opts.parte);
    const itens = lista.map(x => ({ nome: opts.nomear ? opts.nomear(x.nome) : x.nome, qtd: x.qtd }));
    G.barras(document.getElementById(`g-${id}`), itens, opts);
    document.getElementById(`t-${id}`).innerHTML = G.tabela([opts.colunaNome || 'Nome', 'Processos'], itens.map(i => [i.nome, i.qtd]));
  }
  function selecionarAba(aba) {
    document.querySelectorAll('.abas a').forEach(a => {
      if (a.dataset.aba === aba) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  function opcoesTribunais(selecionado, excluir = []) {
    return RAMOS.map(r => {
      const ts = indice.tribunais.filter(t => t.ramo === r && !excluir.includes(t.alias));
      if (!ts.length) return '';
      return `<optgroup label="${esc(NOMES_RAMOS[r])}">${ts.map(t => `<option value="${t.alias}"${t.alias === selecionado ? ' selected' : ''}>${esc(t.sigla)} · ${esc(t.nome)}</option>`).join('')}</optgroup>`;
    }).join('');
  }

  // ---------- Visão 1: panorama nacional ----------
  let filtroRamo = LT.store.get('jurimetria-ramo', 'Todos');
  let ordem = { campo: 'total', dir: -1 };
  let busca = '';
  let mostrarTodos = false;

  function panorama() {
    selecionarAba('panorama');
    if (!RAMOS.includes(filtroRamo)) filtroRamo = 'Todos';
    const ts = indice.tribunais.filter(t => filtroRamo === 'Todos' || t.ramo === filtroRamo);
    const comTotal = ts.filter(t => t.total);
    const soma = comTotal.reduce((s, t) => s + t.total, 0);
    const pondEl = comTotal.filter(t => t.pct_eletronico != null);
    const somaPond = pondEl.reduce((s, t) => s + t.total, 0);
    const eletronico = somaPond ? pondEl.reduce((s, t) => s + t.total * t.pct_eletronico, 0) / somaPond : null;
    const maior = [...comTotal].sort((a, b) => b.total - a.total)[0];
    const esperado = filtroRamo === 'Todos' ? 91 : null;

    app.innerHTML = `
      <div class="filtros" role="group" aria-label="Filtrar por ramo da Justiça">
        <div class="chips">${['Todos', ...RAMOS].map(r => `<button type="button" class="chip" data-ramo="${r}" aria-pressed="${r === filtroRamo}">${r === 'Todos' ? 'Todos os ramos' : esc(NOMES_RAMOS[r])}</button>`).join('')}</div>
      </div>
      <div class="grid grid-4 kpis">
        ${kpi('Registros de processos', LT.fmtInt(soma), `soma de ${comTotal.length} tribunais`)}
        ${kpi('Tribunais com dados', `${ts.length}${esperado ? ` <small class="muted">de ${esperado}</small>` : ''}`, ts.length === comTotal.length ? 'na base do DataJud' : `${comTotal.length} já com o total de processos`)}
        ${kpi('Processos eletrônicos', eletronico != null ? fmtPct(eletronico) : '—', 'média ponderada pelo volume')}
        ${kpi('Maior tribunal', maior ? esc(maior.sigla) : '—', maior ? `${LT.fmtInt(maior.total)} processos · ${fmtPct(pct(maior.total, soma))} do total` : '')}
      </div>
      <div class="grid grid-2">
        ${cartao('ranking', 'Tribunais por volume de processos', 'Clique no nome para abrir o tribunal.', 'span-2')}
        ${filtroRamo === 'Todos' ? cartao('ramos', 'Processos por ramo da Justiça', 'Soma dos tribunais de cada ramo.') : ''}
        ${cartao('lideres', 'Classe mais frequente em cada tribunal', 'Quantos tribunais têm cada classe como a mais comum.')}
        ${cartao('fisicos', 'Onde ainda há mais processos físicos', 'Tribunais com a menor fatia de processos eletrônicos.')}
        ${cartao('defasagem', 'Até quando vai a base de cada tribunal', 'Meses entre o último mês com volume real de ajuizamentos encontrado na base pública e a coleta. Parte das lacunas pode vir do formato das datas na origem (veja <a href="../sobre/#limitacoes">Limitações</a>).', filtroRamo === 'Todos' ? '' : 'span-2')}
      </div>
      <section class="card" style="margin-top:16px">
        <div class="card-head">
          <div><h2>Todos os tribunais</h2><p class="muted">Clique em uma coluna para ordenar e em uma linha para ver os detalhes.</p></div>
          <div class="row" style="flex:0 1 auto;align-items:center">
            <input type="text" class="busca" id="busca" placeholder="Buscar tribunal…" aria-label="Buscar tribunal" value="${esc(busca)}">
            <button class="btn secondary" type="button" id="baixar-csv">Baixar CSV</button>
          </div>
        </div>
        <div class="table-wrap"><table class="tabela-tribunais" id="tabela"></table></div>
      </section>`;

    app.querySelectorAll('[data-ramo]').forEach(b => b.addEventListener('click', () => {
      filtroRamo = b.dataset.ramo; LT.store.set('jurimetria-ramo', filtroRamo); mostrarTodos = false; render();
      document.querySelector(`[data-ramo="${filtroRamo}"]`)?.focus();
    }));

    // Ranking
    const ordenados = [...comTotal].sort((a, b) => b.total - a.total);
    const limite = mostrarTodos ? ordenados.length : 20;
    G.barras(document.getElementById('g-ranking'), ordenados.slice(0, limite).map(t => ({ nome: t.sigla, extra: t.nome, qtd: t.total, href: `#tribunal/${t.alias}` })), { total: soma });
    if (ordenados.length > 20) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'link-btn'; b.style.marginTop = '.75rem';
      b.textContent = mostrarTodos ? 'Mostrar só os 20 maiores' : `Mostrar todos os ${ordenados.length}`;
      b.id = 'mostrar-todos';
      b.addEventListener('click', () => { mostrarTodos = !mostrarTodos; render(); document.getElementById('mostrar-todos')?.focus(); });
      document.getElementById('g-ranking').append(b);
    }
    document.getElementById('t-ranking').innerHTML = G.tabela(['Tribunal', 'Processos'], ordenados.map(t => [`${t.sigla} · ${t.nome}`, t.total]));

    // Por ramo
    if (filtroRamo === 'Todos') {
      const ramos = RAMOS.map(r => ({ nome: NOMES_RAMOS[r], qtd: comTotal.filter(t => t.ramo === r).reduce((s, t) => s + t.total, 0) })).sort((a, b) => b.qtd - a.qtd);
      G.barras(document.getElementById('g-ramos'), ramos, { total: soma });
      document.getElementById('t-ramos').innerHTML = G.tabela(['Ramo', 'Processos'], ramos.map(r => [r.nome, r.qtd]));
    }

    // Classes líderes
    const contagem = new Map();
    for (const t of ts) if (t.classe_principal) {
      const c = contagem.get(t.classe_principal) || { n: 0, siglas: [] };
      c.n++; c.siglas.push(t.sigla); contagem.set(t.classe_principal, c);
    }
    const lideres = [...contagem].map(([nome, c]) => ({ nome, qtd: c.n, dica: c.siglas.join(', ') })).sort((a, b) => b.qtd - a.qtd).slice(0, 12);
    if (lideres.length) {
      G.barras(document.getElementById('g-lideres'), lideres, { unidade: 'tribunais', formato: n => String(n), formatoDica: n => String(n) });
      document.getElementById('t-lideres').innerHTML = G.tabela(['Classe', 'Tribunais'], lideres.map(l => [l.nome, l.qtd]));
    } else faltando('lideres', 'classes');

    // Processos físicos
    const fisicos = ts.filter(t => t.pct_eletronico != null && t.pct_eletronico < 100)
      .map(t => ({ nome: t.sigla, extra: t.nome, qtd: +(100 - t.pct_eletronico).toFixed(1), href: `#tribunal/${t.alias}` }))
      .sort((a, b) => b.qtd - a.qtd).slice(0, 10);
    if (fisicos.length) {
      G.barras(document.getElementById('g-fisicos'), fisicos, { unidade: 'dos processos são físicos', formato: v => fmtPct(v), formatoDica: v => fmtPct(v) });
      document.getElementById('t-fisicos').innerHTML = G.tabela(['Tribunal', '% físicos'], fisicos.map(f => [`${f.nome} · ${f.extra}`, fmtPct(f.qtd)]));
    } else {
      document.getElementById('g-fisicos').innerHTML = '<p class="muted vazio">Todos os tribunais deste filtro estão 100% eletrônicos.</p>';
      document.querySelector('#c-fisicos .ver-tabela')?.remove();
    }

    // Defasagem da base pública
    const comSerie = ts.filter(t => t.partes.includes('mensal') || t.partes.includes('anual'));
    const def = [], antigos = [];
    for (const t of comSerie) {
      const coleta = t.atualizado_em.slice(0, 7);
      let qtd = null, quando;
      if (t.ultimo_mes) { qtd = mesesEntre(t.ultimo_mes, coleta); quando = G.mesLongo(t.ultimo_mes); }
      else if (t.ultimo_ano) { qtd = mesesEntre(`${t.ultimo_ano}-12`, coleta); quando = `dezembro de ${t.ultimo_ano} ou antes`; }
      if (qtd == null || qtd > 36) antigos.push(t);
      else def.push({ nome: t.sigla, extra: t.nome, href: `#tribunal/${t.alias}`, qtd: Math.max(0, qtd), quando, dica: `último mês com volume real: ${quando}` });
    }
    def.sort((a, b) => b.qtd - a.qtd);
    const boxDef = document.getElementById('g-defasagem');
    if (comSerie.length) {
      if (def.length) G.barras(boxDef, def, { unidade: 'meses de atraso', formato: n => `${n} m`, formatoDica: String });
      else boxDef.innerHTML = '';
      const semSerie = ts.length - comSerie.length;
      boxDef.insertAdjacentHTML('beforeend', `
        ${antigos.length ? `<p style="margin:.9rem 0 .25rem"><strong>${plural(antigos.length, 'tribunal', 'tribunais')} sem ajuizamentos encontrados nos últimos 36 meses</strong> <span class="muted">(desde ${G.mesLongo(antigos[0].atualizado_em.slice(0, 7).replace(/^(\d{4})/, y => +y - 3))}, na coleta atual):</span></p>
          <p class="siglas">${antigos.sort((a, b) => (b.total || 0) - (a.total || 0)).map(t => `<a href="#tribunal/${t.alias}" title="${esc(t.nome)}">${esc(t.sigla)}</a>`).join(' ')}</p>` : ''}
        ${semSerie ? `<p class="muted" style="margin:.5rem 0 0;font-size:.85rem">${plural(semSerie, 'tribunal ainda sem', 'tribunais ainda sem')} a série de ajuizamentos coletada.</p>` : ''}`);
      document.getElementById('t-defasagem').innerHTML = G.tabela(['Tribunal', 'Último mês com dados', 'Meses de atraso'],
        [...def.map(x => [`${x.nome} · ${x.extra}`, x.quando, x.qtd]), ...antigos.map(t => [`${t.sigla} · ${t.nome}`, t.ultimo_ano ? `${t.ultimo_ano} ou antes` : 'antes dos últimos 36 meses', 'mais de 36'])]);
    } else faltando('defasagem', 'mensal');

    // Tabela completa
    desenharTabela(ts);
    const inp = document.getElementById('busca');
    inp.addEventListener('input', () => { busca = inp.value; desenharTabela(ts); });
    document.getElementById('baixar-csv').addEventListener('click', () => {
      const linhas = [['sigla', 'nome', 'ramo', 'total_processos', 'pct_eletronico', 'classe_mais_frequente', 'estatisticas_coletadas', 'atualizado_em']];
      // Formato do Excel em português: vírgula decimal e data dd/mm/aaaa.
      const dec = v => v == null ? '' : String(v).replace('.', ',');
      const dia = iso => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '';
      for (const t of ts) linhas.push([t.sigla, t.nome, t.ramo, t.total ?? '', dec(t.pct_eletronico), t.classe_principal ?? '', t.partes.length, dia(t.atualizado_em)]);
      LT.download(`jurimetria-tribunais-${new Date().toISOString().slice(0, 10)}.csv`, csv(linhas), 'text/csv;charset=utf-8');
    });
  }

  function desenharTabela(ts) {
    const cols = [
      { campo: 'sigla', rotulo: 'Tribunal' },
      { campo: 'ramo', rotulo: 'Ramo' },
      { campo: 'total', rotulo: 'Processos', num: true },
      { campo: 'pct_eletronico', rotulo: '% eletrônico', num: true },
      { campo: 'classe_principal', rotulo: 'Classe mais frequente' },
      { campo: 'cobertura', rotulo: 'Estatísticas', num: true },
      { campo: 'atualizado_em', rotulo: 'Atualizado', num: true },
    ];
    const q = busca.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    const valor = (t, c) => c === 'cobertura' ? t.partes.length : t[c];
    const linhas = ts.filter(t => !q || norm(`${t.sigla} ${t.nome} ${t.alias}`).includes(q))
      .sort((a, b) => {
        const va = valor(a, ordem.campo), vb = valor(b, ordem.campo);
        if (va == null) return 1; if (vb == null) return -1;
        return (typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR')) * ordem.dir;
      });
    const tab = document.getElementById('tabela');
    tab.innerHTML = `<thead><tr>${cols.map(c => `<th class="ordenavel${c.num ? ' num' : ''}" data-campo="${c.campo}" tabindex="0"${ordem.campo === c.campo ? ` aria-sort="${ordem.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${c.rotulo}</th>`).join('')}</tr></thead>
      <tbody>${linhas.map(t => `<tr data-alias="${t.alias}">
        <td><a href="#tribunal/${t.alias}">${esc(t.sigla)}</a><br><small class="muted">${esc(t.nome)}</small></td>
        <td>${esc(t.ramo)}</td>
        <td class="num">${t.total != null ? LT.fmtInt(t.total) : '—'}</td>
        <td class="num">${t.pct_eletronico != null ? fmtPct(t.pct_eletronico) : '—'}</td>
        <td>${esc(t.classe_principal || '—')}</td>
        <td class="num" title="${t.partes.length} de ${PARTES.length} estatísticas coletadas"><span class="cobertura" role="img" aria-label="${t.partes.length} de ${PARTES.length}">${PARTES.map(p => `<span class="${t.partes.includes(p) ? '' : 'falta'}"></span>`).join('')}</span></td>
        <td class="num">${fmtData(t.atualizado_em)}</td>
      </tr>`).join('') || `<tr><td colspan="${cols.length}" class="muted">Nenhum tribunal encontrado.</td></tr>`}</tbody>`;
    tab.querySelectorAll('th.ordenavel').forEach(th => {
      const ordenar = () => {
        const c = th.dataset.campo;
        ordem = ordem.campo === c ? { campo: c, dir: -ordem.dir } : { campo: c, dir: ['sigla', 'ramo', 'classe_principal'].includes(c) ? 1 : -1 };
        desenharTabela(ts);
        document.querySelector(`#tabela th[data-campo="${c}"]`)?.focus();
      };
      th.addEventListener('click', ordenar);
      th.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ordenar(); } });
    });
    tab.querySelectorAll('tbody tr[data-alias]').forEach(tr => tr.addEventListener('click', e => {
      if (e.target.closest('a')) return;
      location.hash = `#tribunal/${tr.dataset.alias}`;
    }));
  }

  // ---------- Visão 2: um tribunal ----------
  async function visaoTribunal(alias) {
    selecionarAba('tribunal');
    const pedido = alias;
    if (!alias || !porAlias(alias)) alias = LT.store.get('jurimetria-tribunal', 'tjsp');
    if (!porAlias(alias)) alias = indice.tribunais[0].alias;
    LT.store.set('jurimetria-tribunal', alias);
    if (location.hash !== `#tribunal/${alias}`) history.replaceState(null, '', `#tribunal/${alias}`);
    app.innerHTML = `<div class="filtros">
        <div class="campo"><label for="sel-tribunal">Tribunal</label><select id="sel-tribunal">${opcoesTribunais(alias)}</select></div>
        <a class="btn secondary" href="#comparar/${alias}">Comparar com outros</a>
      </div><p class="carregando"><span class="spinner"></span> Carregando ${esc(porAlias(alias).sigla)}…</p>`;
    document.getElementById('sel-tribunal').addEventListener('change', e => { location.hash = `#tribunal/${e.target.value}`; });

    let d;
    try { d = await tribunal(alias); } catch (e) {
      if (location.hash !== `#tribunal/${alias}`) return;
      app.querySelector('.carregando').outerHTML = `<div class="notice bad"><strong>Não foi possível carregar ${esc(porAlias(alias).sigla)}.</strong> ${esc(e.message)}. Tente de novo ou escolha outro tribunal.</div>`;
      return;
    }
    if (location.hash !== `#tribunal/${alias}`) return; // o usuário já trocou de tribunal

    const { pontos, parcial, ultimo, defasagem, insuficiente } = mesesCompletos(d);
    const atrasada = !!ultimo && defasagem >= 2;
    const anoFim = ultimoRelevante(d.anual, 'ano');
    const u12 = ultimos12(d);
    const el = pctEletronico(d);
    const graus = (d.graus || []);
    const somaGraus = graus.reduce((s, g) => s + g.qtd, 0);

    app.innerHTML = `
      <div class="filtros">
        <div class="campo"><label for="sel-tribunal">Tribunal</label><select id="sel-tribunal">${opcoesTribunais(alias)}</select></div>
        <a class="btn secondary" href="#comparar/${alias}">Comparar com outros</a>
        <button class="btn secondary" type="button" id="baixar-json">Baixar dados (JSON)</button>
        <button class="btn secondary" type="button" id="baixar-tcsv">Baixar dados (CSV)</button>
      </div>
      ${pedido && pedido !== alias ? `<div class="notice">Não há dados para "${esc(decodeURIComponent(pedido))}" no DataJud${pedido === 'tre-dft' ? ' (a API responde que o índice desse tribunal não existe)' : ''}. Mostrando ${esc(d.sigla)}.</div>` : ''}
      <section class="page-head" style="margin-bottom:1rem">
        <h2 style="font-size:1.35rem;margin:0">${esc(d.nome)} <span class="tag">${esc(NOMES_RAMOS[d.ramo] || d.ramo)}</span></h2>
        <p class="muted" style="margin:.25rem 0 0">Dados coletados até ${fmtData(d.atualizado_em)}.</p>
      </section>
      <div class="grid grid-4 kpis">
        ${kpi('Processos na base', d.total != null ? LT.fmtInt(d.total) : '—', d.total != null ? `${fmtPct(pct(d.total, indice.tribunais.reduce((s, t) => s + (t.total || 0), 0)), 2)} do total nacional` : 'total ainda não coletado')}
        ${u12 ? kpi('Ajuizados em 12 meses', LT.fmtInt(u12.atual), `12 meses completos até ${G.mesLongo(u12.ate)}${u12.variacao != null ? ` · ${u12.variacao >= 0 ? '+' : ''}${fmtPct(u12.variacao)} sobre os 12 meses anteriores` : ''}`)
          : anoFim ? kpi(`Ajuizados em ${anoFim}`, LT.fmtInt(d.anual.find(x => x.ano === anoFim).qtd), 'último ano com dados na base (provavelmente incompleto)')
          : kpi('Ajuizados em 12 meses', '—', insuficiente ? 'sem ajuizamentos recentes na base pública' : pontos.length ? 'menos de 12 meses completos na série' : 'histórico mensal ainda não coletado')}
        ${kpi('Processos eletrônicos', el != null ? fmtPct(el) : '—', d.formatos ? d.formatos.map(f => `${esc(f.nome)}: ${LT.fmtInt(f.qtd)}`).join(' · ') : 'ainda não coletado')}
        ${kpi('Classe mais frequente', esc(primeiro(d.classes)), basePct(d, 'classes') ? `${fmtPct(pct(d.classes[0].qtd, basePct(d, 'classes')))} dos processos` : d.classes?.length ? `${LT.fmtInt(d.classes[0].qtd)} processos` : 'ainda não coletada', true)}
      </div>
      <div class="grid grid-2">
        ${d.anual?.length ? cartao('anual', 'Processos ajuizados por ano', !anoFim ? 'Poucos processos com data de ajuizamento na base deste tribunal.' : +anoFim < new Date().getFullYear() ? `Na base pública, o volume de ajuizamentos deste tribunal vai até <strong>${anoFim}</strong>.` : 'Desde 2000, pela data de ajuizamento. O último ano está em andamento.', 'span-2') : ''}
        ${cartao('mensal', 'Processos ajuizados por mês', atrasada
          ? `Na base pública, a série deste tribunal vai até <strong>${G.mesLongo(ultimo)}</strong> (${defasagem} meses antes da coleta). A coluna mais clara é esse último mês, provavelmente incompleto.`
          : insuficiente ? 'Pela data de ajuizamento.' : 'Pela data de ajuizamento. A coluna mais clara é o mês mais recente, ainda incompleto.', 'span-2')}
        ${cartao('classes', 'Classes processuais mais frequentes', 'Tipo de ação ou recurso (Tabelas Processuais Unificadas do CNJ).')}
        ${cartao('assuntos', 'Assuntos mais frequentes', 'Um processo pode ter mais de um assunto.')}
        ${cartao('orgaos', 'Órgãos julgadores com mais processos', 'Varas, câmaras, turmas e gabinetes.')}
        ${cartao('graus', 'Processos por grau de jurisdição', '')}
        ${cartao('sistemas', 'Sistemas processuais eletrônicos', 'Sistema em que o processo tramita.')}
        <section class="card qualidade" id="c-qualidade"><h2>Qualidade e cobertura dos dados</h2><div id="qualidade"></div></section>
      </div>`;
    document.getElementById('sel-tribunal').addEventListener('change', e => { location.hash = `#tribunal/${e.target.value}`; });

    if (d.anual?.length) {
      const anos = d.anual.map(a => ({ mes: a.ano, qtd: a.qtd }));
      const iFim = anos.findIndex(a => a.mes === anoFim);
      limpar.push(G.colunas(document.getElementById('g-anual'), anos, {
        parcial: iFim >= 0 && (iFim === anos.length - 1 || +anoFim < new Date().getFullYear()) ? iFim : -1,
        rotulo: p => p.mes, rotuloLongo: p => p.mes, titulo: `Processos ajuizados por ano no ${d.sigla}`,
        rotuloParcial: +anoFim < new Date().getFullYear() ? 'último ano com dados na base (provavelmente incompleto)' : 'ano em andamento',
      }));
      document.getElementById('t-anual').innerHTML = G.tabela(['Ano', 'Processos ajuizados'], anos.map(a => [a.mes, a.qtd]));
    }
    if (insuficiente) {
      const soma = pontos.reduce((a, p) => a + p.qtd, 0);
      const quando = d.partes_atualizadas_em?.mensal ? ` (consulta de ${fmtData(d.partes_atualizadas_em.mensal)})` : '';
      const achado = soma
        ? `a API do DataJud devolveu só ${LT.fmtInt(soma)} processo${soma === 1 ? '' : 's'} do ${esc(d.sigla)} ajuizado${soma === 1 ? '' : 's'} nos 36 meses anteriores à coleta${quando}, entre ${G.mesLongo(pontos[0].mes)} e ${G.mesLongo(pontos[pontos.length - 1].mes)}`
        : `a API do DataJud não devolveu nenhum processo do ${esc(d.sigla)} ajuizado nos 36 meses anteriores à coleta${quando}`;
      document.getElementById('g-mensal').innerHTML = `<p class="muted vazio" style="text-align:left">Sem série mensal recente: ${achado}. ${d.anual?.length ? 'A série anual acima mostra até quando vão os dados.' : 'Isso pode refletir dados antigos na base ou datas gravadas em outro formato pelo tribunal; a próxima coleta conta os dois formatos e busca também a série anual.'} Os outros números desta página (total, classes, assuntos, órgãos) cobrem todo o acervo da base.</p>`;
      if (pontos.length) document.getElementById('t-mensal').innerHTML = G.tabela(['Mês', 'Processos ajuizados'], pontos.map(p => [G.mesLongo(p.mes), p.qtd]));
      else document.querySelector('#c-mensal .ver-tabela')?.remove();
    } else if (pontos.length) {
      // Meses depois do último mês com volume real são só registros soltos: ficam de fora.
      const serie = pontos.slice(0, parcial + 1);
      limpar.push(G.colunas(document.getElementById('g-mensal'), serie, { parcial, titulo: `Processos ajuizados por mês no ${d.sigla}`, rotuloParcial: atrasada ? 'último mês na base (provavelmente incompleto)' : 'mês em andamento (parcial)' }));
      document.getElementById('t-mensal').innerHTML = G.tabela(['Mês', 'Processos ajuizados'], serie.map((p, i) => [G.mesLongo(p.mes) + (i === parcial ? ' (parcial)' : ''), p.qtd]));
    } else faltando('mensal', 'mensal');
    grafBarras('classes', d.classes, { total: basePct(d, 'classes'), parte: 'classes', colunaNome: 'Classe' });
    grafBarras('assuntos', d.assuntos, { total: basePct(d, 'assuntos'), unidade: 'processos com este assunto', parte: 'assuntos', colunaNome: 'Assunto' });
    grafBarras('orgaos', d.orgaos, { total: basePct(d, 'orgaos'), parte: 'orgaos', colunaNome: 'Órgão julgador' });
    grafBarras('graus', graus, { total: somaGraus, parte: 'graus', nomear: nomeGrau, colunaNome: 'Grau' });
    grafBarras('sistemas', d.sistemas, { total: (d.sistemas || []).reduce((s, x) => s + x.qtd, 0), parte: 'sistemas', colunaNome: 'Sistema' });

    // Qualidade dos dados
    const faltam = PARTES.filter(p => d[p] == null);
    const erros = Object.keys(d.erros || {});
    document.getElementById('qualidade').innerHTML = `
      <p><strong>${PARTES.length - faltam.length} de ${PARTES.length}</strong> estatísticas coletadas.</p>
      ${faltam.length ? `<p class="muted">Ainda faltam: ${faltam.map(p => esc(NOMES_PARTES[p])).join(', ')}. A API do DataJud vive sobrecarregada; o coletor tenta de novo toda madrugada e mantém os números anteriores quando uma consulta falha.</p>` : ''}
      ${erros.length && erros.some(p => !faltam.includes(p)) ? `<p class="muted">Na última coleta não foi possível atualizar: ${erros.filter(p => !faltam.includes(p)).map(p => esc(NOMES_PARTES[p])).join(', ')}. Os valores mostrados são da coleta anterior.</p>` : ''}
      <div class="table-wrap"><table><thead><tr><th>Estatística</th><th class="num">Atualizada em</th></tr></thead><tbody>
        ${PARTES.map(p => `<tr><td>${esc(NOMES_PARTES[p])}</td><td class="num">${d.partes_atualizadas_em?.[p] ? fmtData(d.partes_atualizadas_em[p]) : '<span class="tag warn">pendente</span>'}</td></tr>`).join('')}
      </tbody></table></div>`;

    document.getElementById('baixar-json').addEventListener('click', () => {
      const { erros: _e, ...limpo } = d;
      LT.download(`jurimetria-${alias}.json`, JSON.stringify(limpo, null, 1), 'application/json');
    });
    document.getElementById('baixar-tcsv').addEventListener('click', () => {
      const linhas = [['estatistica', 'item', 'quantidade']];
      if (d.total != null) linhas.push(['total', 'processos', d.total]);
      for (const p of ['classes', 'assuntos', 'orgaos', 'graus', 'sistemas', 'formatos']) for (const x of d[p] || []) linhas.push([p, p === 'graus' ? nomeGrau(x.nome) : x.nome, x.qtd]);
      for (const x of d.anual || []) linhas.push(['anual', x.ano, x.qtd]);
      for (const x of d.mensal || []) linhas.push(['mensal', x.mes, x.qtd]);
      LT.download(`jurimetria-${alias}.csv`, csv(linhas), 'text/csv;charset=utf-8');
    });
  }

  // ---------- Visão 3: comparar ----------
  let modoIndice = LT.store.get('jurimetria-indice', false);

  async function comparar(lista) {
    selecionarAba('comparar');
    let aliases = (lista || '').split(',').map(s => s.trim()).filter(a => porAlias(a));
    aliases = [...new Set(aliases)].slice(0, MAX_COMPARAR);
    const vazioDeProposito = lista === ''; // o usuário removeu todos os tribunais
    if (!aliases.length && !vazioDeProposito) {
      aliases = (LT.store.get('jurimetria-comparar', null) || ['tjsp', 'tjrj', 'tjmg']).filter(a => porAlias(a));
      if (!aliases.length) aliases = indice.tribunais.slice(0, 3).map(t => t.alias);
    }
    LT.store.set('jurimetria-comparar', aliases);
    const hash = `#comparar/${aliases.join(',')}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);

    const seletorAdicionar = () => aliases.length < MAX_COMPARAR
      ? `<div class="campo"><label for="add-tribunal">Adicionar tribunal</label><select id="add-tribunal"><option value="">Escolha…</option>${opcoesTribunais(null, aliases)}</select></div>` : '';
    const ligarAdicionar = () => document.getElementById('add-tribunal')?.addEventListener('change', e => {
      if (e.target.value) location.hash = `#comparar/${[...aliases, e.target.value].join(',')}`;
    });
    if (!aliases.length) {
      app.innerHTML = `<div class="filtros">${seletorAdicionar()}</div><p class="muted vazio">Escolha até ${MAX_COMPARAR} tribunais para comparar.</p>`;
      ligarAdicionar();
      return;
    }

    app.innerHTML = `<p class="carregando"><span class="spinner"></span> Carregando…</p>`;
    const resultados = await Promise.allSettled(aliases.map(tribunal));
    if (location.hash !== hash) return;
    const dados = resultados.filter(r => r.status === 'fulfilled').map(r => r.value);
    const falharam = aliases.filter((a, i) => resultados[i].status === 'rejected');

    const series = dados.map(d => ({ nome: d.sigla, pontos: mesesCompletos(d).completos || [] }));
    const semSerie = dados.filter(d => !mesesCompletos(d).completos.length).map(d => d.sigla);
    const seriesGraf = modoIndice ? series.map(s => {
      const media = s.pontos.reduce((a, p) => a + p.qtd, 0) / (s.pontos.length || 1);
      return { nome: s.nome, pontos: s.pontos.map(p => ({ mes: p.mes, qtd: media ? 100 * p.qtd / media : 0 })) };
    }) : series;

    app.innerHTML = `
      <div class="filtros">
        <div style="flex:1 1 100%">
          <label>Tribunais comparados <span class="hint">(até ${MAX_COMPARAR})</span></label>
          <div class="chips">${dados.map((d, k) => `<button type="button" class="chip" aria-pressed="true" data-remover="${d.alias}" title="Remover ${esc(d.sigla)}"><i style="background:var(--serie-${k + 1})"></i>${esc(d.sigla)}<span class="x" aria-hidden="true">×</span><span class="sr">remover</span></button>`).join('')}${falharam.map(a => `<button type="button" class="chip" aria-pressed="true" data-remover="${a}" title="Remover ${esc(porAlias(a).sigla)}">${esc(porAlias(a).sigla)} (erro ao carregar)<span class="x" aria-hidden="true">×</span><span class="sr">remover</span></button>`).join('')}</div>
        </div>
        ${seletorAdicionar()}
        <div class="campo" style="flex:0 1 auto"><label for="modo">Escala</label><select id="modo">
          <option value="abs"${modoIndice ? '' : ' selected'}>Números absolutos</option>
          <option value="idx"${modoIndice ? ' selected' : ''}>Índice (média do período = 100)</option>
        </select></div>
      </div>
      <section class="card">
        <div class="card-head"><div><h2>Processos ajuizados por mês</h2>
          <p class="muted">${modoIndice ? 'Só meses completos. Cada tribunal dividido pela própria média: 120 = 20% acima do normal daquele tribunal. Assim dá para comparar tendências de tribunais de tamanhos diferentes.' : 'Só meses completos. Use o índice para comparar tendências de tribunais de tamanhos muito diferentes.'}</p></div></div>
        <ul class="legenda">${dados.map((d, k) => `<li><i style="background:var(--serie-${k + 1})"></i>${esc(d.sigla)} · ${esc(d.nome)}</li>`).join('')}</ul>
        ${semSerie.length ? `<p class="notice" style="margin-top:0">Sem série mensal utilizável para ${semSerie.map(esc).join(', ')}: a série ainda não foi coletada ou a base pública desse tribunal para antes do período.</p>` : ''}
        <div class="viz-box" id="g-comp"></div>
        <details class="ver-tabela"><summary>Ver como tabela</summary><div id="t-comp"></div></details>
      </section>
      <section class="card" style="margin-top:16px">
        <h2>Lado a lado</h2>
        <div class="table-wrap" id="lado"></div>
      </section>`;

    app.querySelectorAll('[data-remover]').forEach(b => b.addEventListener('click', () => {
      const resto = aliases.filter(a => a !== b.dataset.remover);
      LT.store.set('jurimetria-comparar', resto);
      location.hash = `#comparar/${resto.join(',')}`;
    }));
    ligarAdicionar();
    document.getElementById('modo').addEventListener('change', e => {
      modoIndice = e.target.value === 'idx'; LT.store.set('jurimetria-indice', modoIndice); render();
    });

    const fmtIdx = v => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
    limpar.push(G.linhas(document.getElementById('g-comp'), seriesGraf, {
      formatoValor: modoIndice ? fmtIdx : G.fmt, unidade: modoIndice ? 'índice (média do tribunal = 100)' : 'processos ajuizados',
    }));
    const meses = [...new Set(seriesGraf.flatMap(s => s.pontos.map(p => p.mes)))].sort();
    const mapas = seriesGraf.map(s => new Map(s.pontos.map(p => [p.mes, p.qtd])));
    document.getElementById('t-comp').innerHTML = G.tabela(['Mês', ...dados.map(d => d.sigla)],
      meses.map(m => [G.mesLongo(m), ...mapas.map(mp => mp.has(m) ? (modoIndice ? fmtIdx(mp.get(m)) : mp.get(m)) : '—')]));

    const metricas = [
      ['Processos na base', d => d.total != null ? LT.fmtInt(d.total) : '—'],
      ['Ajuizados nos últimos 12 meses', d => { const u = ultimos12(d); return u ? LT.fmtInt(u.atual) : '—'; }],
      ['Variação sobre os 12 meses anteriores', d => { const u = ultimos12(d); return u?.variacao != null ? `${u.variacao >= 0 ? '+' : ''}${fmtPct(u.variacao)}` : '—'; }],
      ['Processos eletrônicos', d => { const e = pctEletronico(d); return e != null ? fmtPct(e) : '—'; }],
      ['Classe mais frequente', d => esc(primeiro(d.classes))],
      ['Assunto mais frequente', d => esc(primeiro(d.assuntos))],
      ['Grau com mais processos', d => esc(primeiro(d.graus, g => nomeGrau(g.nome)))],
      ['Sistema principal', d => esc(primeiro(d.sistemas))],
      ['Dados coletados até', d => fmtData(d.atualizado_em)],
    ];
    document.getElementById('lado').innerHTML = `<table><thead><tr><th><span class="sr">Indicador</span></th>${dados.map((d, k) => `<th><a href="#tribunal/${d.alias}">${esc(d.sigla)}</a></th>`).join('')}</tr></thead>
      <tbody>${metricas.map(([r, f]) => `<tr><td class="muted">${r}</td>${dados.map(d => `<td>${f(d)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  // ---------- Roteamento ----------
  function erro(e) {
    app.innerHTML = `<div class="notice bad"><strong>Não foi possível carregar os dados.</strong> ${esc(e.message)}<br>Se você abriu o arquivo direto do computador, use um servidor local (por exemplo, <code>serve.ps1</code>) ou a versão publicada.</div>`;
  }
  async function render() {
    limpar.forEach(f => f && f()); limpar = [];
    G.esconderDica();
    const [rota, bruto] = location.hash.replace(/^#/, '').split('/');
    let arg = bruto;
    try { arg = bruto == null ? bruto : decodeURIComponent(bruto).toLowerCase().replace(/\s+/g, ''); } catch { /* hash inválido */ }
    try {
      if (rota === 'tribunal') await visaoTribunal(arg);
      else if (rota === 'comparar') await comparar(arg);
      else panorama();
    } catch (e) { console.error(e); erro(e); }
  }

  (async () => {
    try { indice = await json(`${DADOS}index.json`); } catch (e) { return erro(e); }
    indice.tribunais = indice.tribunais.filter(t => /^[a-z0-9-]+$/.test(t.alias)).sort((a, b) => (b.total || 0) - (a.total || 0));
    document.getElementById('frescor').textContent = `Dados de ${indice.tribunais.length} tribunais · última coleta em ${fmtData(indice.tribunais.map(t => t.atualizado_em).sort().pop())} · atualização automática diária.`;
    window.addEventListener('hashchange', () => { render(); });
    render();
  })();
})();

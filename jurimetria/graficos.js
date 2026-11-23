// Gráficos do dashboard de jurimetria, em SVG e HTML puros (sem biblioteca externa).
// Cores, grade e textos vêm das variáveis CSS de jurimetria.css, então os temas claro e escuro
// se ajustam sozinhos. Todo gráfico tem dica ao passar o mouse e uma tabela equivalente.
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const fmt = n => Number(n || 0).toLocaleString('pt-BR');
  const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
  const fmtC = n => compacto.format(n);
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function mesCurto(m) { const [a, mm] = m.split('-'); return `${MESES[+mm - 1]}/${a.slice(2)}`; }
  function mesLongo(m) { const [a, mm] = m.split('-'); return `${MESES_LONGOS[+mm - 1]} de ${a}`; }

  function el(tag, attrs = {}, parent) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.append(e);
    return e;
  }

  // Escala "bonita": 0 até um teto arredondado, com ~4 marcas.
  function marcas(max, n = 4) {
    if (!(max > 0)) return { teto: 1, passos: [0, 1] };
    const bruto = max / n;
    const pot = 10 ** Math.floor(Math.log10(bruto));
    const passo = [1, 2, 2.5, 5, 10].map(f => f * pot).find(p => p >= bruto);
    const teto = Math.ceil(max / passo) * passo;
    const passos = [];
    for (let v = 0; v <= teto + passo / 2; v += passo) passos.push(v);
    return { teto, passos };
  }

  // Dica flutuante compartilhada por todos os gráficos.
  const tip = document.createElement('div');
  tip.className = 'viz-tip';
  tip.setAttribute('role', 'status');
  tip.hidden = true;
  document.addEventListener('DOMContentLoaded', () => document.body.append(tip));
  function mostrarDica(html, x, y) {
    if (!tip.isConnected) document.body.append(tip);
    tip.innerHTML = html;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > innerHeight - 8) top = y - r.height - 14;
    tip.style.left = `${Math.max(8, left) + scrollX}px`;
    tip.style.top = `${Math.max(8, top) + scrollY}px`;
  }
  function esconderDica() { tip.hidden = true; }

  // Mouse: a dica segue o ponteiro e some ao sair. Toque: aparece no toque e fica até tocar fora.
  function interativo(alvo, aoMover, aoSair) {
    alvo.addEventListener('pointermove', aoMover);
    alvo.addEventListener('pointerdown', aoMover);
    alvo.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') aoSair(); });
    tocaveis.push([alvo, aoSair]);
  }
  const tocaveis = [];
  document.addEventListener('pointerdown', e => {
    for (const [alvo, aoSair] of tocaveis) if (alvo.isConnected && !alvo.contains(e.target)) aoSair();
    for (let i = tocaveis.length - 1; i >= 0; i--) if (!tocaveis[i][0].isConnected) tocaveis.splice(i, 1);
  }, true);
  addEventListener('scroll', () => { if (!tip.hidden && matchMedia('(pointer: coarse)').matches) esconderDica(); }, { passive: true });

  // Redesenha quando a largura do contêiner muda.
  function responsivo(container, desenhar) {
    let largura = 0;
    const ro = new ResizeObserver(() => {
      const w = Math.floor(container.clientWidth);
      if (w && w !== largura) { largura = w; desenhar(w); }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }

  // Caminho de coluna com topo arredondado (4px) e base reta.
  function colunaPath(x, y, w, h, r = 4) {
    if (h <= 0) return '';
    r = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  /**
   * Barras horizontais ordenadas (ranking). HTML puro: os nomes longos quebram linha.
   * itens: [{nome, qtd, extra?, href?}]
   */
  function barras(container, itens, opts = {}) {
    const { unidade = 'processos', total = null, max = null, formato = fmtC, formatoDica = fmt } = opts;
    container.innerHTML = '';
    if (!itens || !itens.length) { container.innerHTML = '<p class="muted vazio">Sem dados.</p>'; return; }
    const teto = max ?? Math.max(...itens.map(i => i.qtd));
    const lista = document.createElement('ol');
    lista.className = 'hbars';
    for (const it of itens) {
      const li = document.createElement('li');
      const pct = total ? ` · ${(100 * it.qtd / total).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '';
      const nome = it.href ? `<a href="${esc(it.href)}">${esc(it.nome)}</a>` : esc(it.nome);
      li.innerHTML = `
        <span class="hbar-nome">${nome}${it.extra ? ` <small>${esc(it.extra)}</small>` : ''}</span>
        <span class="hbar-trilho"><span class="hbar" style="width:${teto ? Math.max(0.4, 100 * it.qtd / teto) : 0}%"></span></span>
        <span class="hbar-valor">${formato(it.qtd)}</span>`;
      const dica = `<strong>${esc(it.nome)}</strong><br>${formatoDica(it.qtd)} ${unidade}${pct}${it.dica ? `<br>${esc(it.dica)}` : ''}`;
      interativo(li, e => mostrarDica(dica, e.clientX, e.clientY), esconderDica);
      lista.append(li);
    }
    container.append(lista);
  }

  /**
   * Colunas mensais (uma série). pontos: [{mes:'2024-01', qtd}]
   * opts.parcial: índice do mês incompleto (desenhado mais claro).
   */
  function colunas(container, pontos, opts = {}) {
    const { parcial = -1, unidade = 'processos ajuizados', altura = 260, rotuloParcial = 'mês em andamento (parcial)' } = opts;
    container.innerHTML = '';
    if (!pontos || !pontos.length) { container.innerHTML = '<p class="muted vazio">Sem dados.</p>'; return () => {}; }
    const curto = opts.rotulo || (p => mesCurto(p.mes));
    const longo = opts.rotuloLongo || (p => mesLongo(p.mes));
    return responsivo(container, w => {
      container.innerHTML = '';
      const m = { t: 12, r: 8, b: 28, l: 48 };
      const iw = w - m.l - m.r, ih = altura - m.t - m.b;
      const { teto, passos } = marcas(Math.max(...pontos.map(p => p.qtd)));
      const svg = el('svg', { viewBox: `0 0 ${w} ${altura}`, width: w, height: altura, class: 'viz', role: 'img', 'aria-label': opts.titulo || 'Gráfico de colunas por mês' }, container);
      const g = el('g', { transform: `translate(${m.l},${m.t})` }, svg);
      for (const v of passos) {
        const y = ih - (v / teto) * ih;
        el('line', { x1: 0, x2: iw, y1: y, y2: y, class: v === 0 ? 'eixo' : 'grade' }, g);
        el('text', { x: -8, y: y + 4, 'text-anchor': 'end', class: 'rotulo-eixo' }, g).textContent = fmtC(v);
      }
      const banda = iw / pontos.length;
      const cw = Math.min(24, Math.max(2, banda - 2));
      const passoRotulo = Math.max(1, Math.ceil(pontos.length / Math.max(1, Math.floor(iw / 54))));
      const colunasEl = [];
      pontos.forEach((p, i) => {
        const h = (p.qtd / teto) * ih;
        const x = i * banda + (banda - cw) / 2;
        const path = el('path', { d: colunaPath(x, ih - h, cw, h), class: 'coluna' + (i === parcial ? ' parcial' : '') }, g);
        colunasEl.push(path);
        if (i % passoRotulo === 0) {
          el('text', { x: i * banda + banda / 2, y: ih + 18, 'text-anchor': 'middle', class: 'rotulo-eixo' }, g).textContent = curto(p);
        }
      });
      // Rótulo direto só no pico e no último mês completo.
      const ultimoCompleto = parcial >= 0 ? parcial - 1 : pontos.length - 1;
      let pico = 0; pontos.forEach((p, i) => { if (p.qtd > pontos[pico].qtd) pico = i; });
      const rotular = [pico];
      // O segundo rótulo só entra se não encostar no do pico.
      if (ultimoCompleto >= 0 && ultimoCompleto !== pico && Math.abs(ultimoCompleto - pico) * banda >= 56) rotular.push(ultimoCompleto);
      for (const i of rotular) {
        const h = (pontos[i].qtd / teto) * ih;
        const x0 = i * banda + (banda - cw) / 2;
        const [x, ancora] = i < 2 ? [x0, 'start'] : i > pontos.length - 3 ? [x0 + cw, 'end'] : [x0 + cw / 2, 'middle'];
        el('text', { x, y: Math.max(10, ih - h - 6), 'text-anchor': ancora, class: 'rotulo-direto' }, g).textContent = fmtC(pontos[i].qtd);
      }
      // Faixa de captura (maior que a coluna) para o mouse e o toque.
      const hit = el('rect', { x: 0, y: 0, width: iw, height: ih, fill: 'transparent' }, g);
      const ativo = i => colunasEl.forEach((c, j) => c.classList.toggle('apagada', i !== null && j !== i));
      interativo(hit, e => {
        const r = svg.getBoundingClientRect();
        const i = Math.min(pontos.length - 1, Math.max(0, Math.floor((e.clientX - r.left - m.l) / banda)));
        ativo(i);
        const p = pontos[i];
        mostrarDica(`<strong>${esc(longo(p))}</strong><br>${fmt(p.qtd)} ${unidade}${i === parcial ? `<br><em>${esc(rotuloParcial)}</em>` : ''}`, e.clientX, e.clientY);
      }, () => { ativo(null); esconderDica(); });
    });
  }

  /**
   * Linhas para comparar séries mensais (até 4). series: [{nome, pontos:[{mes,qtd}]}]
   * As cores seguem a ordem fixa das séries (--serie-1 … --serie-4).
   */
  function linhas(container, series, opts = {}) {
    const { altura = 300, formatoValor = fmt, unidade = 'processos ajuizados', parcialMes = null } = opts;
    container.innerHTML = '';
    if (!series.length) { container.innerHTML = '<p class="muted vazio">Escolha pelo menos um tribunal.</p>'; return () => {}; }
    const meses = [...new Set(series.flatMap(s => s.pontos.map(p => p.mes)))].sort();
    if (!meses.length) { container.innerHTML = '<p class="muted vazio">Sem dados mensais.</p>'; return () => {}; }
    const mapas = series.map(s => new Map(s.pontos.map(p => [p.mes, p.qtd])));
    return responsivo(container, w => {
      container.innerHTML = '';
      const larguraRotulo = w < 520 ? 0 : 64;
      const m = { t: 14, r: 10 + larguraRotulo, b: 28, l: 48 };
      const iw = w - m.l - m.r, ih = altura - m.t - m.b;
      const max = Math.max(...mapas.flatMap(mp => [...mp.values()]));
      const { teto, passos } = marcas(max);
      const x = i => meses.length === 1 ? iw / 2 : (i / (meses.length - 1)) * iw;
      const y = v => ih - (v / teto) * ih;
      const svg = el('svg', { viewBox: `0 0 ${w} ${altura}`, width: w, height: altura, class: 'viz', role: 'img', 'aria-label': opts.titulo || 'Comparação mensal' }, container);
      const g = el('g', { transform: `translate(${m.l},${m.t})` }, svg);
      for (const v of passos) {
        el('line', { x1: 0, x2: iw, y1: y(v), y2: y(v), class: v === 0 ? 'eixo' : 'grade' }, g);
        el('text', { x: -8, y: y(v) + 4, 'text-anchor': 'end', class: 'rotulo-eixo' }, g).textContent = fmtC(v);
      }
      const passoRotulo = Math.max(1, Math.ceil(meses.length / Math.max(1, Math.floor(iw / 54))));
      meses.forEach((mes, i) => {
        if (i % passoRotulo === 0) el('text', { x: x(i), y: ih + 18, 'text-anchor': 'middle', class: 'rotulo-eixo' }, g).textContent = mesCurto(mes);
      });
      const iParcial = parcialMes ? meses.indexOf(parcialMes) : -1;
      if (iParcial > 0) {
        el('rect', { x: x(iParcial - 1), y: 0, width: x(iParcial) - x(iParcial - 1), height: ih, class: 'faixa-parcial' }, g);
      }
      const finais = [];
      series.forEach((s, k) => {
        const cor = `var(--serie-${k + 1})`;
        let d = '', aberto = false, ultimo = null;
        meses.forEach((mes, i) => {
          const v = mapas[k].get(mes);
          if (v == null) { aberto = false; return; }
          d += `${aberto ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
          aberto = true; ultimo = i;
        });
        el('path', { d, class: 'linha', style: `stroke:${cor}` }, g);
        if (ultimo != null) {
          const v = mapas[k].get(meses[ultimo]);
          el('circle', { cx: x(ultimo), cy: y(v), r: 4, class: 'ponto', style: `fill:${cor}` }, g);
          finais.push({ k, x: x(ultimo), y: y(v), nome: s.nome });
        }
      });
      // Rótulos diretos no fim de cada linha, afastados para não se sobreporem.
      // Cada rótulo fica logo depois do último ponto da sua linha; rótulos próximos são afastados
      // na vertical (mín. 13px) sem sair da área do gráfico.
      if (larguraRotulo) {
        const perto = (a, b) => Math.abs(a.x - b.x) < 60;
        finais.sort((a, b) => a.y - b.y);
        for (let i = 0; i < finais.length; i++) {
          for (let j = 0; j < i; j++) if (perto(finais[i], finais[j]) && finais[i].y - finais[j].y < 13) finais[i].y = finais[j].y + 13;
        }
        for (let i = finais.length - 1; i >= 0; i--) {
          if (finais[i].y > ih - 2) finais[i].y = ih - 2;
          for (let j = i + 1; j < finais.length; j++) if (perto(finais[i], finais[j]) && finais[j].y - finais[i].y < 13) finais[i].y = finais[j].y - 13;
        }
        for (const f of finais) el('text', { x: f.x + 8, y: Math.max(8, f.y) + 4, class: 'rotulo-direto' }, g).textContent = f.nome;
      }
      const cursor = el('line', { x1: 0, x2: 0, y1: 0, y2: ih, class: 'cursor', visibility: 'hidden' }, g);
      const marcadores = series.map((s, k) => el('circle', { r: 4, class: 'ponto', style: `fill:var(--serie-${k + 1})`, visibility: 'hidden' }, g));
      const hit = el('rect', { x: 0, y: 0, width: iw, height: ih, fill: 'transparent' }, g);
      interativo(hit, e => {
        const r = svg.getBoundingClientRect();
        const rel = (e.clientX - r.left - m.l) / iw;
        const i = Math.min(meses.length - 1, Math.max(0, Math.round(rel * (meses.length - 1))));
        cursor.setAttribute('x1', x(i)); cursor.setAttribute('x2', x(i)); cursor.setAttribute('visibility', 'visible');
        const linhasDica = series.map((s, k) => {
          const v = mapas[k].get(meses[i]);
          const mk = marcadores[k];
          if (v == null) { mk.setAttribute('visibility', 'hidden'); return ''; }
          mk.setAttribute('cx', x(i)); mk.setAttribute('cy', y(v)); mk.setAttribute('visibility', 'visible');
          return `<span class="tip-linha"><i style="background:var(--serie-${k + 1})"></i>${esc(s.nome)}<b>${formatoValor(v)}</b></span>`;
        }).join('');
        mostrarDica(`<strong>${esc(mesLongo(meses[i]))}</strong>${i === iParcial ? ' <em>(parcial)</em>' : ''}${linhasDica}<small>${esc(unidade)}</small>`, e.clientX, e.clientY);
      }, () => {
        cursor.setAttribute('visibility', 'hidden');
        marcadores.forEach(mk => mk.setAttribute('visibility', 'hidden'));
        esconderDica();
      });
    });
  }

  /** Tabela equivalente a um gráfico (acessibilidade e conferência dos números). */
  function tabela(cabecalhos, linhasTabela) {
    return `<div class="table-wrap"><table><thead><tr>${cabecalhos.map((h, i) => `<th${i ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${linhasTabela.map(l => `<tr>${l.map((c, i) => `<td${i ? ' class="num"' : ''}>${typeof c === 'number' ? fmt(c) : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  window.Graficos = { barras, colunas, linhas, tabela, mesCurto, mesLongo, fmt, fmtC, esconderDica };
})();

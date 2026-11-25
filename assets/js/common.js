// JusLab.IA — cabeçalho, tema e utilitários compartilhados.
(function () {
  const base = document.body.dataset.base || './';
  const page = document.body.dataset.page || 'inicio';

  // A marca leva ao início; o menu lista as ferramentas e páginas do projeto.
  const TOOLS = [
    { id: 'jurimetria', href: 'jurimetria/', label: 'Jurimetria', rotulo: 'Jurimetria · dados do CNJ' },
    { id: 'prazos', href: 'prazos/', label: 'Prazos', rotulo: 'Ferramenta · CPC' },
    { id: 'documentos', href: 'documentos/', label: 'Documentos', rotulo: 'Ferramenta · modelos' },
    { id: 'contratos', href: 'contratos/', label: 'Contratos', rotulo: 'Ferramenta · análise de risco' },
    { id: 'legislacao', href: 'legislacao/', label: 'Legislação', rotulo: 'Ferramenta · IA com fontes oficiais' },
    { id: 'lgpd', href: 'lgpd/', label: 'LGPD', rotulo: 'Ferramenta · Lei 13.709/2018' },
    { id: 'lei-anotada', href: 'lei-anotada/', label: 'Direito Penal', rotulo: 'Direito Penal · fontes oficiais' },
    { id: 'ia-juridica', href: 'ia-juridica/', label: 'IA jurídica', rotulo: 'Projeto · skill para o Claude' },
    { id: 'sobre', href: 'sobre/', label: 'Sobre', rotulo: 'Projeto' },
  ];
  const AUTOR = { nome: 'João Lang Casagrande', github: 'https://github.com/LangCasagrande', linkedin: '' };

  // Ícones de traço (24px), usados nos cartões e botões.
  const ICONES = {
    grafico: '<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V8M17 16v-8"/>',
    calendario: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M8 14h3"/>',
    documento: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    lupa: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/>',
    balanca: '<path d="M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
    escudo: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    instancias: '<rect x="3" y="15" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/><rect x="15" y="3" width="6" height="6" rx="1.5"/>',
    seta: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    check: '<path d="m5 12 4 4 10-10"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    fechar: '<path d="M6 6l12 12M18 6 6 18"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    lua: '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>',
    github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
  };
  const icone = (nome, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${nome === 'check' ? 2.4 : 1.8}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${ICONES[nome] || ''}</svg>`;

  // Ícone da aba (o mesmo "§" da marca), sem precisar de arquivo de imagem.
  if (!document.querySelector('link[rel="icon"]')) {
    const icon = document.createElement('link');
    icon.rel = 'icon';
    icon.href = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#0f1d33"/><text x="16" y="23" font-size="20" text-anchor="middle" fill="#c9b27c" font-family="Georgia,serif">§</text></svg>');
    document.head.append(icon);
  }

  // Tema: segue o sistema; o botão alterna e lembra a escolha neste navegador.
  const root = document.documentElement;
  function storedTheme() { try { return localStorage.getItem('tema'); } catch { return null; } }
  function saveTheme(t) { try { localStorage.setItem('tema', t); } catch { /* sem armazenamento */ } }
  const saved = storedTheme();
  if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
  function currentTheme() {
    if (root.dataset.theme) return root.dataset.theme;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  const header = document.createElement('header');
  header.className = 'topbar';
  header.innerHTML = `
    <div class="topbar-inner">
      <a class="brand" href="${base}" aria-label="JusLab.IA — início">
        <span class="brand-text"><span>JusLab<span class="ia">.IA</span></span><small>dados e tecnologia para o Direito</small></span>
      </a>
      <nav class="nav" id="menu-principal" aria-label="Menu principal">
        ${TOOLS.map(t => `<a href="${base}${t.href}"${t.id === page ? ' aria-current="page"' : ''}>${t.label}</a>`).join('')}
      </nav>
      <button class="icon-btn menu-btn" type="button" aria-controls="menu-principal" aria-expanded="false" aria-label="Abrir menu">${icone('menu')}</button>
      <button class="icon-btn" type="button" id="theme-toggle" aria-label="Alternar tema claro/escuro"></button>
    </div>`;
  document.body.prepend(header);
  const faixaTopo = document.createElement('aside');
  faixaTopo.setAttribute('aria-label', 'Sobre o projeto');
  faixaTopo.className = 'faixa-topo';
  faixaTopo.innerHTML = `<div class="faixa-topo-in"><span>Dados públicos do CNJ · fontes oficiais</span><a href="${base}sobre/">Projeto de ${AUTOR.nome}</a></div>`;
  document.body.prepend(faixaTopo);

  // Menu do celular (☰)
  const menuBtn = header.querySelector('.menu-btn');
  menuBtn.addEventListener('click', () => {
    const aberto = header.classList.toggle('aberto');
    menuBtn.setAttribute('aria-expanded', String(aberto));
    menuBtn.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
    menuBtn.innerHTML = icone(aberto ? 'fechar' : 'menu');
  });

  // Título da página numa faixa escura logo abaixo do cabeçalho (todas as páginas, menos o início).
  const cabecalho = document.querySelector('main > .page-head');
  if (cabecalho) {
    const banda = document.createElement('section');
    banda.className = 'banda';
    const titulo = cabecalho.querySelector('h1');
    if (titulo) { titulo.id = titulo.id || 'titulo-pagina'; banda.setAttribute('aria-labelledby', titulo.id); }
    const atual = TOOLS.find(t => t.id === page);
    banda.innerHTML = `<div class="banda-in">${atual?.rotulo ? `<span class="rotulo">${atual.rotulo}</span>` : ''}</div>`;
    banda.firstElementChild.append(cabecalho);
    header.after(banda);
  }

  // Link "pular para o conteúdo" (aparece ao navegar com Tab).
  const main = document.querySelector('main');
  if (main) {
    if (!main.id) main.id = 'conteudo';
    const pular = document.createElement('a');
    pular.className = 'pular';
    pular.href = `#${main.id}`;
    pular.textContent = 'Pular para o conteúdo';
    pular.addEventListener('click', e => { e.preventDefault(); main.setAttribute('tabindex', '-1'); main.focus(); });
    document.body.prepend(pular);
  }

  const toggle = header.querySelector('#theme-toggle');
  function paintToggle() { toggle.innerHTML = icone(currentTheme() === 'dark' ? 'sol' : 'lua'); }
  paintToggle();
  toggle.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    saveTheme(next);
    paintToggle();
    document.dispatchEvent(new CustomEvent('themechange', { detail: next }));
  });

  const footer = document.createElement('footer');
  footer.className = 'footer';
  const linkAutor = AUTOR.linkedin ? ` · <a href="${AUTOR.linkedin}" rel="me noopener" target="_blank">LinkedIn</a>` : '';
  footer.innerHTML = `
    <div class="footer-in">
      <div>
        <a class="brand" href="${base}"><span class="brand-text"><span>JusLab<span class="ia">.IA</span></span></span></a>
        <p>Dados e tecnologia para o Direito. Projeto aberto de estudo e portfólio em legal tech.</p>
        <p class="autor">Feito por ${AUTOR.nome}<br><a href="${AUTOR.github}" rel="me noopener" target="_blank">GitHub</a>${linkAutor}</p>
      </div>
      <div><h2 class="footer-titulo">Ferramentas</h2>${TOOLS.slice(0, 7).map(t => `<a href="${base}${t.href}">${t.label}</a>`).join('')}</div>
      <div><h2 class="footer-titulo">Projeto</h2><a href="${base}sobre/">Sobre</a><a href="${base}sobre/#metodologia">Metodologia</a><a href="${base}sobre/#limitacoes">Limitações dos dados</a><a href="${base}ia-juridica/">IA jurídica em 3 instâncias</a><a href="https://github.com/LangCasagrande/dashboard-jurimetria" rel="noopener" target="_blank">Código no GitHub</a></div>
      <div><h2 class="footer-titulo">Fonte dos dados</h2><a href="https://datajud-wiki.cnj.jus.br/api-publica/acesso" rel="noopener" target="_blank">API Pública do DataJud</a><p style="margin:.35rem 0 0">Portaria CNJ nº 160/2020</p></div>
    </div>
    <div class="footer-legal"><span>Ferramentas educacionais de apoio. Não substituem a análise de um advogado nem a consulta ao calendário e às normas do tribunal.</span><span>© 2026 JusLab.IA · <span class="powered">powered by <strong title="Aretaic: do grego aretḗ, excelência">Aretaic</strong></span></span></div>`;
  document.body.append(footer);

  // Utilitários usados pelas páginas
  window.LT = {
    base,
    esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    fmtInt(n) { return Number(n || 0).toLocaleString('pt-BR'); },
    fmtDate(d) { return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' }); },
    fmtDateLong(d) { return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }); },
    store: {
      get(k, fallback = null) { try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
      set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } },
      del(k) { try { localStorage.removeItem(k); } catch { /* sem armazenamento */ } },
    },
    download(filename, content, mime) {
      const blob = new Blob([content], { type: mime });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.append(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    },
    themeVar(name) { return getComputedStyle(root).getPropertyValue(name).trim(); },
    icone,
    autor: AUTOR,
  };
})();

// Laboratório de Legal Tech — cabeçalho, tema e utilitários compartilhados.
(function () {
  const base = document.body.dataset.base || './';
  const page = document.body.dataset.page || 'inicio';

  const TOOLS = [
    { id: 'inicio', href: '', label: 'Início' },
    { id: 'jurimetria', href: 'jurimetria/', label: 'Jurimetria' },
    { id: 'prazos', href: 'prazos/', label: 'Prazos' },
    { id: 'documentos', href: 'documentos/', label: 'Documentos' },
    { id: 'contratos', href: 'contratos/', label: 'Contratos' },
    { id: 'legislacao', href: 'legislacao/', label: 'Legislação' },
    { id: 'lgpd', href: 'lgpd/', label: 'LGPD' },
    { id: 'sobre', href: 'sobre/', label: 'Sobre' },
  ];

  // Ícone da aba (o mesmo "§" da marca), sem precisar de arquivo de imagem.
  if (!document.querySelector('link[rel="icon"]')) {
    const icon = document.createElement('link');
    icon.rel = 'icon';
    icon.href = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#1f4e8c"/><text x="16" y="23" font-size="20" text-anchor="middle" fill="#fff" font-family="Georgia,serif">§</text></svg>');
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
      <a class="brand" href="${base}">
        <span class="brand-mark" aria-hidden="true">§</span>
        <span class="brand-text">Laboratório de Legal Tech</span>
      </a>
      <nav class="nav" aria-label="Ferramentas">
        ${TOOLS.map(t => `<a href="${base}${t.href}"${t.id === page ? ' aria-current="page"' : ''}>${t.label}</a>`).join('')}
      </nav>
      <button class="icon-btn" type="button" id="theme-toggle" aria-label="Alternar tema claro/escuro"></button>
    </div>`;
  document.body.prepend(header);

  const toggle = header.querySelector('#theme-toggle');
  function paintToggle() { toggle.textContent = currentTheme() === 'dark' ? '☀' : '☾'; }
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
  footer.innerHTML = `
    <p>Ferramentas educacionais de apoio. Não substituem a análise de um advogado nem a consulta ao calendário e às normas do tribunal.</p>
    <p>Código aberto no <a href="https://github.com/LangCasagrande/dashboard-jurimetria">GitHub</a> · <a href="${base}sobre/">Sobre o projeto e metodologia</a>.</p>`;
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
  };
})();

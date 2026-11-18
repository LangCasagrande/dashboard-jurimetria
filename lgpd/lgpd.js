// Kit LGPD: checklist de adequação com nota e gerador de política de privacidade.
(function () {
  const { esc, store, download } = window.LT;
  const $ = id => document.getElementById(id);

  // ---------- Abas ----------
  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    $('painel-checklist').hidden = b.dataset.tab !== 'checklist';
    $('painel-politica').hidden = b.dataset.tab !== 'politica';
    store.set('lgpd:aba', b.dataset.tab);
  }));
  if (store.get('lgpd:aba') === 'politica') document.querySelector('[data-tab="politica"]').click();

  // ---------- Checklist ----------
  const GRUPOS = [
    ['Governança', [
      ['encarregado', 'Há um encarregado (DPO) ou canal de contato divulgado no site', 'Art. 41 da LGPD; Resoluções CD/ANPD nº 2/2022 e nº 18/2024'],
      ['ropa', 'Existe registro das operações de tratamento de dados', 'Art. 37'],
      ['politica', 'A política de privacidade está publicada e atualizada', 'Arts. 6º, VI, e 9º'],
      ['treinamento', 'A equipe recebe treinamento sobre proteção de dados', 'Art. 50'],
      ['ripd', 'Há relatório de impacto (RIPD) para tratamentos de alto risco', 'Art. 38'],
    ]],
    ['Bases legais e finalidade', [
      ['base', 'Cada tratamento tem uma base legal identificada', 'Arts. 7º e 11'],
      ['minimizacao', 'Só são coletados os dados necessários para a finalidade', 'Art. 6º, III (necessidade)'],
      ['consentimento', 'Quando usado, o consentimento é livre, destacado e fácil de revogar', 'Art. 8º'],
      ['sensiveis', 'Dados sensíveis (saúde, biometria etc.) só com hipótese do art. 11', 'Art. 11'],
      ['criancas', 'Dados de crianças e adolescentes seguem o melhor interesse', 'Art. 14'],
      ['retencao', 'Há prazo de retenção e os dados são eliminados ao fim do tratamento', 'Arts. 15 e 16'],
    ]],
    ['Direitos dos titulares', [
      ['canal', 'Existe canal para pedir acesso, correção, eliminação e portabilidade', 'Art. 18'],
      ['prazo15', 'Pedidos de acesso completo são respondidos em até 15 dias', 'Art. 19, II'],
      ['compartilhamento', 'O titular é informado com quem os dados são compartilhados', 'Arts. 9º, V, e 18, VII'],
    ]],
    ['Segurança', [
      ['acesso', 'Controle de acesso, senhas fortes e autenticação em dois fatores', 'Art. 46'],
      ['backup', 'Backups regulares e criptografia de dados sensíveis', 'Art. 46'],
      ['incidente', 'Plano de resposta a incidentes com comunicação à ANPD em 3 dias úteis', 'Art. 48; Resolução CD/ANPD nº 15/2024'],
    ]],
    ['Terceiros e site', [
      ['operadores', 'Contratos com fornecedores (operadores) têm cláusulas de proteção de dados', 'Art. 39'],
      ['internacional', 'Transferência internacional com mecanismo válido (ex.: cláusulas-padrão)', 'Art. 33; Resolução CD/ANPD nº 19/2024'],
      ['cookies', 'Banner de cookies permite recusar os não essenciais', 'Art. 8º; Guia de cookies da ANPD'],
    ]],
  ];
  const OPCOES = [['sim', 'Sim'], ['parcial', 'Parcial'], ['nao', 'Não'], ['na', 'N/A']];
  let respostas = store.get('lgpd:respostas', {});

  $('lista-check').innerHTML = GRUPOS.map(([g, itens]) => `
    <h2 style="margin-top:.5rem">${esc(g)}</h2>
    ${itens.map(([id, texto, base]) => `
      <div class="item">
        <p>${esc(texto)}<small>${esc(base)}</small></p>
        <div class="seg" role="radiogroup" aria-label="${esc(texto)}">
          ${OPCOES.map(([v, l]) => `<label><input type="radio" name="q_${id}" value="${v}"${respostas[id] === v ? ' checked' : ''}><span>${l}</span></label>`).join('')}
        </div>
      </div>`).join('')}`).join('') + `
    <div class="actions no-print"><button class="btn secondary" type="button" id="zerar">Limpar respostas</button><button class="btn secondary" type="button" id="imprimir-check">Imprimir relatório</button></div>`;

  $('lista-check').addEventListener('change', e => {
    if (e.target.type !== 'radio') return;
    respostas[e.target.name.slice(2)] = e.target.value;
    store.set('lgpd:respostas', respostas);
    resumo();
  });
  $('zerar').addEventListener('click', () => { respostas = {}; store.del('lgpd:respostas'); document.querySelectorAll('#lista-check input').forEach(i => { i.checked = false; }); resumo(); });
  $('imprimir-check').addEventListener('click', () => window.print());

  function pontuar(itens) {
    let pontos = 0, total = 0, respondidos = 0;
    for (const [id] of itens) {
      const r = respostas[id];
      if (!r) continue;
      respondidos++;
      if (r === 'na') continue;
      total++;
      pontos += r === 'sim' ? 1 : r === 'parcial' ? 0.5 : 0;
    }
    return { pct: total ? Math.round((pontos / total) * 100) : 0, respondidos, total };
  }

  function resumo() {
    const todos = GRUPOS.flatMap(g => g[1]);
    const geral = pontuar(todos);
    const nivel = geral.pct >= 85 ? ['Avançado', 'ok'] : geral.pct >= 60 ? ['Intermediário', 'warn'] : geral.pct >= 30 ? ['Inicial', 'warn'] : ['Crítico', 'bad'];
    const pendencias = todos.filter(([id]) => respostas[id] === 'nao' || respostas[id] === 'parcial');
    $('resumo-check').innerHTML = `
      <h2>Maturidade em LGPD</h2>
      <p class="big">${geral.total ? geral.pct + '%' : '—'}</p>
      <p>${geral.total ? `<span class="tag ${nivel[1]}">${nivel[0]}</span>` : ''} <span class="muted">${geral.respondidos} de ${todos.length} itens respondidos</span></p>
      ${GRUPOS.map(([g, itens]) => { const p = pontuar(itens); return `<div class="grupo-res"><span>${esc(g)}</span><strong style="text-align:right">${p.total ? p.pct + '%' : '—'}</strong><div class="bar"><i style="width:${p.pct}%"></i></div></div>`; }).join('')}
      ${pendencias.length ? `<h3 style="margin-top:1rem">Prioridades (${pendencias.length})</h3><ol style="padding-left:1.1rem;font-size:.9rem">${pendencias.slice(0, 6).map(([, t, b]) => `<li>${esc(t)} <small class="muted">(${esc(b)})</small></li>`).join('')}</ol>` : ''}`;
  }
  resumo();

  // ---------- Gerador de política de privacidade ----------
  const DADOS = [['identificacao', 'Identificação (nome, CPF, RG)'], ['contato', 'Contato (e-mail, telefone, endereço)'], ['financeiros', 'Dados financeiros e de pagamento'], ['navegacao', 'Navegação (IP, cookies, dispositivo)'], ['localizacao', 'Localização'], ['saude', 'Dados de saúde (sensíveis)'], ['biometria', 'Biometria (sensíveis)']];
  const FINALIDADES = [['servico', 'Prestar o serviço ou entregar o produto contratado', 'execução de contrato (art. 7º, V)'], ['legal', 'Cumprir obrigações legais, fiscais e regulatórias', 'cumprimento de obrigação legal (art. 7º, II)'], ['seguranca', 'Prevenir fraudes e garantir a segurança', 'legítimo interesse e prevenção à fraude (arts. 7º, IX, e 11, II, g)'], ['marketing', 'Enviar comunicações e ofertas', 'consentimento (art. 7º, I), revogável a qualquer momento'], ['analise', 'Medir audiência e melhorar o site', 'legítimo interesse (art. 7º, IX) e consentimento para cookies não essenciais'], ['direitos', 'Exercer direitos em processos judiciais ou administrativos', 'exercício regular de direitos (art. 7º, VI)']];
  const COMPART = [['pagamento', 'empresas de pagamento'], ['entrega', 'transportadoras e serviços de entrega'], ['nuvem', 'provedores de hospedagem e nuvem'], ['marketing', 'ferramentas de marketing e e-mail'], ['autoridades', 'autoridades públicas, quando exigido por lei']];

  const CAMPOS = [
    ['Empresa', [['empresa', 'Nome empresarial'], ['cnpj', 'CNPJ'], ['endereco', 'Endereço'], ['site', 'Site']]],
    ['Encarregado (DPO)', [['dpoNome', 'Nome do encarregado'], ['dpoEmail', 'E-mail para assuntos de privacidade']]],
  ];
  const cks = (grupo, lista, sel) => lista.map(([id, label]) => `<label class="check"><input type="checkbox" data-grupo="${grupo}" value="${id}"${sel.includes(id) ? ' checked' : ''}> ${esc(label)}</label>`).join('');
  const POL_PADRAO = { dados: ['identificacao', 'contato', 'navegacao'], finalidades: ['servico', 'legal', 'seguranca'], compart: ['pagamento', 'nuvem', 'autoridades'], internacional: false, retencao: 'pelo tempo necessário para cumprir as finalidades informadas e os prazos legais (por exemplo, 5 anos para documentos fiscais)' };
  let pol = { ...POL_PADRAO, ...store.get('lgpd:politica', {}) };

  $('form-politica').innerHTML = CAMPOS.map(([g, cs]) => `<fieldset><legend>${g}</legend>${cs.map(([id, l]) => `<label for="p_${id}">${l}</label><input type="text" id="p_${id}" data-campo="${id}" value="${esc(pol[id] || '')}">`).join('')}</fieldset>`).join('') + `
    <fieldset><legend>Dados coletados</legend>${cks('dados', DADOS, pol.dados)}</fieldset>
    <fieldset><legend>Finalidades</legend>${cks('finalidades', FINALIDADES, pol.finalidades)}</fieldset>
    <fieldset><legend>Compartilhamento com</legend>${cks('compart', COMPART, pol.compart)}</fieldset>
    <fieldset><legend>Outros</legend>
      <label class="check"><input type="checkbox" id="p_internacional"${pol.internacional ? ' checked' : ''}> Há transferência de dados para outros países (ex.: nuvem no exterior)</label>
      <label for="p_retencao">Prazo de guarda dos dados</label><textarea id="p_retencao" rows="2">${esc(pol.retencao)}</textarea>
    </fieldset>`;

  function lerPolitica() {
    const p = { dados: [], finalidades: [], compart: [] };
    document.querySelectorAll('#form-politica [data-campo]').forEach(i => { p[i.dataset.campo] = i.value; });
    document.querySelectorAll('#form-politica [data-grupo]').forEach(i => { if (i.checked) p[i.dataset.grupo].push(i.value); });
    p.internacional = $('p_internacional').checked;
    p.retencao = $('p_retencao').value;
    return p;
  }

  function renderPolitica() {
    pol = lerPolitica();
    store.set('lgpd:politica', pol);
    const v = (x, ph) => x && x.trim() ? esc(x.trim()) : `<span class="ph">[${ph}]</span>`;
    const lista = (ids, fonte) => fonte.filter(([id]) => ids.includes(id));
    const sensiveis = pol.dados.some(d => d === 'saude' || d === 'biometria');
    const hoje = new Date().toLocaleDateString('pt-BR');
    $('politica').innerHTML = `
      <h1>Política de Privacidade</h1>
      <p><em>Última atualização: ${hoje}</em></p>
      <p>Esta política explica como ${v(pol.empresa, 'nome da empresa')}, inscrita no CNPJ sob o nº ${v(pol.cnpj, 'CNPJ')}, com sede em ${v(pol.endereco, 'endereço')} ("nós"), trata os dados pessoais de clientes e visitantes${pol.site ? ` do site ${esc(pol.site)}` : ''}, nos termos da Lei 13.709/2018 (Lei Geral de Proteção de Dados – LGPD).</p>
      <h2>1. Quais dados coletamos</h2>
      <ul>${lista(pol.dados, DADOS).map(([, l]) => `<li>${esc(l)}</li>`).join('') || '<li><span class="ph">[selecione os dados]</span></li>'}</ul>
      ${sensiveis ? '<p>Dados sensíveis são tratados somente nas hipóteses do art. 11 da LGPD, com medidas de segurança reforçadas.</p>' : ''}
      <h2>2. Para que usamos os dados e com qual base legal</h2>
      <ul>${lista(pol.finalidades, FINALIDADES).map(([, l, b]) => `<li><strong>${esc(l)}</strong> — base legal: ${esc(b)}.</li>`).join('') || '<li><span class="ph">[selecione as finalidades]</span></li>'}</ul>
      <p>Não usamos os dados para finalidades incompatíveis com as informadas aqui.</p>
      <h2>3. Com quem compartilhamos</h2>
      <p>Compartilhamos dados apenas o necessário e com: ${lista(pol.compart, COMPART).map(([, l]) => esc(l)).join('; ') || '<span class="ph">[selecione]</span>'}. Esses parceiros devem proteger os dados e usá-los só para os fins contratados (art. 39 da LGPD).</p>
      ${pol.internacional ? '<p>Alguns fornecedores armazenam dados fora do Brasil. Nesses casos, a transferência segue o art. 33 da LGPD e a regulamentação da ANPD, com garantias como cláusulas contratuais padrão.</p>' : ''}
      <h2>4. Por quanto tempo guardamos</h2>
      <p>Os dados são mantidos ${v(pol.retencao, 'prazo')}. Depois disso, são eliminados ou anonimizados, salvo as hipóteses de conservação do art. 16 da LGPD.</p>
      <h2>5. Seus direitos</h2>
      <p>Você pode, a qualquer momento e de forma gratuita, pedir: confirmação de que tratamos seus dados; acesso; correção; anonimização, bloqueio ou eliminação de dados desnecessários; portabilidade; informação sobre compartilhamentos; e revogação do consentimento (art. 18 da LGPD). Pedidos de acesso completo são respondidos em até 15 dias (art. 19, II). Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>
      <h2>6. Segurança</h2>
      <p>Adotamos medidas técnicas e administrativas para proteger os dados contra acessos não autorizados e incidentes (art. 46). Se ocorrer um incidente que possa causar risco ou dano relevante, comunicaremos a ANPD e os titulares afetados (art. 48).</p>
      <h2>7. Cookies</h2>
      <p>Usamos cookies necessários para o funcionamento do site. Cookies de análise ou marketing só são usados com a sua permissão, que pode ser alterada a qualquer momento.</p>
      <h2>8. Encarregado e contato</h2>
      <p>Nosso encarregado pelo tratamento de dados é ${v(pol.dpoNome, 'nome do encarregado')}, que pode ser contatado pelo e-mail ${v(pol.dpoEmail, 'e-mail')}.</p>
      <h2>9. Alterações</h2>
      <p>Podemos atualizar esta política. A versão vigente estará sempre disponível${pol.site ? ` em ${esc(pol.site)}` : ' em nosso site'}, com a data da última atualização.</p>`;
  }
  $('form-politica').addEventListener('input', renderPolitica);
  $('form-politica').addEventListener('change', renderPolitica);
  renderPolitica();

  const docHtml = corpo => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Política de Privacidade</title><style>body{font-family:Georgia,serif;max-width:760px;margin:2rem auto;padding:0 16px;line-height:1.6}h1{text-align:center}.ph{background:#fff3c4}</style></head><body>${corpo}</body></html>`;
  $('pol-imprimir').addEventListener('click', () => window.print());
  $('pol-word').addEventListener('click', () => download('politica-de-privacidade.doc', '﻿' + docHtml($('politica').innerHTML), 'application/msword'));
  $('pol-html').addEventListener('click', () => download('politica-de-privacidade.html', docHtml($('politica').innerHTML), 'text/html'));
})();

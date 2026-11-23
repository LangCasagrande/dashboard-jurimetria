// Modelos de documentos jurídicos. Cada modelo declara seus campos e uma função que monta o texto.
(function () {
  const esc = s => window.LT.esc(s);
  const v = (x, ph) => (x && String(x).trim()) ? esc(String(x).trim()) : `<span class="ph">[${esc(ph)}]</span>`;
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function dataExtenso(iso) {
    if (!iso) return '<span class="ph">[data]</span>';
    const [y, m, d] = iso.split('-').map(Number);
    return `${d === 1 ? '1º' : d} de ${MESES[m - 1]} de ${y}`;
  }

  // Valor por extenso em reais (até bilhões).
  const UN = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const CEN = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  function ate999(n) {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100), r = n % 100, partes = [];
    if (c) partes.push(CEN[c]);
    if (r) partes.push(r < 20 ? UN[r] : DEZ[Math.floor(r / 10)] + (r % 10 ? ' e ' + UN[r % 10] : ''));
    return partes.join(' e ');
  }
  function inteiroExtenso(n) {
    if (n === 0) return 'zero';
    const grupos = [[1e9, 'bilhão', 'bilhões'], [1e6, 'milhão', 'milhões'], [1e3, 'mil', 'mil'], [1, '', '']];
    const partes = []; // [valor do grupo, texto]
    let resto = n;
    for (const [div, sing, plur] of grupos) {
      const q = Math.floor(resto / div);
      resto %= div;
      if (!q) continue;
      if (div === 1e3) partes.push([q, q === 1 ? 'mil' : `${ate999(q)} mil`]);
      else if (div === 1) partes.push([q, ate999(q)]);
      else partes.push([q, `${ate999(q)} ${q === 1 ? sing : plur}`]);
    }
    if (partes.length === 1) return partes[0][1];
    const [qUltimo, ultimo] = partes.pop();
    // "mil e duzentos", "mil duzentos e cinquenta": usa "e" se o último grupo for < 100 ou centena redonda.
    const conector = qUltimo < 100 || qUltimo % 100 === 0 ? ' e ' : ' ';
    return partes.map(p => p[1]).join(', ') + conector + ultimo;
  }
  function reaisExtenso(valor) {
    const total = Math.round(Number(valor) * 100);
    if (!isFinite(total) || total <= 0) return '';
    const r = Math.floor(total / 100), c = total % 100, partes = [];
    if (r) {
      const milhaoRedondo = r >= 1e6 && r % 1e6 === 0;
      partes.push(`${inteiroExtenso(r)}${milhaoRedondo ? ' de' : ''} ${r === 1 ? 'real' : 'reais'}`);
    }
    if (c) partes.push(`${inteiroExtenso(c)} ${c === 1 ? 'centavo' : 'centavos'}`);
    return partes.join(' e ');
  }
  const moeda = x => Number(x || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  // Parcelas que somam exatamente o total: a diferença de centavos vai para a primeira.
  function textoParcelas(valor, n) {
    const centavos = Math.round(valor * 100), base = Math.floor(centavos / n), resto = centavos - base * n;
    if (!resto) return `em ${n} parcelas mensais e sucessivas de ${moeda(base / 100)}`;
    return `em ${n} parcelas mensais e sucessivas, sendo a primeira de ${moeda((base + resto) / 100)} e as demais de ${moeda(base / 100)}`;
  }
  // 20 -> "vinte"; 20.5 -> "vinte vírgula cinco"; 12.25 -> "doze vírgula vinte e cinco".
  function percentualExtenso(x) {
    const [int, dec = ''] = String(Number(x)).split('.');
    const inteiro = +int === 0 ? 'zero' : inteiroExtenso(+int);
    if (!dec) return inteiro;
    const casas = dec.slice(0, 2);
    return `${inteiro} vírgula ${casas.startsWith('0') ? 'zero ' : ''}${inteiroExtenso(+casas)}`;
  }
  const valorCompleto = (x, ph) => (Number(x) > 0) ? `${moeda(x)} (${reaisExtenso(x)})` : `<span class="ph">[${esc(ph)}]</span>`;

  const qualifPF = (p, f) => `${v(f[p + 'Nome'], 'nome completo')}, ${v(f[p + 'Nacionalidade'], 'nacionalidade')}, ${v(f[p + 'EstadoCivil'], 'estado civil')}, ${v(f[p + 'Profissao'], 'profissão')}, inscrito(a) no CPF sob o nº ${v(f[p + 'Cpf'], 'CPF')}, residente e domiciliado(a) em ${v(f[p + 'Endereco'], 'endereço completo')}`;
  const camposPF = (p, titulo) => [
    { id: p + 'Nome', label: 'Nome completo', group: titulo },
    { id: p + 'Nacionalidade', label: 'Nacionalidade', def: 'brasileiro(a)', group: titulo },
    { id: p + 'EstadoCivil', label: 'Estado civil', group: titulo },
    { id: p + 'Profissao', label: 'Profissão', group: titulo },
    { id: p + 'Cpf', label: 'CPF', group: titulo },
    { id: p + 'Endereco', label: 'Endereço completo', group: titulo },
  ];
  const camposAdv = [
    { id: 'advNome', label: 'Nome do(a) advogado(a)', group: 'Advogado(a)' },
    { id: 'advOab', label: 'Nº de inscrição na OAB', group: 'Advogado(a)' },
    { id: 'advUf', label: 'Seccional (UF)', def: 'SP', group: 'Advogado(a)' },
    { id: 'advEndereco', label: 'Endereço profissional', group: 'Advogado(a)' },
    { id: 'advEmail', label: 'E-mail', group: 'Advogado(a)' },
  ];
  const qualifAdv = f => `${v(f.advNome, 'nome do(a) advogado(a)')}, advogado(a) inscrito(a) na OAB/${v(f.advUf, 'UF')} sob o nº ${v(f.advOab, 'número')}, com escritório profissional em ${v(f.advEndereco, 'endereço profissional')}${f.advEmail ? `, e-mail ${esc(f.advEmail)}` : ''}`;
  const camposLocalData = [
    { id: 'local', label: 'Cidade', group: 'Local e data' },
    { id: 'data', label: 'Data', type: 'date', def: 'hoje', group: 'Local e data' },
  ];
  const localData = f => `<p class="right">${v(f.local, 'cidade')}, ${dataExtenso(f.data)}.</p>`;
  const assinatura = nome => `<div class="sign"><div class="line"></div><p>${nome}</p></div>`;

  const PODERES = [
    ['receberCitacao', 'receber citação'],
    ['confessar', 'confessar'],
    ['reconhecer', 'reconhecer a procedência do pedido'],
    ['transigir', 'transigir'],
    ['desistir', 'desistir'],
    ['renunciar', 'renunciar ao direito sobre o qual se funda a ação'],
    ['quitacao', 'receber, dar quitação e levantar valores, inclusive por alvará'],
    ['compromisso', 'firmar compromisso'],
    ['hipossuficiencia', 'assinar declaração de hipossuficiência econômica'],
  ];

  const MODELOS = [
    {
      id: 'procuracao',
      nome: 'Procuração ad judicia et extra',
      base: 'Art. 105 do CPC e art. 5º da Lei 8.906/94',
      campos: [
        ...camposPF('out', 'Outorgante (cliente)'),
        ...camposAdv,
        { id: 'finalidade', label: 'Finalidade específica', type: 'textarea', hint: 'opcional — ex.: propor ação de indenização em face de Fulano', group: 'Poderes' },
        ...PODERES.map(([id, label]) => ({ id: 'p_' + id, label, type: 'checkbox', group: 'Poderes especiais (art. 105)' })),
        { id: 'substabelecer', label: 'Pode substabelecer', type: 'checkbox', def: true, group: 'Poderes' },
        ...camposLocalData,
      ],
      render(f) {
        const especiais = PODERES.filter(([id]) => f['p_' + id]).map(([, l]) => l);
        const listaEsp = especiais.length ? `, conferindo-lhe ainda os poderes especiais para ${especiais.join(', ').replace(/, ([^,]*)$/, ' e $1')}` : '';
        return `
          <h1>PROCURAÇÃO <em>AD JUDICIA ET EXTRA</em></h1>
          <p><strong>OUTORGANTE:</strong> ${qualifPF('out', f)}.</p>
          <p><strong>OUTORGADO(A):</strong> ${qualifAdv(f)}.</p>
          <p><strong>PODERES:</strong> pelo presente instrumento particular de mandato, o(a) outorgante nomeia e constitui o(a) outorgado(a) seu(sua) bastante procurador(a), conferindo-lhe os poderes da cláusula <em>ad judicia et extra</em>, para o foro em geral, podendo representá-lo(a) perante qualquer juízo, instância ou tribunal, repartições públicas e entidades privadas, propor as ações competentes e defendê-lo(a) nas contrárias, seguindo umas e outras até decisão final, usando dos recursos legais e acompanhando-os, nos termos do art. 105 do Código de Processo Civil${listaEsp}${f.substabelecer ? ', podendo substabelecer com ou sem reserva de poderes' : ''}${f.finalidade ? `, especialmente para ${esc(f.finalidade.trim().replace(/\.$/, ''))}` : ''}.</p>
          ${localData(f)}
          ${assinatura(v(f.outNome, 'outorgante'))}`;
      },
    },
    {
      id: 'substabelecimento',
      nome: 'Substabelecimento',
      base: 'Art. 667 do Código Civil e art. 26 do Código de Ética e Disciplina da OAB',
      campos: [
        ...camposAdv.map(c => ({ ...c, group: 'Substabelecente (advogado atual)' })),
        { id: 'subNome', label: 'Nome do(a) substabelecido(a)', group: 'Substabelecido(a)' },
        { id: 'subOab', label: 'Nº de inscrição na OAB', group: 'Substabelecido(a)' },
        { id: 'subUf', label: 'Seccional (UF)', def: 'SP', group: 'Substabelecido(a)' },
        { id: 'cliente', label: 'Nome do cliente (mandante)', group: 'Processo' },
        { id: 'processo', label: 'Número do processo', hint: 'opcional', group: 'Processo' },
        { id: 'reserva', label: 'Com reserva de poderes', type: 'checkbox', def: true, group: 'Processo' },
        ...camposLocalData,
      ],
      render(f) {
        return `
          <h1>SUBSTABELECIMENTO</h1>
          <p>${qualifAdv(f)}, na qualidade de procurador(a) de ${v(f.cliente, 'nome do cliente')}${f.processo ? `, nos autos do processo nº ${esc(f.processo)}` : ''}, <strong>SUBSTABELECE, ${f.reserva ? 'COM' : 'SEM'} RESERVA DE PODERES</strong>, ao(à) advogado(a) ${v(f.subNome, 'nome do(a) substabelecido(a)')}, inscrito(a) na OAB/${v(f.subUf, 'UF')} sob o nº ${v(f.subOab, 'número')}, os poderes que lhe foram conferidos pelo(a) mandante.${f.reserva ? '' : ' O(A) substabelecente deverá dar ciência prévia ao cliente, nos termos do art. 26 do Código de Ética e Disciplina da OAB.'}</p>
          ${localData(f)}
          ${assinatura(`${v(f.advNome, 'substabelecente')} — OAB/${v(f.advUf, 'UF')} ${v(f.advOab, 'nº')}`)}`;
      },
    },
    {
      id: 'honorarios',
      nome: 'Contrato de honorários advocatícios',
      base: 'Arts. 22 a 24 da Lei 8.906/94 e Código de Ética e Disciplina da OAB',
      campos: [
        ...camposPF('cli', 'Contratante (cliente)'),
        ...camposAdv,
        { id: 'objeto', label: 'Objeto (serviço contratado)', type: 'textarea', group: 'Serviço e honorários' },
        { id: 'tipo', label: 'Forma de remuneração', type: 'select', options: [['fixo', 'Valor fixo'], ['exito', 'Só honorários de êxito'], ['misto', 'Valor fixo + êxito']], def: 'misto', group: 'Serviço e honorários' },
        { id: 'valor', label: 'Valor fixo (R$)', type: 'number', group: 'Serviço e honorários' },
        { id: 'parcelas', label: 'Número de parcelas', type: 'number', def: '1', group: 'Serviço e honorários' },
        { id: 'exito', label: 'Percentual de êxito (%)', type: 'number', def: '20', group: 'Serviço e honorários' },
        { id: 'foro', label: 'Comarca do foro', group: 'Serviço e honorários' },
        ...camposLocalData,
      ],
      render(f) {
        const parcelas = Math.max(1, parseInt(f.parcelas, 10) || 1);
        const fixo = f.tipo !== 'exito', exito = f.tipo !== 'fixo';
        let clausula = 2;
        const n = () => `CLÁUSULA ${String(clausula++).padStart(2, '0')}`;
        const honor = [];
        if (fixo) honor.push(`a título de honorários contratuais, o valor de ${valorCompleto(f.valor, 'valor')}, pago ${parcelas > 1 ? textoParcelas(Number(f.valor) || 0, parcelas) : 'à vista, na assinatura deste contrato'}`);
        if (exito) honor.push(`${fixo ? 'acrescido de ' : ''}${v(f.exito ? Number(f.exito).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '', '%')}% (${v(f.exito ? percentualExtenso(f.exito) : '', 'percentual por extenso')} por cento) sobre o proveito econômico obtido pelo(a) CONTRATANTE, pagos quando do efetivo recebimento`);
        return `
          <h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS</h1>
          <p><strong>CONTRATANTE:</strong> ${qualifPF('cli', f)}.</p>
          <p><strong>CONTRATADO(A):</strong> ${qualifAdv(f)}.</p>
          <p>As partes acima identificadas têm entre si justo e contratado o seguinte:</p>
          <p><strong>CLÁUSULA 01 — DO OBJETO.</strong> O(A) CONTRATADO(A) prestará ao(à) CONTRATANTE os serviços profissionais de advocacia consistentes em ${v(f.objeto, 'descrever o serviço')}, em todas as instâncias, até decisão final.</p>
          <p><strong>${n()} — DOS HONORÁRIOS.</strong> O(A) CONTRATANTE pagará ao(à) CONTRATADO(A), ${honor.join(', ')}.</p>
          <p><strong>${n()} — DA SUCUMBÊNCIA.</strong> Os honorários de sucumbência pertencem exclusivamente ao(à) CONTRATADO(A), sem prejuízo dos honorários aqui pactuados, nos termos do art. 23 da Lei 8.906/94.</p>
          <p><strong>${n()} — DAS DESPESAS.</strong> Custas processuais, emolumentos, perícias, diligências e demais despesas necessárias ao andamento do serviço correm por conta do(a) CONTRATANTE e não estão incluídas nos honorários.</p>
          <p><strong>${n()} — DAS OBRIGAÇÕES.</strong> O(A) CONTRATANTE fornecerá documentos e informações verdadeiros e completos, e manterá seus dados de contato atualizados. O(A) CONTRATADO(A) manterá o(a) CONTRATANTE informado(a) sobre o andamento do caso e guardará sigilo profissional.</p>
          <p><strong>${n()} — DA RESCISÃO.</strong> Qualquer das partes pode encerrar este contrato mediante comunicação escrita. Em caso de revogação do mandato pelo(a) CONTRATANTE, serão devidos os honorários contratuais de forma proporcional ao trabalho realizado, sem prejuízo dos honorários de êxito, se o resultado vier a ser obtido.</p>
          <p><strong>${n()} — DO TÍTULO EXECUTIVO.</strong> Este contrato constitui título executivo extrajudicial, nos termos do art. 24 da Lei 8.906/94.</p>
          <p><strong>${n()} — DO FORO.</strong> Fica eleito o foro da comarca de ${v(f.foro, 'comarca')} para dirimir questões oriundas deste contrato.</p>
          <p>E, por estarem assim justas e contratadas, as partes assinam o presente instrumento em duas vias de igual teor.</p>
          ${localData(f)}
          <div class="sign-grid">${assinatura(`${v(f.cliNome, 'contratante')}<br><small>CONTRATANTE</small>`)}${assinatura(`${v(f.advNome, 'contratado(a)')}<br><small>CONTRATADO(A)</small>`)}</div>
          <p><strong>Testemunhas:</strong></p>
          <div class="sign-grid">${assinatura('Nome:<br>CPF:')}${assinatura('Nome:<br>CPF:')}</div>`;
      },
    },
    {
      id: 'notificacao',
      nome: 'Notificação extrajudicial',
      base: 'Art. 397, parágrafo único, do Código Civil',
      campos: [
        ...camposPF('not', 'Notificante (quem envia)'),
        { id: 'destNome', label: 'Nome ou razão social', group: 'Notificado(a)' },
        { id: 'destDoc', label: 'CPF ou CNPJ', hint: 'opcional', group: 'Notificado(a)' },
        { id: 'destEndereco', label: 'Endereço completo', group: 'Notificado(a)' },
        { id: 'assunto', label: 'Assunto', def: 'Cobrança de valores em atraso', group: 'Conteúdo' },
        { id: 'fatos', label: 'Fatos', type: 'textarea', group: 'Conteúdo' },
        { id: 'pedido', label: 'O que se exige do(a) notificado(a)', type: 'textarea', group: 'Conteúdo' },
        { id: 'prazo', label: 'Prazo para cumprir (dias)', type: 'number', def: '10', group: 'Conteúdo' },
        ...camposLocalData,
      ],
      render(f) {
        const prazo = parseInt(f.prazo, 10) || 0;
        return `
          <h1>NOTIFICAÇÃO EXTRAJUDICIAL</h1>
          <p><strong>NOTIFICANTE:</strong> ${qualifPF('not', f)}.</p>
          <p><strong>NOTIFICADO(A):</strong> ${v(f.destNome, 'nome ou razão social')}${f.destDoc ? `, inscrito(a) sob o nº ${esc(f.destDoc)}` : ''}, com endereço em ${v(f.destEndereco, 'endereço completo')}.</p>
          <p><strong>ASSUNTO:</strong> ${v(f.assunto, 'assunto')}.</p>
          <p>Prezado(a) Senhor(a),</p>
          <p>Pela presente, o(a) NOTIFICANTE vem, respeitosamente, NOTIFICÁ-LO(A) do seguinte:</p>
          <p>${f.fatos ? esc(f.fatos).replace(/\n+/g, '</p><p>') : '<span class="ph">[descreva os fatos]</span>'}</p>
          <p>Diante do exposto, fica Vossa Senhoria notificado(a) para, no prazo de ${prazo ? `${prazo} (${inteiroExtenso(prazo)}) dias` : '<span class="ph">[prazo]</span>'} a contar do recebimento desta, ${f.pedido ? esc(f.pedido.trim().replace(/\.$/, '')) : '<span class="ph">[o que se exige]</span>'}.</p>
          <p>O não atendimento no prazo indicado constituirá Vossa Senhoria em mora, para todos os fins de direito (art. 397, parágrafo único, do Código Civil), e ensejará a adoção das medidas judiciais cabíveis, sem nova comunicação.</p>
          ${localData(f)}
          ${assinatura(v(f.notNome, 'notificante'))}`;
      },
    },
    {
      id: 'hipossuficiencia',
      nome: 'Declaração de hipossuficiência',
      base: 'Art. 99, § 3º, do CPC e Lei 7.115/83',
      campos: [
        ...camposPF('dec', 'Declarante'),
        ...camposLocalData,
      ],
      render(f) {
        return `
          <h1>DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA</h1>
          <p>${qualifPF('dec', f)}, DECLARA, para os fins do art. 98 e seguintes do Código de Processo Civil e sob as penas da lei, que não possui condições de arcar com as custas e despesas processuais e com os honorários advocatícios sem prejuízo do próprio sustento e do de sua família, razão pela qual requer os benefícios da gratuidade da justiça.</p>
          <p>Declara, ainda, estar ciente de que a declaração falsa sujeita o(a) declarante às sanções civis, administrativas e penais cabíveis, e de que a presunção de veracidade desta declaração (art. 99, § 3º, do CPC) pode ser afastada por prova em contrário.</p>
          ${localData(f)}
          ${assinatura(v(f.decNome, 'declarante'))}`;
      },
    },
  ];

  window.Modelos = { MODELOS, reaisExtenso, inteiroExtenso, dataExtenso };
})();

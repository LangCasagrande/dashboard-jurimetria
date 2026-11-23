// Interface da calculadora de prazos.
(function () {
  const C = window.Calendario, { esc } = window.LT;
  const $ = id => document.getElementById(id);

  const ATOS = [
    { nome: 'Contestação', dias: 15, base: 'art. 335 do CPC' },
    { nome: 'Réplica', dias: 15, base: 'arts. 350 e 351 do CPC' },
    { nome: 'Apelação', dias: 15, base: 'art. 1.003, § 5º, do CPC' },
    { nome: 'Contrarrazões de apelação', dias: 15, base: 'art. 1.010, § 1º, do CPC' },
    { nome: 'Agravo de instrumento', dias: 15, base: 'art. 1.003, § 5º, do CPC' },
    { nome: 'Agravo interno', dias: 15, base: 'art. 1.070 do CPC' },
    { nome: 'Embargos de declaração', dias: 5, base: 'art. 1.023 do CPC' },
    { nome: 'Recurso especial / extraordinário', dias: 15, base: 'art. 1.003, § 5º, do CPC' },
    { nome: 'Pagamento voluntário (cumprimento de sentença)', dias: 15, base: 'art. 523 do CPC' },
    { nome: 'Impugnação ao cumprimento de sentença', dias: 15, base: 'art. 525 do CPC' },
    { nome: 'Embargos à execução', dias: 15, base: 'art. 915 do CPC' },
    { nome: 'Recurso inominado (Juizados Especiais)', dias: 10, base: 'art. 42 da Lei 9.099/95' },
    { nome: 'Manifestação sem prazo fixado', dias: 5, base: 'art. 218, § 3º, do CPC' },
    { nome: 'Outro (digite o prazo)', dias: null, base: '' },
  ];
  $('ato').innerHTML = ATOS.map((a, i) => `<option value="${i}">${esc(a.nome)}${a.dias ? ` — ${a.dias} dias` : ''}</option>`).join('');
  $('ato').addEventListener('change', () => { const a = ATOS[$('ato').value]; if (a.dias) $('dias').value = a.dias; });
  $('ato').value = '0';

  const LABELS = {
    dje: 'Data da disponibilização no DJe',
    portal: 'Data do envio da intimação pelo portal',
    intimacao: 'Data em que a intimação se considera feita',
  };
  function syncModo() {
    $('data-label').textContent = LABELS[$('modo').value];
    $('consulta-box').hidden = $('modo').value !== 'portal';
  }
  $('modo').addEventListener('change', syncModo);
  syncModo();

  // Hoje (data local) como padrão
  const now = new Date();
  $('data').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const parseInput = v => { if (!v) return null; const [y, m, d] = v.split('-').map(Number); return C.utc(y, m, d); };
  function parseExtras(text) {
    const map = new Map(), erros = [];
    text.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
      const m = l.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(.*)$/);
      if (!m) { erros.push(l); return; }
      const d = C.utc(+m[3], +m[2], +m[1]);
      // Rejeita datas inexistentes (ex.: 31/02), que o Date "rolaria" para o mês seguinte.
      if (d.getUTCDate() !== +m[1] || d.getUTCMonth() + 1 !== +m[2]) { erros.push(l); return; }
      map.set(C.key(d), m[4] || 'Feriado local / suspensão');
    });
    return { map, erros };
  }

  let ultimo = null;

  $('form').addEventListener('submit', e => {
    e.preventDefault();
    const data = parseInput($('data').value);
    const dias = parseInt($('dias').value, 10);
    if (!data || !(dias > 0)) return;
    const extras = parseExtras($('extras').value);
    const ato = ATOS[$('ato').value];
    const params = {
      modo: $('modo').value,
      data,
      consulta: parseInput($('consulta').value),
      dias,
      dobro: $('dobro').checked || $('litis').checked,
      contagem: $('contagem').value,
      recesso: $('recesso').checked,
      feriados: {
        carnaval: $('carnaval').checked, cinzas: $('cinzas').checked, corpusChristi: $('corpus').checked,
        justicaFederal: $('federal').checked, extras: extras.map,
      },
    };
    const r = C.calcular(params);
    ultimo = { r, ato, dias };
    render(r, ato, extras.erros);
    $('ics').disabled = false;
  });

  function render(r, ato, erros) {
    const base = ato.base ? ` (${esc(ato.base)})` : '';
    const rows = r.dias.map(d => {
      const final = d.data.getTime() === r.vencimento.getTime() && (d.contado || d.vencimento);
      const cls = final ? 'final' : d.contado ? 'counted' : 'skipped';
      const status = d.contado ? `${d.contado}º dia` : '—';
      const desc = final ? 'Vencimento' + (d.motivo ? ` — ${esc(d.motivo)}` : '') : esc(d.motivo);
      return `<tr class="${cls}"><td>${LT.fmtDate(d.data)} <small>${d.data.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' })}</small></td><td>${status}</td><td>${desc}</td></tr>`;
    }).join('');
    $('saida').innerHTML = `
      <h2>Resultado</h2>
      <p class="muted">${esc(ato.dias ? ato.nome : 'Prazo')}: ${r.total} dias${base}</p>
      <p class="result-date">${LT.fmtDateLong(r.vencimento)}</p>
      <p>Último dia para praticar o ato. Início da contagem: <strong>${LT.fmtDate(r.inicio)}</strong>.</p>
      ${erros.length ? `<div class="notice bad">Linhas de feriado ignoradas (use dd/mm/aaaa): ${erros.map(esc).join('; ')}</div>` : ''}
      <h3>Como foi calculado</h3>
      <ol class="steps">${r.passos.map(p => `<li>${esc(p)}</li>`).join('')}</ol>
      <h3 style="margin-top:1rem">Dia a dia</h3>
      <div class="table-wrap"><table class="day-list">
        <thead><tr><th>Data</th><th>Contagem</th><th>Observação</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }

  // Exporta o vencimento como evento de dia inteiro (iCalendar).
  $('ics').addEventListener('click', () => {
    if (!ultimo) return;
    const { r, ato } = ultimo;
    const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
    const fim = C.addDays(r.vencimento, 1);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const titulo = `Vencimento: ${ato.dias ? ato.nome : 'prazo processual'}`;
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//JusLab.IA//Prazos//PT-BR', 'BEGIN:VEVENT',
      `UID:${ymd(r.vencimento)}-${Math.random().toString(36).slice(2)}@legaltech`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(r.vencimento)}`, `DTEND;VALUE=DATE:${ymd(fim)}`,
      `SUMMARY:${titulo}`, `DESCRIPTION:Prazo de ${r.total} dias. Início da contagem: ${LT.fmtDate(r.inicio)}.`,
      'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:${titulo}`, 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    LT.download(`prazo-${ymd(r.vencimento)}.ics`, ics, 'text/calendar');
  });
})();

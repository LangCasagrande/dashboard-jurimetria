// Calendário forense: feriados, suspensões e contagem de prazos (CPC/2015).
// Todas as datas são Date em UTC à meia-noite, para não sofrer com fuso e horário de verão.
(function () {
  const DAY = 86400000;
  const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
  const key = d => d.toISOString().slice(0, 10);
  const addDays = (d, n) => new Date(d.getTime() + n * DAY);
  const isWeekend = d => d.getUTCDay() === 0 || d.getUTCDay() === 6;

  // Domingo de Páscoa (algoritmo anônimo gregoriano / Meeus).
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return utc(y, month, day);
  }

  /**
   * Feriados de um ano conforme as opções.
   * opts: { carnaval, cinzas, corpusChristi, justicaFederal, extras: Map<key, nome> }
   * Retorna Map<'AAAA-MM-DD', nome>.
   */
  function holidaysOfYear(y, opts) {
    const h = new Map();
    const put = (d, nome) => { if (!h.has(key(d))) h.set(key(d), nome); };
    put(utc(y, 1, 1), 'Confraternização Universal');
    put(utc(y, 4, 21), 'Tiradentes');
    put(utc(y, 5, 1), 'Dia do Trabalho');
    put(utc(y, 9, 7), 'Independência do Brasil');
    put(utc(y, 10, 12), 'Nossa Senhora Aparecida');
    put(utc(y, 11, 2), 'Finados');
    put(utc(y, 11, 15), 'Proclamação da República');
    if (y >= 2024) put(utc(y, 11, 20), 'Dia Nacional de Zumbi e da Consciência Negra (Lei 14.759/2023)');
    put(utc(y, 12, 25), 'Natal');
    const p = easter(y);
    put(addDays(p, -2), 'Sexta-feira da Paixão');
    if (opts.carnaval) { put(addDays(p, -48), 'Carnaval (segunda-feira)'); put(addDays(p, -47), 'Carnaval (terça-feira)'); }
    if (opts.cinzas) put(addDays(p, -46), 'Quarta-feira de Cinzas');
    if (opts.corpusChristi) put(addDays(p, 60), 'Corpus Christi');
    if (opts.justicaFederal) {
      // Lei 5.010/1966, art. 62
      put(addDays(p, -4), 'Semana Santa — quarta-feira (Lei 5.010/66)');
      put(addDays(p, -3), 'Semana Santa — quinta-feira (Lei 5.010/66)');
      put(utc(y, 8, 11), 'Dia da criação dos cursos jurídicos (Lei 5.010/66)');
      put(utc(y, 11, 1), 'Todos os Santos (Lei 5.010/66)');
      put(utc(y, 12, 8), 'Dia da Justiça (Lei 5.010/66)');
      // Art. 62, I: de 20/12 a 06/01, inclusive (feriado mesmo sem marcar a suspensão do art. 220 do CPC).
      for (let dia = 2; dia <= 6; dia++) put(utc(y, 1, dia), 'Recesso da Justiça Federal (Lei 5.010/66, art. 62, I)');
      for (let dia = 20; dia <= 31; dia++) if (dia !== 25) put(utc(y, 12, dia), 'Recesso da Justiça Federal (Lei 5.010/66, art. 62, I)');
    }
    if (opts.extras) for (const [k, nome] of opts.extras) if (k.startsWith(String(y))) h.set(k, nome);
    return h;
  }

  // Art. 220 do CPC: suspensão do curso dos prazos de 20/12 a 20/01, inclusive.
  function inRecesso(d) {
    const m = d.getUTCMonth() + 1, day = d.getUTCDate();
    return (m === 12 && day >= 20) || (m === 1 && day <= 20);
  }

  function makeCalendar(opts) {
    const cache = new Map();
    const holidays = y => { if (!cache.has(y)) cache.set(y, holidaysOfYear(y, opts)); return cache.get(y); };
    // Motivo para o dia não ter expediente forense, ou null se for dia útil.
    function closedReason(d) {
      if (d.getUTCDay() === 0) return 'Domingo';
      if (d.getUTCDay() === 6) return 'Sábado';
      const h = holidays(d.getUTCFullYear()).get(key(d));
      return h || null;
    }
    // Motivo para o prazo não correr naquele dia (dias úteis), ou null se conta.
    function skipReason(d, { recesso }) {
      const r = closedReason(d);
      if (r) return r;
      if (recesso && inRecesso(d)) return 'Suspensão de prazos — art. 220 do CPC';
      return null;
    }
    const nextBusinessDay = d => { let x = addDays(d, 1); while (closedReason(x)) x = addDays(x, 1); return x; };
    const businessOnOrAfter = d => { let x = d; while (closedReason(x)) x = addDays(x, 1); return x; };
    return { closedReason, skipReason, nextBusinessDay, businessOnOrAfter, holidays };
  }

  /**
   * Calcula o prazo.
   * p: {
   *   modo: 'intimacao' | 'dje' | 'portal',
   *   data: Date            // intimação, disponibilização no DJe ou envio pelo portal
   *   consulta?: Date       // portal: data em que a intimação foi aberta (opcional)
   *   dias: number, dobro: boolean, contagem: 'uteis' | 'corridos', recesso: boolean,
   *   feriados: opções de holidaysOfYear
   * }
   */
  function calcular(p) {
    const cal = makeCalendar(p.feriados);
    const passos = [];
    let termo; // dia em que a intimação se considera feita (excluído da contagem — art. 224)

    if (p.modo === 'dje') {
      const pub = cal.nextBusinessDay(p.data);
      passos.push(`Disponibilização no DJe em ${fmt(p.data)}. Considera-se publicada no primeiro dia útil seguinte: ${fmt(pub)} (Lei 11.419/2006, art. 4º, § 3º).`);
      termo = pub;
    } else if (p.modo === 'portal') {
      const limite = addDays(p.data, 10);
      if (p.consulta && p.consulta < p.data) {
        passos.push(`A data de consulta informada (${fmt(p.consulta)}) é anterior ao envio e foi desconsiderada.`);
      }
      if (p.consulta && p.consulta >= p.data && p.consulta <= limite) {
        termo = cal.businessOnOrAfter(p.consulta);
        passos.push(`Intimação enviada pelo portal em ${fmt(p.data)} e consultada em ${fmt(p.consulta)}. Considera-se feita em ${fmt(termo)} (Lei 11.419/2006, art. 5º, §§ 1º e 2º).`);
      } else {
        termo = cal.businessOnOrAfter(limite);
        passos.push(`Intimação enviada pelo portal em ${fmt(p.data)} sem consulta em 10 dias corridos. Considera-se feita em ${fmt(termo)} (Lei 11.419/2006, art. 5º, § 3º).`);
      }
    } else {
      termo = p.data;
      passos.push(`Intimação considerada feita em ${fmt(termo)}.`);
    }

    const total = p.dias * (p.dobro ? 2 : 1);
    if (p.dobro) passos.push(`Prazo em dobro: ${p.dias} × 2 = ${total} dias.`);

    const dias = []; // { data, contado: n | null, motivo }
    let atual = termo, contados = 0, inicio = null, guard = 0;
    dias.push({ data: termo, contado: null, motivo: 'Dia do começo — excluído (art. 224 do CPC)' });

    if (p.contagem === 'uteis') {
      while (contados < total && guard++ < 2000) {
        atual = addDays(atual, 1);
        const motivo = cal.skipReason(atual, { recesso: p.recesso });
        if (motivo) { dias.push({ data: atual, contado: null, motivo }); continue; }
        contados++;
        if (!inicio) inicio = atual;
        dias.push({ data: atual, contado: contados, motivo: '' });
      }
      passos.push(`A contagem começa no primeiro dia útil seguinte: ${fmt(inicio)} (art. 224, § 3º). Contam-se só os dias úteis (art. 219).`);
    } else {
      // Dias corridos (prazos materiais e processo penal): começa no primeiro dia útil (Súmula 310 do STF)
      // e, se terminar em dia sem expediente, prorroga para o próximo dia útil.
      // Se o primeiro dia útil cai na suspensão do art. 220, a contagem só começa depois dela.
      inicio = cal.nextBusinessDay(termo);
      while (p.recesso && inRecesso(inicio)) inicio = cal.nextBusinessDay(inicio);
      for (let x = addDays(termo, 1); x < inicio; x = addDays(x, 1)) {
        dias.push({ data: x, contado: null, motivo: (p.recesso && inRecesso(x) ? 'Suspensão de prazos (20/12 a 20/01)' : cal.closedReason(x)) || '' });
      }
      atual = addDays(inicio, -1);
      while (contados < total && guard++ < 4000) {
        atual = addDays(atual, 1);
        if (p.recesso && inRecesso(atual)) { dias.push({ data: atual, contado: null, motivo: 'Suspensão de prazos (20/12 a 20/01)' }); continue; }
        contados++;
        dias.push({ data: atual, contado: contados, motivo: cal.closedReason(atual) || '' });
      }
      // Vencimento em dia sem expediente (ou dentro da suspensão do art. 220) vai para o primeiro dia útil.
      const fechado = d => cal.closedReason(d) || (p.recesso && inRecesso(d) ? 'Suspensão de prazos (20/12 a 20/01)' : '');
      let fim = atual;
      while (fechado(fim)) {
        fim = addDays(fim, 1);
        dias.push({ data: fim, contado: null, motivo: fechado(fim) || 'Prorrogação do vencimento para o primeiro dia útil' });
      }
      if (fim.getTime() !== atual.getTime()) {
        passos.push(`O ${total}º dia caiu em ${fmt(atual)}, sem expediente; o vencimento foi prorrogado para ${fmt(fim)}.`);
        dias.at(-1).motivo = 'Vencimento prorrogado para este dia útil';
        dias.at(-1).vencimento = true;
        atual = fim;
      }
      passos.push(`Contagem em dias corridos a partir de ${fmt(inicio)}.`);
    }

    return { termo, inicio, vencimento: atual, total, dias, passos };
  }

  function fmt(d) { return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' }); }

  window.Calendario = { utc, key, addDays, isWeekend, easter, holidaysOfYear, inRecesso, makeCalendar, calcular };
})();

// Motor de regras do analisador de contratos. Funciona sem IA e sem internet.
// Cada regra procura padrões no texto (sem acentos, minúsculo) e devolve achados com trecho e fundamento.
(function () {
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const REGRAS = [
    {
      id: 'multa', titulo: 'Multa ou cláusula penal', padrao: /multa|clausula penal|penalidade|pena convencional/,
      avaliar(t, ctx) {
        // Só os percentuais logo depois de "multa"/"cláusula penal" (evita pegar juros ou honorários da mesma frase).
        const p = [...t.matchAll(/(?:multa|clausula penal|penalidade)[^%]{0,40}?(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:%|por cento)/g)].map(m => parseFloat(m[1].replace(',', '.')));
        const max = p.length ? Math.max(...p) : null;
        if (max !== null && ctx.consumo && /mora|atraso|inadimpl/.test(t) && max > 2)
          return { nivel: 'alto', nota: `Multa moratória de ${max}% em relação de consumo: o limite é 2% quando há fornecimento de crédito ou financiamento.` };
        if (max !== null && max >= 20) return { nivel: 'alto', nota: `Multa de ${max}%: valor elevado, sujeito a redução pelo juiz se for manifestamente excessiva.` };
        if (max !== null && max >= 10) return { nivel: 'medio', nota: `Multa de ${max}%: confira se é proporcional ao prejuízo e se vale para as duas partes.` };
        return { nivel: 'baixo', nota: 'Há cláusula penal. Confira se é recíproca e proporcional.' };
      },
      base: 'Arts. 412 e 413 do Código Civil; art. 52, § 1º, do CDC',
      sugestao: 'Prever multa recíproca, proporcional ao prejuízo e, em relação de consumo com crédito, limitada a 2% na mora.',
    },
    {
      id: 'juros', titulo: 'Juros', padrao: /juros/,
      avaliar(t) {
        const m = t.match(/juros[^%]{0,40}?(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*(?:\([^)]*\)\s*)?(?:ao mes|a\.?\s?m\.?|mensa)/);
        const v = m ? parseFloat(m[1].replace(',', '.')) : null;
        if (v !== null && v > 1) return { nivel: 'alto', nota: `Juros de ${v}% ao mês. Fora do sistema financeiro, juros acima de 1% ao mês costumam ser considerados abusivos (Lei de Usura).` };
        return { nivel: 'baixo', nota: 'Há previsão de juros. Confira a taxa e a base de cálculo.' };
      },
      base: 'Art. 406 do Código Civil (redação da Lei 14.905/2024); Decreto 22.626/1933 (Lei de Usura)',
      sugestao: 'Fixar juros moratórios pela taxa legal (art. 406 do CC) ou em até 1% ao mês.',
    },
    {
      id: 'renovacao', titulo: 'Renovação automática', padrao: /renova\w* automatica|prorroga\w* automatica|renovad[oa] automaticamente|prorrogad[oa] automaticamente|renovad[oa] tacitamente|prorrogad[oa] tacitamente/,
      nivel: 'medio', nota: 'O contrato se renova sozinho. Verifique o prazo e a forma para avisar que não quer renovar.',
      base: 'Arts. 6º, III, e 51, IV, do CDC; art. 422 do Código Civil (boa-fé)',
      sugestao: 'Exigir aviso prévio da renovação com antecedência e permitir cancelamento sem multa após o período inicial.',
    },
    {
      id: 'alteracao', titulo: 'Alteração unilateral', padrao: /(alterar|modificar|reajustar|atualizar)\w*.{0,80}(unilateral|a seu criterio|a seu exclusivo criterio|criterio exclusivo|a qualquer tempo|sem (previo )?aviso|independentemente de (aviso|anuencia|concordancia))/,
      nivel: 'alto', nota: 'Uma parte pode mudar preço, condições ou o próprio contrato sem a concordância da outra.',
      base: 'Art. 51, X e XIII, do CDC; art. 122 do Código Civil (condição puramente potestativa)',
      sugestao: 'Condicionar qualquer alteração a acordo escrito das partes ou a critérios objetivos previstos no contrato.',
    },
    {
      id: 'rescisao', titulo: 'Rescisão (encerramento)', padrao: /rescind|rescisao|resili|resolucao do contrato|denunciar o contrato|denuncia do contrato/,
      avaliar(t) {
        if (/sem (previo )?aviso|imediatamente|independentemente de (aviso|notificacao)/.test(t)) return { nivel: 'alto', nota: 'Permite encerrar o contrato sem aviso prévio.' };
        if (/a qualquer tempo|unilateral|imotivad/.test(t)) return { nivel: 'medio', nota: 'Permite encerramento unilateral. Verifique aviso prévio e multa para as duas partes.' };
        return { nivel: 'info', nota: 'Há regra de rescisão.' };
      },
      base: 'Art. 473 do Código Civil (resilição unilateral e aviso prévio)',
      sugestao: 'Prever aviso prévio mínimo (ex.: 30 dias) e as mesmas condições de saída para as duas partes.',
    },
    {
      id: 'responsabilidade', titulo: 'Limitação ou exclusão de responsabilidade', padrao: /nao se responsabiliza|isent\w* de (qualquer )?responsabilidade|exime\w*|nao respondera|nao sera responsavel|limitacao de responsabilidade|responsabilidade (fica |sera )?limitada|em nenhuma hipotese.{0,60}respons/,
      avaliar(t, ctx) {
        return ctx.consumo
          ? { nivel: 'alto', nota: 'Em relação de consumo, é nula a cláusula que impossibilite, exonere ou atenue a responsabilidade do fornecedor.' }
          : { nivel: 'medio', nota: 'Limitação de responsabilidade entre empresas é possível, mas não vale para dolo ou culpa grave.' };
      },
      base: 'Arts. 25 e 51, I, do CDC; arts. 393 e 927 do Código Civil',
      sugestao: 'Limitar a responsabilidade apenas a danos indiretos ou a um teto razoável, nunca a dolo ou culpa grave.',
    },
    {
      id: 'perda', titulo: 'Perda de valores pagos', padrao: /(perda|perdera|perderao|reten\w*|reter|nao (sera|serao) (devolvid|restituid|reembolsad)).{0,80}(valores pagos|quantias pagas|parcelas pagas|valor pago|totalidade|integralidade|mensalidades)/,
      nivel: 'alto', nota: 'Prevê que quem sai do contrato perde o que já pagou.',
      base: 'Art. 53 do CDC; art. 413 do Código Civil',
      sugestao: 'Permitir retenção apenas de percentual razoável para cobrir despesas comprovadas, com devolução do restante.',
    },
    {
      id: 'arbitragem', titulo: 'Arbitragem', padrao: /arbitragem|arbitral|clausula compromissoria|compromisso arbitral|camara de (mediacao e )?arbitragem/,
      avaliar(t, ctx) {
        return ctx.consumo
          ? { nivel: 'alto', nota: 'Em contrato de consumo, a arbitragem compulsória é nula; em contrato de adesão, só vale com concordância expressa e destacada.' }
          : { nivel: 'medio', nota: 'Disputas iriam para arbitragem, que costuma ser mais cara. Verifique a câmara, o local e os custos.' };
      },
      base: 'Art. 51, VII, do CDC; art. 4º, § 2º, da Lei 9.307/1996',
      sugestao: 'Em contrato de adesão, colocar a cláusula em negrito, com assinatura ou visto específico, ou em documento anexo.',
    },
    {
      id: 'foro', titulo: 'Foro de eleição', padrao: /foro d[aeo]|eleg\w* o foro|comarca de [a-z]/,
      avaliar(t, ctx) {
        return ctx.consumo
          ? { nivel: 'medio', nota: 'Em relação de consumo, o consumidor pode propor a ação no próprio domicílio; foro distante que dificulte a defesa é abusivo.' }
          : { nivel: 'info', nota: 'Há foro de eleição. Desde a Lei 14.879/2024, ele precisa ter relação com o domicílio das partes ou com o local da obrigação.' };
      },
      base: 'Art. 63, §§ 1º e 3º, do CPC (Lei 14.879/2024); art. 101, I, do CDC',
      sugestao: 'Eleger o foro do domicílio do contratante ou do local de cumprimento da obrigação.',
    },
    {
      id: 'reajuste', titulo: 'Reajuste de preço', padrao: /reajust|correcao monetaria|corrigid[oa] monetariamente|igp-?m|ipca|inpc|incc/,
      avaliar(t) {
        if (/(mensal|mensalmente|trimestral|semestral)/.test(t) && /reajust/.test(t)) return { nivel: 'alto', nota: 'Reajuste em período menor que 12 meses: a lei só permite reajuste por índice com periodicidade anual.' };
        if (/igp-?m/.test(t)) return { nivel: 'baixo', nota: 'Reajuste pelo IGP-M, índice que já teve altas muito acima da inflação. Considere IPCA.' };
        return { nivel: 'info', nota: 'Há regra de reajuste.' };
      },
      base: 'Art. 2º, § 1º, da Lei 10.192/2001',
      sugestao: 'Reajuste anual por índice oficial de inflação (ex.: IPCA), com data-base definida.',
    },
    {
      id: 'exclusividade', titulo: 'Exclusividade ou não concorrência', padrao: /exclusividade|nao concorrencia|nao concorrer|nao podera (contratar|prestar|atuar|trabalhar|exercer).{0,80}(concorrent|terceir|mesmo ramo|similar)/,
      avaliar(t) {
        const temLimite = /(\d+|um|dois|tres|seis|doze)\s*\(?\w*\)?\s*(meses|anos)/.test(t);
        return temLimite
          ? { nivel: 'baixo', nota: 'Restrição de concorrência com prazo definido. Confira se também há limite de território e de atividade.' }
          : { nivel: 'medio', nota: 'Restrição de concorrência sem prazo claro. Ela precisa de limites de tempo, território e objeto para ser válida.' };
      },
      base: 'Arts. 421 e 422 do Código Civil; art. 170, IV, da Constituição (livre concorrência)',
      sugestao: 'Limitar a restrição no tempo (ex.: até 2 anos), no território e às atividades efetivamente concorrentes.',
    },
    {
      id: 'renuncia', titulo: 'Renúncia de direitos', padrao: /renuncia\w*.{0,80}(direito|beneficio de ordem|indenizac|benfeitoria|garantia)/,
      avaliar(t, ctx) {
        if (/beneficio de ordem/.test(t)) return { nivel: 'baixo', nota: 'O fiador renuncia ao benefício de ordem: pode ser cobrado antes do devedor principal. É prática comum, mas aumenta o risco do fiador.' };
        if (/benfeitoria/.test(t)) return { nivel: 'baixo', nota: 'Renúncia à indenização por benfeitorias. Em locação, é válida (Súmula 335 do STJ).' };
        return { nivel: ctx.consumo ? 'alto' : 'medio', nota: 'Prevê renúncia antecipada de direitos.' };
      },
      base: 'Arts. 827 e 828 do Código Civil; art. 51, I, do CDC; Súmula 335 do STJ',
      sugestao: 'Evitar renúncias genéricas; deixar explícito qual direito é renunciado e por quê.',
    },
    {
      id: 'vencimento', titulo: 'Vencimento antecipado', padrao: /vencimento antecipado|vencimento (imediato )?de todas as (parcelas|prestacoes)|vencer.{0,30}antecipadamente/,
      nivel: 'medio', nota: 'Um atraso pode tornar exigível de uma vez todo o saldo devedor.',
      base: 'Art. 1.425 do Código Civil; art. 52 do CDC',
      sugestao: 'Exigir notificação prévia e prazo para regularizar antes do vencimento antecipado.',
    },
    {
      id: 'honorarios', titulo: 'Honorários de cobrança', padrao: /honorarios.{0,60}(\d{1,2}\s*%)/,
      avaliar(t, ctx) { return { nivel: ctx.consumo ? 'medio' : 'baixo', nota: 'Prevê honorários advocatícios de cobrança em percentual fixo.' }; },
      base: 'Art. 51, XII, do CDC (reciprocidade); art. 395 do Código Civil',
      sugestao: 'Prever a cobrança de honorários de forma recíproca e só quando houver efetiva atuação de advogado.',
    },
    {
      id: 'dados', titulo: 'Proteção de dados pessoais (LGPD)', padrao: /dados pessoais|lgpd|13\.709|protecao de dados|tratamento de dados/,
      nivel: 'info', nota: 'O contrato trata de proteção de dados pessoais.', positivo: true,
      base: 'Lei 13.709/2018 (LGPD), arts. 7º, 37 a 39 e 46',
      sugestao: 'Definir quem é controlador e operador, a finalidade do tratamento e as medidas de segurança.',
    },
    {
      id: 'sigilo', titulo: 'Confidencialidade', padrao: /confidencial|sigilo|nao divulgar|nao podera divulgar/,
      nivel: 'info', nota: 'Há dever de confidencialidade.', positivo: true,
      base: 'Arts. 421 e 422 do Código Civil',
      sugestao: 'Definir prazo do sigilo após o fim do contrato e as exceções (ordem judicial, informação pública).',
    },
    {
      id: 'garantia', titulo: 'Garantias', padrao: /fianca|fiador|avalista|caucao|alienacao fiduciaria|hipoteca|seguro.fianca/,
      nivel: 'info', nota: 'Há garantia vinculada ao contrato.',
      base: 'Arts. 818 a 839 do Código Civil (fiança); Lei 9.514/1997',
      sugestao: 'Conferir se há outorga do cônjuge na fiança (art. 1.647, III, do CC) e o prazo da garantia.',
    },
  ];

  // Cláusulas que um contrato costuma ter. Ausência vira alerta.
  const ESSENCIAIS = [
    { id: 'objeto', titulo: 'Objeto do contrato', padrao: /objeto|tem por finalidade|presta\w* (de )?servic/ },
    { id: 'preco', titulo: 'Preço e forma de pagamento', padrao: /pagamento|preco|valor (total|mensal|de r\$)|remuneracao|mensalidade|r\$\s?\d/ },
    { id: 'prazo', titulo: 'Prazo de vigência', padrao: /vigencia|prazo (determinado|indeterminado|de \d|contratual)|vigorara|durac/ },
    { id: 'rescisao', titulo: 'Regras de rescisão', padrao: /rescind|rescisao|resili|denuncia/ },
    { id: 'foro', titulo: 'Foro para resolver conflitos', padrao: /foro|arbitragem|comarca/ },
  ];

  const PESO = { alto: 15, medio: 7, baixo: 2, info: 0 };

  // Divide o texto em trechos (frases/cláusulas) preservando o original.
  function trechos(texto) {
    const out = [];
    const re = /[^\n.;]+(?:[.;]+(?!\d)|\n|$)/g;
    let m;
    while ((m = re.exec(texto))) {
      const t = m[0];
      if (t.trim().length < 3) continue;
      out.push({ ini: m.index, fim: m.index + t.length, original: t.trim(), norm: norm(t) });
    }
    return out;
  }

  function analisar(texto, ctx = {}) {
    const partes = trechos(texto);
    const textoNorm = norm(texto);
    const achados = [];
    for (const r of REGRAS) {
      const hits = partes.filter(p => r.padrao.test(p.norm));
      if (!hits.length) continue;
      // Avalia cada ocorrência e fica com a mais grave.
      let pior = null;
      for (const h of hits) {
        const av = r.avaliar ? r.avaliar(h.norm, ctx) : { nivel: r.nivel, nota: r.nota };
        if (!pior || PESO[av.nivel] > PESO[pior.av.nivel]) pior = { h, av };
      }
      achados.push({
        id: r.id, titulo: r.titulo, nivel: pior.av.nivel, nota: pior.av.nota, base: r.base, sugestao: r.sugestao,
        positivo: !!r.positivo, trecho: pior.h.original, ini: pior.h.ini, fim: pior.h.fim, ocorrencias: hits.length,
      });
    }
    const ausencias = ESSENCIAIS.filter(e => !e.padrao.test(textoNorm)).map(e => e.titulo);
    if (/dados|cpf|e-?mail|endereco|telefone/.test(textoNorm) && !achados.some(a => a.id === 'dados'))
      ausencias.push('Cláusula de proteção de dados (LGPD)');

    const ordem = { alto: 0, medio: 1, baixo: 2, info: 3 };
    achados.sort((a, b) => ordem[a.nivel] - ordem[b.nivel] || a.ini - b.ini);
    // Cada ponto de risco reduz a nota de forma decrescente: 1 risco alto ≈ 78, 2 ≈ 61, 4 ≈ 37.
    const perda = achados.reduce((s, a) => s + PESO[a.nivel], 0) + ausencias.length * 4;
    const nota = Math.round(100 * Math.exp(-perda / 60));
    const faixa = nota >= 80 ? 'Risco baixo' : nota >= 55 ? 'Risco moderado' : 'Risco alto';
    const contagem = { alto: 0, medio: 0, baixo: 0, info: 0 };
    achados.forEach(a => contagem[a.nivel]++);
    return { achados, ausencias, nota, faixa, contagem, palavras: texto.trim().split(/\s+/).length };
  }

  window.RegrasContrato = { analisar, REGRAS, ESSENCIAIS, norm };
})();

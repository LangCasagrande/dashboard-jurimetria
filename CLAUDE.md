# Dashboard de Jurimetria

Projeto de portfólio (legal tech): dashboard com estatísticas de processos judiciais brasileiros a partir da API Pública do DataJud (CNJ).

## Arquitetura decidida
- **Coletor (ETL)** roda fora do navegador, consulta o DataJud com agregações e salva JSON pré-calculado em `data/`.
- **Dashboard estático** (HTML + JS, biblioteca de gráficos via CDN) lê esses JSON. Publicável no GitHub Pages; atualização periódica via GitHub Actions.
- Motivo: a API **não envia cabeçalhos CORS** (o preflight OPTIONS volta 200 sem `Access-Control-Allow-Origin`), então o navegador não consegue chamá-la direto; e ela é lenta demais para consulta ao vivo.

## API DataJud — fatos verificados em 2026-11-18
- Doc oficial: https://datajud-wiki.cnj.jus.br/api-publica/acesso (bloqueia fetch automatizado; abrir pelo navegador).
- Endpoint: `POST https://api-publica.datajud.cnj.jus.br/api_publica_<alias>/_search` (Elasticsearch).
- Cabeçalho: `Authorization: APIKey <chave pública>`. Chave vigente em 2026-11-18:
  `cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==` — o CNJ pode trocá-la a qualquer momento; manter em config, não espalhada no código.
- 91 aliases: `tst tse stj stm`, `trf1`–`trf6`, 27 TJs (`tjac` … `tjto`, `tjdft`), `trt1`–`trt24`, 27 TREs com hífen (`tre-ac` … `tre-to`, `tre-dft`), `tjmmg tjmrs tjmsp`.
- **Agregações funcionam** (`terms` em `classe.nome.keyword` testado no TJAC: 200 OK).
- **Muito lento e instável**: ~30–55 s por consulta no TJAC; TJSP deu 504 com agregação sem filtro; 429 `es_rejected_execution_exception` (fila cheia) é comum → o coletor precisa de retry com backoff, timeout longo e filtros (por período) nos tribunais grandes.
- **Runners do GitHub Actions conseguem acessar** (teste de 2026-11-18 ~12:30 BRT): sem bloqueio geográfico; as falhas foram as mesmas de sobrecarga (429 fila cheia; 504 do balanceador "NSX LB" após exatos 60 s). O gateway corta em 60 s → cada consulta precisa ser barata; rodar o coletor de madrugada (horário de Brasília) com muitas tentativas e backoff, e manter os dados anteriores quando um tribunal falhar.
- `hits.total` limita em 10000 (`relation: gte`) a menos que se use `track_total_hits: true`.
- Campos do processo: `numeroProcesso`, `tribunal`, `grau` (G1, G2, JE…), `dataAjuizamento` (string `yyyyMMddHHmmss`), `classe{codigo,nome}`, `assuntos[]{codigo,nome}`, `orgaoJulgador{codigo,nome,codigoMunicipioIBGE}`, `sistema{codigo,nome}`, `formato{codigo,nome}`, `nivelSigilo`, `dataHoraUltimaAtualizacao`, `movimentos[]{codigo,nome,dataHora,complementosTabelados[]}`.

## Estado atual (2026-11-23)
- Site estático completo: página inicial + 6 ferramentas (`jurimetria/`, `prazos/`, `documentos/`, `contratos/`, `legislacao/`, `lgpd/`) + `sobre/` (metodologia). Código compartilhado em `assets/` (`common.js` monta cabeçalho/rodapé/tema; `ia.js` chama a API da Anthropic com a chave do usuário).
- `jurimetria/`: três visões por hash (`#panorama`, `#tribunal/<alias>`, `#comparar/<a,b,c>`); gráficos SVG próprios em `graficos.js` (sem biblioteca); paleta categórica validada para daltonismo em `jurimetria.css`.
- Coletor roda diariamente no GitHub Actions; 90 de 91 tribunais têm dados (tre-dft ainda vazio).
- **Datas em dois formatos (hipótese forte, 2026-11-23):** a primeira coleta mensal (filtro ISO `now-36M`) voltou vazia em ~70 tribunais (TJMG, TJPR, TRF1–5…). Explicação provável: parte dos registros tem `dataAjuizamento` compacto `yyyyMMddHHmmss`, que o índice lê como epoch_millis → ano ~2600 (19850101000000 ms = ano 2599, as "datas absurdas"). O coletor agora soma, na mesma consulta, um `date_histogram` das datas ISO (filtro de período) e uma agregação `range` numérica com as faixas compactas (`_corpo_datas`/`_somar_datas`), para `anual` (desde 2000) e `mensal` (36 meses; janela termina no último ano com dados se a base parou). Índice traz `ultimo_mes`/`ultimo_ano`. **Confirmar após a próxima execução do Actions** (esta sessão na nuvem não alcança a API); se a agregação `range` em campo date der 400, trocar por `date_range` com números (epoch ms).
- Testes do coletor: `python -m unittest discover -s coletor` (FakeES simula os dois formatos). CI em `.github/workflows/testes.yml`.
- Compartilhamento: `assets/og.png` (1200×630, gerada a partir de HTML) + tags Open Graph/canonical em todas as páginas, `robots.txt` e `sitemap.xml` apontando para `https://langcasagrande.github.io/dashboard-jurimetria/` (trocar se usar domínio próprio).
- SDK da Anthropic fixado em `@anthropic-ai/sdk@1.6.0` (`assets/js/ia.js`): versões com pelo menos 2 semanas de publicação; API conferida contra a 1.4.0.
- **Layout "B · Tecnologia" (2026-11-24):** cabeçalho escuro fixo com menu ☰ no celular, faixa escura com o título de cada página (o `common.js` move o `main > .page-head` para uma `section.banda`), rodapé em colunas. Tokens em `assets/css/style.css`; ícones SVG em `LT.icone(nome)`. Página inicial em `index.html` + `assets/css/inicio.css` + `assets/js/inicio.js`, que calcula números e destaques a partir de `data/index.json` (o HTML traz textos padrão caso os dados não carreguem).
- **Vitrine da skill** em `ia-juridica/` (projeto separado: github.com/LangCasagrande/sistema-ordenamentos-juridicos, licença "todos os direitos reservados"; não copiar o SKILL.md para cá).
- **Autor:** João Lang Casagrande. Dados em `AUTOR` no `assets/js/common.js`; o campo `linkedin` está vazio até o usuário passar o link (aparece sozinho no rodapé e no Sobre quando preenchido).
- **Direito Penal anotado (`lei-anotada/`, menu "Direito Penal")**: índice em `lei-anotada/dados/indice.json`; um JSON por artigo (`cp-157.json` publicado). Abas: Texto da lei · Jurisprudência · Notas da doutrina · Jurimetria · Fontes; cada nota tem `aba` (`lei`/`jurisprudencia`/`doutrina`). Regra: só entra o que foi baixado de fonte oficial e conferido literalmente por script; resumos fiéis à fonte; interpretação só no campo `interpretacao` (exibido como "Interpretação do JusLab.IA"); o que não puder ser conferido vai para `pendentes`. Fontes que funcionam daqui: Normas.leg.br (API `/api/public/metadados/gerais` + `/api/public/binario/<id>/texto`), STJ (PDF de súmulas, páginas de temas em processo.stj.jus.br, informativos). Planalto e STF não respondem a este servidor; buscas scon e PDFs de acórdão do STJ são bloqueados pelo firewall deles.
- **Em andamento (pausado em 24/11/2026, branch `direito-penal`)**: agentes pesquisando `cp-155.json` (furto), `cp-121.json` (homicídio) e `ld-33.json` (art. 33 da Lei 11.343). Ao retomar: conferir os JSON gerados, incluí-los em `indice.json`, acrescentar os códigos CNJ deles em `coletor/temas.json`, rodar revisor independente (JSON x fontes) e prova com agente só pelo site, corrigir, testar (axe, links, celular) e publicar via PR. Fontes baixadas ficam no scratchpad da sessão (podem se perder com o contêiner).
- Ambiente na nuvem "dashboard-jurimetria" (criado em 24/11/2026) libera Planalto, STJ, STF, Senado, Câmara, LexML, DataJud e o próprio site; a API do DataJud responde daqui.
- Ideias futuras do usuário em `IDEIAS.md` (ex.: "LinkedIn jurídico").
- `tre-dft` responde 404 (índice inexistente na API); conferir o alias certo na wiki do DataJud.
- Ainda não publicado. Nome do site: **JusLab.IA**, subtítulo "dados e tecnologia para o Direito" (escolhido em 2026-11-23; antes era "Laboratório de Legal Tech"). Ao mudar o nome, atualizar também `assets/og.png` (gerada de HTML), as tags og:* e o PRODID do .ics em `prazos/prazos.js`.
- Arquivos pessoais (currículos em PDF) não pertencem a esta pasta; `.gitignore` bloqueia `*.pdf` e `*.docx`.

## Ambiente local
- Windows; sem Python, Node ou winget instalados (2026-11-18). Git 2.55 disponível. PowerShell 5.1 falha em caminhos longos (>260 chars) e teve conexão fechada pelo servidor do DataJud; `curl` do Git Bash funcionou.

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
- `hits.total` limita em 10000 (`relation: gte`) a menos que se use `track_total_hits: true`.
- Campos do processo: `numeroProcesso`, `tribunal`, `grau` (G1, G2, JE…), `dataAjuizamento` (string `yyyyMMddHHmmss`), `classe{codigo,nome}`, `assuntos[]{codigo,nome}`, `orgaoJulgador{codigo,nome,codigoMunicipioIBGE}`, `sistema{codigo,nome}`, `formato{codigo,nome}`, `nivelSigilo`, `dataHoraUltimaAtualizacao`, `movimentos[]{codigo,nome,dataHora,complementosTabelados[]}`.

## Onde paramos (2026-11-18)
- Nenhum código escrito ainda. Decidido: **Python na nuvem, sem instalar nada no PC** — coletor em Python rodando no GitHub Actions; desenvolvimento numa sessão do Claude Code na nuvem. O usuário já tem conta no GitHub.
- Pendente: criar o repositório no GitHub, fazer o primeiro push e testar se o DataJud aceita conexões de servidores fora do Brasil (runners do GitHub).
- Arquivos pessoais (currículos em PDF) não pertencem a esta pasta; `.gitignore` bloqueia `*.pdf` por segurança.

## Ambiente local
- Windows; sem Python, Node ou winget instalados (2026-11-18). Git 2.55 disponível. PowerShell 5.1 falha em caminhos longos (>260 chars) e teve conexão fechada pelo servidor do DataJud; `curl` do Git Bash funcionou.

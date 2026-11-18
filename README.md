# Dashboard de Jurimetria

Painel com estatísticas de processos judiciais brasileiros, construído a partir da [API Pública do DataJud](https://datajud-wiki.cnj.jus.br/api-publica/acesso), mantida pelo Conselho Nacional de Justiça (CNJ).

> Projeto em construção.

## Como funciona

1. **Coletor (Python):** consulta a API do DataJud, calcula as estatísticas e salva os resultados em `data/`.
2. **Atualização automática:** o GitHub Actions roda o coletor periodicamente.
3. **Dashboard (HTML + JavaScript):** lê os dados salvos e mostra os gráficos. Publicado no GitHub Pages.

A API não pode ser chamada direto do navegador (não envia cabeçalhos CORS) e cada consulta leva de 30 a 55 segundos; por isso os dados são pré-calculados.

## Fonte dos dados

Metadados de processos públicos da Base Nacional de Dados do Poder Judiciário (DataJud), disponibilizados pelo CNJ nos termos da Portaria CNJ nº 160/2020.

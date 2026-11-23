# Laboratório de Legal Tech

Seis ferramentas jurídicas abertas, feitas para estudo e portfólio, com destaque para um **dashboard de jurimetria** construído a partir da [API Pública do DataJud](https://datajud-wiki.cnj.jus.br/api-publica/acesso), mantida pelo Conselho Nacional de Justiça (CNJ).

| Ferramenta | O que faz |
|---|---|
| [Jurimetria](jurimetria/) | Panorama nacional, detalhe por tribunal e comparação de até 4 tribunais (90 tribunais) |
| [Prazos](prazos/) | Prazos processuais em dias úteis conforme o CPC |
| [Documentos](documentos/) | Procuração, contrato de honorários, notificação e declaração de hipossuficiência |
| [Contratos](contratos/) | Cláusulas de risco por regras, com análise opcional por IA |
| [Legislação](legislacao/) | Perguntas em linguagem simples com o artigo de lei citado |
| [LGPD](lgpd/) | Checklist de adequação e gerador de política de privacidade |

## Como funciona

1. **Coletor (Python, só biblioteca padrão):** `coletor/coletar.py` consulta a API do DataJud com agregações e salva JSON pré-calculado em `data/`.
2. **Atualização automática:** o GitHub Actions (`.github/workflows/coletar-dados.yml`) roda o coletor toda madrugada e faz commit dos dados.
3. **Site estático (HTML + JavaScript, sem build):** lê os JSON e desenha os gráficos em SVG. Pronto para GitHub Pages.

A API não pode ser chamada direto do navegador (não envia cabeçalhos CORS) e cada consulta leva de 30 a 55 segundos; por isso os dados são pré-calculados. Metodologia e limitações dos dados estão na página [Sobre](sobre/).

## Rodar localmente

Qualquer servidor estático na raiz do repositório serve. No Windows, sem instalar nada:

```
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Com Python: `python -m http.server 8080`. Depois abra http://localhost:8080/.

## Publicar no GitHub Pages

Em **Settings → Pages**, escolha *Deploy from a branch*, branch `main`, pasta `/ (root)`. O site fica em `https://langcasagrande.github.io/dashboard-jurimetria/`.

## Fonte dos dados

Metadados de processos públicos da Base Nacional de Dados do Poder Judiciário (DataJud), disponibilizados pelo CNJ nos termos da Portaria CNJ nº 160/2020.

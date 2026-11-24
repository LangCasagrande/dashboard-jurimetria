#!/usr/bin/env python3
"""Coletor de estatísticas da API Pública do DataJud (CNJ).

Consulta cada tribunal com agregações do Elasticsearch e grava JSON pré-calculado em data/,
que o dashboard estático lê. Usa só a biblioteca padrão do Python.

A API é lenta e instável (fila cheia -> HTTP 429; gateway corta em 60 s -> HTTP 504), então:
  - cada estatística é uma consulta pequena e separada, com novas tentativas e espera crescente;
  - se uma parte falhar, o valor da coleta anterior é mantido;
  - há um orçamento de tempo; os tribunais com dados mais antigos são coletados primeiro.

Uso:
  python coletor/coletar.py                      # todos, dentro do orçamento de tempo
  python coletor/coletar.py --tribunais tjac,stj # só alguns
  python coletor/coletar.py --minutos 30
"""
from __future__ import annotations

import argparse
import http.client
import json
import os
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, request

API = "https://api-publica.datajud.cnj.jus.br/api_publica_{alias}/_search"
# Chave pública divulgada pelo CNJ em https://datajud-wiki.cnj.jus.br/api-publica/acesso
# (pode ser trocada pelo CNJ; sobrescreva com a variável de ambiente DATAJUD_API_KEY).
CHAVE_PUBLICA = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=="
RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / "data"
POR_TRIBUNAL = DADOS / "tribunais"
LISTA = Path(__file__).with_name("tribunais.json")
# Temas ligados a artigos de lei (lei anotada): códigos de assunto do CNJ por tema.
TEMAS_ARQ = Path(__file__).with_name("temas.json")
MESES_HISTORICO = 36
ANO_INICIAL = 2000


class ErroDataJud(Exception):
    def __init__(self, msg: str, definitivo: bool = False):
        super().__init__(msg)
        self.definitivo = definitivo


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def consultar(alias: str, corpo: dict, chave: str, tentativas: int = 6, timeout: int = 80,
              prazo: float | None = None) -> dict:
    """POST de busca com novas tentativas para 429, 5xx, falhas de rede e respostas truncadas.
    Não começa nova tentativa depois do prazo (orçamento de tempo da execução)."""
    url = API.format(alias=alias)
    dados = json.dumps(corpo).encode()
    espera = 15.0
    ultimo = "?"
    for n in range(1, tentativas + 1):
        req = request.Request(
            url,
            data=dados,
            method="POST",
            headers={
                "Authorization": f"APIKey {chave}",
                "Content-Type": "application/json",
                "User-Agent": "dashboard-jurimetria/1.0 (projeto educacional)",
            },
        )
        inicio = time.monotonic()
        try:
            with request.urlopen(req, timeout=timeout) as r:
                resposta = json.load(r)
            log(f"    ok em {time.monotonic() - inicio:.0f}s")
            return resposta
        except error.HTTPError as e:
            trecho = e.read(400).decode("utf-8", errors="replace").replace("\n", " ")
            ultimo = f"HTTP {e.code}: {trecho[:160]}"
            if e.code in (400, 401, 403, 404):
                raise ErroDataJud(ultimo, definitivo=True) from e
            pedido = e.headers.get("Retry-After") if e.headers else None
            if pedido and pedido.isdigit():
                espera = max(espera, min(float(pedido), 240))
        except (error.URLError, TimeoutError, ConnectionError, OSError) as e:
            ultimo = f"rede: {e}"
        except (ValueError, http.client.HTTPException) as e:  # JSON inválido ou resposta truncada
            ultimo = f"resposta inválida: {e.__class__.__name__}: {str(e)[:120]}"
        if n < tentativas:
            pausa = espera + random.uniform(0, 5)
            if prazo is not None and time.monotonic() + pausa > prazo:
                break
            log(f"    tentativa {n}/{tentativas} falhou ({ultimo}); nova tentativa em {pausa:.0f}s")
            time.sleep(pausa)
            espera = min(espera * 2, 240)
    raise ErroDataJud(ultimo)


def termos(campo: str, tamanho: int) -> dict:
    # track_total_hits: o total vem da mesma consulta, para os percentuais serem coerentes
    # (a API às vezes responde com estados diferentes do índice em consultas seguidas).
    return {"size": 0, "track_total_hits": True, "aggs": {"x": {"terms": {"field": campo, "size": tamanho}}}}


def buckets(resp: dict) -> list[dict]:
    return [{"nome": b["key"], "qtd": b["doc_count"]} for b in resp["aggregations"]["x"]["buckets"]]


# Cada parte do painel = uma consulta. Ordem: das mais baratas para as mais caras
# ("anual" vem antes de "mensal" porque a janela mensal depende dele).
PARTES = {
    "graus": (termos("grau.keyword", 10), buckets),
    "formatos": (termos("formato.nome.keyword", 5), buckets),
    "sistemas": (termos("sistema.nome.keyword", 10), buckets),
    "classes": (termos("classe.nome.keyword", 15), buckets),
    "assuntos": (termos("assuntos.nome.keyword", 15), buckets),
    "orgaos": (termos("orgaoJulgador.nome.keyword", 15), buckets),
    "total": (
        {"size": 0, "track_total_hits": True},
        lambda r: r["hits"]["total"]["value"],
    ),
    # "anual" e "mensal" têm corpo montado na hora (ver corpo_anual / corpo_mensal).
    "anual": (None, None),
    "mensal": (None, None),
    # Processos por tema (ex.: roubo, art. 157 do CP), pelos códigos de assunto do CNJ (ver temas.json).
    "temas": (None, None),
}


def carregar_temas() -> dict:
    return ler_json(TEMAS_ARQ, {})


def corpo_temas(temas: dict) -> dict:
    """Uma consulta só: para cada tema, quantos processos têm algum dos seus assuntos e quantos têm cada um."""
    todos = sorted({int(c) for t in temas.values() for c in t["assuntos"]})
    aggs = {}
    for tid, t in temas.items():
        codigos = [int(c) for c in t["assuntos"]]
        aggs[tid] = {
            "filter": {"terms": {"assuntos.codigo": codigos}},
            "aggs": {"por": {"filters": {"filters": {str(c): {"term": {"assuntos.codigo": c}} for c in codigos}}}},
        }
    return {"size": 0, "query": {"terms": {"assuntos.codigo": todos}}, "aggs": aggs}


def extrair_temas(resp: dict, temas: dict) -> dict:
    saida = {}
    for tid in temas:
        a = resp["aggregations"][tid]
        saida[tid] = {
            "total": a["doc_count"],
            "por_assunto": {c: b["doc_count"] for c, b in a["por"]["buckets"].items()},
        }
    return saida


# Datas de ajuizamento em dois formatos na base.
# Parte dos tribunais envia dataAjuizamento como texto ISO ("2024-01-15T00:00:00"), que o
# Elasticsearch entende como data. Outra parte envia no formato compacto "20240115000000", que o
# índice lê como milissegundos desde 1970: 20240115000000 ms cai no ano 2611 (e 1985 vira 2599,
# as "datas absurdas" vistas na base). Um filtro "até hoje" descarta todos esses registros.
# Por isso cada série soma duas agregações na mesma consulta: um histograma das datas corretas e
# faixas numéricas que capturam o formato compacto (período P = [inicio, fim) em yyyyMMddHHmmss).
def _compacto(ano: int, mes: int = 1) -> int:
    return int(f"{ano:04d}{mes:02d}01000000")


def _proximo_mes(ano: int, mes: int) -> tuple[int, int]:
    return (ano + 1, 1) if mes == 12 else (ano, mes + 1)


def _corpo_datas(periodos: list[tuple[str, int, int]], inicio_iso: str, fim_iso: str, intervalo: str, formato: str) -> dict:
    return {
        "size": 0,
        "aggs": {
            "iso": {
                "filter": {"range": {"dataAjuizamento": {"gte": inicio_iso, "lt": fim_iso}}},
                "aggs": {"h": {"date_histogram": {"field": "dataAjuizamento", "calendar_interval": intervalo, "format": formato}}},
            },
            "compacto": {
                "range": {"field": "dataAjuizamento", "ranges": [{"key": k, "from": a, "to": b} for k, a, b in periodos]},
            },
        },
    }


def _somar_datas(resp: dict, chaves: list[str], rotulo: str) -> list[dict]:
    soma = dict.fromkeys(chaves, 0)
    aggs = resp["aggregations"]
    for b in aggs["iso"]["h"]["buckets"]:
        if b["key_as_string"] in soma:
            soma[b["key_as_string"]] += b["doc_count"]
    for b in aggs["compacto"]["buckets"]:
        if b.get("key") in soma:
            soma[b["key"]] += b["doc_count"]
    return [{rotulo: k, "qtd": v} for k, v in soma.items()]


def anos_serie(hoje: datetime | None = None) -> list[int]:
    hoje = hoje or datetime.now(timezone.utc)
    return list(range(ANO_INICIAL, hoje.year + 1))


def corpo_anual(hoje: datetime | None = None) -> tuple[dict, list[str]]:
    anos = anos_serie(hoje)
    periodos = [(str(a), _compacto(a), _compacto(a + 1)) for a in anos]
    return _corpo_datas(periodos, f"{anos[0]}-01-01", f"{anos[-1] + 1}-01-01", "year", "yyyy"), [str(a) for a in anos]


def meses_janela(dados: dict, hoje: datetime | None = None) -> list[tuple[int, int]]:
    """Os 36 meses mais recentes que têm dados (mais o mês corrente, se a base está em dia).
    Se a base do tribunal parou em um ano anterior, a janela termina no fim desse ano."""
    hoje = hoje or datetime.now(timezone.utc)
    ano = ultimo_ano_relevante(dados.get("anual"))
    if ano is not None and ano < hoje.year:
        fim = (ano, 12)
        n = MESES_HISTORICO
    else:
        fim = (hoje.year, hoje.month)
        n = MESES_HISTORICO + 1
    meses = [fim]
    while len(meses) < n:
        a, m = meses[-1]
        meses.append((a - 1, 12) if m == 1 else (a, m - 1))
    return meses[::-1]


def corpo_mensal(dados: dict, hoje: datetime | None = None) -> tuple[dict, list[str]]:
    meses = meses_janela(dados, hoje)
    periodos = [(f"{a:04d}-{m:02d}", _compacto(a, m), _compacto(*_proximo_mes(a, m))) for a, m in meses]
    fim = _proximo_mes(*meses[-1])
    corpo = _corpo_datas(periodos, f"{meses[0][0]:04d}-{meses[0][1]:02d}-01", f"{fim[0]:04d}-{fim[1]:02d}-01", "month", "yyyy-MM")
    return corpo, [p[0] for p in periodos]


def ultimo_ano_relevante(anual: list[dict] | None) -> int | None:
    """Último ano com volume real de ajuizamentos (ignora registros soltos com datas tardias)."""
    if not anual:
        return None
    maximo = max(a["qtd"] for a in anual)
    if maximo < 100:
        return None
    relevantes = [int(a["ano"]) for a in anual if a["qtd"] >= 0.05 * maximo]
    return max(relevantes) if relevantes else None


def agora_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def ler_json(caminho: Path, padrao):
    try:
        return json.loads(caminho.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return padrao


def gravar_json(caminho: Path, dados) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    tmp = caminho.with_suffix(".tmp")
    tmp.write_text(json.dumps(dados, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    tmp.replace(caminho)


def coletar_tribunal(trib: dict, chave: str, prazo: float) -> dict:
    caminho = POR_TRIBUNAL / f"{trib['alias']}.json"
    dados = ler_json(caminho, {})
    dados.update({k: trib[k] for k in ("alias", "sigla", "nome", "ramo")})
    atualizadas = dados.setdefault("partes_atualizadas_em", {})
    erros = {}
    for parte, (corpo, extrair) in PARTES.items():
        if time.monotonic() > prazo:
            erros[parte] = "orçamento de tempo esgotado"
            continue
        log(f"  {trib['sigla']} · {parte}")
        try:
            if parte == "anual":
                corpo, chaves = corpo_anual()
                extrair = lambda r, c=chaves: _somar_datas(r, c, "ano")  # noqa: E731
            elif parte == "mensal":
                corpo, chaves = corpo_mensal(dados)
                extrair = lambda r, c=chaves: _somar_datas(r, c, "mes")  # noqa: E731
            elif parte == "temas":
                temas = carregar_temas()
                if not temas:
                    continue
                corpo = corpo_temas(temas)
                extrair = lambda r, t=temas: extrair_temas(r, t)  # noqa: E731
            resposta = consultar(trib["alias"], corpo, chave, prazo=prazo)
            try:
                dados[parte] = extrair(resposta)
                total_consulta = (resposta.get("hits") or {}).get("total")
                if parte not in ("total", "anual", "mensal") and isinstance(total_consulta, dict):
                    dados.setdefault("totais_partes", {})[parte] = total_consulta.get("value")
            except (KeyError, TypeError, IndexError, ValueError) as e:
                raise ErroDataJud(f"resposta sem o formato esperado: {e.__class__.__name__}: {e}") from e
            atualizadas[parte] = agora_iso()
        except ErroDataJud as e:
            erros[parte] = str(e)
            log(f"    falhou: {e}")
            if e.definitivo and parte == "graus":
                break  # índice inexistente ou chave inválida: não adianta seguir
    dados["erros"] = erros
    dados["atualizado_em"] = max(atualizadas.values()) if atualizadas else None
    # A parte mais antiga (ou nunca coletada) decide a prioridade na próxima fila.
    dados["parte_mais_antiga_em"] = min((atualizadas.get(p, "") for p in PARTES), default="")
    gravar_json(caminho, dados)
    return dados


def ultimo_mes_relevante(mensal: list[dict] | None) -> str | None:
    """Último mês com volume real (>= 5% do maior mês); None se a série é só ruído."""
    if not mensal:
        return None
    maximo = max(m["qtd"] for m in mensal)
    if maximo < 100:
        return None
    return max(m["mes"] for m in mensal if m["qtd"] >= 0.05 * maximo)


def atualizar_indice(tribunais: list[dict]) -> None:
    itens = []
    for t in tribunais:
        d = ler_json(POR_TRIBUNAL / f"{t['alias']}.json", None)
        if not d or not d.get("atualizado_em"):
            continue
        formatos = {f["nome"]: f["qtd"] for f in d.get("formatos", [])}
        soma_formatos = sum(formatos.values()) or None
        itens.append({
            "alias": t["alias"], "sigla": t["sigla"], "nome": t["nome"], "ramo": t["ramo"],
            "total": d.get("total"),
            "pct_eletronico": round(100 * formatos.get("Eletrônico", 0) / soma_formatos, 1) if soma_formatos else None,
            "classe_principal": (d.get("classes") or [{}])[0].get("nome"),
            # Até quando vai a base pública: mostra o atraso de cada tribunal no DataJud.
            "ultimo_mes": ultimo_mes_relevante(d.get("mensal")),
            "ultimo_ano": ultimo_ano_relevante(d.get("anual")),
            "atualizado_em": d["atualizado_em"],
            "partes": sorted(k for k in PARTES if k in d),
        })
    gravar_json(DADOS / "index.json", {"gerado_em": agora_iso(), "fonte": "API Pública do DataJud (CNJ)", "tribunais": itens})
    log(f"index.json: {len(itens)} tribunais com dados")
    atualizar_temas(tribunais)


def atualizar_temas(tribunais: list[dict], novos: dict | None = None) -> None:
    """data/temas.json: por tema, os números de cada tribunal. Usa o arquivo do tribunal quando ele tem
    a parte "temas"; senão, os números recebidos em `novos` (coleta só de temas) ou os que já estavam."""
    temas = carregar_temas()
    if not temas:
        return
    antigo = ler_json(DADOS / "temas.json", {}).get("temas", {})
    novos = novos or {}
    saida = {}
    for tid, cfg in temas.items():
        anteriores = {x["alias"]: x for x in antigo.get(tid, {}).get("tribunais", [])}
        linhas = []
        for t in tribunais:
            d = ler_json(POR_TRIBUNAL / f"{t['alias']}.json", {}) or {}
            if tid in (d.get("temas") or {}):
                valor, quando = d["temas"][tid], (d.get("partes_atualizadas_em") or {}).get("temas")
            elif tid in novos.get(t["alias"], {}).get("temas", {}):
                valor, quando = novos[t["alias"]]["temas"][tid], novos[t["alias"]]["coletado_em"]
            elif t["alias"] in anteriores:
                linhas.append(anteriores[t["alias"]])
                continue
            else:
                continue
            linhas.append({"alias": t["alias"], "sigla": t["sigla"], "nome": t["nome"], "ramo": t["ramo"],
                           "total": valor["total"], "por_assunto": valor["por_assunto"], "coletado_em": quando})
        saida[tid] = {**cfg, "tribunais": sorted(linhas, key=lambda x: -x["total"])}
    gravar_json(DADOS / "temas.json", {"gerado_em": agora_iso(), "fonte": "API Pública do DataJud (CNJ)", "temas": saida})


def coletar_so_temas(fila: list[dict], todos: list[dict], chave: str, prazo: float) -> int:
    """Coleta apenas os temas, sem mexer nos arquivos dos tribunais (útil fora do agendamento diário)."""
    temas = carregar_temas()
    ok = 0
    for i, t in enumerate(fila, 1):
        if time.monotonic() > prazo:
            log("orçamento de tempo esgotado")
            break
        log(f"[{i}/{len(fila)}] {t['sigla']} · temas")
        try:
            r = consultar(t["alias"], corpo_temas(temas), chave, prazo=prazo)
            novos = {t["alias"]: {"temas": extrair_temas(r, temas), "coletado_em": agora_iso()}}
            atualizar_temas(todos, novos)
            ok += 1
        except (ErroDataJud, KeyError, TypeError) as e:
            log(f"    falhou: {e}")
    return ok


def minutos_padrao() -> float:
    try:
        return float(os.environ.get("ORCAMENTO_MINUTOS") or 320)
    except ValueError:
        return 320.0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tribunais", help="aliases separados por vírgula (ex.: tjac,stj,tre-sp)")
    ap.add_argument("--so-temas", action="store_true", help="coleta só os temas (data/temas.json), sem tocar nos tribunais")
    ap.add_argument("--minutos", type=float, default=minutos_padrao(),
                    help="orçamento de tempo total (padrão 320 min; o job do GitHub Actions tem limite de 350)")
    args = ap.parse_args()

    chave = os.environ.get("DATAJUD_API_KEY") or CHAVE_PUBLICA
    todos = json.loads(LISTA.read_text(encoding="utf-8"))
    if args.tribunais:
        pedidos = {a.strip().lower() for a in args.tribunais.split(",") if a.strip()}
        fila = [t for t in todos if t["alias"] in pedidos]
        desconhecidos = pedidos - {t["alias"] for t in fila}
        if desconhecidos:
            log(f"aliases desconhecidos ignorados: {', '.join(sorted(desconhecidos))}")
    else:
        # Primeiro os tribunais cuja parte mais antiga (ou nunca coletada) é a mais velha.
        def idade(t):
            d = ler_json(POR_TRIBUNAL / f"{t['alias']}.json", {})
            feitas = d.get("partes_atualizadas_em") or {}
            return min((feitas.get(p, "") for p in PARTES), default="")
        fila = sorted(todos, key=idade)

    prazo = time.monotonic() + args.minutos * 60
    log(f"{len(fila)} tribunais na fila; orçamento de {args.minutos:.0f} min")
    if args.so_temas:
        ok = coletar_so_temas(fila, todos, chave, prazo)
        log(f"concluído: temas de {ok} tribunais")
        return 0
    ok = 0
    for i, t in enumerate(fila, 1):
        if time.monotonic() > prazo:
            log("orçamento de tempo esgotado; o restante fica para a próxima execução")
            break
        log(f"[{i}/{len(fila)}] {t['sigla']} — {t['nome']}")
        d = coletar_tribunal(t, chave, prazo)
        if not d["erros"]:
            ok += 1
        atualizar_indice(todos)
    atualizar_indice(todos)
    log(f"concluído: {ok} tribunais sem nenhuma falha")
    return 0


if __name__ == "__main__":
    sys.exit(main())

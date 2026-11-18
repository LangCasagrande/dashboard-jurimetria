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
MESES_HISTORICO = 36


class ErroDataJud(Exception):
    def __init__(self, msg: str, definitivo: bool = False):
        super().__init__(msg)
        self.definitivo = definitivo


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def consultar(alias: str, corpo: dict, chave: str, tentativas: int = 6, timeout: int = 80) -> dict:
    """POST de busca com novas tentativas para 429, 5xx e falhas de rede."""
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
        except (error.URLError, TimeoutError, ConnectionError, OSError) as e:
            ultimo = f"rede: {e}"
        if n < tentativas:
            pausa = espera + random.uniform(0, 5)
            log(f"    tentativa {n}/{tentativas} falhou ({ultimo}); nova tentativa em {pausa:.0f}s")
            time.sleep(pausa)
            espera = min(espera * 2, 240)
    raise ErroDataJud(ultimo)


def termos(campo: str, tamanho: int) -> dict:
    return {"size": 0, "aggs": {"x": {"terms": {"field": campo, "size": tamanho}}}}


def buckets(resp: dict) -> list[dict]:
    return [{"nome": b["key"], "qtd": b["doc_count"]} for b in resp["aggregations"]["x"]["buckets"]]


# Cada parte do painel = uma consulta. Ordem: das mais baratas para as mais caras.
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
    "mensal": (
        {
            "size": 0,
            # Limita o período: há registros com datas absurdas (ex.: ano 2599) na base.
            "query": {"range": {"dataAjuizamento": {"gte": f"now-{MESES_HISTORICO}M/M", "lt": "now+1M/M"}}},
            "aggs": {"x": {"date_histogram": {"field": "dataAjuizamento", "calendar_interval": "month", "format": "yyyy-MM", "min_doc_count": 0}}},
        },
        lambda r: [{"mes": b["key_as_string"], "qtd": b["doc_count"]} for b in r["aggregations"]["x"]["buckets"]],
    ),
}


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
            dados[parte] = extrair(consultar(trib["alias"], corpo, chave))
            atualizadas[parte] = agora_iso()
        except ErroDataJud as e:
            erros[parte] = str(e)
            log(f"    falhou: {e}")
            if e.definitivo and parte == "graus":
                break  # índice inexistente ou chave inválida: não adianta seguir
    dados["erros"] = erros
    dados["atualizado_em"] = max(atualizadas.values()) if atualizadas else None
    gravar_json(caminho, dados)
    return dados


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
            "atualizado_em": d["atualizado_em"],
            "partes": sorted(k for k in PARTES if k in d),
        })
    gravar_json(DADOS / "index.json", {"gerado_em": agora_iso(), "fonte": "API Pública do DataJud (CNJ)", "tribunais": itens})
    log(f"index.json: {len(itens)} tribunais com dados")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tribunais", help="aliases separados por vírgula (ex.: tjac,stj,tre-sp)")
    ap.add_argument("--minutos", type=float, default=float(os.environ.get("ORCAMENTO_MINUTOS", 330)),
                    help="orçamento de tempo total (padrão 330 min, abaixo do limite de 6 h do GitHub Actions)")
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
        # Os mais desatualizados (ou nunca coletados) primeiro.
        def idade(t):
            return ler_json(POR_TRIBUNAL / f"{t['alias']}.json", {}).get("atualizado_em") or ""
        fila = sorted(todos, key=idade)

    prazo = time.monotonic() + args.minutos * 60
    log(f"{len(fila)} tribunais na fila; orçamento de {args.minutos:.0f} min")
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
    log(f"concluído: {ok} tribunais sem nenhuma falha")
    return 0


if __name__ == "__main__":
    sys.exit(main())

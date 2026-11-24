"""Testes do coletor, sem rede e sem esperas reais.

Rodar a partir da raiz do repositório:  python -m unittest discover -s coletor -v

Um "Elasticsearch de mentira" (FakeES) responde às consultas que o coletor monta, a partir de uma
lista de processos com datas nos dois formatos que a base do DataJud mistura:
  - texto ISO ("2024-03-10T00:00:00"), que o índice entende como data;
  - formato compacto ("20240310000000"), que o índice lê como milissegundos desde 1970.
"""
from __future__ import annotations

import io
import json
import shutil
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock
from urllib import error

sys.path.insert(0, str(Path(__file__).resolve().parent))
import coletar  # noqa: E402

HOJE = datetime(2026, 11, 23, tzinfo=timezone.utc)


def ms_iso(texto: str) -> int:
    return int(datetime.fromisoformat(texto).replace(tzinfo=timezone.utc).timestamp() * 1000)


class FakeES:
    """Avalia o subconjunto de consultas usado pelo coletor sobre uma lista de datas."""

    def __init__(self, datas: list[str]):
        # Como o índice guarda cada data: ISO vira o instante certo; compacto vira "milissegundos".
        self.ms = [int(d) if d.isdigit() else ms_iso(d) for d in datas]

    @staticmethod
    def _limite(v) -> int:
        return int(v) if isinstance(v, (int, float)) else ms_iso(v)

    def buscar(self, corpo: dict) -> dict:
        aggs = corpo.get("aggs", {})
        resp = {"hits": {"total": {"value": len(self.ms)}}, "aggregations": {}}
        if "iso" in aggs:
            faixa = aggs["iso"]["filter"]["range"]["dataAjuizamento"]
            ini, fim = self._limite(faixa["gte"]), self._limite(faixa["lt"])
            dentro = [m for m in self.ms if ini <= m < fim]
            hist = aggs["iso"]["aggs"]["h"]["date_histogram"]
            fmt = "%Y" if hist["calendar_interval"] == "year" else "%Y-%m"
            cont: dict[str, int] = {}
            for m in dentro:
                k = datetime.fromtimestamp(m / 1000, timezone.utc).strftime(fmt)
                cont[k] = cont.get(k, 0) + 1
            resp["aggregations"]["iso"] = {"doc_count": len(dentro), "h": {"buckets": [
                {"key_as_string": k, "doc_count": v} for k, v in sorted(cont.items())]}}
        if "compacto" in aggs:
            faixas = aggs["compacto"]["range"]["ranges"]
            resp["aggregations"]["compacto"] = {"buckets": [
                {"key": f["key"], "from": f["from"], "to": f["to"],
                 "doc_count": sum(1 for m in self.ms if f["from"] <= m < f["to"])} for f in faixas]}
        return resp


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        for alvo, valor in (("DADOS", self.tmp), ("POR_TRIBUNAL", self.tmp / "tribunais")):
            p = mock.patch.object(coletar, alvo, valor)
            p.start()
            self.addCleanup(p.stop)
        p = mock.patch.object(coletar.time, "sleep")
        self.sleep = p.start()
        self.addCleanup(p.stop)
        p = mock.patch.object(coletar, "log")
        p.start()
        self.addCleanup(p.stop)


TRIB = {"alias": "tjxx", "sigla": "TJXX", "nome": "Tribunal de Teste", "ramo": "Estadual"}


def resposta_termos(corpo):
    campo = corpo["aggs"]["x"]["terms"]["field"]
    return {"hits": {"total": {"value": 10, "relation": "eq"}}, "aggregations": {"x": {"buckets": [{"key": f"{campo}-A", "doc_count": 7}, {"key": f"{campo}-B", "doc_count": 3}]}}}


class TestSeriesDeDatas(Base):
    def test_soma_os_dois_formatos(self):
        datas = ["2024-03-10T12:00:00", "20240315000000", "20240301000000", "2025-01-02T00:00:00", "20231231235959"]
        es = FakeES(datas)
        corpo, chaves = coletar.corpo_anual(HOJE)
        serie = dict((x["ano"], x["qtd"]) for x in coletar._somar_datas(es.buscar(corpo), chaves, "ano"))
        self.assertEqual(serie["2024"], 3)
        self.assertEqual(serie["2025"], 1)
        self.assertEqual(serie["2023"], 1)
        self.assertEqual(sum(serie.values()), len(datas))
        self.assertEqual(list(serie)[0], "2000")
        self.assertEqual(list(serie)[-1], "2026")

    def test_compacto_cai_no_ano_2600_como_epoch_millis(self):
        # A explicação das "datas absurdas": 1985 compacto vira 2599 quando lido como milissegundos.
        ano = datetime.fromtimestamp(19850101000000 / 1000, timezone.utc).year
        self.assertEqual(ano, 2599)
        self.assertGreater(datetime.fromtimestamp(coletar._compacto(2024) / 1000, timezone.utc).year, 2600)

    def test_mensal_janela_com_base_em_dia(self):
        meses = coletar.meses_janela({"anual": [{"ano": "2025", "qtd": 900}, {"ano": "2026", "qtd": 800}]}, HOJE)
        self.assertEqual(len(meses), coletar.MESES_HISTORICO + 1)
        self.assertEqual(meses[-1], (2026, 11))
        self.assertEqual(meses[0], (2023, 11))

    def test_mensal_janela_com_base_parada(self):
        anual = [{"ano": "2021", "qtd": 900000}, {"ano": "2022", "qtd": 800000}, {"ano": "2023", "qtd": 30}]
        meses = coletar.meses_janela({"anual": anual}, HOJE)
        self.assertEqual((meses[0], meses[-1], len(meses)), ((2020, 1), (2022, 12), 36))

    def test_mensal_contiguo_e_somado(self):
        datas = ["2026-10-05T00:00:00", "20261020000000", "20250101000000", "2024-02-29T23:00:00"]
        corpo, chaves = coletar.corpo_mensal({}, HOJE)
        serie = coletar._somar_datas(FakeES(datas).buscar(corpo), chaves, "mes")
        meses = [x["mes"] for x in serie]
        self.assertEqual(meses, sorted(meses))
        self.assertEqual(len(meses), 37)
        d = {x["mes"]: x["qtd"] for x in serie}
        self.assertEqual((d["2026-10"], d["2025-01"], d["2024-02"], d["2026-11"]), (2, 1, 1, 0))

    def test_relevantes(self):
        self.assertIsNone(coletar.ultimo_ano_relevante(None))
        self.assertIsNone(coletar.ultimo_ano_relevante([{"ano": "2024", "qtd": 99}]))
        self.assertEqual(coletar.ultimo_ano_relevante([{"ano": "2022", "qtd": 1000}, {"ano": "2024", "qtd": 3}]), 2022)
        self.assertIsNone(coletar.ultimo_mes_relevante([]))
        self.assertEqual(coletar.ultimo_mes_relevante([{"mes": "2025-01", "qtd": 500}, {"mes": "2025-02", "qtd": 20}]), "2025-01")


class TestConsultar(Base):
    def _resp(self, corpo: bytes):
        r = mock.MagicMock()
        r.__enter__.return_value = io.BytesIO(corpo)
        return r

    def _http(self, code, headers=None):
        return error.HTTPError("u", code, "x", headers or {}, io.BytesIO(b'{"error":"x"}'))

    def test_429_e_depois_sucesso(self):
        with mock.patch.object(coletar.request, "urlopen", side_effect=[self._http(429), self._resp(b'{"ok":1}')]):
            self.assertEqual(coletar.consultar("tjxx", {}, "k"), {"ok": 1})
        self.assertEqual(self.sleep.call_count, 1)

    def test_erro_definitivo(self):
        with mock.patch.object(coletar.request, "urlopen", side_effect=self._http(404)):
            with self.assertRaises(coletar.ErroDataJud) as c:
                coletar.consultar("tjxx", {}, "k")
        self.assertTrue(c.exception.definitivo)
        self.sleep.assert_not_called()

    def test_json_invalido_e_repetido(self):
        with mock.patch.object(coletar.request, "urlopen", side_effect=[self._resp(b"<html>proxy</html>"), self._resp(b'{"ok":2}')]):
            self.assertEqual(coletar.consultar("tjxx", {}, "k"), {"ok": 2})

    def test_nao_tenta_de_novo_depois_do_prazo(self):
        with mock.patch.object(coletar.request, "urlopen", side_effect=self._http(503)) as u:
            with self.assertRaises(coletar.ErroDataJud):
                coletar.consultar("tjxx", {}, "k", prazo=coletar.time.monotonic() + 1)
        self.assertEqual(u.call_count, 1)

    def test_retry_after(self):
        with mock.patch.object(coletar.request, "urlopen", side_effect=[self._http(429, {"Retry-After": "90"}), self._resp(b"{}")]), \
                mock.patch.object(coletar.random, "uniform", return_value=0):
            coletar.consultar("tjxx", {}, "k")
        self.assertEqual(self.sleep.call_args[0][0], 90)


class TestColetarTribunal(Base):
    def _fake(self, datas, falhar=()):
        es = FakeES(datas)

        def consultar(alias, corpo, chave, **kw):
            aggs = corpo.get("aggs", {})
            if "x" in aggs:
                campo = aggs["x"]["terms"]["field"]
                if any(f in campo for f in falhar):
                    raise coletar.ErroDataJud("HTTP 429: fila cheia")
                return resposta_termos(corpo)
            return es.buscar(corpo)
        return consultar

    def test_coleta_completa(self):
        datas = ["20240310000000"] * 300 + ["2025-06-01T00:00:00"] * 200
        with mock.patch.object(coletar, "consultar", self._fake(datas)):
            d = coletar.coletar_tribunal(TRIB, "k", coletar.time.monotonic() + 999)
        self.assertEqual(d["erros"], {})
        self.assertEqual(set(coletar.PARTES) - set(d), set())
        self.assertEqual(d["total"], 500)
        anual = {x["ano"]: x["qtd"] for x in d["anual"]}
        self.assertEqual((anual["2024"], anual["2025"]), (300, 200))
        self.assertTrue((coletar.POR_TRIBUNAL / "tjxx.json").exists())
        self.assertEqual(d["parte_mais_antiga_em"], min(d["partes_atualizadas_em"].values()))
        self.assertEqual(d["totais_partes"]["classes"], 10)
        self.assertNotIn("anual", d["totais_partes"])

    def test_parte_que_falha_mantem_valor_anterior(self):
        coletar.gravar_json(coletar.POR_TRIBUNAL / "tjxx.json", {"classes": [{"nome": "Antiga", "qtd": 1}]})
        with mock.patch.object(coletar, "consultar", self._fake(["2025-01-01T00:00:00"], falhar=("classe",))):
            d = coletar.coletar_tribunal(TRIB, "k", coletar.time.monotonic() + 999)
        self.assertEqual(d["classes"], [{"nome": "Antiga", "qtd": 1}])
        self.assertIn("classes", d["erros"])

    def test_resposta_malformada_vira_erro_da_parte(self):
        def consultar(alias, corpo, chave, **kw):
            return {"timed_out": True}
        with mock.patch.object(coletar, "consultar", consultar):
            d = coletar.coletar_tribunal(TRIB, "k", coletar.time.monotonic() + 999)
        self.assertEqual(set(d["erros"]), set(coletar.PARTES))

    def test_mensal_usa_janela_da_base_parada(self):
        datas = ["20210615000000"] * 500 + ["2022-03-01T00:00:00"] * 400 + ["20240101000000"]
        corpos = []

        def consultar(alias, corpo, chave, **kw):
            corpos.append(corpo)
            return resposta_termos(corpo) if "x" in corpo.get("aggs", {}) else FakeES(datas).buscar(corpo)
        with mock.patch.object(coletar, "consultar", consultar):
            d = coletar.coletar_tribunal(TRIB, "k", coletar.time.monotonic() + 999)
        self.assertEqual(d["mensal"][-1]["mes"], "2022-12")
        self.assertEqual(sum(x["qtd"] for x in d["mensal"]), 900)


class TestIndiceEMain(Base):
    def test_indice(self):
        coletar.gravar_json(coletar.POR_TRIBUNAL / "tjxx.json", {
            **TRIB, "atualizado_em": "2026-11-20T00:00:00+00:00", "total": 10,
            "formatos": [{"nome": "Eletrônico", "qtd": 3}, {"nome": "Físico", "qtd": 1}],
            "classes": [{"nome": "Execução Fiscal", "qtd": 5}],
            "anual": [{"ano": "2024", "qtd": 900}, {"ano": "2025", "qtd": 800}],
            "mensal": [{"mes": "2025-04", "qtd": 400}, {"mes": "2025-05", "qtd": 3}],
        })
        coletar.atualizar_indice([TRIB, {**TRIB, "alias": "tjyy"}])
        idx = json.loads((coletar.DADOS / "index.json").read_text(encoding="utf-8"))
        self.assertEqual(len(idx["tribunais"]), 1)
        t = idx["tribunais"][0]
        self.assertEqual((t["pct_eletronico"], t["classe_principal"], t["ultimo_mes"], t["ultimo_ano"]),
                         (75.0, "Execução Fiscal", "2025-04", 2025))

    def test_minutos_padrao_invalido(self):
        with mock.patch.dict(coletar.os.environ, {"ORCAMENTO_MINUTOS": "abc"}):
            self.assertEqual(coletar.minutos_padrao(), 320.0)
        with mock.patch.dict(coletar.os.environ, {"ORCAMENTO_MINUTOS": ""}):
            self.assertEqual(coletar.minutos_padrao(), 320.0)

    def test_lista_de_tribunais_tem_91(self):
        lista = json.loads(coletar.LISTA.read_text(encoding="utf-8"))
        self.assertEqual(len({t["alias"] for t in lista}), 91)


if __name__ == "__main__":
    unittest.main()

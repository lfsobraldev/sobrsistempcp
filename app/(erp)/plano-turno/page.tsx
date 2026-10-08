"use client";

import { FileSpreadsheet, Printer, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { useOps } from "@/components/operational-provider";
import { LABELS, leaderPlanRows } from "@/lib/metrics";
import { PROCESSOS } from "@/lib/processos";
import { exportarCompleto, exportarSetor } from "@/lib/export";
import { fmt } from "@/lib/format";

type LinhaPlano = {
  key: string;
  descricao: string;
  medida: string;
  quantidade: number;
  saldo: number;
};

type SetorPlano = {
  processo: string;
  rows: LinhaPlano[];
  total: number;
  saldo: number;
};

export default function PlanoTurno() {
  const { pg, refresh } = useOps();
  const produtos = pg?.produtos || [];

  const setores = useMemo<SetorPlano[]>(() => {
    return PROCESSOS.map((processo) => {
      const origem = leaderPlanRows(produtos, processo) as LinhaPlano[];

      return {
        processo,
        rows: origem,
        total: origem.reduce(
          (s, x) => s + Number(x.quantidade || 0),
          0
        ),
        saldo: origem.reduce(
          (s, x) => s + Number(x.saldo || 0),
          0
        ),
      };
    }).filter((x) => x.rows.length > 0);
  }, [produtos]);

  const prioridades = useMemo(
    () =>
      produtos.filter(
        (p) => p.prioridade === "ALTA" || p.prioridade === "URGENTE"
      ).length,
    [produtos]
  );

  return (
    <>
      <div className="pageTitle">
        <div>
          <span>IMPRESSÃO PARA O CHÃO DE FÁBRICA</span>
          <h1>Plano do Turno</h1>
          <p>Gere as folhas por setor seguindo a sequência industrial definida.</p>
        </div>

        <div className="rowActions">
          <button className="secondary" onClick={refresh}>
            <RefreshCw /> Atualizar
          </button>

          <button
            className="primary"
            disabled={!produtos.length}
            onClick={() => exportarCompleto(produtos)}
          >
            <Printer /> Gerar plano completo
          </button>
        </div>
      </div>

      <div className="pcpMetricStrip">
        <article>
          <span>SETORES COM SERVIÇO</span>
          <b>{setores.length}</b>
          <small>folhas para impressão</small>
        </article>

        <article>
          <span>PEÇAS PROGRAMADAS</span>
          <b>{fmt(setores.reduce((s, x) => s + x.total, 0))}</b>
          <small>somatório dos processos</small>
        </article>

        <article className={prioridades ? "attention" : ""}>
          <span>ITENS PRIORITÁRIOS</span>
          <b>{prioridades}</b>
          <small>destacados no turno</small>
        </article>
      </div>

      <div className="pcpDashGrid">
        {setores.map((setor) => (
          <section className="pcpBoard" key={setor.processo}>
            <header>
              <div>
                <span>FOLHA DO LÍDER</span>
                <h2>{LABELS[setor.processo] || setor.processo}</h2>
              </div>

              <button
                className="secondary"
                onClick={() => exportarSetor(produtos, setor.processo)}
              >
                <FileSpreadsheet /> Excel
              </button>
            </header>

            <div className="pcpMiniRows">
              {setor.rows.slice(0, 5).map((x, i) => (
                <div key={x.key}>
                  <span>{i + 1}. {x.descricao}</span>
                  <b>{x.medida || "-"}</b>
                  <small>{fmt(x.saldo)} pç</small>
                </div>
              ))}
            </div>

            <div className="leaderHero">
              <div>
                <small>PROGRAMADO</small>
                <b>{fmt(setor.total)}</b>
              </div>

              <div>
                <small>SALDO</small>
                <b>{fmt(setor.saldo)}</b>
              </div>
            </div>
          </section>
        ))}

        {!setores.length && (
          <div className="empty">
            <b>Nenhum setor com serviço programado.</b>
          </div>
        )}
      </div>
    </>
  );
}

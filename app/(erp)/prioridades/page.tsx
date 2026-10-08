"use client";

import { FileSpreadsheet, Flag, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useOps } from "@/components/operational-provider";
import { LABELS } from "@/lib/metrics";
import { exportarExcel } from "@/lib/export";
import { fmt } from "@/lib/format";

type Nivel = "NORMAL" | "ALTA" | "URGENTE";

const PESO: Record<Nivel, number> = {
  NORMAL: 0,
  ALTA: 1,
  URGENTE: 2,
};

export default function Prioridades() {
  const { pg, refresh, toast } = useOps();
  const [busy, setBusy] = useState("");

  const pedidos = useMemo(() => {
    const map = new Map<string, any>();

    for (const p of pg?.produtos || []) {
      const atual =
        p.operacoes.find((o) => o.status !== "CONCLUIDA") ||
        null;

      if (!atual) continue;

      const saldo = Math.max(
        0,
        atual.quantidadePlanejada - atual.quantidadeProduzida
      );

      const nivel = (p.prioridade || "NORMAL") as Nivel;
      const x = map.get(p.pedido);

      if (x) {
        x.saldo += saldo;
        x.ofs.add(p.of);
        x.processos.add(atual.processo);
        if (PESO[nivel] > PESO[x.prioridade]) x.prioridade = nivel;
        if (atual.status === "BLOQUEADA") x.alertas.add("BLOQUEADA");
        if (atual.status === "DIVERGENCIA") x.alertas.add("DIVERGÊNCIA");
      } else {
        map.set(p.pedido, {
          pedido: p.pedido,
          prioridade: nivel,
          saldo,
          ofs: new Set(p.of ? [p.of] : []),
          processos: new Set([atual.processo]),
          alertas: new Set(
            atual.status === "BLOQUEADA"
              ? ["BLOQUEADA"]
              : atual.status === "DIVERGENCIA"
              ? ["DIVERGÊNCIA"]
              : []
          ),
        });
      }
    }

    return [...map.values()].sort(
      (a, b) =>
        PESO[b.prioridade as Nivel] - PESO[a.prioridade as Nivel] ||
        b.alertas.size - a.alertas.size ||
        String(a.pedido).localeCompare(String(b.pedido), "pt-BR", {
          numeric: true,
        })
    );
  }, [pg]);

  async function alterar(pedido: string, prioridade: Nivel) {
    setBusy(pedido);
    try {
      const r = await fetch("/api/prioridades", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pedido, prioridade }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      toast("success", `Pedido ${pedido}: ${prioridade}.`);
      await refresh();
    } catch (e: any) {
      toast("error", e.message);
    } finally {
      setBusy("");
    }
  }

  function exportar() {
    const linhas = pedidos
      .filter((x) => x.prioridade !== "NORMAL" || x.alertas.size)
      .map((x) => ({
        Prioridade: x.prioridade,
        Pedido: x.pedido,
        OFs: [...x.ofs].join(", "),
        "Processo atual": [...x.processos]
          .map((p) => LABELS[p] || p)
          .join(" / "),
        Saldo: x.saldo,
        Observação: [...x.alertas].join(" / "),
      }));

    exportarExcel(
      [{ nome: "PRIORIDADES", linhas }],
      "Prioridades_do_Turno"
    );
  }

  const importantes = pedidos.filter(
    (x) => x.prioridade !== "NORMAL" || x.alertas.size
  );

  return (
    <>
      <div className="pageTitle">
        <div>
          <span>CONTROLE DO TURNO</span>
          <h1>Prioridades</h1>
          <p>Defina somente os pedidos que precisam passar na frente e imprima a orientação do turno.</p>
        </div>
        <div className="rowActions">
          <button className="secondary" onClick={refresh}>
            <RefreshCw /> Atualizar
          </button>
          <button className="primary" onClick={exportar}>
            <FileSpreadsheet /> Exportar para imprimir
          </button>
        </div>
      </div>

      <div className="pcpMetricStrip">
        <article>
          <span>PEDIDOS ATIVOS</span>
          <b>{pedidos.length}</b>
          <small>na programação</small>
        </article>
        <article className={importantes.length ? "attention" : ""}>
          <span>COM PRIORIDADE</span>
          <b>{importantes.length}</b>
          <small>para orientar os líderes</small>
        </article>
        <article>
          <span>URGENTES</span>
          <b>{pedidos.filter((x) => x.prioridade === "URGENTE").length}</b>
          <small>passam na frente</small>
        </article>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>PRIORIDADE</th>
              <th>PEDIDO</th>
              <th>OFs</th>
              <th>PROCESSO ATUAL</th>
              <th className="num">SALDO</th>
              <th>ALERTA</th>
              <th>DEFINIR</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.map((x) => (
              <tr key={x.pedido}>
                <td>
                  <span className={`priority p-${String(x.prioridade).toLowerCase()}`}>
                    {x.prioridade}
                  </span>
                </td>
                <td><b>{x.pedido}</b></td>
                <td>{[...x.ofs].join(", ") || "-"}</td>
                <td>
                  {[...x.processos]
                    .map((p) => LABELS[String(p)] || String(p))
                    .join(" / ")}
                </td>
                <td className="num"><b>{fmt(x.saldo)}</b></td>
                <td>{[...x.alertas].join(" / ") || "-"}</td>
                <td>
                  <div className="rowActions">
                    {(["NORMAL", "ALTA", "URGENTE"] as Nivel[]).map((nivel) => (
                      <button
                        key={nivel}
                        disabled={busy === x.pedido || x.prioridade === nivel}
                        onClick={() => alterar(x.pedido, nivel)}
                        title={nivel}
                      >
                        <Flag />
                        {nivel}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {!pedidos.length && (
              <tr>
                <td colSpan={7}>
                  <div className="empty">
                    <b>Nenhum pedido ativo.</b>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

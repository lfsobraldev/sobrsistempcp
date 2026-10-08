"use client";

import { ArrowDown, ArrowUp, FileSpreadsheet, Pin, PinOff } from "lucide-react";
import { useState } from "react";
import { useOps } from "@/components/operational-provider";
import { LABELS, queueRows } from "@/lib/metrics";
import { PROCESSOS } from "@/lib/filter-parser";
import { FAMILIAS, familiaDe } from "@/lib/sort";
import { modeloProduto } from "@/lib/presentation";
import { fmt } from "@/lib/format";
import { exportarExcel, linhaOp } from "@/lib/export";
import { FamiliaTabs, TableScroll } from "@/components/table-scroll";

export default function Sequenciamento() {
  const { pg, refresh, toast } = useOps();

  const products = pg?.produtos || [];

  const procs = [...PROCESSOS];

  const [proc, setProc] = useState(
    procs[0] || "RECOBRIDORA"
  );

  const [dragged, setDragged] =
    useState<string | null>(null);

  const [fam, setFam] = useState("TODAS");

  const rows = queueRows(products, proc).filter(
    (x) => fam === "TODAS" || familiaDe(x.p.categoria) === fam
  );

  async function patch(
    id: string,
    action: string,
    payload: Record<string, unknown> = {}
  ) {
    try {
      const response = await fetch(
        "/api/sequenciamento",
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            id,
            action,
            ...payload,
          }),
        }
      );

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ||
            "Falha ao atualizar sequenciamento."
        );
      }

      toast(
        "success",
        "Sequenciamento atualizado."
      );

      await refresh();
    } catch (error: any) {
      toast(
        "error",
        error?.message ||
          "Falha ao atualizar sequenciamento."
      );
    }
  }

  async function dropOn(
    targetOrder: number,
    targetId: string
  ) {
    if (!dragged || dragged === targetId) {
      return;
    }

    const sourceId = dragged;

    setDragged(null);

    await patch(
      sourceId,
      "MOVER",
      {
        ordem: targetOrder,
      }
    );
  }

  return (
    <>
      <div className="pageTitle">
        <div>
          <span>APS</span>

          <h1>Sequenciamento</h1>

          <p>
            Prioridade, agrupamento de setup e
            intervenção manual controlada.
          </p>
        </div>

        <button
          className="secondary"
          onClick={() =>
            exportarExcel(
              [{ nome: LABELS[proc] || proc, linhas: rows.map((x) => linhaOp(x.p, x.o)) }],
              `Sequenciamento_${LABELS[proc] || proc}`
            )
          }
        >
          <FileSpreadsheet />
          Exportar Excel
        </button>
      </div>

      <div className="processTabs">
        {procs.map((p) => (
          <button
            key={p}
            className={
              proc === p
                ? "active"
                : ""
            }
            onClick={() =>
              setProc(p)
            }
          >
            {LABELS[p] || p}
          </button>
        ))}
      </div>

      <FamiliaTabs value={fam} onChange={setFam} familias={FAMILIAS} />

      <TableScroll>
        <table>
          <thead>
            <tr>
              <th>SEQ.</th><th>FIXA</th><th>PEDIDO</th><th>ITEM</th><th>OF</th><th>PRODUTO</th><th>FAMÍLIA</th><th>DESCRIÇÃO</th>
              <th>TIPO</th><th>REBAIXO</th><th>ACABAMENTO</th><th>COR</th><th className="num">QTD PROGRAMADA</th>
              <th className="num">COMP.</th><th className="num">LARG.</th><th className="num">ESP.</th><th>STATUS</th><th>PRIORIDADE</th><th>AÇÕES</th>
            </tr>
          </thead>

          <tbody>
            {rows.map(({ p, o }, i) => {
              const m = modeloProduto(p, o, pg?.turno || "");
              return (
                <tr
                  key={o.id}
                  draggable
                  onDragStart={() => setDragged(o.id)}
                  onDragEnd={() => setDragged(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => dropOn(i + 1, o.id)}
                >
                  <td className="mono"><b>{o.ordemFila}</b></td>
                  <td>{o.fixada ? <Pin size={16} /> : ""}</td>
                  <td>{m.pedido}</td><td>{m.item}</td><td><b>{m.of}</b></td><td>{m.produto}</td>
                  <td><em className="tag">{m.familia}</em></td><td className="descCell"><b>{m.descricao}</b></td>
                  <td>{m.tipo}</td><td>{m.rebaixo}</td><td>{m.acabamento}</td><td>{m.cor}</td>
                  <td className="num">{fmt(m.planejado)}</td><td className="num mono">{fmt(m.comprimento)}</td>
                  <td className="num mono">{fmt(m.largura)}</td><td className="num mono">{fmt(m.espessura)}</td>
                  <td>{m.status}</td><td><span className={`priority p-${String(m.prioridade).toLowerCase()}`}>{m.prioridade}</span></td>
                  <td>
                    <div className="rowActions">
                      <button type="button" title="Subir" onClick={() => patch(o.id, "MOVER", { ordem: Math.max(1, o.ordemFila - 1) })}><ArrowUp /></button>
                      <button type="button" title="Descer" onClick={() => patch(o.id, "MOVER", { ordem: o.ordemFila + 1 })}><ArrowDown /></button>
                      <button type="button" title={o.fixada ? "Desafixar" : "Fixar"} onClick={() => patch(o.id, "FIXAR", { value: !o.fixada })}>
                        {o.fixada ? <PinOff /> : <Pin />}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
    </>
  );
}

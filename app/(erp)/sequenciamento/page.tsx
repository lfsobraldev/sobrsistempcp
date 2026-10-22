"use client";

import { ArrowDown, ArrowUp, FileSpreadsheet, Pin, PinOff } from "lucide-react";
import { useState } from "react";
import { useOpsVisao as useOps } from "@/components/operational-provider";
import { LABELS, queueRows } from "@/lib/metrics";
import { PROCESSOS } from "@/lib/processos";
import { FAMILIAS, familiaDe } from "@/lib/sort";
import { modeloProduto } from "@/lib/presentation";
import { fmt } from "@/lib/format";
import { exportarExcel, linhaOp } from "@/lib/export";
import { FamiliaTabs, TableScroll } from "@/components/table-scroll";
import { Badge, PageHeader, Segmented, type Tone } from "@/components/ui";

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

  const tomPrio = (p: string): Tone => (/URGENTE/i.test(p) ? "danger" : /ALTA/i.test(p) ? "warning" : "neutral");

  return (
    <>
      <PageHeader
        eyebrow="APS"
        title="Sequenciamento"
        description="Prioridade, agrupamento de setup e intervenção manual controlada. Arraste as linhas para reordenar."
        actions={
          <button onClick={() => exportarExcel([{ nome: LABELS[proc] || proc, linhas: rows.map((x) => linhaOp(x.p, x.o)) }], `Sequenciamento_${LABELS[proc] || proc}`)}>
            <FileSpreadsheet /> Exportar Excel
          </button>
        }
      />

      <div style={{ marginBottom: "var(--sp-3)", overflowX: "auto" }}>
        <Segmented value={proc} onChange={setProc} options={procs.map((p) => ({ value: p, label: LABELS[p] || p }))} />
      </div>

      <FamiliaTabs value={fam} onChange={setFam} familias={FAMILIAS} />

      <TableScroll>
        <table>
          <thead>
            <tr>
              <th>Seq.</th><th>Fixa</th><th>Pedido</th><th>Item</th><th>OF</th><th>Produto</th><th>Família</th><th>Descrição</th>
              <th>Tipo</th><th>Rebaixo</th><th>Acabamento</th><th>Cor</th><th className="num">Qtd programada</th>
              <th className="num">Comp.</th><th className="num">Larg.</th><th className="num">Esp.</th><th>Status</th><th>Prioridade</th><th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, o }, i) => {
              const m = modeloProduto(p, o, pg?.turno || "");
              return (
                <tr key={o.id} draggable onDragStart={() => setDragged(o.id)} onDragEnd={() => setDragged(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropOn(i + 1, o.id)} className={dragged === o.id ? "dragging" : ""}>
                  <td className="mono"><b>{o.ordemFila}</b></td>
                  <td>{o.fixada ? <Pin size={16} /> : ""}</td>
                  <td>{m.pedido}</td><td>{m.item}</td><td><b>{m.of}</b></td><td>{m.produto}</td>
                  <td><Badge>{m.familia}</Badge></td><td className="descCell"><b>{m.descricao}</b></td>
                  <td>{m.tipo}</td><td>{m.rebaixo}</td><td>{m.acabamento}</td><td>{m.cor}</td>
                  <td className="num">{fmt(m.planejado)}</td><td className="num mono">{fmt(m.comprimento)}</td>
                  <td className="num mono">{fmt(m.largura)}</td><td className="num mono">{fmt(m.espessura)}</td>
                  <td>{m.status}</td><td><Badge tone={tomPrio(String(m.prioridade))}>{m.prioridade}</Badge></td>
                  <td>
                    <div className="rowActions">
                      <button type="button" title="Subir" onClick={() => patch(o.id, "MOVER", { ordem: Math.max(1, o.ordemFila - 1) })}><ArrowUp /></button>
                      <button type="button" title="Descer" onClick={() => patch(o.id, "MOVER", { ordem: o.ordemFila + 1 })}><ArrowDown /></button>
                      <button type="button" title={o.fixada ? "Desafixar" : "Fixar"} onClick={() => patch(o.id, "FIXAR", { value: !o.fixada })}>{o.fixada ? <PinOff /> : <Pin />}</button>
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

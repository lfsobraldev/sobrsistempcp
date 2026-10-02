"use client";

import { ArrowDown, ArrowUp, Pin, PinOff } from "lucide-react";
import { useState } from "react";
import { useOps } from "@/components/operational-provider";
import { LABELS, queueRows } from "@/lib/metrics";

export default function Sequenciamento() {
  const { pg, refresh, toast } = useOps();

  const products = pg?.produtos || [];

  const procs = [
    ...new Set(
      products.flatMap((p) =>
        p.operacoes.map((o) => o.processo)
      )
    ),
  ];

  const [proc, setProc] = useState(
    procs[0] || "RECOBRIDORA"
  );

  const [dragged, setDragged] =
    useState<string | null>(null);

  const rows = queueRows(products, proc);

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

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>SEQ</th>
              <th>FIXA</th>
              <th>OF</th>
              <th>PEDIDO</th>
              <th>PEÇA</th>
              <th>QTD</th>
              <th>ACABAMENTO</th>
              <th>COR</th>
              <th>STATUS</th>
              <th>AÇÕES</th>
            </tr>
          </thead>

          <tbody>
            {rows.map(
              (
                { p, o },
                i
              ) => (
                <tr
                  key={o.id}
                  draggable
                  onDragStart={() =>
                    setDragged(
                      o.id
                    )
                  }
                  onDragEnd={() =>
                    setDragged(
                      null
                    )
                  }
                  onDragOver={(
                    event
                  ) =>
                    event.preventDefault()
                  }
                  onDrop={() =>
                    dropOn(
                      i + 1,
                      o.id
                    )
                  }
                >
                  <td>
                    <b>
                      {
                        o.ordemFila
                      }
                    </b>
                  </td>

                  <td>
                    {o.fixada ? (
                      <Pin
                        size={
                          14
                        }
                      />
                    ) : (
                      ""
                    )}
                  </td>

                  <td>
                    {p.of ||
                      "-"}
                  </td>

                  <td>
                    {
                      p.pedido
                    }
                  </td>

                  <td>
                    {
                      p.categoria
                    }
                  </td>

                  <td>
                    {
                      p.quantidade
                    }
                  </td>

                  <td>
                    {p.acabamento ||
                      "-"}
                  </td>

                  <td>
                    {p.cor ||
                      "-"}
                  </td>

                  <td>
                    {
                      o.status
                    }
                  </td>

                  <td>
                    <div className="rowActions">
                      <button
                        type="button"
                        title="Subir"
                        onClick={() =>
                          patch(
                            o.id,
                            "MOVER",
                            {
                              ordem:
                                Math.max(
                                  1,
                                  o.ordemFila -
                                    1
                                ),
                            }
                          )
                        }
                      >
                        <ArrowUp />
                      </button>

                      <button
                        type="button"
                        title="Descer"
                        onClick={() =>
                          patch(
                            o.id,
                            "MOVER",
                            {
                              ordem:
                                o.ordemFila +
                                1,
                            }
                          )
                        }
                      >
                        <ArrowDown />
                      </button>

                      <button
                        type="button"
                        title={
                          o.fixada
                            ? "Desafixar"
                            : "Fixar"
                        }
                        onClick={() =>
                          patch(
                            o.id,
                            "FIXAR",
                            {
                              value:
                                !o.fixada,
                            }
                          )
                        }
                      >
                        {o.fixada ? (
                          <PinOff />
                        ) : (
                          <Pin />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

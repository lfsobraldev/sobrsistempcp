"use client";

import { useOps } from "@/components/operational-provider";
import { LABELS, atual } from "@/lib/metrics";
import { PROCESSOS } from "@/lib/filter-parser";

export default function Fluxo() {
  const { pg, me } = useOps();
  const products = pg?.produtos || [];

  const procs = me?.processos?.length
    ? PROCESSOS.filter((x) => me.processos.includes(x))
    : [...PROCESSOS];

  return (
    <>
      <div className="pageTitle">
        <div>
          <span>FLUXO</span>
          <h1>Fluxo de Produção</h1>
          <p>Cada produto aparece somente no estágio atual de sua própria rota.</p>
        </div>
      </div>

      <div className="flowBoard">
        {procs.map((proc) => {
          const itens = products
            .filter((p) => atual(p)?.processo === proc)
            .sort(
              (a, b) =>
                (atual(a)?.ordemFila || 0) -
                (atual(b)?.ordemFila || 0)
            )
            .slice(0, 80);

          return (
            <section key={proc}>
              <header>
                <b>{LABELS[proc] || proc}</b>
                <span>{itens.length}</span>
              </header>

              <div>
                {itens.map((p) => (
                  <article key={p.id}>
                    <small>
                      OF {p.of || "-"} • Pedido {p.pedido}
                    </small>
                    <b>{p.categoria}</b>
                    <span>
                      {p.medida || "-"} • {Math.round(p.quantidade)} pçs
                    </span>
                    <em>{atual(p)?.status}</em>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

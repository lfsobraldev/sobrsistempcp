"use client";

import { useOps } from "@/components/operational-provider";
import { LABELS, atual } from "@/lib/metrics";
import { PROCESSOS } from "@/lib/processos";
import { Badge, Empty, PageHeader, Status } from "@/components/ui";

export default function Fluxo() {
  const { pg, me } = useOps();
  const products = pg?.produtos || [];
  const procs = me?.processos?.length ? PROCESSOS.filter((x) => me.processos.includes(x)) : [...PROCESSOS];

  return (
    <>
      <PageHeader eyebrow="Fluxo" title="Fluxo de Produção" description="Cada produto aparece somente no estágio atual de sua própria rota." />
      <div className="kanban">
        {procs.map((proc) => {
          const itens = products
            .filter((p) => atual(p)?.processo === proc)
            .sort((a, b) => (atual(a)?.ordemFila || 0) - (atual(b)?.ordemFila || 0))
            .slice(0, 80);
          return (
            <section key={proc} className="kanban-col">
              <header><b>{LABELS[proc] || proc}</b><Badge tone="info">{itens.length}</Badge></header>
              <div className="kanban-list">
                {itens.map((p) => (
                  <article key={p.id} className="kanban-card">
                    <small>OF {p.of || "-"} · Pedido {p.pedido}</small>
                    <b>{p.categoria}</b>
                    <span>{p.medida || "-"} · {Math.round(p.quantidade)} pçs</span>
                    <Status value={atual(p)?.status} />
                  </article>
                ))}
                {!itens.length && <Empty title="Vazio" />}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

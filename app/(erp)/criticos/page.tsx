"use client";

import { FileSpreadsheet } from "lucide-react";
import { useMemo, useState } from "react";
import { useOps } from "@/components/operational-provider";
import { LABELS } from "@/lib/metrics";
import { ordenarProcessos } from "@/lib/processos";
import { calcularCriticos } from "@/lib/criticos";
import { exportarExcel, linhaOp } from "@/lib/export";
import { fmt } from "@/lib/format";
import { familiaDe } from "@/lib/sort";
import { Badge, DataTable, Empty, PageHeader, Segmented, Status } from "@/components/ui";

export default function Criticos() {
  const { pg, andon } = useOps();
  const lista = useMemo(() => calcularCriticos(pg?.produtos || [], andon), [pg, andon]);
  const procs = ordenarProcessos([...new Set(lista.map((c) => c.o.processo))]);
  const [proc, setProc] = useState("TODOS");
  const rows = proc === "TODOS" ? lista : lista.filter((c) => c.o.processo === proc);

  return (
    <>
      <PageHeader
        eyebrow="Operação"
        title="Pedidos em Risco"
        description={`${fmt(lista.length)} item(ns) exigem atenção antes de virarem atraso.`}
        actions={
          <button onClick={() => exportarExcel([{ nome: "Pedidos em Risco", linhas: rows.map((c) => ({ Motivos: c.motivos.join(" | "), Gravidade: c.gravidade, ...linhaOp(c.p, c.o) })) }], "Pedidos_em_Risco")}>
            <FileSpreadsheet /> Exportar Excel
          </button>
        }
      />
      <div style={{ marginBottom: "var(--sp-4)", overflowX: "auto" }}>
        <Segmented
          value={proc}
          onChange={setProc}
          options={["TODOS", ...procs].map((p) => ({ value: p, label: p === "TODOS" ? "Todos" : LABELS[p] || p }))}
        />
      </div>
      <DataTable head={["Motivo", "Processo", "OF", "Pedido", "Peça", "Medida", "Saldo", "Status"]} empty={!rows.length && <Empty title="Nenhum pedido em risco no momento." />}>
        {rows.map((c) => (
          <tr key={c.o.id}>
            <td><div className="row" style={{ flexWrap: "wrap", gap: "var(--sp-1)" }}>{c.motivos.map((m) => <Badge key={m} tone="danger">{m}</Badge>)}</div></td>
            <td>{LABELS[c.o.processo] || c.o.processo}</td>
            <td><b>{c.p.of || "-"}</b></td>
            <td>{c.p.pedido}</td>
            <td><b>{c.p.descricao}</b> <Badge>{familiaDe(c.p.categoria)}</Badge></td>
            <td className="mono">{c.p.medida || "-"}</td>
            <td className="num"><b>{fmt(c.saldo)}</b></td>
            <td><Status value={c.o.status} /></td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}

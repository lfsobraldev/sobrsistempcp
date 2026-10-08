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
import { Empty, Status } from "@/components/ui";
import { TableScroll } from "@/components/table-scroll";

export default function Criticos() {
  const { pg, andon } = useOps();
  const lista = useMemo(() => calcularCriticos(pg?.produtos || [], andon), [pg, andon]);
  const procs = ordenarProcessos([...new Set(lista.map((c) => c.o.processo))]);
  const [proc, setProc] = useState("TODOS");
  const rows = proc === "TODOS" ? lista : lista.filter((c) => c.o.processo === proc);

  return (
    <>
      <div className="pageTitle">
        <div>
          <span>OPERAÇÃO</span>
          <h1>Pedidos em Risco</h1>
          <p>{fmt(lista.length)} item(ns) exigem atenção antes de virarem atraso.</p>
        </div>
        <button className="secondary" onClick={() => exportarExcel([{ nome: "Pedidos em Risco", linhas: rows.map((c) => ({ Motivos: c.motivos.join(" | "), Gravidade: c.gravidade, ...linhaOp(c.p, c.o) })) }], "Pedidos_em_Risco")}>
          <FileSpreadsheet />Exportar Excel
        </button>
      </div>
      <div className="processTabs">
        {["TODOS", ...procs].map((p) => (
          <button key={p} className={proc === p ? "active" : ""} onClick={() => setProc(p)}>{p === "TODOS" ? "Todos" : LABELS[p] || p}</button>
        ))}
      </div>
      <TableScroll>
        <table>
          <thead>
            <tr><th>MOTIVO</th><th>PROCESSO</th><th>OF</th><th>PEDIDO</th><th>PEÇA</th><th>MEDIDA</th><th className="num">SALDO</th><th>STATUS</th></tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.o.id} className="critRow">
                <td>{c.motivos.map((m) => <em key={m} className="tag crit">{m}</em>)}</td>
                <td>{LABELS[c.o.processo] || c.o.processo}</td>
                <td><b>{c.p.of || "-"}</b></td>
                <td>{c.p.pedido}</td>
                <td><b>{c.p.descricao}</b><em className="tag">{familiaDe(c.p.categoria)}</em></td>
                <td className="mono">{c.p.medida || "-"}</td>
                <td className="num"><b>{fmt(c.saldo)}</b></td>
                <td><Status value={c.o.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty title="Nenhum pedido em risco no momento." />}
      </TableScroll>
    </>
  );
}

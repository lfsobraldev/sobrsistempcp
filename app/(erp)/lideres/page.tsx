"use client";

import { FileSpreadsheet } from "lucide-react";
import { useMemo, useState } from "react";
import { useOps } from "@/components/operational-provider";
import { LABELS, leaderPlanRows, leaderReleasedRows } from "@/lib/metrics";
import { FAMILIAS } from "@/lib/sort";
import { fmt, fmtPct, pct } from "@/lib/format";
import { exportarExcel } from "@/lib/export";
import { Empty } from "@/components/ui";
import { FamiliaTabs, TableScroll } from "@/components/table-scroll";

export default function Lideres() {
  const { pg, me } = useOps();
  const products = pg?.produtos || [];
  const all = [...new Set(products.flatMap((p) => p.operacoes.map((o) => o.processo)))];
  const procs = me?.processos?.length ? all.filter((x) => me.processos.includes(x)) : all;
  const [proc, setProc] = useState(procs[0] || "RECOBRIDORA");
  const [tab, setTab] = useState<"PLAN" | "NOW">("PLAN");
  const [fam, setFam] = useState("TODAS");

  const plan = useMemo(() => leaderPlanRows(products, proc), [products, proc]);
  const now = useMemo(() => leaderReleasedRows(products, proc), [products, proc]);
  const base = tab === "PLAN" ? plan : now;
  const rows = fam === "TODAS" ? base : base.filter((x) => x.familia === fam);

  const soma = (l: typeof plan, k: "quantidade" | "produzido" | "saldo") => l.reduce((s, x) => s + x[k], 0);
  const planned = soma(plan, "quantidade");
  const produced = soma(plan, "produzido");

  function exportar() {
    exportarExcel(
      [{
        nome: LABELS[proc] || proc,
        linhas: rows.map((x) => ({
          Família: x.familia, Peça: x.descricao, Material: x.material, Medida: x.medida,
          Rebaixo: x.rebaixo, Acabamento: x.acabamento, Cor: x.cor,
          Planejado: x.quantidade, Produzido: x.produzido, Refugo: x.refugo, Saldo: x.saldo,
        })),
      }],
      `Lideres_${LABELS[proc] || proc}`
    );
  }

  return (
    <>
      <div className="pageTitle">
        <div>
          <span>OPERAÇÃO</span>
          <h1>Líderes</h1>
          <p>Quantidades reais por processo, da maior medida para a menor.</p>
        </div>
        <button className="secondary" onClick={exportar}><FileSpreadsheet />Exportar Excel</button>
      </div>

      <div className="processTabs">
        {procs.map((p) => (
          <button key={p} className={proc === p ? "active" : ""} onClick={() => setProc(p)}>{LABELS[p] || p}</button>
        ))}
      </div>

      <section className="leaderHero">
        <div><span>{LABELS[proc] || proc}</span><h2>Plano do dia</h2></div>
        <div><small>PLANEJADO</small><b>{fmt(planned)}</b></div>
        <div><small>PRODUZIDO</small><b>{fmt(produced)}</b></div>
        <div><small>SALDO</small><b>{fmt(Math.max(0, planned - produced))}</b></div>
        <div><small>ANDAMENTO</small><b>{fmtPct(pct(produced, planned))}</b></div>
      </section>

      <div className="switch">
        <button className={tab === "PLAN" ? "active" : ""} onClick={() => setTab("PLAN")}>
          PLANO DO DIA <b>{fmt(planned)} pçs</b>
        </button>
        <button className={tab === "NOW" ? "active" : ""} onClick={() => setTab("NOW")}>
          LIBERADO AGORA <b>{fmt(soma(now, "quantidade"))} pçs</b>
        </button>
      </div>

      <FamiliaTabs value={fam} onChange={setFam} familias={FAMILIAS} />

      <TableScroll className="leader">
        <table>
          <thead>
            <tr>
              <th>PEÇA</th><th>MATERIAL</th><th>MEDIDA</th><th>REBAIXO</th><th>ACABAMENTO</th><th>COR</th>
              <th className="num">PLANEJADO</th><th className="num">PRODUZIDO</th><th className="num">SALDO</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.key}>
                <td><b>{x.descricao}</b><em className="tag">{x.categoria}</em></td>
                <td>{x.material || "-"}</td>
                <td className="mono">{x.medida || "-"}</td>
                <td>{x.rebaixo || "-"}</td>
                <td>{x.acabamento || "-"}</td>
                <td>{x.cor || "-"}</td>
                <td className="num bigQty">{fmt(x.quantidade)}</td>
                <td className="num">{fmt(x.produzido)}</td>
                <td className="num"><b>{fmt(x.saldo)}</b></td>
              </tr>
            ))}
          </tbody>
          {!!rows.length && (
            <tfoot>
              <tr>
                <td colSpan={6}>TOTAL</td>
                <td className="num">{fmt(soma(rows, "quantidade"))}</td>
                <td className="num">{fmt(soma(rows, "produzido"))}</td>
                <td className="num">{fmt(soma(rows, "saldo"))}</td>
              </tr>
            </tfoot>
          )}
        </table>
        {!rows.length && <Empty title="Nenhuma quantidade neste processo." />}
      </TableScroll>
    </>
  );
}

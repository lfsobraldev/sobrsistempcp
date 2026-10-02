"use client";

import { FileSpreadsheet } from "lucide-react";
import { useMemo, useState } from "react";
import { useOps } from "@/components/operational-provider";
import { LABELS, leaderPlanRows, leaderReleasedRows } from "@/lib/metrics";
import { FAMILIAS, dims } from "@/lib/sort";
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
        linhas: rows.map((x) => {
          const [comprimento, largura, espessura] = dims(x.medida);
          return {
            Família: x.familia, Descrição: x.descricao, Tipo: x.material, Rebaixo: x.rebaixo, Acabamento: x.acabamento, Cor: x.cor,
            Comprimento: comprimento, Largura: largura, Espessura: espessura,
            "Qtd Programada": x.quantidade, "Qtd Produzida": x.produzido, Saldo: x.saldo, "% Concluído": pct(x.produzido, x.quantidade) / 100,
          };
        }),
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
              <th>FAMÍLIA</th><th>DESCRIÇÃO</th><th>TIPO / MATERIAL</th><th>REBAIXO</th><th>ACABAMENTO</th><th>COR</th>
              <th className="num">COMP.</th><th className="num">LARG.</th><th className="num">ESP.</th>
              <th className="num">QTD PROGRAMADA</th><th className="num">QTD PRODUZIDA</th><th className="num">SALDO</th><th className="num">% CONCLUÍDO</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => {
              const [comp, larg, esp] = dims(x.medida);
              return (
                <tr key={x.key}>
                  <td><em className="tag">{x.familia}</em></td>
                  <td className="descCell"><b>{x.descricao}</b></td>
                  <td>{x.material || "-"}</td><td>{x.rebaixo || "-"}</td><td>{x.acabamento || "-"}</td><td>{x.cor || "-"}</td>
                  <td className="num mono">{fmt(comp)}</td><td className="num mono">{fmt(larg)}</td><td className="num mono">{fmt(esp)}</td>
                  <td className="num bigQty">{fmt(x.quantidade)}</td><td className="num">{fmt(x.produzido)}</td><td className="num"><b>{fmt(x.saldo)}</b></td>
                  <td className="num">{fmtPct(pct(x.produzido, x.quantidade))}</td>
                </tr>
              );
            })}
          </tbody>
          {!!rows.length && (
            <tfoot>
              <tr>
                <td colSpan={9}>TOTAL</td>
                <td className="num">{fmt(soma(rows, "quantidade"))}</td>
                <td className="num">{fmt(soma(rows, "produzido"))}</td>
                <td className="num">{fmt(soma(rows, "saldo"))}</td>
                <td className="num">{fmtPct(pct(soma(rows, "produzido"), soma(rows, "quantidade")))}</td>
              </tr>
            </tfoot>
          )}
        </table>
        {!rows.length && <Empty title="Nenhuma quantidade neste processo." />}
      </TableScroll>
    </>
  );
}

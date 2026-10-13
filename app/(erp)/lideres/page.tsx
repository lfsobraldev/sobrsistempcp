"use client";

import { FileSpreadsheet, Filter, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useOps } from "@/components/operational-provider";
import { LABELS, leaderPlanRows, leaderReleasedRows } from "@/lib/metrics";
import { PROCESSOS } from "@/lib/processos";
import { fmt, fmtPct, pct } from "@/lib/format";
import { exportarSetor } from "@/lib/export";
import { Badge, Card, DataTable, Empty, Field, PageHeader, Segmented, StatCard } from "@/components/ui";
import { TableScroll } from "@/components/table-scroll";
import type { MontagemEngenharia, TipoPedido } from "@/types/pcp";

const MONTAGENS_ENGENHARIA: Array<{value:MontagemEngenharia;label:string}> = [
  { value: "MONTADO_HS", label: "Montado HS" },
  { value: "MONTADO_TIMADEL", label: "Montado Timadel" },
  { value: "MONTADO_ESTANCIA", label: "Montado Estância" },
];

export default function Lideres() {
  const { pg, me, refresh, toast } = useOps();
  const products = pg?.produtos || [];
  const procs = me?.processos?.length
    ? PROCESSOS.filter((x) => me.processos.includes(x))
    : [...PROCESSOS];
  const [proc, setProc] = useState(procs[0] || "RECOBRIDORA");
  const [busyPedido, setBusyPedido] = useState("");
  const [busca, setBusca] = useState("");
  const [peca, setPeca] = useState("TODAS");
  const [medida, setMedida] = useState("TODAS");

  useEffect(() => {
    if (!procs.length) return;
    if (!procs.includes(proc as (typeof PROCESSOS)[number])) setProc(procs[0]);
  }, [procs.join("|"), proc]);

  const [tab, setTab] = useState<"PLAN" | "NOW">("PLAN");

  const plan = useMemo(() => leaderPlanRows(products, proc), [products, proc]);
  const now = useMemo(() => leaderReleasedRows(products, proc), [products, proc]);
  const baseRows = tab === "PLAN" ? plan : now;

  const pecas = useMemo(
    () =>
      [...new Set(baseRows.map((x) => String(x.categoria || x.descricao || "").trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })),
    [baseRows]
  );

  const medidas = useMemo(
    () =>
      [...new Set(baseRows.map((x) => String(x.medida || "").trim()).filter(Boolean))]
        .sort((a, b) => {
          const na = a.split(/[x×]/i).map(Number);
          const nb = b.split(/[x×]/i).map(Number);
          return (nb[1] || 0) - (na[1] || 0) || (nb[0] || 0) - (na[0] || 0);
        }),
    [baseRows]
  );

  const rows = useMemo(() => {
    const q = busca.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

    return baseRows.filter((x) => {
      if (peca !== "TODAS" && String(x.categoria || x.descricao || "") !== peca) return false;
      if (medida !== "TODAS" && String(x.medida || "") !== medida) return false;
      if (!q) return true;

      const text = [
        x.descricao,
        x.categoria,
        x.material,
        x.medida,
        x.rebaixo,
        x.acabamento,
        x.cor,
        x.pedido,
        x.of,
      ]
        .filter(Boolean)
        .join(" ")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();

      return text.includes(q);
    });
  }, [baseRows, busca, peca, medida]);

  const filtrosAtivos = busca.trim() || peca !== "TODAS" || medida !== "TODAS";

  const pedidos = useMemo(() => {
    const map = new Map<string, { tipo: TipoPedido; montagem: MontagemEngenharia }>();

    for (const p of products) {
      const tipo = (p.tipoPedido || "NORMAL") as TipoPedido;
      const montagem = (p.montagemEngenharia || "MONTADO_HS") as MontagemEngenharia;
      const atual = map.get(p.pedido);

      if (!atual || atual.tipo === "NORMAL") {
        map.set(p.pedido, { tipo, montagem });
      }
    }

    return [...map.entries()]
      .map(([pedido, dados]) => ({ pedido, ...dados }))
      .sort((a, b) => a.pedido.localeCompare(b.pedido, "pt-BR", { numeric: true }));
  }, [products]);

  const soma = (l: typeof plan, k: "quantidade" | "produzido" | "saldo") =>
    l.reduce((s, x) => s + x[k], 0);

  const planned = soma(plan, "quantidade");
  const produced = soma(plan, "produzido");
  const embalagemSelecionada = proc.startsWith("EMBALAGEM");

  async function alterarPedido(
    pedido: string,
    tipo: TipoPedido,
    montagemEngenharia: MontagemEngenharia = "MONTADO_HS"
  ) {
    setBusyPedido(pedido);

    try {
      const r = await fetch("/api/pedidos/tipo", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pedido, tipo, montagemEngenharia }),
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao alterar pedido.");

      toast(
        "success",
        tipo === "ENGENHARIA"
          ? `Pedido ${pedido}: Engenharia • ${montagemEngenharia.replaceAll("_", " ")}.`
          : `Pedido ${pedido}: ${tipo}.`
      );

      await refresh();
    } catch (e: any) {
      toast("error", e?.message || "Falha ao alterar pedido.");
    } finally {
      setBusyPedido("");
    }
  }

  const exportar = () => exportarSetor(products, proc);

  return (
    <>
      <PageHeader
        eyebrow="Operação"
        title="Líderes"
        description="Quantidades reais por processo, da maior medida para a menor."
        actions={<button onClick={exportar}><FileSpreadsheet /> Exportar Excel</button>}
      />

      <div className="leader-process-tabs">
        <Segmented value={proc} onChange={setProc} options={procs.map((p) => ({ value: p, label: LABELS[p] || p }))} />
      </div>

      {embalagemSelecionada && (
        <Card
          subtitle="Embalagem"
          title="Pedidos especiais"
          className="mb"
          actions={<small>Revenda usa a regra Revenda; Engenharia deve ser HS, Timadel ou Estância.</small>}
        >
          <DataTable head={["Pedido", "Tipo", "Montagem engenharia", "Destino na embalagem"]}>
            {pedidos.map((p) => (
              <tr key={p.pedido}>
                <td><b>{p.pedido}</b></td>
                <td style={{ width: 180 }}>
                  <select value={p.tipo} disabled={busyPedido === p.pedido} onChange={(e) => alterarPedido(p.pedido, e.target.value as TipoPedido, p.montagem)}>
                    <option value="NORMAL">Normal</option>
                    <option value="REVENDA">Revenda</option>
                    <option value="ENGENHARIA">Engenharia</option>
                  </select>
                </td>
                <td style={{ width: 220 }}>
                  {p.tipo === "ENGENHARIA" ? (
                    <select value={p.montagem} disabled={busyPedido === p.pedido} onChange={(e) => alterarPedido(p.pedido, "ENGENHARIA", e.target.value as MontagemEngenharia)}>
                      {MONTAGENS_ENGENHARIA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  ) : <span className="muted">-</span>}
                </td>
                <td>
                  {p.tipo === "REVENDA" ? <Badge tone="info">Embalagem · Revenda</Badge>
                    : p.tipo === "ENGENHARIA" ? <Badge tone="info">Embalagem · Engenharia · {MONTAGENS_ENGENHARIA.find((m) => m.value === p.montagem)?.label || p.montagem}</Badge>
                    : <span className="muted">Regra normal por componente</span>}
                </td>
              </tr>
            ))}
          </DataTable>
        </Card>
      )}

      <div className="stats">
        <StatCard label={`${LABELS[proc] || proc} · plano do dia`} value={fmt(planned)} hint="peças planejadas" />
        <StatCard label="Produzido" value={fmt(produced)} tone={produced ? "success" : "neutral"} />
        <StatCard label="Saldo" value={fmt(Math.max(0, planned - produced))} />
        <StatCard label="Andamento" value={fmtPct(pct(produced, planned))} />
      </div>

      <div style={{ marginBottom: "var(--sp-4)" }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "PLAN", label: <>Plano do dia · <b>{fmt(planned)} pçs</b></> },
            { value: "NOW", label: <>Liberado agora · <b>{fmt(soma(now, "quantidade"))} pçs</b></> },
          ]}
        />
      </div>

      <section className="card mb leader-filter-card">
        <div className="card-head">
          <div className="row">
            <span className="stat-icon"><Filter /></span>
            <div><h2>Filtrar produção</h2><small>Encontre rapidamente peça, medida, material ou OF.</small></div>
          </div>
          {filtrosAtivos && (
            <button type="button" onClick={() => { setBusca(""); setPeca("TODAS"); setMedida("TODAS"); }}><X /> Limpar</button>
          )}
        </div>
        <div className="card-body form-grid">
          <Field label="Busca">
            <div className="search" style={{ maxWidth: "none" }}>
              <Search />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Peça, material, OF, acabamento..." />
            </div>
          </Field>
          <Field label="Peça">
            <select value={peca} onChange={(e) => setPeca(e.target.value)}>
              <option value="TODAS">Todas as peças</option>
              {pecas.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Medida / metragem">
            <select value={medida} onChange={(e) => setMedida(e.target.value)}>
              <option value="TODAS">Todas as medidas</option>
              {medidas.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <div className="result-box"><small>Resultado</small><b>{rows.length}</b><small>{rows.length === 1 ? "linha encontrada" : "linhas encontradas"}</small></div>
        </div>
      </section>

      <TableScroll className="leader">
        <table>
          <thead>
            <tr>
              <th>Peça</th><th>Material</th><th>Medida</th><th>Rebaixo</th><th>Acabamento</th><th>Cor</th>
              <th className="num">Planejado</th><th className="num">Produzido</th><th className="num">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.key}>
                <td><b>{x.descricao}</b> <Badge>{x.categoria}</Badge></td>
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
                <td colSpan={6}>Total</td>
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

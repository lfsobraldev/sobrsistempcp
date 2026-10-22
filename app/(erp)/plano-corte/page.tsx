"use client";

import { useMemo, useState } from "react";
import { Badge, DataTable, Kpi, PageHeader, Panel } from "@/components/ui";
import { planoDeCorte, type Peca } from "@/lib/plano-corte";

export default function PlanoCortePage() {
  const [chapa, setChapa] = useState({ largura: 2750, altura: 1850, kerf: 4 });
  const [pecas, setPecas] = useState<Peca[]>([{ id: "Lateral", largura: 800, altura: 600, qtd: 4 }, { id: "Prateleira", largura: 700, altura: 300, qtd: 6 }]);
  const [material, setMaterial] = useState("MDF");
  const [msg, setMsg] = useState("");
  const r = useMemo(() => planoDeCorte(pecas, chapa), [pecas, chapa]);
  const set = (i: number, k: keyof Peca, v: string) => setPecas((a) => a.map((p, j) => (j === i ? { ...p, [k]: k === "id" ? v : Number(v) || 0 } : p)));
  const num = (k: "largura" | "altura" | "kerf") => <input inputMode="numeric" value={chapa[k]} onChange={(e) => setChapa({ ...chapa, [k]: Number(e.target.value) || 0 })} style={{ width: 90 }} />;
  const esc = 0.12;

  async function guardar(c: (typeof r.chapas)[number]) {
    if (!c.retalho) return;
    const res = await fetch("/api/wms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "SOBRA_CRIAR", descricao: `Retalho de chapa ${material}`, medida: `${Math.round(c.retalho.w)}x${Math.round(c.retalho.h)}`, material, quantidade: 1, origem: "PLANO_CORTE" }) });
    const j = await res.json().catch(() => ({}));
    setMsg(res.ok ? "Retalho registrado como sobra reaproveitável." : j.error || "Falha ao registrar.");
  }

  return (
    <>
      <PageHeader eyebrow="Produção" title="Plano de corte" description="Otimização de chapa por faixas com kerf, rotação e aproveitamento. Retalhos úteis podem virar sobra no estoque." />
      {msg && <div className="alert success">{msg}</div>}
      <Panel title="Chapa e peças">
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <label>Material <input value={material} onChange={(e) => setMaterial(e.target.value)} style={{ width: 120 }} /></label>
          <label>Largura {num("largura")}</label><label>Altura {num("altura")}</label><label>Serra (kerf) {num("kerf")}</label>
        </div>
        <DataTable head={["Peça", "Largura", "Altura", "Qtd", ""]}>
          {pecas.map((p, i) => <tr key={i}><td><input value={p.id} onChange={(e) => set(i, "id", e.target.value)} /></td>
            <td><input inputMode="numeric" value={p.largura} onChange={(e) => set(i, "largura", e.target.value)} style={{ width: 90 }} /></td>
            <td><input inputMode="numeric" value={p.altura} onChange={(e) => set(i, "altura", e.target.value)} style={{ width: 90 }} /></td>
            <td><input inputMode="numeric" value={p.qtd} onChange={(e) => set(i, "qtd", e.target.value)} style={{ width: 70 }} /></td>
            <td><button onClick={() => setPecas((a) => a.filter((_, j) => j !== i))}>Remover</button></td></tr>)}
        </DataTable>
        <button onClick={() => setPecas((a) => [...a, { id: `Peça ${a.length + 1}`, largura: 500, altura: 500, qtd: 1 }])}>Adicionar peça</button>
      </Panel>
      <div className="kpis"><Kpi label="Chapas" value={r.chapas.length} /><Kpi label="Aproveitamento" value={`${r.aproveitamento}%`} /><Kpi label="Peças" value={r.totalPecas} />{r.naoCabem.length > 0 && <Kpi label="Não cabem" value={r.naoCabem.join(", ")} tone="warn" />}</div>
      {r.chapas.map((c) => (
        <Panel key={c.numero} title={`Chapa ${c.numero} · ${c.aproveitamento}%`} actions={c.retalho ? <button onClick={() => guardar(c)}>Guardar retalho {Math.round(c.retalho.w)}x{Math.round(c.retalho.h)}</button> : <Badge tone="neutral">Sem retalho útil</Badge>}>
          <svg viewBox={`0 0 ${chapa.largura} ${chapa.altura}`} style={{ width: "100%", maxHeight: 360, background: "var(--surface-2, #f4f4f4)", border: "1px solid var(--border, #ccc)" }} role="img" aria-label={`Chapa ${c.numero}`}>
            {c.posicoes.map((p, i) => <g key={i}><rect x={p.x} y={p.y} width={p.w} height={p.h} fill="#7fb5ff" stroke="#145" strokeWidth={4} /><text x={p.x + 12} y={p.y + p.h / 2} fontSize={Math.max(24, chapa.altura * esc * 0.3)} fill="#012">{p.id}{p.girada ? " ↻" : ""}</text></g>)}
            {c.retalho && <rect x={c.retalho.x} y={c.retalho.y} width={c.retalho.w} height={c.retalho.h} fill="none" stroke="#c60" strokeDasharray="30 20" strokeWidth={5} />}
          </svg>
        </Panel>
      ))}
    </>
  );
}

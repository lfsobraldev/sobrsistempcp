"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, TimerReset } from "lucide-react";
import { Card, Field, Modal, PageHeader, Progress, StatCard } from "@/components/ui";
import { pareto } from "@/lib/domain/industrial";
import { useOpsVisao as useOps } from "@/components/operational-provider";

const MOTIVOS = ["Falta material", "Setup", "Manutenção", "Aguardando OF", "Qualidade", "Falta operador", "Máquina parada", "Retrabalho", "Falta de ferramenta", "Outro"];

export default function Perdas() {
  const { pg, toast,recorteQuery } = useOps();
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ processo: "", maquina: "", turno: pg?.turno || "A", pedido: "", of: "", motivo: MOTIVOS[0], inicio: new Date().toISOString().slice(0, 16), fim: "", quantidadePerdida: "", responsavel: "", observacao: "" });

  async function load() {
    const r = await fetch("/api/perdas?recorte=1&"+recorteQuery, { cache: "no-store" });
    const j = await r.json();
    if (r.ok) setRows(j.itens || []);
  }
  useEffect(() => { load(); }, [recorteQuery]);

  const p = useMemo(() => pareto(rows.map((x) => ({ motivo: x.motivo, minutos: Number(x.minutos || 0) }))), [rows]);
  const total = rows.reduce((s, x) => s + Number(x.minutos || 0), 0);

  async function save() {
    const r = await fetch("/api/perdas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
    const j = await r.json();
    if (!r.ok) return toast("error", j.error || "Falha ao registrar perda.");
    toast("success", "Perda registrada.");
    setOpen(false);
    await load();
  }
  const set = (k: string, v: string) => setF({ ...f, [k]: v });

  return (
    <>
      <PageHeader eyebrow="Eficiência" title="Perdas de Produção" description="Tempo perdido por motivo, máquina, setor e turno." actions={<button className="primary" onClick={() => setOpen(true)}><Plus /> Registrar perda</button>} />
      <div className="stats">
        <StatCard label="Tempo perdido · 7 dias" value={`${(total / 60).toFixed(1)} h`} tone={total ? "warning" : "neutral"} />
        <StatCard label="Registros" value={rows.length} />
        <StatCard label="Principal causa" value={p[0]?.motivo || "Sem dados"} />
      </div>

      <div className="grid-half">
        <Card subtitle="Ordenado por minutos perdidos" title="Pareto de perdas">
          <div className="bars">
            {p.map((x, i) => (
              <div className="bar-row" key={x.motivo}>
                <div><b>{i + 1}. {x.motivo}</b></div>
                <Progress value={p[0] ? (x.minutos / p[0].minutos) * 100 : 0} tone="warning" label="" />
                <strong>{(x.minutos / 60).toFixed(1)} h</strong>
              </div>
            ))}
            {!p.length && <span className="muted">Sem perdas registradas.</span>}
          </div>
        </Card>
        <Card subtitle="Registros operacionais" title="Últimas perdas">
          {rows.slice(0, 15).map((x) => (
            <div className="list-item" key={x.id}>
              <span className="tileIcon"><TimerReset /></span>
              <div>
                <b>{x.motivo}</b>
                <span>{x.processo || "-"} · {x.maquina || "sem máquina"} · {Number(x.minutos || 0).toFixed(0)} min</span>
                <small>{x.pedido ? `Pedido ${x.pedido}` : ""} {x.of ? `· OF ${x.of}` : ""}</small>
              </div>
            </div>
          ))}
          {!rows.length && <span className="muted">Nada registrado.</span>}
        </Card>
      </div>

      <Modal open={open} title="Registrar perda de produção" onClose={() => setOpen(false)} footer={<><button onClick={() => setOpen(false)}>Cancelar</button><button className="primary" onClick={save}>Salvar perda</button></>}>
        <div className="form-grid">
          {([["Processo", "processo"], ["Máquina", "maquina"], ["Turno", "turno"], ["Pedido", "pedido"], ["OF", "of"], ["Responsável", "responsavel"]] as const).map(([l, k]) => (
            <Field key={k} label={l}><input value={(f as any)[k]} onChange={(e) => set(k, e.target.value)} /></Field>
          ))}
          <Field label="Motivo"><select value={f.motivo} onChange={(e) => set("motivo", e.target.value)}>{MOTIVOS.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Início"><input type="datetime-local" value={f.inicio} onChange={(e) => set("inicio", e.target.value)} /></Field>
          <Field label="Fim"><input type="datetime-local" value={f.fim} onChange={(e) => set("fim", e.target.value)} /></Field>
          <Field label="Qtd. estimada perdida"><input type="number" value={f.quantidadePerdida} onChange={(e) => set("quantidadePerdida", e.target.value)} /></Field>
          <Field label="Observação" className="span-all"><textarea rows={4} value={f.observacao} onChange={(e) => set("observacao", e.target.value)} /></Field>
        </div>
      </Modal>
    </>
  );
}

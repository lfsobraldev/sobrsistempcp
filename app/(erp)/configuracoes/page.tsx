"use client";

import { useEffect, useState } from "react";
import { Card, Field, PageHeader } from "@/components/ui";
import { useOps } from "@/components/operational-provider";
import { LABELS } from "@/lib/metrics";
import { PROCESSOS } from "@/lib/processos";

export default function Config() {
  const { pg, toast } = useOps();
  const procs = [...PROCESSOS];

  const [rows, setRows] = useState<any[]>([]);
  const [f, setF] = useState({
    processo: procs[0] || "RECOBRIDORA",
    maquina: "PADRAO",
    turno: pg?.turno || "A",
    pecasHora: "",
    minutosDisponiveis: "480",
    eficiencia: "100",
    setupMedio: "",
    meta: "",
  });

  async function load() {
    const r = await fetch("/api/capacidades", { cache: "no-store" });
    const j = await r.json();
    if (r.ok) setRows(j.capacidades || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(tipo: string) {
    const r = await fetch("/api/capacidades", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...f, tipo }),
    });

    const j = await r.json();

    if (!r.ok) {
      return toast("error", j.error || "Falha ao salvar.");
    }

    toast(
      "success",
      tipo === "META" ? "Meta salva." : "Capacidade salva."
    );

    await load();
  }

  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  return (
    <>
      <PageHeader eyebrow="Parâmetros industriais" title="Configurações" description="Capacidade, meta e parâmetros usados nos cálculos da Central." />
      <div className="grid-half">
        <Card subtitle="Nenhuma capacidade é inventada pelo sistema" title="Capacidade por máquina">
          <div className="form-grid">
            <Field label="Processo">
              <select value={f.processo} onChange={(e) => set("processo", e.target.value)}>
                {procs.map((x) => <option key={x} value={x}>{LABELS[x] || x}</option>)}
              </select>
            </Field>
            <Field label="Máquina"><input value={f.maquina} onChange={(e) => set("maquina", e.target.value)} /></Field>
            <Field label="Turno"><input value={f.turno} onChange={(e) => set("turno", e.target.value)} /></Field>
            <Field label="Peças / hora"><input type="number" value={f.pecasHora} onChange={(e) => set("pecasHora", e.target.value)} /></Field>
            <Field label="Minutos disponíveis"><input type="number" value={f.minutosDisponiveis} onChange={(e) => set("minutosDisponiveis", e.target.value)} /></Field>
            <Field label="Eficiência esperada %"><input type="number" value={f.eficiencia} onChange={(e) => set("eficiencia", e.target.value)} /></Field>
            <Field label="Setup médio (min)"><input type="number" value={f.setupMedio} onChange={(e) => set("setupMedio", e.target.value)} /></Field>
          </div>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: "var(--sp-4)" }}>
            <button className="primary" onClick={() => save("CAPACIDADE")}>Salvar capacidade</button>
          </div>
        </Card>

        <Card subtitle="Meta operacional por processo/máquina/turno" title="Meta do dia">
          <div className="row" style={{ alignItems: "flex-end" }}>
            <Field label="Meta" className="grow"><input type="number" value={f.meta} onChange={(e) => set("meta", e.target.value)} /></Field>
            <button className="primary" onClick={() => save("META")}>Salvar meta</button>
          </div>
          <h3 className="sectionTitle">Capacidades cadastradas</h3>
          {rows.length ? rows.map((x) => (
            <div className="list-item row between" key={x.id}>
              <div><b>{LABELS[x.processo] || x.processo}</b><span className="muted">{x.maquina} · Turno {x.turno}</span></div>
              <strong className="mono-num">{x.pecas_hora ?? "—"} pç/h</strong>
            </div>
          )) : <span className="muted">Nenhuma capacidade cadastrada.</span>}
        </Card>
      </div>
    </>
  );
}

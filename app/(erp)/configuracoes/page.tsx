"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/ui";
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

  return (
    <>
      <div className="pageTitle">
        <div>
          <span>PARÂMETROS INDUSTRIAIS</span>
          <h1>Configurações</h1>
          <p>Capacidade, meta e parâmetros usados nos cálculos da Central.</p>
        </div>
      </div>

      <div className="settingsGrid">
        <Panel
          title="Capacidade por máquina"
          subtitle="Nenhuma capacidade é inventada pelo sistema"
        >
          <div className="configForm">
            <label>
              Processo
              <select
                value={f.processo}
                onChange={(e) => setF({ ...f, processo: e.target.value })}
              >
                {procs.map((x) => (
                  <option key={x} value={x}>
                    {LABELS[x] || x}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Máquina
              <input
                value={f.maquina}
                onChange={(e) => setF({ ...f, maquina: e.target.value })}
              />
            </label>

            <label>
              Turno
              <input
                value={f.turno}
                onChange={(e) => setF({ ...f, turno: e.target.value })}
              />
            </label>

            <label>
              Peças / hora
              <input
                type="number"
                value={f.pecasHora}
                onChange={(e) => setF({ ...f, pecasHora: e.target.value })}
              />
            </label>

            <label>
              Minutos disponíveis
              <input
                type="number"
                value={f.minutosDisponiveis}
                onChange={(e) =>
                  setF({ ...f, minutosDisponiveis: e.target.value })
                }
              />
            </label>

            <label>
              Eficiência esperada %
              <input
                type="number"
                value={f.eficiencia}
                onChange={(e) => setF({ ...f, eficiencia: e.target.value })}
              />
            </label>

            <label>
              Setup médio (min)
              <input
                type="number"
                value={f.setupMedio}
                onChange={(e) => setF({ ...f, setupMedio: e.target.value })}
              />
            </label>

            <button className="primary" onClick={() => save("CAPACIDADE")}>
              SALVAR CAPACIDADE
            </button>
          </div>
        </Panel>

        <Panel
          title="Meta do dia"
          subtitle="Meta operacional por processo/máquina/turno"
        >
          <div className="configForm">
            <label>
              Meta
              <input
                type="number"
                value={f.meta}
                onChange={(e) => setF({ ...f, meta: e.target.value })}
              />
            </label>

            <button className="primary" onClick={() => save("META")}>
              SALVAR META
            </button>
          </div>

          <div className="capacityList">
            {rows.map((x) => (
              <div key={x.id}>
                <b>{LABELS[x.processo] || x.processo}</b>
                <span>
                  {x.maquina} • Turno {x.turno}
                </span>
                <strong>{x.pecas_hora ?? "—"} pç/h</strong>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

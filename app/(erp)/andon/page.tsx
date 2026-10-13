"use client";

import { AlertTriangle, CheckCircle2, Hand, PlayCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useOps } from "@/components/operational-provider";
import { LABELS } from "@/lib/metrics";
import { Badge, Empty, Field, Modal, PageHeader, type Tone } from "@/components/ui";

function elapsed(from: string, now: number) {
  const sec = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  return `${h}:${m}`;
}
const prioTone = (p?: string): Tone => (/ALTA|URGENTE|CRIT/i.test(p || "") ? "danger" : /BAIXA/i.test(p || "") ? "neutral" : "warning");

export default function Andon() {
  const { andon, me, refresh, toast } = useOps();
  const [now, setNow] = useState(Date.now());
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [final, setFinal] = useState("");

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function patch(id: string, action: string, observacaoFinal = "") {
    const r = await fetch("/api/andon", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action, observacaoFinal }) });
    const j = await r.json();
    if (!r.ok) return toast("error", j.error || "Falha.");
    toast("success", "Andon atualizado.");
    setResolveId(null);
    setFinal("");
    await refresh();
  }

  const canAct = ["PCP", "ENCARREGADO", "LIDER"].includes(String(me?.perfil));

  return (
    <>
      <PageHeader eyebrow="Resposta rápida" title="Central Andon" description="Problema aberto precisa de responsável, tratamento e encerramento." />
      <div className="andon-grid">
        {andon.map((a) => (
          <article key={a.id} className="card andon-card">
            <header className="row between">
              <Badge tone={prioTone(a.prioridade)}><AlertTriangle size={12} /> {a.prioridade || "MÉDIA"}</Badge>
              <b>{LABELS[a.processo] || a.processo}</b>
              <span className="mono-num muted">{elapsed(a.criado_em, now)}</span>
            </header>
            <h3>{a.motivo}</h3>
            <p className="muted">{a.observacao || "Sem descrição adicional."}</p>
            <dl className="kv">
              <div><dt>Pedido</dt><dd>{a.pedido || "-"}</dd></div>
              <div><dt>OF</dt><dd>{a.of || "-"}</dd></div>
              <div><dt>Status</dt><dd>{String(a.status).replaceAll("_", " ")}</dd></div>
              <div><dt>Responsável</dt><dd>{a.responsavel || a.assumido_por || "Não assumido"}</dd></div>
            </dl>
            {canAct && (
              <footer className="row" style={{ flexWrap: "wrap" }}>
                {a.status === "ABERTO" && <button onClick={() => patch(a.id, "ASSUMIR")}><Hand /> Assumir</button>}
                {["ABERTO", "ASSUMIDO"].includes(a.status) && <button onClick={() => patch(a.id, "TRATAR")}><PlayCircle /> Em tratamento</button>}
                <button className="success" onClick={() => setResolveId(a.id)}><CheckCircle2 /> Resolver</button>
              </footer>
            )}
          </article>
        ))}
        {!andon.length && <Empty title="Nenhum Andon aberto." sub="Sem ocorrências exigindo ação agora." />}
      </div>

      <Modal
        open={!!resolveId}
        title="Resolver Andon"
        onClose={() => setResolveId(null)}
        footer={<><button onClick={() => setResolveId(null)}>Cancelar</button><button className="primary" onClick={() => resolveId && patch(resolveId, "RESOLVER", final)}>Confirmar resolução</button></>}
      >
        <Field label="Observação final"><textarea value={final} onChange={(e) => setFinal(e.target.value)} rows={5} placeholder="O que foi feito para resolver?" /></Field>
      </Modal>
    </>
  );
}

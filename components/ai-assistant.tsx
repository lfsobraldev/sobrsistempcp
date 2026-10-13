"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, FileSpreadsheet, MessageSquare, Send, Sparkles, X, ArrowRight } from "lucide-react";
import { useOps } from "@/components/operational-provider";
import { abrirRomaneioIA } from "@/components/romaneio-ai";
import { baixarPlanilhaProducao } from "@/lib/planilha";

type Anexo =
  | { type: "navigate"; path: string; label: string }
  | { type: "confirm"; label: string; token: string }
  | { type: "romaneio"; data: any; alertas: any[]; resumo: any }
  | { type: "planilha_usinagem"; setores: string[]; arquivo: string; label: string; pedido?: string };
type Msg = { role: "user" | "assistant"; content: string; anexos?: Anexo[] };

const SUGESTOES = [
  "Resumo da produção de hoje",
  "Quais pedidos estão em risco de atraso?",
  "Faça a programação sugerida da fábrica",
  "Onde estão os gargalos de capacidade?",
  "Gerar planilha de usinagem",
  "Quais Andons estão abertos?",
];
const KEY = "sobral-ia-chat";

export default function AiAssistant() {
  const router = useRouter();
  const path = usePathname();
  const { toast, refresh, pg } = useOps();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { try { const s = sessionStorage.getItem(KEY); if (s) setMsgs(JSON.parse(s)); } catch {} }, []);
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-30))); } catch {} end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, open]);

  async function enviar(texto: string) {
    const t = texto.trim();
    if (!t || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: t }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const r = await fetch("/api/ia/chat", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ path, messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha na IA.");
      setMsgs([...next, { role: "assistant", content: j.reply, anexos: j.attachments }]);
    } catch (e: any) {
      setMsgs([...next, { role: "assistant", content: `⚠ ${e.message}` }]);
    } finally { setBusy(false); }
  }

  async function confirmar(token: string) {
    try {
      const r = await fetch("/api/ia/acao", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setDone((d) => ({ ...d, [token]: true }));
      toast("success", j.mensagem || "Ação executada.");
      void refresh();
    } catch (e: any) { toast("error", e.message || "Falha ao executar."); }
  }

  if (!open) return <button className="ai-fab" onClick={() => setOpen(true)} aria-label="Abrir assistente IA"><Sparkles /> Assistente IA</button>;

  return (
    <section className="ai-panel" aria-label="Assistente IA">
      <header>
        <Sparkles size={18} />
        <h3>Assistente Sobral</h3>
        <button className="ghost iconBtn" onClick={() => { setMsgs([]); }} title="Limpar conversa"><MessageSquare /></button>
        <button className="ghost iconBtn" onClick={() => setOpen(false)} aria-label="Fechar"><X /></button>
      </header>
      <div className="ai-msgs">
        {!msgs.length && <div className="empty"><b>Como posso ajudar?</b><span>Consulto a produção, gero romaneios, ajusto prioridades e abro telas.</span></div>}
        {msgs.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role}`}>
            {m.content}
            {m.anexos?.map((a, k) => (
              <div className="ai-actions" key={k}>
                {a.type === "navigate" && <button onClick={() => { router.push(a.path); setOpen(false); }}><ArrowRight /> Abrir {a.path}</button>}
                {a.type === "confirm" && (done[a.token]
                  ? <span className="status s-concluida"><Check size={12} /> Executado</span>
                  : <button className="primary" onClick={() => confirmar(a.token)}><Check /> Confirmar: {a.label}</button>)}
                {a.type === "romaneio" && (
                  <>
                    <span className="tag">{a.data.itens.length} itens</span>
                    {a.alertas.length > 0 && <span className="status s-atencao">{a.alertas.length} alerta(s)</span>}
                    <button className="primary" onClick={() => { abrirRomaneioIA({ romaneio: a.data }); }}><FileSpreadsheet /> Revisar e exportar</button>
                  </>
                )}
                {a.type === "planilha_usinagem" && (
                  <button
                    className="primary"
                    onClick={async () => {
                      if (!pg?.produtos?.length) {
                        toast("error", "Nenhuma programação ativa disponível.");
                        return;
                      }
                      try {
                        const produtos = a.pedido
                          ? pg.produtos.filter((p) => String(p.pedido) === String(a.pedido))
                          : pg.produtos;
                        await baixarPlanilhaProducao(produtos, {
                          setores: a.setores,
                          arquivo: a.arquivo || "Planilha_Usinagem",
                        });
                        toast("success", "Planilha de usinagem gerada.");
                      } catch (e: any) {
                        toast("error", e?.message || "Falha ao gerar planilha.");
                      }
                    }}
                  >
                    <FileSpreadsheet /> {a.label || "Gerar planilha de usinagem"}
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
        {busy && <div className="ai-msg assistant na">Pensando…</div>}
        <div ref={end} />
      </div>
      {!msgs.length && <div className="ai-suggest">{SUGESTOES.map((s) => <button key={s} onClick={() => enviar(s)}>{s}</button>)}</div>}
      <form className="ai-input" onSubmit={(e) => { e.preventDefault(); void enviar(input); }}>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Pergunte ou peça algo…" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(input); } }} />
        <button className="primary" disabled={busy || !input.trim()} aria-label="Enviar"><Send /></button>
      </form>
    </section>
  );
}

"use client";
import { InstrucaoOperacao } from "@/components/instrucao-operacao";
import OFCiclo from "@/components/of-ciclo";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { History, RefreshCw, X } from "lucide-react";
import PCPFilterBar,{type OpcoesPCP} from "@/components/pcp-filter-bar";
import {usePCPFilters} from "@/hooks/use-pcp-filters";
import { useOps } from "@/components/operational-provider";
import { PROCESSOS } from "@/lib/processos";

type Op = {
  clienteNome:string;clienteCodigo:string;representanteNome:string;representanteCodigo:string;id: string; pedido: string; of: string; produto: string; descricao: string; cor: string; processo: string; sequencia: number; status: string;
  planejada: number; produzida: number; refugo: number; percentual: number; anterior_processo: string | null; anterior_status: string | null; atualizado_em: string;
};
type Hist = { lancamentos: { tipo: string; quantidade: number; usuario: string; data_producao: string; criado_em: string }[]; eventos: { tipo: string; descricao: string; usuario: string; criado_em: string }[] };
type ProgLista = { id: string; filtro: string; data: string; turno: string; status: string };
const STATUS: [string, string][] = [["EM_ANDAMENTO", "Em andamento"], ["LIBERADA", "Liberada"], ["PENDENTE", "Pendente"], ["DIVERGENCIA", "Divergência"], ["BLOQUEADA", "Bloqueada"], ["CONCLUIDA", "Concluída"]];
const rot = (s: string) => STATUS.find(([k]) => k === s)?.[1] || s;
const f = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const TIPO_LANC: Record<string, string> = { PRODUCAO: "Produção", CORRECAO: "Correção", FINALIZACAO: "Conclusão da operação", REFUGO: "Refugo" };

export default function ApontamentoOperacoes() {
  const { me,selectedProgramacaoId } = useOps();
  const {filtros,setFiltros,query,limpar}=usePCPFilters(selectedProgramacaoId);
  const [opcoes,setOpcoes]=useState<OpcoesPCP>({filtros:[],meses:[],pedidos:[]});
  const [page,setPage]=useState(1);
  const [filtro, setFiltro] = useState("");
  const [ops, setOps] = useState<Op[]>([]);
  const [truncado, setTruncado] = useState(false);
  const [restrito, setRestrito] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [q, setQ] = useState("");
  const [processo, setProcesso] = useState("");
  const [status, setStatus] = useState("");
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [confirma, setConfirma] = useState<{ op: Op; tipo: "FINALIZAR" | "DIVERGENCIA"; obs: string } | null>(null);
  const [hist, setHist] = useState<{ op: Op; dados: Hist | null; erro: string } | null>(null);
  const [instr, setInstr] = useState<Op | null>(null);
  const tentativas = useRef<Record<string, string>>({}); // requestId por operação+ação até o servidor confirmar (retry idempotente)
  const pode = ["PCP", "ENCARREGADO", "LIDER", "APONTADOR"].includes(me?.perfil || "");
  const meusSetores = me?.processos?.length && ["LIDER", "APONTADOR"].includes(me?.perfil || "") ? PROCESSOS.filter((x) => me.processos.includes(x)) : PROCESSOS;

  const carregar = useCallback(async (signal?:AbortSignal) => {
    setLoading(true); setErro("");
    try {
      const p = new URLSearchParams(query);p.set("page",String(page)); if (processo) p.set("processo", processo); if (status) p.set("status", status); if (q.trim()) p.set("q", q.trim());
      const r = await fetch("/api/pcp/operacoes?" + p, { cache: "no-store",signal }); const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao carregar operações.");
      if(signal?.aborted)return;setOpcoes(j.opcoes||{filtros:[],meses:[],pedidos:[]});setOps(j.operacoes || []); setFiltro(j.filtro || ""); setTruncado(!!j.truncado); setRestrito(!!j.restritoAosSeusSetores);
    } catch (e) { if(!signal?.aborted)setErro(e instanceof Error ? e.message : "Falha ao carregar."); } finally { if(!signal?.aborted)setLoading(false); }
  }, [query, page, processo, status, q]);
  useEffect(() => {const c=new AbortController(); const t = setTimeout(() => void carregar(c.signal), 250); return () => {clearTimeout(t);c.abort();}; }, [carregar]);
  useEffect(()=>setPage(1),[query,processo,status,q]);

  async function enviar(op: Op, action: string, extra: Record<string, unknown> = {}) {
    const chave = op.id + "|" + action + "|" + JSON.stringify(extra);
    const requestId = tentativas.current[chave] || (tentativas.current[chave] = uuid());
    setBusy(op.id); setErro(""); setOk("");
    try {
      const r = await fetch("/api/operacoes/" + op.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, requestId, ...extra }) });
      const j = await r.json();
      if (!r.ok) { if (r.status === 409 || r.status === 400 || r.status === 403) delete tentativas.current[chave]; throw new Error(j.error || "Não foi possível registrar."); }
      delete tentativas.current[chave];
      setOk(j.duplicado ? "Lançamento já registrado (duplicidade ignorada)." : "Registrado com sucesso.");
      setQtd((x) => ({ ...x, [op.id]: "" })); await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao registrar."); } finally { setBusy(""); }
  }
  const lancar = (op: Op) => {
    const n = Number((qtd[op.id] || "").replace(",", "."));
    if (!Number.isFinite(n) || n === 0) { setErro("Informe uma quantidade diferente de zero (use valor negativo para corrigir)."); return; }
    void enviar(op, "SOMAR", { value: n });
  };
  async function abrirHist(op: Op) {
    setHist({ op, dados: null, erro: "" });
    try { const r = await fetch("/api/pcp/operacoes?historico=" + op.id, { cache: "no-store" }); const j = await r.json(); if (!r.ok) throw new Error(j.error || "Falha."); setHist({ op, dados: j, erro: "" }); }
    catch (e) { setHist({ op, dados: null, erro: e instanceof Error ? e.message : "Falha ao carregar o histórico." }); }
  }

  const resumo = useMemo(() => ({
    abertas: ops.filter((o) => ["LIBERADA", "EM_ANDAMENTO"].includes(o.status)).length,
    plan: ops.reduce((s, o) => s + o.planejada, 0), prod: ops.reduce((s, o) => s + Math.min(o.produzida, o.planejada), 0),
  }), [ops]);

  return <div className="cart-page"><OFCiclo chao/>
    <header className="cart-hero"><span>PCP · PRODUÇÃO</span><h1>Apontamento de Quantidades</h1>
      <p>Lançamento de peças produzidas por operação, com responsável, data e histórico. Programação <b>{filtro || "—"}</b>.{restrito ? " Você vê apenas os setores liberados para o seu usuário." : ""}</p></header>
    {erro && <p role="alert" className="cart-msg err">{erro}</p>}
    {ok && <p role="status" className="cart-msg info">{ok}</p>}
    <section className="cart-panel">
      <div className="cart-filters">

        <label>Setor<select value={processo} onChange={(e) => setProcesso(e.target.value)}><option value="">Todos</option>{meusSetores.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
        <label>Situação<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todas</option>{STATUS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
        <label>Pesquisar<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pedido, OF ou produto" /></label>
      </div>
      <div className="cart-actions" style={{ marginBottom: 12 }}>
        <button className="cart-btn" onClick={() => void carregar()} disabled={loading}><RefreshCw size={16} /> {loading ? "Atualizando…" : "Atualizar"}</button>
        <span style={{ alignSelf: "center", fontSize: 13, color: "var(--text-2)" }}>{ops.length} operação(ões) · {resumo.abertas} liberada(s)/em andamento · {f(resumo.prod)} de {f(resumo.plan)} peça(s) apontadas</span>
      </div>
      {truncado && <p className="cart-note">Há mais operações nas próximas páginas. Os totais desta lista correspondem à página atual.</p>}
      <div><button className="cart-btn" disabled={loading||page===1} onClick={()=>setPage(p=>p-1)}>Anterior</button> Página {page} <button className="cart-btn" disabled={loading||!truncado} onClick={()=>setPage(p=>p+1)}>Próxima</button></div>
      <div className="cart-wrap"><table className="cart-table stack" style={{ minWidth: 1000 }}>
        <thead><tr><th>Pedido / OF</th><th>Produto</th><th>Setor</th><th>Situação</th><th className="num">Planejada</th><th className="num">Produzida</th><th className="num">Restante</th><th className="num">Refugo</th><th style={{ textAlign: "right" }}>Ação</th></tr></thead>
        <tbody>
          {loading && !ops.length ? <tr><td colSpan={9} className="cart-empty" data-label="">Carregando operações…</td></tr>
            : !ops.length ? <tr><td colSpan={9} className="cart-empty" data-label="">{restrito ? "Nenhuma operação dos seus setores neste filtro." : "Nenhuma operação encontrada. Importe uma programação com roteiro."}</td></tr>
            : ops.map((o) => {
              const aberta = ["LIBERADA", "EM_ANDAMENTO"].includes(o.status), rest = o.status === "CONCLUIDA" ? 0 : Math.max(0, o.planejada - o.produzida), ocupado = busy === o.id;
              return <tr key={o.id}>
                <td data-label="Pedido / OF"><b>{o.pedido}</b><small>OF {o.of || "—"}</small><small>Cliente: {o.clienteNome} · {o.clienteCodigo||"sem código"}</small><small>Representante: {o.representanteNome}</small></td>
                <td data-label="Produto">{o.produto || "—"}<small>{[o.descricao, o.cor].filter(Boolean).join(" · ")}</small></td>
                <td data-label="Setor">{o.processo}<small>seq. {o.sequencia}</small></td>
                <td data-label="Situação"><span className={"cart-badge st-" + o.status}>{rot(o.status)}</span>{o.status === "PENDENTE" && o.anterior_processo && <small>aguarda {o.anterior_processo}</small>}</td>
                <td className="num" data-label="Planejada">{f(o.planejada)}</td>
                <td className="num" data-label="Produzida"><b>{f(o.produzida)}</b><div className="cart-bar" aria-hidden><i style={{ width: Math.min(100, o.planejada > 0 ? (o.produzida / o.planejada) * 100 : 0) + "%" }} /></div></td>
                <td className="num" data-label="Restante">{f(rest)}</td>
                <td className="num" data-label="Refugo">{f(o.refugo)}</td>
                <td className="ap-cell-actions" data-label="Ação"><div className="ap-actions">
                  {pode && o.status === "LIBERADA" && <button className="cart-btn sm" disabled={ocupado} onClick={() => void enviar(o, "INICIAR")}>Iniciar</button>}
                  {pode && aberta && <><input className="ap-qty" inputMode="decimal" aria-label={"Quantidade produzida em " + o.processo} placeholder="Qtd" value={qtd[o.id] || ""} onChange={(e) => setQtd((x) => ({ ...x, [o.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") lancar(o); }} />
                    <button className="cart-btn sm primary" disabled={ocupado} onClick={() => lancar(o)}>{ocupado ? "…" : "Lançar"}</button>
                    <button className="cart-btn sm" disabled={ocupado} onClick={() => setConfirma({ op: o, tipo: "FINALIZAR", obs: "" })}>Finalizar</button></>}
                  {pode && !["CONCLUIDA", "DIVERGENCIA"].includes(o.status) && <button className="cart-btn sm danger" disabled={ocupado} onClick={() => setConfirma({ op: o, tipo: "DIVERGENCIA", obs: "" })}>Divergência</button>}
                  <button className="cart-btn sm" onClick={() => setInstr(o)} aria-label="Instruções">Instruções</button>
                  <button className="cart-btn sm" onClick={() => void abrirHist(o)} aria-label="Histórico"><History size={14} /> Histórico</button>
                  {!pode && null}
                </div>{o.status === "PENDENTE" && <div className="ap-wait">Aguardando a operação anterior ser concluída</div>}</td>
              </tr>;
            })}
        </tbody></table></div>
      <p className="cart-note">Lançar soma à quantidade (valor negativo corrige). O sistema bloqueia quantidade acima do planejado, operação não liberada e lançamento repetido. A conclusão completa as peças restantes e libera a próxima operação do roteiro.</p>
    </section>

    {confirma && <div className="cart-modal-shade" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirma(null); }}>
      <div className="cart-modal" role="dialog" aria-modal="true">
        <h2>{confirma.tipo === "FINALIZAR" ? "Finalizar operação" : "Registrar divergência"}</h2>
        <p>Pedido {confirma.op.pedido} · OF {confirma.op.of || "—"} · {confirma.op.processo}</p>
        {confirma.tipo === "FINALIZAR"
          ? <p>Faltam <b>{f(Math.max(0, confirma.op.planejada - confirma.op.produzida))}</b> peça(s) de {f(confirma.op.planejada)}. Ao finalizar, elas serão contabilizadas como produzidas e a próxima operação será liberada.</p>
          : <label>Descreva a divergência<textarea rows={3} maxLength={300} value={confirma.obs} onChange={(e) => setConfirma({ ...confirma, obs: e.target.value })} /></label>}
        <div className="row"><button className="cart-btn" onClick={() => setConfirma(null)}>Cancelar</button>
          <button className={"cart-btn " + (confirma.tipo === "FINALIZAR" ? "primary" : "danger")} disabled={confirma.tipo === "DIVERGENCIA" && !confirma.obs.trim()} onClick={() => { const c = confirma; setConfirma(null); void enviar(c.op, c.tipo, c.tipo === "DIVERGENCIA" ? { observacao: c.obs.trim() } : {}); }}>Confirmar</button></div>
      </div></div>}

    {instr && <InstrucaoOperacao operacaoId={instr.id} titulo={`${instr.processo} · ${instr.pedido}`} onClose={() => setInstr(null)} />}

    {hist && <div className="cart-drawer-shade" onMouseDown={(e) => { if (e.target === e.currentTarget) setHist(null); }}>
      <aside className="cart-drawer" role="dialog" aria-label="Histórico da operação">
        <header><div><h2>Histórico · {hist.op.processo}</h2><p>Pedido {hist.op.pedido} · OF {hist.op.of || "—"}</p></div><button className="cart-btn sm" onClick={() => setHist(null)} aria-label="Fechar"><X size={16} /></button></header>
        {hist.erro && <p className="cart-msg err">{hist.erro}</p>}
        {!hist.dados && !hist.erro && <p className="cart-note">Carregando…</p>}
        {hist.dados && <>
          <div><h3>Lançamentos de quantidade ({hist.dados.lancamentos.length})</h3>{!hist.dados.lancamentos.length ? <p className="cart-note">Nenhum lançamento registrado por esta tela ainda.</p> : <ul className="cart-hist">{hist.dados.lancamentos.map((l, i) => <li key={i}><b>{TIPO_LANC[l.tipo] || l.tipo}: {l.quantidade > 0 ? "+" : ""}{f(l.quantidade)}</b> · {l.usuario} · <small>produção de {l.data_producao.split("-").reverse().join("/")} · registrado em {new Date(l.criado_em).toLocaleString("pt-BR")}</small></li>)}</ul>}</div>
          <div><h3>Eventos da operação</h3>{!hist.dados.eventos.length ? <p className="cart-note">Sem eventos.</p> : <ul className="cart-hist">{hist.dados.eventos.map((e, i) => <li key={i}><b>{e.tipo.replaceAll("_", " ")}</b> · {e.usuario} · <small>{new Date(e.criado_em).toLocaleString("pt-BR")}</small><div><small>{e.descricao}</small></div></li>)}</ul>}</div>
        </>}
      </aside></div>}
  </div>;
}

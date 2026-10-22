"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, DataTable, Empty, Kpi, PageHeader, Panel } from "@/components/ui";
import { useOps } from "@/components/operational-provider";

type Row = Record<string, any>;
async function api(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na operação.");
  return j;
}
const ABAS = [["PAINEL", "Meu painel"], ["NOTIF", "Notificações"], ["CAMPOS", "Campos customizados"], ["EVENTOS", "Eventos e integração"]] as const;
const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PlataformaPage() {
  const { me } = useOps();
  const admin = ["PCP", "GERENTE"].includes(me?.perfil || "");
  const [aba, setAba] = useState<(typeof ABAS)[number][0]>("PAINEL");
  const [d, setD] = useState<Row | null>(null); const [erro, setErro] = useState(""); const [ok, setOk] = useState("");
  const [nv, setNv] = useState({ entidade: "PEDIDO_VENDA", chave: "", rotulo: "", tipo: "TEXTO", opcoes: "", obrigatorio: false });
  const visao = { PAINEL: "painel", NOTIF: "notificacoes", CAMPOS: "campos", EVENTOS: "eventos" }[aba];
  const carregar = useCallback(async () => { try { setD(await api("/api/plataforma?visao=" + visao)); setErro(""); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } }, [visao]);
  useEffect(() => { setD(null); if ((aba === "CAMPOS" || aba === "EVENTOS") && !admin) return; void carregar(); }, [carregar, aba, admin]);
  const run = async (b: Row, msg: string) => { setErro(""); setOk(""); try { await api("/api/plataforma", b); setOk(msg); await carregar(); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } };

  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Painel, notificações e extensões" description="Cartões por função, central de notificações com leitura individual, campos customizados por entidade e log de eventos entregues às integrações (API v1 e webhooks em Indicadores)." />
      {erro && <div className="alert danger" role="alert">{erro}</div>}{ok && <div className="alert success">{ok}</div>}
      <div className="tabs" role="tablist">{ABAS.filter(([k]) => admin || (k !== "CAMPOS" && k !== "EVENTOS")).map(([k, l]) => <button key={k} role="tab" aria-selected={aba === k} className={aba === k ? "active" : ""} onClick={() => setAba(k)}>{l}</button>)}</div>

      {aba === "PAINEL" && d?.cartoes && (d.cartoes.length ? <div className="kpis">{d.cartoes.map((c: Row) => <Link key={c.chave} href={c.link} style={{ textDecoration: "none" }}><Kpi label={c.rotulo} value={c.moeda ? brl(c.valor) : Number(c.valor)} /></Link>)}</div> : <Empty title="Sem cartões para o seu cargo" />)}

      {aba === "NOTIF" && d?.itens && (
        <Panel title={`Notificações (${d.naoLidas} não lidas)`} actions={d.naoLidas > 0 && <button onClick={() => run({ acao: "LER_TODAS" }, "Tudo marcado como lido.")}>Marcar todas como lidas</button>}>
          {d.itens.length ? d.itens.map((n: Row) => <div key={n.id} className="notif-item" style={{ padding: "8px 0", borderBottom: "1px solid var(--border, #ddd)", opacity: n.lida ? 0.6 : 1 }}>
            <div className="row" style={{ gap: 8, alignItems: "center" }}><Badge tone={n.tipo === "ALERTA" ? "danger" : n.tipo === "APROVACAO" ? "warning" : "info"}>{n.tipo}</Badge><b>{n.titulo}</b><small>{String(n.criado_em).slice(0, 16).replace("T", " ")}</small></div>
            {n.corpo && <div>{n.corpo}</div>}
            <div className="row" style={{ gap: 8 }}>{n.link && <Link href={n.link}>Abrir</Link>}{!n.lida && <button onClick={() => run({ acao: "LER", id: n.id }, "Lida.")}>Marcar como lida</button>}</div>
          </div>) : <Empty title="Nenhuma notificação" />}
        </Panel>)}

      {aba === "CAMPOS" && admin && d?.defs && (<>
        <Panel title="Novo campo">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <select value={nv.entidade} onChange={(e) => setNv({ ...nv, entidade: e.target.value })}>{d.entidades.map((x: string) => <option key={x}>{x}</option>)}</select>
            <input placeholder="chave (ex.: obra)" value={nv.chave} onChange={(e) => setNv({ ...nv, chave: e.target.value.toLowerCase() })} />
            <input placeholder="Rótulo" value={nv.rotulo} onChange={(e) => setNv({ ...nv, rotulo: e.target.value })} />
            <select value={nv.tipo} onChange={(e) => setNv({ ...nv, tipo: e.target.value })}>{d.tipos.map((x: string) => <option key={x}>{x}</option>)}</select>
            {nv.tipo === "LISTA" && <input placeholder="Opções separadas por vírgula" value={nv.opcoes} onChange={(e) => setNv({ ...nv, opcoes: e.target.value })} />}
            <label><input type="checkbox" checked={nv.obrigatorio} onChange={(e) => setNv({ ...nv, obrigatorio: e.target.checked })} /> Obrigatório</label>
            <button className="primary" onClick={() => run({ acao: "CAMPO_DEF", ...nv }, "Campo criado.")}>Criar</button>
          </div>
        </Panel>
        <Panel title="Campos"><DataTable head={["Entidade", "Chave", "Rótulo", "Tipo", "Obrig.", "Ativo", ""]} empty={<Empty title="Nenhum campo" />}>
          {d.defs.map((c: Row) => <tr key={c.id}><td>{c.entidade}</td><td><code>{c.chave}</code></td><td>{c.rotulo}</td><td>{c.tipo}{c.tipo === "LISTA" ? ` (${c.opcoes.join(", ")})` : ""}</td><td>{c.obrigatorio ? "Sim" : "—"}</td><td><Badge tone={c.ativo ? "success" : "neutral"}>{c.ativo ? "Ativo" : "Inativo"}</Badge></td><td><button onClick={() => run({ acao: "CAMPO_ATIVO", id: c.id, ativo: !c.ativo }, "Atualizado.")}>{c.ativo ? "Desativar" : "Ativar"}</button></td></tr>)}
        </DataTable></Panel>
      </>)}

      {aba === "EVENTOS" && admin && d?.eventos && <Panel title="Últimos eventos" subtitle="Cada evento é gravado e entregue aos webhooks inscritos (retentativas automáticas pela rotina agendada)."><DataTable head={["#", "Evento", "Entregas na fila", "Quando", "Dados"]} empty={<Empty title="Nenhum evento ainda" />}>
        {d.eventos.map((e: Row) => <tr key={e.id}><td>{e.id}</td><td><code>{e.tipo}</code></td><td>{e.entregas}</td><td>{String(e.criado_em).slice(0, 16).replace("T", " ")}</td><td><small>{JSON.stringify(e.payload).slice(0, 120)}</small></td></tr>)}
      </DataTable></Panel>}
    </>
  );
}

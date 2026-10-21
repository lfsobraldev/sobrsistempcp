"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import PCPFilterBar, {type OpcoesPCP} from "@/components/pcp-filter-bar";
import {usePCPFilters} from "@/hooks/use-pcp-filters";
import { useOps } from "@/components/operational-provider";
import { exportarExcel } from "@/lib/export";
import { formatarData } from "@/lib/carteira";
import type { LinhaProcesso, EstimativaPedido } from "@/lib/pcp-planejamento";
import type { Divergencia } from "@/lib/apontamento";

type Painel = {
  opcoes:OpcoesPCP; datas:{data:string;quantidade:number;itens:number}[];
  programacaoId: string; filtro: string; horizonte: number; vazio?: boolean;
  indicadores: Record<string, number>; processos: LinhaProcesso[];
  gargalos: { principal: LinhaProcesso | null; sobrecarregados: LinhaProcesso[]; semCapacidade: LinhaProcesso[] };
  estimativas: EstimativaPedido[]; divergencias: Divergencia[]; divergenciasTotal: number;
  perdas: { processo: string; motivo: string; minutos: number; pecas: number; ocorrencias: number }[];
  andon: { processo: string; abertos: number }[];
  produtividade: { data: string; processo: string; produzido: number; meta: number | null; atingimentoPct: number | null }[];
  apontadoPorDia: { data: string; processo: string; apontado: number }[];
  fontes: { capacidades: number; prazos: boolean };
};
type Regra = { processo: string; max_em_andamento: number | null };
const NIVEL: Record<string, string> = { SOBRECARGA: "Sobrecarga", ATENCAO: "Atenção", OK: "Dentro da capacidade", SEM_CAPACIDADE: "Sem capacidade cadastrada", SEM_CARGA: "Sem carga" };
const RISCO: Record<string, string> = { PRAZO_VENCIDO: "Prazo vencido", ATRASO_PROVAVEL: "Atraso provável", SEM_ESTIMATIVA: "Sem estimativa", SEM_PRAZO: "Sem prazo", NO_PRAZO: "No prazo", CONCLUIDO: "Concluído", SEM_OPERACOES: "Sem operações" };
const RISCO_CLASSE: Record<string, string> = { PRAZO_VENCIDO: "ATRASADO", ATRASO_PROVAVEL: "EM_RISCO", SEM_ESTIMATIVA: "SEM_PRAZO", SEM_PRAZO: "SEM_PRAZO", NO_PRAZO: "NO_PRAZO", CONCLUIDO: "CONCLUIDO", SEM_OPERACOES: "SEM_PRAZO" };
const n = (v: number | null | undefined, d = 1) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: d }));

export default function PainelPCP() {
  const { me, selectedProgramacaoId } = useOps();
  const {filtros,setFiltros,query,limpar}=usePCPFilters(selectedProgramacaoId);
  const [d, setD] = useState<Painel | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<"CAPACIDADE" | "PEDIDOS" | "DIVERGENCIAS" | "PERDAS" | "REGRAS">("CAPACIDADE");
  const [horizonte, setHorizonte] = useState(5);
  const [soRisco, setSoRisco] = useState(true);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [procs, setProcs] = useState<string[]>([]);
  const [msg, setMsg] = useState("");

  const carregar = useCallback(async (signal?:AbortSignal) => {
    setLoading(true); setErro("");
    try {
      const r = await fetch("/api/pcp/painel?horizonte=" + horizonte + "&" + query, { cache: "no-store",signal }); const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao carregar o painel.");
      if(signal?.aborted)return;setD(j);
      const rr = await fetch("/api/pcp/recursos-regras", { cache: "no-store" }); if (rr.ok) { const x = await rr.json(); setRegras(x.regras || []); setProcs(x.processos || []); }
    } catch (e) { if(!signal?.aborted)setErro(e instanceof Error ? e.message : "Falha ao carregar."); } finally { if(!signal?.aborted)setLoading(false); }
  }, [horizonte,query]);
  useEffect(() => { const c=new AbortController();void carregar(c.signal);return()=>c.abort(); }, [carregar]);

  async function salvarRegra(processo: string, max: string) {
    setMsg(""); setErro("");
    const r = await fetch("/api/pcp/recursos-regras", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ processo, max }) });
    const j = await r.json(); if (!r.ok) { setErro(j.error || "Falha ao salvar."); return; }
    setMsg("Regra salva para " + processo + "."); await carregar();
  }
  async function exportar() {
    if (!d) return;
    await exportarExcel([
      { nome: "Setores", linhas: d.processos.map((l) => ({ Setor: l.processo, Operações: l.operacoes, Planejada: l.planejada, Realizada: l.produzida, Restante: l.restante, "% realizado": Number(l.pctRealizado.toFixed(1)), "Capacidade/dia": l.capacidadeDia == null ? "" : Number(l.capacidadeDia.toFixed(1)), "Dias necessários": l.diasNecessarios == null ? "" : Number(l.diasNecessarios.toFixed(1)), Situação: NIVEL[l.nivel], Divergências: l.divergencias })) },
      { nome: "Pedidos", linhas: d.estimativas.map((e) => ({ Pedido: e.pedido, Restante: e.restante, "% realizado": Number(e.pctRealizado.toFixed(1)), Prazo: e.prazo || "", "Conclusão estimada": e.conclusaoEstimada || "", Risco: RISCO[e.risco], "Sem capacidade em": e.semCapacidade.join(", ") })) },
      { nome: "Divergências", linhas: d.divergencias.map((x) => ({ Gravidade: x.gravidade, Pedido: x.pedido, OF: x.of, Setor: x.processo || "", Código: x.codigo, Descrição: x.texto })) },
    ], "Sobral_Painel_PCP");
  }

  const ind = d?.indicadores;
  const pedidos = (d?.estimativas || []).filter((e) => !soRisco || ["PRAZO_VENCIDO", "ATRASO_PROVAVEL", "SEM_ESTIMATIVA"].includes(e.risco));
  const podeRegra = me?.perfil === "PCP";

  return <div className="cart-page">
    <header className="cart-hero"><span>PCP · PLANEJAMENTO E CONTROLE</span><h1>Painel PCP</h1>
      <p>Planejado × realizado × restante por setor, capacidade, gargalos e pedidos em risco — calculados dos apontamentos e capacidades cadastrados. Programação <b>{d?.filtro || "—"}</b>.</p></header>
    <PCPFilterBar filtros={filtros} opcoes={d?.opcoes||{filtros:[],meses:[],pedidos:[]}} onChange={setFiltros} onClear={limpar}/>
    <div className="cart-actions">
      <button className="cart-btn" onClick={() => void carregar()} disabled={loading}><RefreshCw size={16} /> {loading ? "Atualizando…" : "Atualizar"}</button>
      <button className="cart-btn" onClick={() => void exportar()} disabled={!d || d.vazio}><Download size={16} /> Exportar Excel</button>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>Horizonte de carga (dias úteis)
        <input className="ap-qty" type="number" min={1} max={30} value={horizonte} onChange={(e) => setHorizonte(Math.min(30, Math.max(1, Number(e.target.value) || 5)))} /></label>
    </div>
    {erro && <p role="alert" className="cart-msg err">{erro}</p>}
    {msg && <p role="status" className="cart-msg info">{msg}</p>}
    {d?.vazio && <p className="cart-msg info">Nenhuma programação ativa. Importe uma programação para ver o planejamento.</p>}

    {d?.datas&&<section className="cart-panel"><h2>Visão geral por data</h2><p>Todos os indicadores abaixo usam o mesmo recorte. Produção, perdas e Andon consideram apenas operações desses itens; metas continuam sendo metas globais do setor. As opções de filtro/pedido mostram até 500 valores.</p><div className="cart-wrap"><table className="cart-table"><thead><tr><th>Data programada</th><th>Itens</th><th>Quantidade de itens</th></tr></thead><tbody>{d.datas.map(x=><tr key={x.data}><td>{formatarData(x.data)}</td><td>{x.itens}</td><td>{n(x.quantidade,3)}</td></tr>)}</tbody></table></div></section>}
    {ind && <section className="cart-kpis" aria-label="Indicadores PCP">
      <div className="cart-kpi"><small>Pedidos · OFs · Operações</small><strong>{ind.pedidos}</strong><em>{ind.ofs} OFs · {ind.operacoes} operações</em></div>
      <div className="cart-kpi good"><small>Realizado</small><strong>{n(ind.pctRealizado)}%</strong><em>{n(ind.realizada, 0)} de {n(ind.planejada, 0)} peça(s) · restam {n(ind.restante, 0)}</em></div>
      <div className="cart-kpi"><small>Operações</small><strong>{ind.emAndamento + ind.liberadas}</strong><em>{ind.emAndamento} em andamento · {ind.liberadas} liberadas · {ind.pendentes} pendentes · {ind.concluidas} concluídas</em></div>
      <div className="cart-kpi bad"><small>Gargalo (sobrecarga)</small><strong>{d?.gargalos.sobrecarregados.length ?? 0}</strong><em>{d?.gargalos.principal ? `principal: ${d.gargalos.principal.processo} (${n(d.gargalos.principal.diasNecessarios)} dias)` : "nenhum setor acima do horizonte"}</em></div>
      <div className="cart-kpi bad"><small>Pedidos com prazo vencido</small><strong>{ind.pedidosPrazoVencido}</strong><em>com produção em aberto</em></div>
      <div className="cart-kpi warn"><small>Atraso provável</small><strong>{ind.pedidosAtrasoProvavel}</strong><em>conclusão estimada após o prazo</em></div>
      <div className="cart-kpi warn"><small>Divergências</small><strong>{ind.divergencias}</strong><em>{ind.semRoteiro} sem roteiro</em></div>
      <div className="cart-kpi"><small>Paradas do recorte</small><strong>{n(ind.minutosParados7d, 0)} min</strong><em>{ind.andonAbertos} Andon aberto(s) · refugo {n(ind.refugo, 0)}</em></div>
    </section>}

    <nav className="cart-tabs" aria-label="Visões do PCP">
      {([["CAPACIDADE", "Setores e capacidade"], ["PEDIDOS", "Pedidos e prazos"], ["DIVERGENCIAS", `Divergências (${d?.divergenciasTotal ?? 0})`], ["PERDAS", "Perdas e produtividade"], ["REGRAS", "Regras de recurso"]] as const).map(([k, t]) => <button key={k} className={aba === k ? "active" : ""} onClick={() => setAba(k)}>{t}</button>)}
    </nav>

    {aba === "CAPACIDADE" && d && !d.vazio && <section className="cart-panel">
      <header><div><h2>Setores</h2><p>Dias necessários = peças restantes ÷ capacidade diária cadastrada (peças/hora × eficiência × minutos). Sobrecarga: acima de {d.horizonte} dias úteis.</p></div></header>
      <div className="cart-wrap"><table className="cart-table stack"><thead><tr><th>Setor</th><th>Situação</th><th className="num">Planejada</th><th className="num">Realizada</th><th className="num">Restante</th><th>Realizado</th><th className="num">Capac./dia</th><th className="num">Dias</th><th className="num">Em and. / Lib. / Pend.</th><th className="num">Diverg.</th></tr></thead>
        <tbody>{d.processos.map((l) => <tr key={l.processo}>
          <td data-label="Setor"><b>{l.processo}</b></td><td data-label="Situação"><span className={"cart-badge n-" + l.nivel}>{NIVEL[l.nivel]}</span></td>
          <td className="num" data-label="Planejada">{n(l.planejada, 0)}</td><td className="num" data-label="Realizada">{n(l.produzida, 0)}</td><td className="num" data-label="Restante"><b>{n(l.restante, 0)}</b></td>
          <td data-label="Realizado"><div className="cart-bar" aria-hidden><i style={{ width: Math.min(100, l.pctRealizado) + "%" }} /></div><small>{n(l.pctRealizado)}%</small></td>
          <td className="num" data-label="Capac./dia">{n(l.capacidadeDia, 0)}<small>{l.maquinasComCapacidade ? l.maquinasComCapacidade + " máq./turno" : "não cadastrada"}</small></td>
          <td className="num" data-label="Dias">{n(l.diasNecessarios)}</td>
          <td className="num" data-label="Em and. / Lib. / Pend.">{l.emAndamento} / {l.liberadas} / {l.pendentes}</td><td className="num" data-label="Diverg.">{l.divergencias || "—"}</td></tr>)}</tbody></table></div>
      {d.gargalos.semCapacidade.length > 0 && <p className="cart-note">Sem capacidade cadastrada (cadastre em Performance / capacidades): {d.gargalos.semCapacidade.map((l) => l.processo).join(", ")}. Nesses setores não há estimativa de tempo.</p>}
    </section>}

    {aba === "PEDIDOS" && d && <section className="cart-panel">
      <header><div><h2>Pedidos e prazos</h2><p>Estimativa mínima: considera a capacidade cadastrada e o roteiro sequencial de cada OF, sem a fila de outros pedidos, manutenção ou falta de material.</p></div>
        <label style={{ display: "flex", gap: 6, fontSize: 13 }}><input type="checkbox" checked={soRisco} onChange={(e) => setSoRisco(e.target.checked)} /> Só pedidos em risco</label></header>
      <div className="cart-wrap"><table className="cart-table stack"><thead><tr><th>Pedido</th><th>Risco</th><th>Prazo</th><th>Conclusão estimada</th><th className="num">Restante</th><th>Realizado</th><th>Observação</th></tr></thead>
        <tbody>{!pedidos.length ? <tr><td colSpan={7} className="cart-empty" data-label="">{soRisco ? "Nenhum pedido em risco." : "Nenhum pedido."}</td></tr> : pedidos.map((e) => <tr key={e.pedido}>
          <td data-label="Pedido"><b>{e.pedido}</b></td><td data-label="Risco"><span className={"cart-badge " + RISCO_CLASSE[e.risco]}>{RISCO[e.risco]}</span></td>
          <td data-label="Prazo">{formatarData(e.prazo)}</td><td data-label="Conclusão estimada">{formatarData(e.conclusaoEstimada)}</td><td className="num" data-label="Restante">{n(e.restante, 0)}</td>
          <td data-label="Realizado"><div className="cart-bar" aria-hidden><i style={{ width: Math.min(100, e.pctRealizado) + "%" }} /></div><small>{n(e.pctRealizado)}%</small></td>
          <td data-label="Observação" style={{ textAlign: "left" }}>{e.semCapacidade.length ? "Sem capacidade em: " + e.semCapacidade.join(", ") : e.prazo ? "" : "Sem prazo definido na Gestão de Entregas"}</td></tr>)}</tbody></table></div>
    </section>}

    {aba === "DIVERGENCIAS" && d && <section className="cart-panel">
      <header><div><h2>Divergências de roteiro e apontamento</h2><p>{d.divergenciasTotal} encontrada(s){d.divergenciasTotal > d.divergencias.length ? ` — mostrando ${d.divergencias.length}` : ""}. Nada é corrigido automaticamente.</p></div></header>
      <div className="cart-wrap"><table className="cart-table stack"><thead><tr><th>Gravidade</th><th>Pedido / OF</th><th>Setor</th><th>Descrição</th></tr></thead>
        <tbody>{!d.divergencias.length ? <tr><td colSpan={4} className="cart-empty" data-label="">Nenhuma divergência encontrada.</td></tr> : d.divergencias.map((x, i) => <tr key={i}>
          <td data-label="Gravidade"><span className={"cart-sev " + x.gravidade} />{x.gravidade}</td><td data-label="Pedido / OF"><b>{x.pedido}</b><small>OF {x.of || "—"}</small></td><td data-label="Setor">{x.processo || "—"}</td><td data-label="Descrição" style={{ textAlign: "left" }}>{x.texto}</td></tr>)}</tbody></table></div>
    </section>}

    {aba === "PERDAS" && d && <section className="cart-panel">
      <header><div><h2>Perdas, paradas e produtividade (7 dias)</h2><p>Dados dos registros de Performance (paradas e produção diária) e dos lançamentos desta tela de apontamento.</p></div></header>
      <h3>Paradas por motivo</h3>
      <div className="cart-wrap" style={{ marginBottom: 14 }}><table className="cart-table stack" style={{ minWidth: 560 }}><thead><tr><th>Setor</th><th>Motivo</th><th className="num">Minutos</th><th className="num">Peças perdidas</th><th className="num">Ocorrências</th></tr></thead>
        <tbody>{!d.perdas.length ? <tr><td colSpan={5} className="cart-empty" data-label="">Nenhuma parada registrada nos últimos 7 dias.</td></tr> : d.perdas.map((p, i) => <tr key={i}><td data-label="Setor">{p.processo}</td><td data-label="Motivo">{p.motivo}</td><td className="num" data-label="Minutos">{n(p.minutos, 0)}</td><td className="num" data-label="Peças perdidas">{n(p.pecas, 0)}</td><td className="num" data-label="Ocorrências">{p.ocorrencias}</td></tr>)}</tbody></table></div>
      <h3>Produção diária × meta</h3>
      <div className="cart-wrap"><table className="cart-table stack" style={{ minWidth: 560 }}><thead><tr><th>Data</th><th>Setor</th><th className="num">Produzido</th><th className="num">Meta</th><th className="num">Atingimento</th></tr></thead>
        <tbody>{!d.produtividade.length ? <tr><td colSpan={5} className="cart-empty" data-label="">Sem produção diária registrada.</td></tr> : d.produtividade.map((p, i) => <tr key={i}><td data-label="Data">{formatarData(p.data)}</td><td data-label="Setor">{p.processo}</td><td className="num" data-label="Produzido">{n(p.produzido, 0)}</td><td className="num" data-label="Meta">{n(p.meta, 0)}</td><td className="num" data-label="Atingimento">{p.atingimentoPct == null ? "—" : n(p.atingimentoPct) + "%"}</td></tr>)}</tbody></table></div>
      {d.apontadoPorDia.length > 0 && <p className="cart-note">Apontado por operação nos últimos dias: {d.apontadoPorDia.slice(0, 8).map((a) => `${formatarData(a.data)} ${a.processo} ${n(a.apontado, 0)}`).join(" · ")}</p>}
    </section>}

    {aba === "REGRAS" && <section className="cart-panel">
      <header><div><h2>Regras de recurso</h2><p>Limite de operações EM_ANDAMENTO ao mesmo tempo em cada setor/linha/máquina. Vazio = sem limite (comportamento atual). {podeRegra ? "" : "Somente o PCP altera."}</p></div></header>
      <div className="cart-wrap"><table className="cart-table stack" style={{ minWidth: 480 }}><thead><tr><th>Setor / recurso</th><th className="num">Limite simultâneo</th><th></th></tr></thead>
        <tbody>{procs.map((p) => <RegraLinha key={p} processo={p} valor={regras.find((r) => r.processo === p)?.max_em_andamento ?? null} editavel={podeRegra} onSalvar={salvarRegra} />)}</tbody></table></div>
    </section>}
  </div>;
}

function RegraLinha({ processo, valor, editavel, onSalvar }: { processo: string; valor: number | null; editavel: boolean; onSalvar: (p: string, v: string) => Promise<void> }) {
  const [v, setV] = useState(valor == null ? "" : String(valor));
  useEffect(() => setV(valor == null ? "" : String(valor)), [valor]);
  return <tr><td data-label="Setor / recurso"><b>{processo}</b></td>
    <td className="num" data-label="Limite simultâneo"><input className="ap-qty" inputMode="numeric" disabled={!editavel} value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ""))} placeholder="sem limite" aria-label={"Limite para " + processo} /></td>
    <td data-label="">{editavel && <button className="cart-btn sm" disabled={v === (valor == null ? "" : String(valor))} onClick={() => void onSalvar(processo, v)}>Salvar</button>}</td></tr>;
}

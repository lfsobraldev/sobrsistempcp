"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Download, RefreshCw, X } from "lucide-react";
import { exportarExcel } from "@/lib/export";
import {
  SITUACAO_LABEL, alertasPedido, calcularIndicadores, calcularSaldos, detectarDuplicidades, filtrarCarteira,
  formatarData, hojeISO, linhasExportacao, ordenarCarteira, prazoReferencia, situacaoCarteira, RISCO_DIAS,
  type Alteracao, type Filtros, type Ordem, type PedidoCarteira, type Situacao,
} from "@/lib/carteira";

type Fontes = { controleEntregas: boolean; prazosPcp: boolean; remessas: boolean; sac: boolean; estoque: boolean };
type Detalhe = {
  itens: { item: string; produto: string; descricao: string; of: string; quantidade: number; avancoPct: number; concluida: number; pendenteEquivalente: number }[];
  cargas: { id: string; romaneio: string; quantidade: number; nota_fiscal: string; transportadora: string; data_saida: string | null; data_entrega: string | null; status: string; usuario: string }[];
  historico: { acao: string; usuario: string; criadoEm: string; alteracoes: Alteracao[]; detalhe: Record<string, unknown> | null }[];
  etapas: { area: string; etapa: string; data_conclusao: string | null; status: string; usuario: string }[];
  sac: { id: string; protocolo: number; assunto: string; status: string; prioridade: string; responsavel: string; prazo: string | null }[];
};
type Prod = { produto: string; descricao: string; categoria: string; pedidos: number; solicitada: number; concluida: number; pendenteEquivalente: number };

const STATUS_ENTREGA: [string, string][] = [["PLANEJADO", "Planejado"], ["EM_PRODUCAO", "Em produção"], ["AGUARDANDO_MONTAGEM", "Aguardando montagem"], ["PRONTO_EXPEDICAO", "Pronto para expedição"], ["EM_TRANSITO", "Em trânsito"], ["ENTREGA_PARCIAL", "Entrega parcial"], ["ENTREGUE", "Entregue"], ["PENDENCIA", "Pendência"]];
const rotuloStatus = (s: string) => STATUS_ENTREGA.find(([k]) => k === s)?.[1] || s;
const n = (v: number | null) => (v === null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
const BRANCO: Filtros = { q: "", cliente: "", situacao: "", statusEntrega: "", prazoDe: "", prazoAte: "", somenteComSaldo: false, somenteComSac: false, somenteComAlerta: false };

export default function CarteiraPage() {
  const [lista, setLista] = useState<PedidoCarteira[]>([]);
  const [prods, setProds] = useState<Prod[]>([]);
  const [fontes, setFontes] = useState<Fontes | null>(null);
  const [filtro, setFiltro] = useState("");
  const [progId, setProgId] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<"PEDIDOS" | "PRODUTOS" | "ALERTAS">("PEDIDOS");
  const [f, setF] = useState<Filtros>(BRANCO);
  const [ordem, setOrdem] = useState<Ordem>({ campo: "situacao", dir: "asc" });
  const [sel, setSel] = useState<PedidoCarteira | null>(null);
  const [det, setDet] = useState<Detalhe | null>(null);
  const [detErro, setDetErro] = useState("");
  const [qProd, setQProd] = useState("");
  const hoje = hojeISO();

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const [a, b] = await Promise.all([fetch("/api/carteira", { cache: "no-store" }), fetch("/api/carteira?visao=produtos", { cache: "no-store" })]);
      const ja = await a.json(), jb = await b.json();
      if (!a.ok) throw new Error(ja.error || "Não foi possível carregar a carteira.");
      setLista(ja.pedidos || []); setFontes(ja.fontes || null); setFiltro(ja.filtro || ""); setProgId(ja.programacaoId || "");
      setProds(b.ok ? jb.produtos || [] : []);
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao carregar."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const abrir = useCallback(async (p: PedidoCarteira) => {
    setSel(p); setDet(null); setDetErro("");
    try {
      const r = await fetch("/api/carteira?pedido=" + encodeURIComponent(p.pedido) + (progId ? "&programacaoId=" + progId : ""), { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao carregar o pedido.");
      setDet(j);
    } catch (e) { setDetErro(e instanceof Error ? e.message : "Falha ao carregar o pedido."); }
  }, [progId]);

  const ind = useMemo(() => calcularIndicadores(lista, hoje), [lista, hoje]);
  const visiveis = useMemo(() => ordenarCarteira(filtrarCarteira(lista, f, hoje), ordem, hoje), [lista, f, ordem, hoje]);
  const dups = useMemo(() => detectarDuplicidades(lista), [lista]);
  const comAlerta = useMemo(() => lista.map((p) => ({ p, alertas: alertasPedido(p, hoje).filter((a) => a.gravidade !== "BAIXA") })).filter((x) => x.alertas.length), [lista, hoje]);
  const prodsFiltrados = useMemo(() => prods.filter((x) => !qProd || (x.produto + " " + x.descricao).toLowerCase().includes(qProd.toLowerCase())), [prods, qProd]);

  const set = (patch: Partial<Filtros>) => setF((x) => ({ ...x, ...patch }));
  const ordenar = (campo: Ordem["campo"]) => setOrdem((o) => ({ campo, dir: o.campo === campo && o.dir === "asc" ? "desc" : "asc" }));
  const seta = (campo: Ordem["campo"]) => (ordem.campo === campo ? (ordem.dir === "asc" ? " ▲" : " ▼") : "");
  const atalho = (situacao: Situacao | "") => { setAba("PEDIDOS"); setF({ ...BRANCO, situacao }); };

  async function exportar() {
    await exportarExcel([
      { nome: "Carteira", linhas: linhasExportacao(visiveis, hoje) },
      { nome: "Saldos por produto", linhas: prods.map((x) => ({ Produto: x.produto, Descrição: x.descricao, Categoria: x.categoria, Pedidos: x.pedidos, "Peças solicitadas": x.solicitada, "Peças concluídas (100%)": x.concluida, "Pendente (equivalente)": Number(x.pendenteEquivalente.toFixed(1)) })) },
    ], "Sobral_Carteira_de_Pedidos");
  }

  const Th = ({ c, children, num }: { c: Ordem["campo"]; children: React.ReactNode; num?: boolean }) => <th className={"sortable" + (num ? " num" : "")} onClick={() => ordenar(c)} aria-sort={ordem.campo === c ? (ordem.dir === "asc" ? "ascending" : "descending") : "none"}>{children}{seta(c)}</th>;

  return <div className="cart-page">
    <header className="cart-hero">
      <span>COMERCIAL · PCP · EXPEDIÇÃO</span>
      <h1>Carteira de Pedidos</h1>
      <p>Pedidos, saldos de produção e entrega, prazos prometidos e riscos de atraso — lidos dos mesmos cadastros da Programação, da Gestão de Entregas e do SAC. Programação: <b>{filtro || "—"}</b>.</p>
    </header>

    <div className="cart-actions">
      <button className="cart-btn" onClick={() => void carregar()} disabled={loading}><RefreshCw size={16} /> {loading ? "Atualizando…" : "Atualizar"}</button>
      <button className="cart-btn" onClick={() => void exportar()} disabled={!visiveis.length}><Download size={16} /> Exportar Excel ({visiveis.length})</button>
      <Link className="cart-btn primary" href="/gestao-pedidos">Gestão de Pedidos e Entregas</Link>
    </div>

    {erro && <p role="alert" className="cart-msg err">{erro}</p>}
    {fontes && !fontes.controleEntregas && <p className="cart-msg info">O cadastro de entregas ainda não foi criado no banco (abra a Gestão de Pedidos e Entregas uma vez). Prazos e entregas ficam indisponíveis até lá.</p>}
    {fontes && !fontes.sac && <p className="cart-note">SAC ainda não instalado no banco: a coluna de SAC mostrará 0 (execute a migration do SAC).</p>}

    <section className="cart-kpis" aria-label="Indicadores da carteira">
      <button className="cart-kpi" onClick={() => atalho("")}><small>Pedidos na carteira</small><strong>{ind.totalPedidos}</strong><em>{ind.emAberto} em aberto · {ind.concluidos} concluídos</em></button>
      <button className="cart-kpi bad" onClick={() => atalho("ATRASADO")}><small>Atrasados</small><strong>{ind.atrasados}</strong><em>prazo vencido e saldo a entregar</em></button>
      <button className="cart-kpi warn" onClick={() => atalho("EM_RISCO")}><small>Em risco</small><strong>{ind.emRisco}</strong><em>vencem em até {RISCO_DIAS} dias sem produção concluída</em></button>
      <button className="cart-kpi" onClick={() => atalho("SEM_PRAZO")}><small>Sem prazo definido</small><strong>{ind.semPrazo}</strong><em>informe o prazo na Gestão de Entregas</em></button>
      <div className="cart-kpi"><small>Entregas previstas (7 dias)</small><strong>{ind.entregasProx7.pedidos}</strong><em>{n(ind.entregasProx7.pecasPendentes)} peça(s) a entregar</em></div>
      <div className="cart-kpi"><small>Entregas previstas (30 dias)</small><strong>{ind.entregasProx30.pedidos}</strong><em>{n(ind.entregasProx30.pecasPendentes)} peça(s) a entregar</em></div>
      <div className="cart-kpi"><small>Peças pendentes de entrega</small><strong>{n(ind.pecasPendentesEntrega)}</strong><em>de {n(ind.pecasSolicitadas)} solicitadas · {n(ind.pecasEntregues)} entregues</em></div>
      <div className="cart-kpi"><small>Peças pendentes de produção</small><strong>{n(ind.pecasPendentesProducao)}</strong><em>linhas ainda abaixo de 100%</em></div>
    </section>
    {ind.pedidosSemQuantidade > 0 && <p className="cart-note">{ind.pedidosSemQuantidade} pedido(s) estão no controle de entregas mas sem itens nesta programação; as quantidades deles não entram nos totais acima.</p>}

    <nav className="cart-tabs" aria-label="Visões da carteira">
      {([["PEDIDOS", "Pedidos"], ["PRODUTOS", "Saldos por produto"], ["ALERTAS", `Alertas e divergências (${comAlerta.length + dups.length})`]] as const).map(([k, t]) => <button key={k} className={aba === k ? "active" : ""} onClick={() => setAba(k)}>{t}</button>)}
    </nav>

    {aba === "PEDIDOS" && <section className="cart-panel">
      <header><div><h2>Pedidos</h2><p>{visiveis.length} de {lista.length} pedido(s). Clique em um pedido para ver itens, remessas, SAC e histórico.</p></div><button className="cart-btn sm" onClick={() => setF(BRANCO)}>Limpar filtros</button></header>
      <div className="cart-filters">
        <label>Pesquisar<input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Pedido, cliente, NF, transportadora" /></label>
        <label>Cliente<input value={f.cliente} onChange={(e) => set({ cliente: e.target.value })} placeholder="Nome do cliente" /></label>
        <label>Situação da carteira<select value={f.situacao} onChange={(e) => set({ situacao: e.target.value as Situacao | "" })}><option value="">Todas</option>{(Object.keys(SITUACAO_LABEL) as Situacao[]).map((k) => <option key={k} value={k}>{SITUACAO_LABEL[k]}</option>)}</select></label>
        <label>Situação da entrega<select value={f.statusEntrega} onChange={(e) => set({ statusEntrega: e.target.value })}><option value="">Todas</option>{STATUS_ENTREGA.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
        <label>Prazo de<input type="date" value={f.prazoDe} onChange={(e) => set({ prazoDe: e.target.value })} /></label>
        <label>Prazo até<input type="date" value={f.prazoAte} onChange={(e) => set({ prazoAte: e.target.value })} /></label>
      </div>
      <div className="cart-checks">
        <label><input type="checkbox" checked={!!f.somenteComSaldo} onChange={(e) => set({ somenteComSaldo: e.target.checked })} /> Só com saldo a entregar</label>
        <label><input type="checkbox" checked={!!f.somenteComSac} onChange={(e) => set({ somenteComSac: e.target.checked })} /> Só com SAC em aberto</label>
        <label><input type="checkbox" checked={!!f.somenteComAlerta} onChange={(e) => set({ somenteComAlerta: e.target.checked })} /> Só com alerta</label>
      </div>
      <div className="cart-wrap"><table className="cart-table stack">
        <thead><tr><Th c="pedido">Pedido</Th><Th c="cliente">Cliente</Th><Th c="prazo">Prazo</Th><Th c="situacao">Situação</Th><th className="num">Solicitada</th><th className="num">Concluída</th><th className="num">Entregue</th><Th c="saldo" num>A entregar</Th><Th c="avanco">Produção</Th><th>Entrega</th><th className="num">SAC</th></tr></thead>
        <tbody>
          {loading && !lista.length ? <tr><td colSpan={11} className="cart-empty" data-label="">Carregando carteira…</td></tr>
            : !visiveis.length ? <tr><td colSpan={11} className="cart-empty" data-label="">{lista.length ? "Nenhum pedido corresponde aos filtros." : "Nenhum pedido encontrado. Importe uma programação ou cadastre pedidos na Gestão de Entregas."}</td></tr>
            : visiveis.map((p) => {
              const s = calcularSaldos(p), sit = situacaoCarteira(p, hoje), prazo = prazoReferencia(p);
              return <tr key={p.pedido} className="clickable" tabIndex={0} onClick={() => void abrir(p)} onKeyDown={(e) => { if (e.key === "Enter") void abrir(p); }}>
                <td data-label="Pedido"><b>{p.pedido}</b>{p.foraDaProgramacao && <small>sem itens na programação</small>}</td>
                <td data-label="Cliente">{p.cliente || <span style={{ color: "var(--text-3)" }}>Não informado</span>}<small>{[p.cidade, p.uf].filter(Boolean).join(" / ")}</small></td>
                <td data-label="Prazo">{formatarData(prazo.data)}{prazo.origem !== "NENHUMA" && <small>{prazo.origem === "CLIENTE" ? "prometido ao cliente" : prazo.origem === "PCP" ? "prazo PCP" : "previsão logística"}</small>}</td>
                <td data-label="Situação"><span className={"cart-badge " + sit}>{SITUACAO_LABEL[sit]}</span></td>
                <td className="num" data-label="Solicitada">{n(s.solicitada)}</td>
                <td className="num" data-label="Concluída">{s.solicitada === null ? "—" : n(s.concluida)}</td>
                <td className="num" data-label="Entregue">{s.solicitada === null ? "—" : n(s.entregue)}</td>
                <td className="num" data-label="A entregar"><b>{n(s.pendenteEntrega)}</b></td>
                <td data-label="Produção">{p.pecas === null ? "—" : <><div className="cart-bar" aria-hidden><i style={{ width: Math.min(100, p.avancoPct) + "%" }} /></div><small>{p.avancoPct.toFixed(1)}%</small></>}</td>
                <td data-label="Entrega">{rotuloStatus(p.statusEntrega)}</td>
                <td className="num" data-label="SAC">{p.sacAbertos || "—"}</td>
              </tr>;
            })}
        </tbody></table></div>
      <p className="cart-note">Prazo de referência: previsão informada ao cliente → prazo PCP → previsão logística. “Em risco”: prazo em até {RISCO_DIAS} dias com produção ainda não concluída, ou previsão logística posterior ao prazo.</p>
    </section>}

    {aba === "PRODUTOS" && <section className="cart-panel">
      <header><div><h2>Saldos por produto</h2><p>Programação {filtro || "—"}, pedidos ainda não entregues. A entrega é registrada por pedido (não por item), por isso aqui o saldo é de produção.</p></div></header>
      <div className="cart-filters"><label>Pesquisar produto<input value={qProd} onChange={(e) => setQProd(e.target.value)} placeholder="Código ou descrição" /></label></div>
      <div className="cart-wrap"><table className="cart-table stack"><thead><tr><th>Produto</th><th>Descrição</th><th className="num">Pedidos</th><th className="num">Solicitada</th><th className="num">Concluída (100%)</th><th className="num">Pendente (equiv.)</th></tr></thead>
        <tbody>{!prodsFiltrados.length ? <tr><td colSpan={6} className="cart-empty" data-label="">{loading ? "Carregando…" : "Nenhum produto encontrado."}</td></tr> : prodsFiltrados.map((x) => <tr key={x.produto + x.descricao}><td data-label="Produto"><b>{x.produto || "—"}</b></td><td data-label="Descrição">{x.descricao}<small>{x.categoria}</small></td><td className="num" data-label="Pedidos">{x.pedidos}</td><td className="num" data-label="Solicitada">{n(x.solicitada)}</td><td className="num" data-label="Concluída">{n(x.concluida)}</td><td className="num" data-label="Pendente"><b>{n(x.pendenteEquivalente)}</b></td></tr>)}</tbody></table></div>
      <p className="cart-note">Pendente (equivalente) = quantidade × (100 − avanço oficial)/100, somado por produto. Estoque: o sistema ainda não possui cadastro de estoque; nenhum saldo de estoque é exibido.</p>
    </section>}

    {aba === "ALERTAS" && <section className="cart-panel">
      <header><div><h2>Alertas e divergências</h2><p>Regras aplicadas sobre os dados reais. Nada é corrigido automaticamente.</p></div></header>
      {dups.length > 0 && <>
        <h3>Possíveis cadastros duplicados</h3>
        <ul className="cart-alerts" style={{ marginBottom: 16 }}>{dups.map((d) => <li key={d.tipo + d.chave}><AlertTriangle size={16} style={{ marginRight: 8, flex: "none", color: "var(--warning)" }} /><span><b>{d.tipo === "PEDIDO" ? "Pedido" : "Cliente"}:</b> {d.valores.join("  ≠  ")} — grafias diferentes para o mesmo {d.tipo === "PEDIDO" ? "número" : "nome"}. Revise antes de unificar.</span></li>)}</ul>
      </>}
      {!comAlerta.length && !dups.length ? <p className="cart-empty">Nenhum alerta ativo.</p> : <div className="cart-wrap"><table className="cart-table stack"><thead><tr><th>Pedido</th><th>Cliente</th><th>Alertas</th></tr></thead><tbody>
        {comAlerta.map(({ p, alertas }) => <tr key={p.pedido} className="clickable" onClick={() => { setAba("PEDIDOS"); void abrir(p); }}><td data-label="Pedido"><b>{p.pedido}</b></td><td data-label="Cliente">{p.cliente || "—"}</td><td data-label="Alertas" style={{ textAlign: "left" }}>{alertas.map((a) => <div key={a.codigo}><span className={"cart-sev " + a.gravidade} />{a.texto}</div>)}</td></tr>)}</tbody></table></div>}
    </section>}

    {sel && <div className="cart-drawer-shade" onMouseDown={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
      <aside className="cart-drawer" role="dialog" aria-label={"Pedido " + sel.pedido}>
        <header><div><h2>Pedido {sel.pedido}</h2><p>{sel.cliente || "Cliente não informado"}{sel.representante ? " · Rep. " + sel.representante : ""}</p></div><button className="cart-btn sm" onClick={() => setSel(null)} aria-label="Fechar"><X size={16} /></button></header>
        {(() => {
          const s = calcularSaldos(sel), sit = situacaoCarteira(sel, hoje), prazo = prazoReferencia(sel), al = alertasPedido(sel, hoje);
          return <>
            <div><span className={"cart-badge " + sit}>{SITUACAO_LABEL[sit]}</span> <span style={{ marginLeft: 8 }}>Prazo {formatarData(prazo.data)} · {rotuloStatus(sel.statusEntrega)}</span></div>
            <div className="cart-grid2"><div><small>Solicitada</small><b>{n(s.solicitada)}</b></div><div><small>Concluída (100%)</small><b>{sel.pecas === null ? "—" : n(s.concluida)}</b></div><div><small>Expedida</small><b>{n(s.expedida)}</b></div><div><small>Entregue{s.origemEntregue === "STATUS" ? " *" : ""}</small><b>{n(s.entregue)}</b></div><div><small>A produzir</small><b>{n(s.pendenteProducao)}</b></div><div><small>A entregar</small><b>{n(s.pendenteEntrega)}</b></div></div>
            {s.origemEntregue === "STATUS" && <p className="cart-note">* Sem remessas registradas: considerado todo entregue pela situação ENTREGUE e data de entrega do pedido.</p>}
            {al.length > 0 && <div><h3>Alertas</h3><ul className="cart-alerts">{al.map((a) => <li key={a.codigo}><span className={"cart-sev " + a.gravidade} style={{ marginTop: 6 }} />{a.texto}</li>)}</ul></div>}
          </>;
        })()}
        {detErro && <p className="cart-msg err" role="alert">{detErro}</p>}
        {!det && !detErro && <p className="cart-note">Carregando detalhes…</p>}
        {det && <>
          <div><h3>Itens ({det.itens.length})</h3><div className="cart-wrap"><table className="cart-table stack" style={{ minWidth: 560 }}><thead><tr><th>Item</th><th>Produto</th><th>OF</th><th className="num">Qtd</th><th className="num">Avanço</th><th className="num">Pendente</th></tr></thead><tbody>{!det.itens.length ? <tr><td colSpan={6} className="cart-empty" data-label="">Sem itens nesta programação.</td></tr> : det.itens.map((i, k) => <tr key={k}><td data-label="Item">{i.item || "—"}</td><td data-label="Produto"><b>{i.produto}</b><small>{i.descricao}</small></td><td data-label="OF">{i.of || "—"}</td><td className="num" data-label="Qtd">{n(i.quantidade)}</td><td className="num" data-label="Avanço">{i.avancoPct.toFixed(0)}%</td><td className="num" data-label="Pendente">{n(i.pendenteEquivalente)}</td></tr>)}</tbody></table></div></div>
          <div><h3>Remessas ({det.cargas.length})</h3><div className="cart-wrap"><table className="cart-table stack" style={{ minWidth: 560 }}><thead><tr><th>Romaneio</th><th className="num">Peças</th><th>NF</th><th>Saída</th><th>Entrega</th><th>Situação</th></tr></thead><tbody>{!det.cargas.length ? <tr><td colSpan={6} className="cart-empty" data-label="">Nenhuma remessa registrada.</td></tr> : det.cargas.map((c) => <tr key={c.id}><td data-label="Romaneio">{c.romaneio || "—"}<small>{c.transportadora}</small></td><td className="num" data-label="Peças">{c.quantidade}</td><td data-label="NF">{c.nota_fiscal || "—"}</td><td data-label="Saída">{formatarData(c.data_saida)}</td><td data-label="Entrega">{formatarData(c.data_entrega)}</td><td data-label="Situação">{c.status.replaceAll("_", " ")}</td></tr>)}</tbody></table></div></div>
          <div><h3>SAC ({det.sac.length})</h3>{!det.sac.length ? <p className="cart-note">Nenhum atendimento SAC com este número de pedido.</p> : <ul className="cart-alerts">{det.sac.map((x) => <li key={x.id}><Link href="/sac">#{x.protocolo}</Link>&nbsp;— {x.assunto} · {x.status.replaceAll("_", " ")}{x.prazo ? " · prazo " + formatarData(x.prazo) : ""}</li>)}</ul>}</div>
          <div><h3>Histórico de alterações</h3>{!det.historico.length ? <p className="cart-note">Sem alterações registradas na Gestão de Entregas.</p> : <ul className="cart-hist">{det.historico.map((h, k) => <li key={k}><b>{h.acao.replaceAll("_", " ")}</b> · {h.usuario} · <small>{new Date(h.criadoEm).toLocaleString("pt-BR")}</small>{h.alteracoes.map((a) => <div key={a.campo}><small>{a.rotulo}: {a.de || "vazio"} → {a.para || "vazio"}</small></div>)}</li>)}</ul>}</div>
          <Link className="cart-btn primary" href="/gestao-pedidos">Editar na Gestão de Pedidos e Entregas</Link>
        </>}
      </aside>
    </div>}
  </div>;
}

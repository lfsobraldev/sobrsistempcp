"use client";
import EstoqueCiclo from "@/components/estoque-ciclo";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { useOps } from "@/components/operational-provider";
import { PERFIS_CADASTRO, PERFIS_CONFERENCIA, PERFIS_CONTAGEM, PERFIS_MOV, ROTULO_MOV, TIPOS_MOV, converterParaBase, type TipoMov } from "@/lib/estoque";

type Un = { unidade: string; fator: number; codigo_barras: string | null };
type Prod = { id: string; codigo: string; descricao: string; unidade_base: string; estoque_minimo: number; ativo: boolean; origem: string; unidades: Un[] };
type Local = { id: string; codigo: string; descricao: string; ativo: boolean };
type Unidade = { codigo: string; descricao: string; fracionavel: boolean };
type Linha = { produto_id: string; codigo: string; descricao: string; unidade_base: string; estoque_minimo: number; fisico: number; reservado: number; bloqueado: number; disponivel: number; locais: number };
type Resumo = { produtosAtivos: number; comSaldo: number; abaixoMinimo: number; comBloqueio: number; comReserva: number };
type Mov = { id: number; tipo: TipoMov; codigo: string; descricao: string; quantidade_base: number; unidade_base: string; quantidade_informada: number; unidade_informada: string; sinal: number; origem: string | null; destino: string | null; documento: string; pedido: string; motivo: string; usuario: string; criado_em: string };
type Inv = { id: string; numero: number; tipo: string; status: string; local: string | null; criado_por: string; criado_em: string; itens: number; contados: number; divergentes: number };
type InvItem = { id: string; codigo: string; descricao: string; unidade_base: string; local: string; saldo_sistema: number; contado: number | null; conferido: boolean; ajustado: boolean; divergencia: number | null };
type InvDet = { inventario: { id: string; numero: number; tipo: string; status: string; local: string | null }; itens: InvItem[]; fechamento: { ok: boolean; naoContados: number; divergentesSemConferencia: number; ajustes: number } };

const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 3 }));
const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const dh = (v: string) => new Date(v).toLocaleString("pt-BR");
async function api(url: string, init?: RequestInit) { const r = await fetch(url, { cache: "no-store", ...init }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Falha na requisição."); return j; }
const post = (url: string, body: unknown) => api(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export default function EstoquePage() {
  const { me,recorteQuery } = useOps();
  const [page,setPage]=useState(1),[total,setTotal]=useState(0);
  const saldoRequest=useRef(0);
  const perfil = me?.perfil || "";
  const [classificacao,setClassificacao]=useState("");
  const [aba, setAba] = useState<"SALDOS" | "MOVIMENTAR" | "HISTORICO" | "CADASTROS" | "INVENTARIO">("SALDOS");
  const [erro, setErro] = useState(""); const [ok, setOk] = useState("");
  const [prods, setProds] = useState<Prod[]>([]); const [locais, setLocais] = useState<Local[]>([]); const [unidades, setUnidades] = useState<Unidade[]>([]);
  const carregarCad = useCallback(async () => { try { const j = await api("/api/estoque/cadastros?inativos=1"); setProds(j.produtos); setLocais(j.locais); setUnidades(j.unidades); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } }, []);
  useEffect(() => { void carregarCad(); }, [carregarCad]);
  const locaisAtivos = locais.filter((l) => l.ativo), prodsAtivos = prods.filter((p) => p.ativo);
  const podeCad = PERFIS_CADASTRO.includes(perfil as never);
  const tiposPermitidos = TIPOS_MOV.filter((t) => PERFIS_MOV[t].includes(perfil as never));
  const msg = (e: unknown) => { setOk(""); setErro(e instanceof Error ? e.message : "Falha."); };
  const sucesso = (t: string) => { setErro(""); setOk(t); };

  /* ---------------- Saldos ---------------- */
  const [q, setQ] = useState(""); const [fLocal, setFLocal] = useState(""); const [filtro, setFiltro] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([]); const [resumo, setResumo] = useState<Resumo | null>(null); const [load, setLoad] = useState(true);
  const [det, setDet] = useState<{ p: Linha; d: any } | null>(null);
  const carregarSaldos = useCallback(async () => {
    setLoad(true);const requisicao=++saldoRequest.current;
    try { const j = await api(`/api/estoque?recorte=1&${recorteQuery}&page=${page}&classificacao=${classificacao}&q=${encodeURIComponent(q)}&local=${fLocal}&saldo=${filtro}`);if(requisicao!==saldoRequest.current)return;setTotal(j.total); setLinhas(j.produtos); setResumo(j.resumo); setErro(""); } catch (e) { msg(e); } finally { setLoad(false); }
  }, [classificacao, q, fLocal, filtro,recorteQuery,page]);
  useEffect(()=>setPage(1),[recorteQuery,classificacao,q,fLocal,filtro]);
  useEffect(() => { if (aba !== "SALDOS") return; const t = setTimeout(() => void carregarSaldos(), 250); return () => clearTimeout(t); }, [aba, carregarSaldos]);
  async function abrirProduto(p: Linha) { setDet({ p, d: null }); try { setDet({ p, d: await api("/api/estoque?produto=" + p.produto_id) }); } catch (e) { msg(e); setDet(null); } }

  /* ---------------- Movimentar ---------------- */
  const vazio = { tipo: "ENTRADA" as TipoMov, produtoId: "", unidade: "", quantidade: "", localOrigem: "", localDestino: "", pedido: "", of: "", documento: "", motivo: "", observacao: "", sinal: 1 as 1 | -1, baixarReserva: false, codigo: "", filtroProd: "" };
  const [f, setF] = useState(vazio); const rid = useRef(uuid()); const [busy, setBusy] = useState(false);
  const prod = prods.find((p) => p.id === f.produtoId);
  const un = prod?.unidades.find((u) => u.unidade === (f.unidade || prod.unidade_base));
  const fracionavel = unidades.find((u) => u.codigo === prod?.unidade_base)?.fracionavel ?? false;
  const preview = prod && un && Number(f.quantidade.replace(",", ".")) > 0 ? converterParaBase(Number(f.quantidade.replace(",", ".")), un.fator, fracionavel) : null;
  useEffect(() => { if (tiposPermitidos.length && !tiposPermitidos.includes(f.tipo)) setF((x) => ({ ...x, tipo: tiposPermitidos[0] })); }, [tiposPermitidos.join(","), f.tipo]); // eslint-disable-line
  async function ler(codigo: string) {
    if (!codigo.trim()) return;
    try { const j = await api("/api/estoque?codigo=" + encodeURIComponent(codigo.trim())); if (!j.encontrado) { msg(new Error("Código não encontrado no cadastro.")); return; } setErro(""); setF((x) => ({ ...x, produtoId: j.encontrado.produto_id, unidade: j.encontrado.unidade, codigo: "" })); } catch (e) { msg(e); }
  }
  const t = f.tipo;
  const precisaOrigem = ["SAIDA", "TRANSFERENCIA", "RESERVA", "LIBERA_RESERVA", "BLOQUEIO", "DESBLOQUEIO"].includes(t) || t === "AJUSTE";
  const precisaDestino = t === "ENTRADA" || t === "TRANSFERENCIA";
  async function enviar() {
    setBusy(true);
    try {
      const j = await post("/api/estoque/movimentos", { tipo: t, produtoId: f.produtoId, unidade: f.unidade || undefined, quantidade: f.quantidade, localOrigem: f.localOrigem, localDestino: f.localDestino, pedido: f.pedido, of: f.of, documento: f.documento, motivo: f.motivo, observacao: f.observacao, sinal: f.sinal, baixarReserva: f.baixarReserva, requestId: rid.current });
      sucesso(j.duplicado ? "Movimento já registrado (duplicidade ignorada)." : `${ROTULO_MOV[t]} registrada: ${n(j.quantidadeBase)} ${prod?.unidade_base}.`);
      rid.current = uuid(); setF((x) => ({ ...vazio, tipo: x.tipo, produtoId: x.produtoId, unidade: x.unidade }));
    } catch (e) { msg(e); } finally { setBusy(false); }
  }

  /* ---------------- Histórico ---------------- */
  const [hq, setHq] = useState(""); const [hTipo, setHTipo] = useState(""); const [hPedido, setHPedido] = useState(""); const [hDe, setHDe] = useState(""); const [hAte, setHAte] = useState(""); const [movs, setMovs] = useState<Mov[]>([]);
  const carregarMovs = useCallback(async () => { try { const j = await api(`/api/estoque/movimentos?q=${encodeURIComponent(hq)}&tipo=${hTipo}&pedido=${encodeURIComponent(hPedido)}&de=${hDe}&ate=${hAte}`); setMovs(j.movimentos); setErro(""); } catch (e) { msg(e); } }, [hq, hTipo, hPedido, hDe, hAte]);
  useEffect(() => { if (aba !== "HISTORICO") return; const t2 = setTimeout(() => void carregarMovs(), 250); return () => clearTimeout(t2); }, [aba, carregarMovs]);

  /* ---------------- Cadastros ---------------- */
  const [np, setNp] = useState({ codigo: "", descricao: "", unidadeBase: "UN", estoqueMinimo: "", codigoBarras: "" });
  const [nu, setNu] = useState({ produtoId: "", unidade: "CX", fator: "", codigoBarras: "" });
  const [nl, setNl] = useState({ codigo: "", descricao: "" });
  const [cq, setCq] = useState("");
  const cad = async (corpo: object, texto: string, limpar?: () => void) => { try { const j = await post("/api/estoque/cadastros", corpo); sucesso(j.aviso ? `${texto} ${j.criados} novo(s) de ${j.analisados} código(s) da programação. ${j.aviso}` : texto); limpar?.(); await carregarCad(); } catch (e) { msg(e); } };
  const patchCad = async (corpo: object) => { try { await api("/api/estoque/cadastros", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }); sucesso("Atualizado."); await carregarCad(); } catch (e) { msg(e); } };

  /* ---------------- Inventário ---------------- */
  const [invs, setInvs] = useState<Inv[]>([]); const [idet, setIdet] = useState<InvDet | null>(null); const [contagem, setContagem] = useState<Record<string, string>>({});
  const [ni, setNi] = useState({ tipo: "LOCAL", localId: "", observacao: "" }); const [add, setAdd] = useState({ produtoId: "", localId: "" });
  const carregarInv = useCallback(async () => { try { setInvs((await api("/api/estoque/inventarios")).inventarios); } catch (e) { msg(e); } }, []);
  useEffect(() => { if (aba === "INVENTARIO") void carregarInv(); }, [aba, carregarInv]);
  const abrirInv = async (id: string) => { try { setIdet(await api("/api/estoque/inventarios?id=" + id)); } catch (e) { msg(e); } };
  const acaoInv = async (corpo: Record<string, unknown>, texto: string) => { try { const j = await post("/api/estoque/inventarios", corpo); sucesso(j.ajustados !== undefined ? `${texto} ${j.ajustados} ajuste(s) aplicado(s).` : texto); await carregarInv(); const id = (corpo.inventarioId as string) || j.id; if (id && corpo.acao !== "CANCELAR") await abrirInv(id); else setIdet(null); } catch (e) { msg(e); if (idet) await abrirInv(idet.inventario.id); } };
  const podeContar = PERFIS_CONTAGEM.includes(perfil as never), podeConferir = PERFIS_CONFERENCIA.includes(perfil as never);
  const prodsFiltrados = useMemo(() => prods.filter((p) => !cq || (p.codigo + " " + p.descricao + " " + p.unidades.map((u) => u.codigo_barras || "").join(" ")).toLowerCase().includes(cq.toLowerCase())), [prods, cq]);
  const listaSelProd = useMemo(() => prodsAtivos.filter((p) => !f.filtroProd || (p.codigo + " " + p.descricao).toLowerCase().includes(f.filtroProd.toLowerCase())).slice(0, 200), [prodsAtivos, f.filtroProd]);

  return <div className="cart-page"><EstoqueCiclo/>
    <header className="cart-hero"><span>ESTOQUE · EXPEDIÇÃO · PCP</span><h1>Estoque e Inventário</h1>
      <p>Saldo físico, disponível, reservado e bloqueado por produto e local, com histórico auditável de cada movimento, conversão de unidades e inventário com contagem e conferência. Nada é movimentado automaticamente.</p></header>
    {erro && <p role="alert" className="cart-msg err">{erro}</p>}
    {ok && <p role="status" className="cart-msg info">{ok}</p>}
    <nav className="cart-tabs" aria-label="Estoque">{([["SALDOS", "Saldos"], ["MOVIMENTAR", "Movimentar"], ["HISTORICO", "Histórico"], ["CADASTROS", "Cadastros"], ["INVENTARIO", "Inventário"]] as const).map(([k, t2]) => <button key={k} className={aba === k ? "active" : ""} onClick={() => { setAba(k); setOk(""); setErro(""); }}>{t2}</button>)}</nav>

    {aba === "SALDOS" && <>
      <label>Tipo de material<select value={classificacao} onChange={e=>setClassificacao(e.target.value)}><option value="">Todos</option><option value="INSUMO">Insumos</option><option value="SEMIACABADO">Semiacabados</option><option value="ACABADO">Acabados</option><option value="NAO_CLASSIFICADO">A classificar</option></select></label>
      {resumo && <section className="cart-kpis">
        <button className="cart-kpi" onClick={() => setFiltro("")}><small>Produtos ativos</small><strong>{resumo.produtosAtivos}</strong><em>{resumo.comSaldo} com saldo</em></button>
        <button className="cart-kpi warn" onClick={() => setFiltro("abaixo-minimo")}><small>Abaixo do mínimo</small><strong>{resumo.abaixoMinimo}</strong><em>disponível menor que o mínimo</em></button>
        <button className="cart-kpi" onClick={() => setFiltro("reservado")}><small>Com reserva</small><strong>{resumo.comReserva}</strong><em>comprometidos com pedidos</em></button>
        <button className="cart-kpi bad" onClick={() => setFiltro("bloqueado")}><small>Com bloqueio</small><strong>{resumo.comBloqueio}</strong><em>indisponíveis para uso</em></button>
      </section>}
      <section className="cart-panel">
        <div className="cart-filters">
          <label>Pesquisar<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código, descrição ou código de barras" /></label>
          <label>Local<select value={fLocal} onChange={(e) => setFLocal(e.target.value)}><option value="">Todos</option>{locaisAtivos.map((l) => <option key={l.id} value={l.id}>{l.codigo}</option>)}</select></label>
          <label>Situação<select value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="">Todos</option><option value="com-saldo">Com saldo</option><option value="abaixo-minimo">Abaixo do mínimo</option><option value="reservado">Com reserva</option><option value="bloqueado">Com bloqueio</option></select></label>
        </div>
        <div className="cart-actions" style={{ marginBottom: 10 }}><button className="cart-btn" onClick={() => void carregarSaldos()} disabled={load}><RefreshCw size={16} /> {load ? "Atualizando…" : "Atualizar"}</button></div>
        <div className="cart-wrap"><table className="cart-table stack"><thead><tr><th>Produto</th><th>Un.</th><th className="num">Físico</th><th className="num">Reservado</th><th className="num">Bloqueado</th><th className="num">Disponível</th><th className="num">Mínimo</th><th className="num">Locais</th></tr></thead>
          <tbody>{!linhas.length ? <tr><td colSpan={8} className="cart-empty" data-label="">{load ? "Carregando…" : prods.length ? "Nenhum produto corresponde ao filtro." : "Nenhum produto cadastrado. Use Cadastros para criar produtos ou importar os códigos da programação."}</td></tr> : linhas.map((l) => <tr key={l.produto_id} className="clickable" onClick={() => void abrirProduto(l)}>
            <td data-label="Produto"><b>{l.codigo}</b><small>{l.descricao}</small></td><td data-label="Un.">{l.unidade_base}</td><td className="num" data-label="Físico">{n(l.fisico)}</td><td className="num" data-label="Reservado">{n(l.reservado)}</td><td className="num" data-label="Bloqueado">{n(l.bloqueado)}</td>
            <td className="num" data-label="Disponível"><b>{n(l.disponivel)}</b>{l.estoque_minimo > 0 && l.disponivel < l.estoque_minimo && <small style={{ color: "var(--warning)" }}>abaixo do mínimo</small>}</td><td className="num" data-label="Mínimo">{n(l.estoque_minimo)}</td><td className="num" data-label="Locais">{l.locais}</td></tr>)}</tbody></table></div>
        <div><button disabled={page===1||load} onClick={()=>setPage(p=>p-1)}>Anterior</button> Página {page} · {total} produtos <button disabled={load||page*50>=total} onClick={()=>setPage(p=>p+1)}>Próxima</button></div><p className="cart-note">Disponível = físico − reservado − bloqueado. Quantidades na unidade base de cada produto; produtos com unidades diferentes não são somados.</p>
      </section></>}

    {aba === "MOVIMENTAR" && <section className="cart-panel">
      <header><div><h2>Registrar movimento</h2><p>Entrada, saída, transferência, ajuste, reserva e bloqueio. Cada lançamento fica no histórico com responsável e data.</p></div></header>
      {!tiposPermitidos.length ? <p className="cart-msg info">Seu perfil só consulta o estoque.</p> : <>
        <div className="cart-filters">
          <label>Tipo<select value={t} onChange={(e) => setF({ ...f, tipo: e.target.value as TipoMov })}>{tiposPermitidos.map((x) => <option key={x} value={x}>{ROTULO_MOV[x]}</option>)}</select></label>
          <label>Ler código de barras / código<input value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") void ler(f.codigo); }} placeholder="Bipe ou digite e tecle Enter" /></label>
          <label>Filtrar produto<input value={f.filtroProd} onChange={(e) => setF({ ...f, filtroProd: e.target.value })} placeholder="Código ou descrição" /></label>
          <label>Produto<select value={f.produtoId} onChange={(e) => setF({ ...f, produtoId: e.target.value, unidade: "" })}><option value="">Selecione…</option>{listaSelProd.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.descricao}</option>)}</select></label>
          {t === "AJUSTE" && <label>Sentido do ajuste<select value={f.sinal} onChange={(e) => setF({ ...f, sinal: Number(e.target.value) === -1 ? -1 : 1 })}><option value={1}>Acrescentar ao saldo (+)</option><option value={-1}>Reduzir do saldo (−)</option></select></label>}
          {precisaOrigem && <label>{t === "TRANSFERENCIA" || t === "SAIDA" ? "Local de origem" : "Local"}<select value={f.localOrigem} onChange={(e) => setF({ ...f, localOrigem: e.target.value })}><option value="">Selecione…</option>{locaisAtivos.map((l) => <option key={l.id} value={l.id}>{l.codigo}</option>)}</select></label>}
          {precisaDestino && <label>Local de destino<select value={f.localDestino} onChange={(e) => setF({ ...f, localDestino: e.target.value })}><option value="">Selecione…</option>{locaisAtivos.map((l) => <option key={l.id} value={l.id}>{l.codigo}</option>)}</select></label>}
          <label>Unidade<select value={f.unidade || prod?.unidade_base || ""} onChange={(e) => setF({ ...f, unidade: e.target.value })} disabled={!prod}>{(prod?.unidades || []).map((u) => <option key={u.unidade} value={u.unidade}>{u.unidade}{u.fator !== 1 ? ` (= ${n(u.fator)} ${prod?.unidade_base})` : ""}</option>)}</select></label>
          <label>Quantidade<input inputMode="decimal" value={f.quantidade} onChange={(e) => setF({ ...f, quantidade: e.target.value })} placeholder="0" /></label>
          {["RESERVA", "LIBERA_RESERVA", "SAIDA", "ENTRADA"].includes(t) && <label>Pedido{t === "RESERVA" || t === "LIBERA_RESERVA" ? " *" : ""}<input value={f.pedido} onChange={(e) => setF({ ...f, pedido: e.target.value })} inputMode="numeric" /></label>}
          {["RESERVA", "SAIDA", "ENTRADA"].includes(t) && <label>OF<input value={f.of} onChange={(e) => setF({ ...f, of: e.target.value })} /></label>}
          {["ENTRADA", "SAIDA", "TRANSFERENCIA"].includes(t) && <label>Documento (NF / romaneio)<input value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })} /></label>}
          {["AJUSTE", "BLOQUEIO", "DESBLOQUEIO", "SAIDA"].includes(t) && <label>Motivo{t === "SAIDA" ? "" : " *"}<input value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} maxLength={200} /></label>}
          <label>Observação<input value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} maxLength={500} /></label>
        </div>
        {t === "SAIDA" && <div className="cart-checks"><label><input type="checkbox" checked={f.baixarReserva} onChange={(e) => setF({ ...f, baixarReserva: e.target.checked })} /> Baixar a reserva do pedido informado (expedição de item reservado)</label></div>}
        {preview && (preview.ok ? <p className="cart-note">= <b>{n(preview.base)} {prod?.unidade_base}</b> na unidade base{un && un.fator !== 1 ? ` (${f.quantidade} ${un.unidade} × ${n(un.fator)})` : ""}.</p> : <p className="cart-msg err">{preview.erro}</p>)}
        <div className="cart-actions"><button className="cart-btn primary" disabled={busy || !f.produtoId || !f.quantidade || (preview ? !preview.ok : true)} onClick={() => void enviar()}>{busy ? "Registrando…" : "Registrar " + ROTULO_MOV[t].toLowerCase()}</button></div></>}
    </section>}

    {aba === "HISTORICO" && <section className="cart-panel">
      <header><div><h2>Histórico de movimentos</h2><p>Registro auditável: não pode ser editado nem apagado. Últimos 300 resultados do filtro.</p></div></header>
      <div className="cart-filters">
        <label>Pesquisar<input value={hq} onChange={(e) => setHq(e.target.value)} placeholder="Produto, documento ou usuário" /></label>
        <label>Tipo<select value={hTipo} onChange={(e) => setHTipo(e.target.value)}><option value="">Todos</option>{TIPOS_MOV.map((x) => <option key={x} value={x}>{ROTULO_MOV[x]}</option>)}</select></label>
        <label>Pedido<input value={hPedido} onChange={(e) => setHPedido(e.target.value)} inputMode="numeric" /></label>
        <label>De<input type="date" value={hDe} onChange={(e) => setHDe(e.target.value)} /></label><label>Até<input type="date" value={hAte} onChange={(e) => setHAte(e.target.value)} /></label>
      </div>
      <div className="cart-wrap"><table className="cart-table stack"><thead><tr><th>Data / hora</th><th>Movimento</th><th>Produto</th><th className="num">Quantidade</th><th>Local</th><th>Referência</th><th>Responsável</th></tr></thead>
        <tbody>{!movs.length ? <tr><td colSpan={7} className="cart-empty" data-label="">Nenhum movimento encontrado.</td></tr> : movs.map((m) => <tr key={m.id}>
          <td data-label="Data / hora">{dh(m.criado_em)}</td><td data-label="Movimento">{ROTULO_MOV[m.tipo]}{m.tipo === "AJUSTE" ? (m.sinal === -1 ? " (−)" : " (+)") : ""}</td><td data-label="Produto"><b>{m.codigo}</b><small>{m.descricao}</small></td>
          <td className="num" data-label="Quantidade">{n(m.quantidade_base)} {m.unidade_base}{m.unidade_informada !== m.unidade_base && m.unidade_informada !== "BASE" && <small>{n(m.quantidade_informada)} {m.unidade_informada}</small>}</td>
          <td data-label="Local">{[m.origem, m.destino].filter(Boolean).join(" → ") || "—"}</td><td data-label="Referência">{[m.documento, m.pedido && "Ped. " + m.pedido, m.motivo].filter(Boolean).join(" · ") || "—"}</td><td data-label="Responsável">{m.usuario}</td></tr>)}</tbody></table></div>
    </section>}

    {aba === "CADASTROS" && <>
      {podeCad && <section className="cart-panel"><header><div><h2>Novo produto</h2><p>O código é único. A unidade base define se o produto aceita fração.</p></div>
        <button className="cart-btn sm" onClick={() => void cad({ tipo: "IMPORTAR_PCP" }, "Importação concluída:")}>Importar códigos da programação</button></header>
        <div className="cart-filters">
          <label>Código *<input value={np.codigo} onChange={(e) => setNp({ ...np, codigo: e.target.value })} maxLength={60} /></label>
          <label>Descrição<input value={np.descricao} onChange={(e) => setNp({ ...np, descricao: e.target.value })} maxLength={240} /></label>
          <label>Unidade base<select value={np.unidadeBase} onChange={(e) => setNp({ ...np, unidadeBase: e.target.value })}>{unidades.map((u) => <option key={u.codigo} value={u.codigo}>{u.codigo} — {u.descricao}{u.fracionavel ? " (fração)" : ""}</option>)}</select></label>
          <label>Estoque mínimo<input inputMode="decimal" value={np.estoqueMinimo} onChange={(e) => setNp({ ...np, estoqueMinimo: e.target.value })} /></label>
          <label>Código de barras (unidade base)<input value={np.codigoBarras} onChange={(e) => setNp({ ...np, codigoBarras: e.target.value })} maxLength={64} /></label></div>
        <div className="cart-actions"><button className="cart-btn primary" disabled={!np.codigo.trim()} onClick={() => void cad({ tipo: "PRODUTO", ...np }, "Produto cadastrado.", () => setNp({ codigo: "", descricao: "", unidadeBase: "UN", estoqueMinimo: "", codigoBarras: "" }))}>Cadastrar produto</button></div></section>}
      {podeCad && <section className="cart-panel"><header><div><h2>Unidade alternativa e código de barras</h2><p>Ex.: 1 CX = 12 UN. O saldo é sempre guardado na unidade base; o fator converte a quantidade informada.</p></div></header>
        <div className="cart-filters">
          <label>Produto<select value={nu.produtoId} onChange={(e) => setNu({ ...nu, produtoId: e.target.value })}><option value="">Selecione…</option>{prodsAtivos.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.descricao}</option>)}</select></label>
          <label>Unidade<select value={nu.unidade} onChange={(e) => setNu({ ...nu, unidade: e.target.value })}>{unidades.map((u) => <option key={u.codigo} value={u.codigo}>{u.codigo}</option>)}</select></label>
          <label>Fator (qtd. na unidade base)<input inputMode="decimal" value={nu.fator} onChange={(e) => setNu({ ...nu, fator: e.target.value })} /></label>
          <label>Código de barras<input value={nu.codigoBarras} onChange={(e) => setNu({ ...nu, codigoBarras: e.target.value })} maxLength={64} /></label></div>
        <div className="cart-actions"><button className="cart-btn primary" disabled={!nu.produtoId || !nu.fator} onClick={() => void cad({ tipo: "UNIDADE_PRODUTO", ...nu, fator: Number(nu.fator.replace(",", ".")) }, "Unidade salva.", () => setNu({ ...nu, fator: "", codigoBarras: "" }))}>Salvar unidade</button></div></section>}
      {podeCad && <section className="cart-panel"><header><div><h2>Locais de estoque</h2></div></header>
        <div className="cart-filters"><label>Código *<input value={nl.codigo} onChange={(e) => setNl({ ...nl, codigo: e.target.value })} maxLength={40} /></label><label>Descrição<input value={nl.descricao} onChange={(e) => setNl({ ...nl, descricao: e.target.value })} maxLength={160} /></label></div>
        <div className="cart-actions" style={{ marginBottom: 10 }}><button className="cart-btn primary" disabled={!nl.codigo.trim()} onClick={() => void cad({ tipo: "LOCAL", ...nl }, "Local cadastrado.", () => setNl({ codigo: "", descricao: "" }))}>Cadastrar local</button></div>
        <div className="cart-wrap"><table className="cart-table stack" style={{ minWidth: 420 }}><thead><tr><th>Local</th><th>Descrição</th><th>Situação</th><th></th></tr></thead><tbody>{locais.map((l) => <tr key={l.id}><td data-label="Local"><b>{l.codigo}</b></td><td data-label="Descrição">{l.descricao || "—"}</td><td data-label="Situação">{l.ativo ? "Ativo" : "Inativo"}</td><td data-label=""><button className="cart-btn sm" onClick={() => void patchCad({ tipo: "LOCAL", id: l.id, ativo: !l.ativo })}>{l.ativo ? "Inativar" : "Reativar"}</button></td></tr>)}{!locais.length && <tr><td colSpan={4} className="cart-empty" data-label="">Nenhum local cadastrado.</td></tr>}</tbody></table></div></section>}
      <section className="cart-panel"><header><div><h2>Produtos ({prods.length})</h2></div></header>
        <div className="cart-filters"><label>Pesquisar<input value={cq} onChange={(e) => setCq(e.target.value)} placeholder="Código, descrição ou código de barras" /></label></div>
        <div className="cart-wrap"><table className="cart-table stack"><thead><tr><th>Produto</th><th>Unidade base</th><th>Conversões / códigos de barras</th><th className="num">Mínimo</th><th>Origem</th><th></th></tr></thead>
          <tbody>{!prodsFiltrados.length ? <tr><td colSpan={6} className="cart-empty" data-label="">Nenhum produto.</td></tr> : prodsFiltrados.slice(0, 300).map((p) => <tr key={p.id}><td data-label="Produto"><b>{p.codigo}</b><small>{p.descricao}{p.ativo ? "" : " · INATIVO"}</small></td><td data-label="Unidade base">{p.unidade_base}</td>
            <td data-label="Conversões" style={{ textAlign: "left" }}>{p.unidades.map((u) => <div key={u.unidade}><small>{u.unidade}{u.fator !== 1 ? ` = ${n(u.fator)} ${p.unidade_base}` : ""}{u.codigo_barras ? " · " + u.codigo_barras : ""}</small></div>)}</td><td className="num" data-label="Mínimo">{podeCad ? <input className="ap-qty" inputMode="decimal" defaultValue={p.estoque_minimo} aria-label={"Mínimo de " + p.codigo} onBlur={(e) => { const v = Number(e.target.value.replace(",", ".")); if (Number.isFinite(v) && v !== p.estoque_minimo) void patchCad({ tipo: "PRODUTO", id: p.id, estoqueMinimo: v }); }} /> : n(p.estoque_minimo)}</td>
            <td data-label="Origem">{p.origem === "PCP" ? "Programação" : "Manual"}</td><td data-label="">{podeCad && <button className="cart-btn sm" onClick={() => void patchCad({ tipo: "PRODUTO", id: p.id, ativo: !p.ativo })}>{p.ativo ? "Inativar" : "Reativar"}</button>}</td></tr>)}</tbody></table></div>
        {prodsFiltrados.length > 300 && <p className="cart-note">Mostrando 300 de {prodsFiltrados.length}. Refine a pesquisa.</p>}</section></>}

    {aba === "INVENTARIO" && <>
      {podeContar && <section className="cart-panel"><header><div><h2>Abrir inventário</h2><p>O inventário congela as movimentações dos itens listados até ser fechado ou cancelado. Ao fechar, as divergências conferidas viram ajustes no histórico.</p></div></header>
        <div className="cart-filters"><label>Tipo<select value={ni.tipo} onChange={(e) => setNi({ ...ni, tipo: e.target.value })}><option value="LOCAL">Por localização</option><option value="GERAL">Geral (todos os locais)</option></select></label>
          {ni.tipo === "LOCAL" && <label>Local<select value={ni.localId} onChange={(e) => setNi({ ...ni, localId: e.target.value })}><option value="">Selecione…</option>{locaisAtivos.map((l) => <option key={l.id} value={l.id}>{l.codigo}</option>)}</select></label>}
          <label>Observação<input value={ni.observacao} onChange={(e) => setNi({ ...ni, observacao: e.target.value })} maxLength={300} /></label></div>
        <div className="cart-actions"><button className="cart-btn primary" disabled={ni.tipo === "LOCAL" && !ni.localId} onClick={() => void acaoInv({ acao: "CRIAR", ...ni }, "Inventário aberto.")}>Abrir inventário</button></div></section>}
      <section className="cart-panel"><header><div><h2>Inventários</h2></div></header>
        <div className="cart-wrap"><table className="cart-table stack" style={{ minWidth: 640 }}><thead><tr><th>Nº</th><th>Escopo</th><th>Situação</th><th className="num">Itens</th><th className="num">Contados</th><th className="num">Divergentes</th><th>Aberto por</th><th></th></tr></thead>
          <tbody>{!invs.length ? <tr><td colSpan={8} className="cart-empty" data-label="">Nenhum inventário.</td></tr> : invs.map((v) => <tr key={v.id}><td data-label="Nº"><b>{v.numero}</b></td><td data-label="Escopo">{v.tipo === "GERAL" ? "Geral" : v.local}</td><td data-label="Situação"><span className={"cart-badge " + (v.status === "FECHADO" ? "CONCLUIDO" : v.status === "CANCELADO" ? "SEM_PRAZO" : "NO_PRAZO")}>{v.status === "EM_CONTAGEM" ? "Em contagem" : v.status === "FECHADO" ? "Fechado" : "Cancelado"}</span></td><td className="num" data-label="Itens">{v.itens}</td><td className="num" data-label="Contados">{v.contados}</td><td className="num" data-label="Divergentes">{v.divergentes}</td><td data-label="Aberto por">{v.criado_por}<small>{dh(v.criado_em)}</small></td><td data-label=""><button className="cart-btn sm" onClick={() => void abrirInv(v.id)}>Abrir</button></td></tr>)}</tbody></table></div></section></>}

    {det && <div className="cart-drawer-shade" onMouseDown={(e) => { if (e.target === e.currentTarget) setDet(null); }}><aside className="cart-drawer" role="dialog" aria-label={"Produto " + det.p.codigo}>
      <header><div><h2>{det.p.codigo}</h2><p>{det.p.descricao} · unidade base {det.p.unidade_base}</p></div><button className="cart-btn sm" onClick={() => setDet(null)} aria-label="Fechar"><X size={16} /></button></header>
      <div className="cart-grid2"><div><small>Físico</small><b>{n(det.p.fisico)}</b></div><div><small>Reservado</small><b>{n(det.p.reservado)}</b></div><div><small>Bloqueado</small><b>{n(det.p.bloqueado)}</b></div><div><small>Disponível</small><b>{n(det.p.disponivel)}</b></div></div>
      {!det.d ? <p className="cart-note">Carregando…</p> : <>
        <div><h3>Por local</h3><div className="cart-wrap"><table className="cart-table stack" style={{ minWidth: 420 }}><thead><tr><th>Local</th><th className="num">Físico</th><th className="num">Reserv.</th><th className="num">Bloq.</th><th className="num">Disp.</th></tr></thead><tbody>{det.d.porLocal.length ? det.d.porLocal.map((l: any) => <tr key={l.local}><td data-label="Local"><b>{l.local}</b></td><td className="num" data-label="Físico">{n(l.fisico)}</td><td className="num" data-label="Reserv.">{n(l.reservado)}</td><td className="num" data-label="Bloq.">{n(l.bloqueado)}</td><td className="num" data-label="Disp.">{n(l.disponivel)}</td></tr>) : <tr><td colSpan={5} className="cart-empty" data-label="">Sem saldo em nenhum local.</td></tr>}</tbody></table></div></div>
        <div><h3>Reservas por pedido</h3>{det.d.reservasPorPedido.length ? <ul className="cart-hist">{det.d.reservasPorPedido.map((r: any) => <li key={r.pedido + r.local}>Pedido <b>{r.pedido}</b> · {r.local} · {n(r.reservado)}</li>)}</ul> : <p className="cart-note">Nenhuma reserva ativa.</p>}</div>
        <div><h3>Últimos movimentos</h3>{det.d.ultimos.length ? <ul className="cart-hist">{det.d.ultimos.map((m: any) => <li key={m.id}><b>{ROTULO_MOV[m.tipo as TipoMov]}{m.tipo === "AJUSTE" ? (m.sinal === -1 ? " (−)" : " (+)") : ""} {n(m.quantidade_base)}</b> · {[m.origem, m.destino].filter(Boolean).join(" → ")} · {m.usuario} · <small>{dh(m.criado_em)}{m.documento ? " · " + m.documento : ""}</small></li>)}</ul> : <p className="cart-note">Sem movimentos.</p>}</div></>}
    </aside></div>}

    {idet && <div className="cart-drawer-shade" onMouseDown={(e) => { if (e.target === e.currentTarget) setIdet(null); }}><aside className="cart-drawer" style={{ width: "min(960px,100%)" }} role="dialog" aria-label={"Inventário " + idet.inventario.numero}>
      <header><div><h2>Inventário nº {idet.inventario.numero}</h2><p>{idet.inventario.tipo === "GERAL" ? "Geral" : "Local " + idet.inventario.local} · {idet.inventario.status === "EM_CONTAGEM" ? "em contagem" : idet.inventario.status.toLowerCase()}</p></div><button className="cart-btn sm" onClick={() => setIdet(null)} aria-label="Fechar"><X size={16} /></button></header>
      <p className="cart-note">Contagem na unidade base do produto. Divergências precisam de conferência (PCP/Gerente) antes do fechamento. Itens não contados bloqueiam o fechamento.</p>
      <div className="cart-wrap"><table className="cart-table stack" style={{ minWidth: 760 }}><thead><tr><th>Produto</th><th>Local</th><th className="num">Sistema</th><th className="num">Contado</th><th className="num">Diferença</th><th>Situação</th><th>Ação</th></tr></thead>
        <tbody>{idet.itens.map((i) => { const aberto = idet.inventario.status === "EM_CONTAGEM"; return <tr key={i.id}>
          <td data-label="Produto"><b>{i.codigo}</b><small>{i.descricao}</small></td><td data-label="Local">{i.local}</td><td className="num" data-label="Sistema">{n(i.saldo_sistema)} {i.unidade_base}</td>
          <td className="num" data-label="Contado">{aberto && podeContar ? <input className="ap-qty" inputMode="decimal" value={contagem[i.id] ?? (i.contado === null ? "" : String(i.contado))} onChange={(e) => setContagem((x) => ({ ...x, [i.id]: e.target.value }))} aria-label={"Contagem de " + i.codigo} /> : n(i.contado)}</td>
          <td className="num" data-label="Diferença" style={{ color: i.divergencia ? "var(--danger)" : undefined }}>{i.divergencia === null ? "—" : (i.divergencia > 0 ? "+" : "") + n(i.divergencia)}</td>
          <td data-label="Situação">{i.contado === null ? "Não contado" : i.divergencia === 0 ? "Confere" : i.conferido ? "Divergência conferida" : "Divergência a conferir"}{i.ajustado && <small>ajustado</small>}</td>
          <td data-label="Ação"><div className="ap-actions">{aberto && podeContar && <button className="cart-btn sm primary" disabled={contagem[i.id] === undefined || contagem[i.id] === ""} onClick={() => void acaoInv({ acao: "CONTAR", inventarioId: idet.inventario.id, itemId: i.id, quantidade: contagem[i.id] }, "Contagem registrada.").then(() => setContagem((x) => { const c = { ...x }; delete c[i.id]; return c; }))}>Contar</button>}
            {aberto && podeConferir && i.divergencia !== null && i.divergencia !== 0 && !i.conferido && <button className="cart-btn sm" onClick={() => void acaoInv({ acao: "CONFERIR", inventarioId: idet.inventario.id, itemId: i.id }, "Divergência conferida.")}>Conferir</button>}</div></td></tr>; })}
          {!idet.itens.length && <tr><td colSpan={7} className="cart-empty" data-label="">Nenhum item. Adicione produtos abaixo.</td></tr>}</tbody></table></div>
      {idet.inventario.status === "EM_CONTAGEM" && podeContar && <div className="cart-filters"><label>Adicionar item<select value={add.produtoId} onChange={(e) => setAdd({ ...add, produtoId: e.target.value })}><option value="">Produto…</option>{prodsAtivos.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.descricao}</option>)}</select></label>
        <label>Local<select value={add.localId} onChange={(e) => setAdd({ ...add, localId: e.target.value })}><option value="">Local…</option>{locaisAtivos.map((l) => <option key={l.id} value={l.id}>{l.codigo}</option>)}</select></label>
        <label>&nbsp;<button className="cart-btn" disabled={!add.produtoId || !add.localId} onClick={() => void acaoInv({ acao: "ADICIONAR_ITEM", inventarioId: idet.inventario.id, ...add }, "Item adicionado.")}>Adicionar</button></label></div>}
      {idet.inventario.status === "EM_CONTAGEM" && podeConferir && <div className="cart-actions">
        <button className="cart-btn primary" disabled={!idet.fechamento.ok} onClick={() => void acaoInv({ acao: "FECHAR", inventarioId: idet.inventario.id }, "Inventário fechado.")}>Fechar e aplicar {idet.fechamento.ajustes} ajuste(s)</button>
        <button className="cart-btn danger" onClick={() => { if (confirm("Cancelar este inventário? Nenhum ajuste será aplicado.")) void acaoInv({ acao: "CANCELAR", inventarioId: idet.inventario.id }, "Inventário cancelado."); }}>Cancelar inventário</button>
        {!idet.fechamento.ok && <span className="cart-note" style={{ alignSelf: "center" }}>{idet.fechamento.naoContados} sem contagem · {idet.fechamento.divergentesSemConferencia} divergência(s) sem conferência</span>}</div>}
    </aside></div>}
  </div>;
}

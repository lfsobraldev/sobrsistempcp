"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, DataTable, Drawer, Empty, Field, Kpi, PageHeader, Panel, Segmented, type Tone } from "@/components/ui";
import { useOps } from "@/components/operational-provider";

type Row = Record<string, any>;
type Aba = "MAPA" | "LOCALIZADOR" | "RASTRO";
const dt = (v: unknown) => (v ? new Date(String(v)).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const tomTipo: Record<string, Tone> = { PALLET: "info", SOBRA: "warning", ESTOQUE: "success" };

async function api(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na operação.");
  return j;
}

export default function MapaFabricaPage() {
  const { me } = useOps();
  const pode = ["PCP", "GERENTE", "ENCARREGADO", "LOGISTICA"].includes(me?.perfil || "");
  const [aba, setAba] = useState<Aba>("MAPA");
  const [erro, setErro] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);
  const [fab, setFab] = useState<Row | null>(null);
  const [sel, setSel] = useState<Row | null>(null);
  const [setorSel, setSetorSel] = useState("TODOS");
  const [busca, setBusca] = useState(""); const [achados, setAchados] = useState<Row[]>([]);
  const [pedido, setPedido] = useState(""); const [rastro, setRastro] = useState<Row | null>(null);
  const [leit, setLeit] = useState({ pedido: "", peca: "", setor: "", evento: "ENTRADA", quantidade: "1", obs: "" });

  const carregar = useCallback(async () => {
    try {
      if (aba === "MAPA") setFab(await api("/api/wms?visao=fabrica"));
      if (aba === "LOCALIZADOR") setAchados((await api("/api/wms?visao=localizador&busca=" + encodeURIComponent(busca))).itens);
      if (aba === "RASTRO") setRastro(await api("/api/wms?visao=rastro&pedido=" + encodeURIComponent(pedido)));
      setErro("");
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao carregar."); }
  }, [aba, busca, pedido]);
  useEffect(() => { const t = setTimeout(carregar, aba === "LOCALIZADOR" ? 250 : 0); return () => clearTimeout(t); }, [carregar, aba]);

  const itensPorEnd = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const i of fab?.itens ?? []) { const l = m.get(i.endereco_id) ?? []; l.push(i); m.set(i.endereco_id, l); }
    return m;
  }, [fab]);

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true); setErro(""); setOk("");
    try { await fn(); setOk(msg); await carregar(); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } finally { setBusy(false); }
  };

  const classe = (p: Row) => {
    const its = itensPorEnd.get(p.id) ?? [];
    if (p.bloqueado) return "bloq";
    const velho = its.some((i) => Number(i.dias) > 30) ? " velho" : "";
    if (!its.length) return "vazio";
    const cheio = p.capacidade_pallets != null && Number(p.pallets) >= Number(p.capacidade_pallets);
    return (cheio ? "cheio" : "ocupado") + velho;
  };

  const posicoesDoSetor = (cod: string) => (fab?.posicoes ?? []).filter((p: Row) => p.setor === cod);
  const totalItens = fab?.itens?.length ?? 0;
  const velhos = (fab?.itens ?? []).filter((i: Row) => Number(i.dias) > 30).length;

  return (
    <div className="page">
      <PageHeader eyebrow="Chão de fábrica" title="Mapa da fábrica" description="Onde está cada pallet, sobra e item de estoque, e por onde cada peça passou." />
      <Segmented value={aba} onChange={setAba} options={[{ value: "MAPA", label: "Mapa" }, { value: "LOCALIZADOR", label: "Localizador" }, { value: "RASTRO", label: "Rastro por pedido" }]} />
      {erro && <p className="error" role="alert">{erro}</p>}
      {ok && <p className="success" role="status">{ok}</p>}

      {aba === "MAPA" && fab && (<>
        <div className="kpis">
          <Kpi label="Itens com endereço" value={totalItens} />
          <Kpi label="Sem endereço" value={fab.semEndereco.length} tone={fab.semEndereco.length ? "danger" : "success"} sub="meta: zero" />
          <Kpi label="Parados há mais de 30 dias" value={velhos} tone={velhos ? "warn" : "success"} sub="contorno laranja no mapa" />
        </div>
        {fab.semEndereco.length > 0 && (
          <Panel title="Sem endereço" subtitle="Peças que existem no sistema, mas ninguém sabe onde estão. Aloque em Pallets ou Sobras no WMS.">
            <DataTable head={["Tipo", "Código", "Descrição", "Pedido", "Qtd", "Desde"]}>
              {fab.semEndereco.slice(0, 50).map((i: Row) => (
                <tr key={i.tipo + i.ref}><td><Badge tone={tomTipo[i.tipo]}>{i.tipo}</Badge></td><td>{i.codigo}</td><td>{i.descricao}</td><td>{i.pedido || "—"}</td><td>{i.quantidade}</td><td>{dt(i.desde)}</td></tr>
              ))}
            </DataTable>
          </Panel>
        )}
        <div className="mf-linha">
          <Field label="Setor"><select value={setorSel} onChange={(e) => setSetorSel(e.target.value)}><option value="TODOS">Todos</option>{fab.setores.map((s: Row) => <option key={s.id} value={s.codigo}>{s.nome}</option>)}</select></Field>
        </div>
        <div className="mf-leg"><span><i style={{ background: "#f8fafc" }} />vazio</span><span><i style={{ background: "#dcfce7" }} />ocupado</span><span><i style={{ background: "#fef3c7" }} />cheio</span><span><i style={{ background: "#fee2e2" }} />bloqueado</span><span><i style={{ boxShadow: "inset 0 0 0 2px #f97316" }} />item parado &gt; 30 dias</span></div>
        {fab.setores.filter((s: Row) => setorSel === "TODOS" || s.codigo === setorSel).map((s: Row) => {
          const ps = posicoesDoSetor(s.codigo);
          const ruas = Array.from(new Set(ps.map((p: Row) => p.rua || "—"))) as string[];
          return (
            <Panel key={s.id} title={s.nome} subtitle={`${ps.length} posição(ões)`}>
              {!ps.length && <Empty title="Sem endereços neste setor" sub="Cadastre em WMS > Mapa" />}
              {ruas.map((rua) => (
                <div key={rua}>
                  {ruas.length > 1 || rua !== "—" ? <div className="mf-rua">Rua {rua}</div> : null}
                  <div className="mf-grid">
                    {ps.filter((p: Row) => (p.rua || "—") === rua).map((p: Row) => {
                      const its = itensPorEnd.get(p.id) ?? [];
                      return (
                        <button key={p.id} type="button" className={`mf-tile ${classe(p)}`} onClick={() => setSel(p)} aria-label={`Endereço ${p.codigo}, ${its.length} item(ns)`}>
                          <b>{p.codigo}</b><span>{its.length ? `${its.length} item(ns)` : "vazio"}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </Panel>
          );
        })}
        <Drawer open={!!sel} title={sel ? `Endereço ${sel.codigo}` : ""} onClose={() => setSel(null)}>
          {sel && (itensPorEnd.get(sel.id) ?? []).length === 0 && <Empty title="Posição vazia" />}
          {sel && (itensPorEnd.get(sel.id) ?? []).length > 0 && (
            <DataTable head={["Tipo", "Código", "Descrição", "Pedido", "Qtd", "Dias"]}>
              {(itensPorEnd.get(sel.id) ?? []).map((i: Row) => (
                <tr key={i.tipo + i.ref}><td><Badge tone={tomTipo[i.tipo]}>{i.tipo}</Badge></td><td>{i.codigo}</td><td>{i.descricao}</td><td>{i.pedido || "—"}</td><td>{i.quantidade}</td><td>{i.dias}</td></tr>
              ))}
            </DataTable>
          )}
        </Drawer>
      </>)}

      {aba === "LOCALIZADOR" && (<>
        <Panel title="Onde está?" subtitle="Digite pedido, código, medida, material, acabamento ou endereço.">
          <Field label="Buscar"><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="ex.: 26847, travessa, 2100, T03" autoFocus /></Field>
        </Panel>
        <DataTable head={["Tipo", "Código", "Descrição", "Pedido", "Qtd", "Onde", "Dias"]} empty={<Empty title="Nada encontrado" sub="Se a peça existe e não aparece, ela está sem endereço (aba Mapa)." />}>
          {achados.map((i) => (
            <tr key={i.tipo + i.ref}><td><Badge tone={tomTipo[i.tipo]}>{i.tipo}</Badge></td><td>{i.codigo}</td><td>{i.descricao}</td><td>{i.pedido || "—"}</td><td>{i.quantidade}</td><td><b>{i.endereco}</b> <small>{i.setor_nome}</small></td><td>{i.dias}</td></tr>
          ))}
        </DataTable>
      </>)}

      {aba === "RASTRO" && rastro && (<>
        {pode && (
          <Panel title="Registrar passagem" subtitle="Leia o QR da peça (ou digite) ao entrar e ao sair do setor. Não apague: cada leitura fica no histórico.">
            <div className="formGrid">
              <Field label="Pedido *"><input value={leit.pedido} onChange={(e) => setLeit({ ...leit, pedido: e.target.value })} /></Field>
              <Field label="Peça / código *"><input value={leit.peca} onChange={(e) => setLeit({ ...leit, peca: e.target.value })} /></Field>
              <Field label="Setor *"><select value={leit.setor} onChange={(e) => setLeit({ ...leit, setor: e.target.value })}><option value="">Selecione</option>{rastro.setores.map((s: Row) => <option key={s.codigo} value={s.codigo}>{s.nome}</option>)}</select></Field>
              <Field label="Evento"><select value={leit.evento} onChange={(e) => setLeit({ ...leit, evento: e.target.value })}><option value="ENTRADA">Entrou no setor</option><option value="SAIDA">Saiu do setor</option><option value="PROBLEMA">Problema</option></select></Field>
              <Field label="Qtd"><input inputMode="decimal" value={leit.quantidade} onChange={(e) => setLeit({ ...leit, quantidade: e.target.value })} /></Field>
              <Field label={leit.evento === "PROBLEMA" ? "Descreva o problema *" : "Observação"}><input value={leit.obs} onChange={(e) => setLeit({ ...leit, obs: e.target.value })} /></Field>
              <button className="primary" disabled={busy || !leit.pedido || !leit.peca || !leit.setor} onClick={() => run(async () => { await api("/api/wms", { acao: "RASTRO_LER", ...leit }); setLeit({ ...leit, peca: "", obs: "" }); }, "Passagem registrada.")}>Registrar</button>
            </div>
          </Panel>
        )}
        <Panel title="Consultar pedido">
          <Field label="Pedido"><input value={pedido} onChange={(e) => setPedido(e.target.value)} placeholder="ex.: 26847" /></Field>
        </Panel>
        {pedido && (<>
          <Panel title="Datas reais por setor" subtitle="Primeira entrada e última saída lidas.">
            <DataTable head={["Setor", "Início real", "Fim real", "Peças", "Problemas"]} empty={<Empty title="Sem leituras para este pedido" />}>
              {rastro.datas.map((d: Row) => <tr key={d.setor}><td>{d.setor_nome}</td><td>{dt(d.inicio_real)}</td><td>{dt(d.fim_real)}</td><td>{d.pecas}</td><td>{d.problemas ? <Badge tone="danger">{d.problemas}</Badge> : 0}</td></tr>)}
            </DataTable>
          </Panel>
          <Panel title="Onde está cada peça agora">
            <DataTable head={["Peça", "Setor", "Último evento", "Quando", "Por", "Dias parada"]} empty={<Empty title="Nenhuma peça lida" />}>
              {rastro.pecas.map((p: Row) => <tr key={p.peca}><td>{p.peca}</td><td>{p.setor_nome}</td><td><Badge tone={p.evento === "PROBLEMA" ? "danger" : p.evento === "SAIDA" ? "success" : "info"}>{p.evento}</Badge></td><td>{dt(p.em)}</td><td>{p.por}</td><td>{p.dias_parada}</td></tr>)}
            </DataTable>
          </Panel>
        </>)}
        <Panel title="Peças paradas" subtitle="Entraram num setor (ou tiveram problema) há 2 dias ou mais e não saíram.">
          <DataTable head={["Pedido", "Peça", "Setor", "Evento", "Dias", "Obs"]} empty={<Empty title="Nenhuma peça parada" />}>
            {rastro.paradas.map((p: Row) => <tr key={p.pedido + p.peca}><td>{p.pedido}</td><td>{p.peca}</td><td>{p.setor_nome}</td><td><Badge tone={p.evento === "PROBLEMA" ? "danger" : "warning"}>{p.evento}</Badge></td><td>{p.dias_parada}</td><td>{p.obs || "—"}</td></tr>)}
          </DataTable>
        </Panel>
      </>)}
    </div>
  );
}

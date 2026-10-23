"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, DataTable, Drawer, Empty, Field, Kpi, PageHeader, Panel, Segmented, type Tone } from "@/components/ui";
import { useOps } from "@/components/operational-provider";

type Row = Record<string, any>;
type Aba = "PLANTA" | "BI" | "MAPA" | "LOCALIZADOR" | "RASTRO";
const NOME: Record<string, string> = { PREPARACAO: "Preparação", COLAGEM_PORTAS: "Colagem de portas", ESQUADRIAS_BORDAS: "Esquadrias e bordas", RECOBRIDORA_PERFIL: "Recobridora de perfil", USINAGEM: "Usinagem", USINAGEM_2: "Usinagem 2", CNC: "CNC", LUSTRACAO: "Lustração", PLASTIFICADORA: "Plastificadora", PLASTIFICADORA_PORTAS: "Plastificadora de portas", EMBALAGEM: "Embalagem", EXPEDICAO: "Expedição" };
const ATRASO_DIAS = 5;
const dia = (v: unknown) => (v ? new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—");
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
  const [aba, setAba] = useState<Aba>("PLANTA");
  const [erro, setErro] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);
  const [fab, setFab] = useState<Row | null>(null);
  const [sel, setSel] = useState<Row | null>(null);
  const [setorSel, setSetorSel] = useState("TODOS");
  const [busca, setBusca] = useState(""); const [achados, setAchados] = useState<Row[]>([]);
  const [pedido, setPedido] = useState(""); const [rastro, setRastro] = useState<Row | null>(null);
  const [planta, setPlanta] = useState<Row | null>(null); const [setorPl, setSetorPl] = useState<string | null>(null);
  const [pedPl, setPedPl] = useState(""); const [rota, setRota] = useState<Row | null>(null); const [agora, setAgora] = useState<Date | null>(null);
  const [bi, setBi] = useState<Row | null>(null); const [fBi, setFBi] = useState({ busca: "", setor: "", status: "", dias: "30" });
  const [leit, setLeit] = useState({ pedido: "", peca: "", setor: "", evento: "ENTRADA", quantidade: "1", obs: "" });

  const carregar = useCallback(async () => {
    try {
      if (aba === "PLANTA") {
        setPlanta(await api("/api/mapa-fabrica"));
        setRota(pedPl.trim() ? await api("/api/mapa-fabrica?pedido=" + encodeURIComponent(pedPl.trim())) : null);
        setAgora(new Date());
      }
      if (aba === "BI") setBi(await api("/api/mapa-fabrica?visao=bi&dias=" + fBi.dias));
      if (aba === "MAPA") setFab(await api("/api/wms?visao=fabrica"));
      if (aba === "LOCALIZADOR") setAchados((await api("/api/wms?visao=localizador&busca=" + encodeURIComponent(busca))).itens);
      if (aba === "RASTRO") setRastro(await api("/api/wms?visao=rastro&pedido=" + encodeURIComponent(pedido)));
      setErro("");
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao carregar."); }
  }, [aba, busca, pedido, pedPl, fBi.dias]);
  useEffect(() => { const t = setTimeout(carregar, aba === "LOCALIZADOR" || aba === "PLANTA" ? 250 : 0); return () => clearTimeout(t); }, [carregar, aba]);
  useEffect(() => { if (aba !== "PLANTA") return; const i = setInterval(carregar, 60000); return () => clearInterval(i); }, [aba, carregar]);

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
      <Segmented value={aba} onChange={setAba} options={[{ value: "PLANTA", label: "Planta (fluxo)" }, { value: "BI", label: "Painel BI" }, { value: "MAPA", label: "Endereços" }, { value: "LOCALIZADOR", label: "Localizador" }, { value: "RASTRO", label: "Rastro por pedido" }]} />
      {erro && <p className="error" role="alert">{erro}</p>}
      {ok && <p className="success" role="status">{ok}</p>}

      {aba === "PLANTA" && planta && (() => {
        const rotaPor: Record<string, Row> = Object.fromEntries((rota?.etapas ?? []).map((e: Row) => [e.etapa, e]));
        const emAnd = planta.fluxo.reduce((a: number, s: string) => a + planta.setores[s].andamento.length, 0);
        const atras = planta.fluxo.reduce((a: number, s: string) => a + planta.setores[s].andamento.filter((p: Row) => p.dias > ATRASO_DIAS).length, 0);
        const estado = (s: string) => { const e = rotaPor[s]; if (!rota) return ""; if (!e || (!e.data_inicio && !e.data_conclusao)) return "todo"; return e.data_conclusao ? "done" : "now"; };
        return (<>
          <div className="kpis">
            <Kpi label="Pedidos em andamento nos setores" value={emAnd} />
            <Kpi label={`Parados há mais de ${ATRASO_DIAS} dias`} value={atras} tone={atras ? "danger" : "success"} sub="no mesmo setor, sem conclusão" />
            <Kpi label="Atualizado" value={agora ? agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"} sub="a cada 1 minuto, com as datas dos líderes" />
          </div>
          <Panel title="Por onde o pedido está passando" subtitle="Digite o número do pedido para ver o caminho pelos setores, com as datas de início e fim lançadas pelos líderes.">
            <Field label="Pedido"><input value={pedPl} onChange={(e) => setPedPl(e.target.value)} placeholder="ex.: 26847" /></Field>
            {rota && <p className="mf-leg"><b>{rota.pedido?.pedido}</b>{rota.pedido?.cliente ? ` · ${rota.pedido.cliente}` : ""}{rota.pedido?.previsao_saida ? ` · saída prevista ${dia(rota.pedido.previsao_saida)}` : ""}</p>}
          </Panel>
          <div className="mf-leg"><span><i style={{ background: "#dcfce7" }} />concluído</span><span><i style={{ background: "#dbeafe" }} />em andamento</span><span><i style={{ background: "#f1f5f9" }} />ainda não iniciou</span><span><i style={{ background: "#fee2e2" }} />parado &gt; {ATRASO_DIAS} dias</span></div>
          <div className="mf-fluxo">
            {planta.fluxo.map((s: string, i: number) => {
              const d = planta.setores[s]; const and: Row[] = d.andamento; const atr = and.filter((p) => p.dias > ATRASO_DIAS).length;
              const e = rotaPor[s]; const est = estado(s);
              const carga = !rota ? (atr ? "atraso" : and.length ? "carga" : "") : est;
              return (
                <button key={s} type="button" className={`mf-est ${carga}`} onClick={() => setSetorPl(s)} aria-label={`${NOME[s]}: ${and.length} pedido(s) em andamento`}>
                  <span className="mf-n">{i + 1}</span>
                  <b>{NOME[s] ?? s}</b>
                  {rota ? (<small>{e?.data_inicio ? `início ${dia(e.data_inicio)}` : "—"}<br />{e?.data_conclusao ? `fim ${dia(e.data_conclusao)}` : e?.data_inicio ? "em andamento" : "não iniciou"}</small>)
                    : (<><strong>{and.length}</strong><small>pedido(s) agora{atr ? ` · ${atr} parado(s)` : ""}<br />{d.concluidas} concluído(s) em 7 dias</small></>)}
                </button>
              );
            })}
          </div>
          <Drawer open={!!setorPl} title={setorPl ? NOME[setorPl] ?? setorPl : ""} onClose={() => setSetorPl(null)}>
            {setorPl && (
              <DataTable head={["Pedido", "Cliente", "Início", "Dias", "Saída prevista"]} empty={<Empty title="Nenhum pedido neste setor agora" />}>
                {planta.setores[setorPl].andamento.map((p: Row) => (
                  <tr key={p.pedido}><td><button type="button" className="linkBtn" onClick={() => { setPedPl(p.pedido); setSetorPl(null); }}>{p.pedido}</button></td><td>{p.cliente || "—"}</td><td>{dia(p.inicio)}</td><td>{p.dias > ATRASO_DIAS ? <Badge tone="danger">{p.dias}</Badge> : p.dias}</td><td>{dia(p.previsaoSaida)}</td></tr>
                ))}
              </DataTable>
            )}
          </Drawer>
        </>);
      })()}

      {aba === "BI" && bi && (() => {
        const linhas: Row[] = bi.linhas.map((l: Row) => ({ ...l, estado: l.data_conclusao ? "CONCLUIDO" : Number(l.dias) > ATRASO_DIAS ? "PARADO" : "ANDAMENTO" }));
        const t = fBi.busca.trim().toLowerCase();
        const fil = linhas.filter((l) => (!t || String(l.pedido).toLowerCase().includes(t) || String(l.cliente ?? "").toLowerCase().includes(t)) && (!fBi.setor || l.etapa === fBi.setor) && (!fBi.status || l.estado === fBi.status));
        const conc = fil.filter((l) => l.estado === "CONCLUIDO");
        const medio = conc.length ? conc.reduce((a, l) => a + Number(l.dias), 0) / conc.length : 0;
        const porSetor = bi.fluxo.map((s: string) => {
          const ls = fil.filter((l) => l.etapa === s); const c = ls.filter((l) => l.estado === "CONCLUIDO");
          return { s, and: ls.filter((l) => l.estado === "ANDAMENTO").length, par: ls.filter((l) => l.estado === "PARADO").length, con: c.length, med: c.length ? c.reduce((a, l) => a + Number(l.dias), 0) / c.length : 0 };
        });
        const maxQ = Math.max(1, ...porSetor.map((x: Row) => x.and + x.par + x.con)); const maxM = Math.max(1, ...porSetor.map((x: Row) => x.med));
        const serie: Row[] = bi.serie; const maxS = Math.max(1, ...serie.map((x) => Number(x.n)));
        const W = 640, Hh = 140, bw = W / Math.max(1, serie.length);
        const pedidosUn = new Set(fil.map((l) => l.pedido)).size;
        const ordem = [...fil].sort((a, b) => (a.estado === b.estado ? Number(b.dias) - Number(a.dias) : a.estado === "PARADO" ? -1 : b.estado === "PARADO" ? 1 : a.estado === "ANDAMENTO" ? -1 : 1)).slice(0, 200);
        return (<>
          <Panel title="Pesquisar e filtrar" subtitle="Tudo abaixo (indicadores, gráficos e tabela) obedece a estes filtros.">
            <div className="formGrid">
              <Field label="Pedido ou cliente"><input value={fBi.busca} onChange={(e) => setFBi({ ...fBi, busca: e.target.value })} placeholder="ex.: 26847 ou nome do cliente" autoFocus /></Field>
              <Field label="Setor"><select value={fBi.setor} onChange={(e) => setFBi({ ...fBi, setor: e.target.value })}><option value="">Todos</option>{bi.fluxo.map((s: string) => <option key={s} value={s}>{NOME[s] ?? s}</option>)}</select></Field>
              <Field label="Situação"><select value={fBi.status} onChange={(e) => setFBi({ ...fBi, status: e.target.value })}><option value="">Todas</option><option value="ANDAMENTO">Em andamento</option><option value="PARADO">Parado</option><option value="CONCLUIDO">Concluído</option></select></Field>
              <Field label="Período"><select value={fBi.dias} onChange={(e) => setFBi({ ...fBi, dias: e.target.value })}><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option></select></Field>
              <button onClick={() => setFBi({ busca: "", setor: "", status: "", dias: fBi.dias })}>Limpar</button>
            </div>
          </Panel>
          <div className="kpis">
            <Kpi label="Pedidos" value={pedidosUn} />
            <Kpi label="Em andamento" value={fil.filter((l) => l.estado === "ANDAMENTO").length} />
            <Kpi label={`Parados > ${ATRASO_DIAS} dias`} value={fil.filter((l) => l.estado === "PARADO").length} tone={fil.some((l) => l.estado === "PARADO") ? "danger" : "success"} />
            <Kpi label="Concluídos no período" value={conc.length} tone="success" />
            <Kpi label="Tempo médio por setor" value={medio ? `${medio.toFixed(1)} dias` : "—"} sub="início até conclusão" />
          </div>
          <Panel title="Pedidos por setor" subtitle="Toque na barra para filtrar o setor.">
            <div className="bi-leg"><span><i style={{ background: "#3b82f6" }} />andamento</span><span><i style={{ background: "#ef4444" }} />parado</span><span><i style={{ background: "#22c55e" }} />concluído</span></div>
            {porSetor.map((x: Row) => (
              <button key={x.s} type="button" className="bi-linha" onClick={() => setFBi({ ...fBi, setor: fBi.setor === x.s ? "" : x.s })} aria-label={`${NOME[x.s]}: ${x.and} andamento, ${x.par} parados, ${x.con} concluídos`}>
                <span className="bi-nome">{NOME[x.s] ?? x.s}</span>
                <span className="bi-barra"><i style={{ width: `${(x.and / maxQ) * 100}%`, background: "#3b82f6" }} /><i style={{ width: `${(x.par / maxQ) * 100}%`, background: "#ef4444" }} /><i style={{ width: `${(x.con / maxQ) * 100}%`, background: "#22c55e" }} /></span>
                <span className="bi-val">{x.and + x.par + x.con}</span>
              </button>
            ))}
          </Panel>
          <Panel title="Tempo médio em cada setor (dias)" subtitle="Dos concluídos no período. Mostra o gargalo.">
            {porSetor.map((x: Row) => (
              <div key={x.s} className="bi-linha static">
                <span className="bi-nome">{NOME[x.s] ?? x.s}</span>
                <span className="bi-barra"><i style={{ width: `${(x.med / maxM) * 100}%`, background: "#8b5cf6" }} /></span>
                <span className="bi-val">{x.med ? x.med.toFixed(1) : "—"}</span>
              </div>
            ))}
          </Panel>
          <Panel title="Etapas concluídas por dia" subtitle={`Fábrica toda, últimos ${bi.dias} dias.`}>
            <svg viewBox={`0 0 ${W} ${Hh + 22}`} className="bi-svg" role="img" aria-label="Etapas concluídas por dia">
              {serie.map((d, i) => { const h = (Number(d.n) / maxS) * Hh; return <rect key={d.dia} x={i * bw + 1} y={Hh - h} width={Math.max(1, bw - 2)} height={h} rx={2} fill="#22c55e"><title>{`${dia(d.dia)}: ${d.n}`}</title></rect>; })}
              <line x1={0} y1={Hh} x2={W} y2={Hh} stroke="#cbd5e1" />
              <text x={0} y={Hh + 15} fontSize={11} fill="#64748b">{dia(serie[0]?.dia)}</text>
              <text x={W} y={Hh + 15} fontSize={11} fill="#64748b" textAnchor="end">{dia(serie[serie.length - 1]?.dia)}</text>
              <text x={W} y={11} fontSize={11} fill="#64748b" textAnchor="end">máx. {maxS}/dia</text>
            </svg>
          </Panel>
          <Panel title="Pedidos e etapas" subtitle={`${fil.length} registro(s)${fil.length > 200 ? " (mostrando 200, os mais urgentes primeiro)" : ""}`}>
            <DataTable head={["Pedido", "Cliente", "Setor", "Situação", "Início", "Fim", "Dias", "Saída prevista"]} empty={<Empty title="Nada encontrado com estes filtros" />}>
              {ordem.map((l) => (
                <tr key={l.pedido + l.etapa}>
                  <td><button type="button" className="linkBtn" onClick={() => { setPedPl(l.pedido); setAba("PLANTA"); }}>{l.pedido}</button></td>
                  <td>{l.cliente || "—"}</td><td>{NOME[l.etapa] ?? l.etapa}</td>
                  <td><Badge tone={l.estado === "PARADO" ? "danger" : l.estado === "CONCLUIDO" ? "success" : "info"}>{l.estado === "PARADO" ? "Parado" : l.estado === "CONCLUIDO" ? "Concluído" : "Em andamento"}</Badge></td>
                  <td>{dia(l.data_inicio)}</td><td>{dia(l.data_conclusao)}</td><td>{l.dias}</td><td>{dia(l.previsao_saida)}</td>
                </tr>
              ))}
            </DataTable>
          </Panel>
        </>);
      })()}

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

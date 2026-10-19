"use client";

import { FileSpreadsheet, Filter, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useOps } from "@/components/operational-provider";
import { LABELS, leaderPlanRows, leaderReleasedRows } from "@/lib/metrics";
import { PROCESSOS } from "@/lib/processos";
import { fmt, fmtPct, pct } from "@/lib/format";
import { exportarExcel } from "@/lib/export";
import { Badge, Card, DataTable, Empty, Field, PageHeader, Segmented, StatCard } from "@/components/ui";
import { TableScroll } from "@/components/table-scroll";
import type { MontagemEngenharia, TipoPedido } from "@/types/pcp";

const MONTAGENS_ENGENHARIA: Array<{value:MontagemEngenharia;label:string}> = [
  { value: "MONTADO_HS", label: "Montado HS" },
  { value: "MONTADO_TIMADEL", label: "Montado Timadel" },
  { value: "MONTADO_ESTANCIA", label: "Montado Estância" },
];

export default function Lideres() {
  const { pg, me, refresh, toast } = useOps();
  type ProgramacaoLista = { id: string; filtro: string; data: string; turno: string; status: string; origem: string; import_pedidos?: number; import_ofs?: number; import_pecas?: number };
  const [programacoesDisponiveis, setProgramacoesDisponiveis] = useState<ProgramacaoLista[]>([]);
  const [filtroSelecionado, setFiltroSelecionado] = useState("");
  const [programacaoIdSelecionada, setProgramacaoIdSelecionada] = useState("");
  const [programacaoSelecionada, setProgramacaoSelecionada] = useState<typeof pg>(null);
  const [carregandoProgramacao, setCarregandoProgramacao] = useState(false);

  useEffect(() => {
    let cancelado = false;
    async function carregarLista() {
      try {
        const r = await fetch("/api/programacoes/historico", { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Falha ao carregar filtros.");
        const itens = (j.itens || []) as ProgramacaoLista[];
        if (cancelado) return;
        setProgramacoesDisponiveis(itens);
        const inicial = (pg?.id && itens.find((x) => x.id === pg.id)) || itens[0];
        if (inicial) {
          setFiltroSelecionado(String(inicial.filtro || ""));
          setProgramacaoIdSelecionada(inicial.id);
        }
      } catch (e) {
        if (!cancelado) toast("error", e instanceof Error ? e.message : "Falha ao carregar filtros.");
      }
    }
    void carregarLista();
    return () => { cancelado = true; };
  // A lista inicial é carregada uma vez; o histórico já vem ordenado do mais recente.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!programacaoIdSelecionada) return;
    let cancelado = false;
    setCarregandoProgramacao(true);
    setProgramacaoSelecionada(null);
    fetch("/api/programacoes/ativa?id=" + encodeURIComponent(programacaoIdSelecionada), { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Falha ao abrir a programação selecionada.");
        if (!cancelado) setProgramacaoSelecionada(j.programacao || null);
      })
      .catch((e) => { if (!cancelado) toast("error", e instanceof Error ? e.message : "Falha ao abrir filtro."); })
      .finally(() => { if (!cancelado) setCarregandoProgramacao(false); });
    return () => { cancelado = true; };
  }, [programacaoIdSelecionada, toast]);

  const filtrosDisponiveis = [...new Set(programacoesDisponiveis.map((x) => String(x.filtro || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  const programacoesDoFiltro = programacoesDisponiveis.filter((x) => String(x.filtro || "").trim() === filtroSelecionado);
  const programacaoAtiva = programacaoSelecionada || (pg?.id === programacaoIdSelecionada ? pg : null);
  const products = programacaoAtiva?.produtos || [];
  const procs = me?.processos?.length
    ? PROCESSOS.filter((x) => me.processos.includes(x))
    : [...PROCESSOS];
  const [proc, setProc] = useState(procs[0] || "RECOBRIDORA");
  const [busyPedido, setBusyPedido] = useState("");
  const [busca, setBusca] = useState("");
  const [peca, setPeca] = useState("TODAS");
  const [medida, setMedida] = useState("TODAS");

  useEffect(() => {
    if (!procs.length) return;
    if (!procs.includes(proc as (typeof PROCESSOS)[number])) setProc(procs[0]);
  }, [procs.join("|"), proc]);

  const [tab, setTab] = useState<"PLAN" | "NOW">("PLAN");

  const plan = useMemo(() => leaderPlanRows(products, proc), [products, proc]);
  const now = useMemo(() => leaderReleasedRows(products, proc), [products, proc]);
  const baseRows = tab === "PLAN" ? plan : now;

  const pecas = useMemo(
    () =>
      [...new Set(baseRows.map((x) => String(x.categoria || x.descricao || "").trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })),
    [baseRows]
  );

  const medidas = useMemo(
    () =>
      [...new Set(baseRows.map((x) => String(x.medida || "").trim()).filter(Boolean))]
        .sort((a, b) => {
          const na = a.split(/[x×]/i).map(Number);
          const nb = b.split(/[x×]/i).map(Number);
          return (nb[1] || 0) - (na[1] || 0) || (nb[0] || 0) - (na[0] || 0);
        }),
    [baseRows]
  );

  const pendenciasTecnicas = useMemo(() => {
    return products.filter(p => p.operacoes.some(o => o.processo === proc)).filter(p => {
      const descricao = String(p.descricao || "").trim();
      return !descricao || !String(p.medida || "").trim() || !String(p.material || "").trim();
    }).map(p => ({ codigo: p.produto, pedido: p.pedido, of: p.of,
      campos: [!String(p.descricao || "").trim() ? "Descrição" : "", !String(p.medida || "").trim() ? "Medida" : "",
        !String(p.material || "").trim() ? "Material" : ""].filter(Boolean).join(", ")
    }));
  }, [products, proc]);

  const rows = useMemo(() => {
    const q = busca.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

    return baseRows.filter((x) => {
      if (peca !== "TODAS" && String(x.categoria || x.descricao || "") !== peca) return false;
      if (medida !== "TODAS" && String(x.medida || "") !== medida) return false;
      if (!q) return true;

      const text = [
        x.descricao, x.categoria, x.material, x.medida, x.rebaixo, x.acabamento, x.cor, x.pedido, x.of,
      ].filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

      return text.includes(q);
    });
  }, [baseRows, busca, peca, medida]);

  const filtrosAtivos = busca.trim() || peca !== "TODAS" || medida !== "TODAS";

  const pedidos = useMemo(() => {
    const map = new Map<string, { tipo: TipoPedido; montagem: MontagemEngenharia }>();

    for (const p of products) {
      const tipo = (p.tipoPedido || "NORMAL") as TipoPedido;
      const montagem = (p.montagemEngenharia || "MONTADO_HS") as MontagemEngenharia;
      const atual = map.get(p.pedido);
      if (!atual || atual.tipo === "NORMAL") map.set(p.pedido, { tipo, montagem });
    }

    return [...map.entries()]
      .map(([pedido, dados]) => ({ pedido, ...dados }))
      .sort((a, b) => a.pedido.localeCompare(b.pedido, "pt-BR", { numeric: true }));
  }, [products]);

  const soma = (l: typeof plan, k: "quantidade" | "produzido" | "saldo") =>
    l.reduce((s, x) => s + x[k], 0);

  const planned = soma(plan, "quantidade");
  const produced = soma(plan, "produzido");
  const embalagemSelecionada = proc.startsWith("EMBALAGEM");

  async function alterarPedido(
    pedido: string,
    tipo: TipoPedido,
    montagemEngenharia: MontagemEngenharia = "MONTADO_HS"
  ) {
    setBusyPedido(pedido);

    try {
      const r = await fetch("/api/pedidos/tipo", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pedido, tipo, montagemEngenharia, programacaoId: programacaoAtiva?.id }),
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao alterar pedido.");

      toast(
        "success",
        tipo === "ENGENHARIA"
          ? `Pedido ${pedido}: Engenharia • ${montagemEngenharia.replaceAll("_", " ")}.`
          : `Pedido ${pedido}: ${tipo}.`
      );

      // O refresh do contexto atualiza a programação global selecionada.
      await refresh();
    } catch (e: any) {
      toast("error", e?.message || "Falha ao alterar pedido.");
    } finally {
      setBusyPedido("");
    }
  }

  // Exportar exatamente a mesma projeção e os mesmos filtros da tabela visível.
  const exportar = async () => {
    const linhas = rows.map((x) => ({
      "Peça": x.categoria ? `${x.descricao} · ${x.categoria}` : x.descricao,
      "Material": x.material || "-",
      "Medida": x.medida || "-",
      "Rebaixo": x.rebaixo || "-",
      "Acabamento": x.acabamento || "-",
      "Cor": x.cor || "-",
      "Planejado": x.quantidade,
      "Produzido": x.produzido,
      "Saldo": x.saldo,
    }));
    try {
      await exportarExcel(
        [{ nome: (LABELS[proc] || proc).slice(0, 31), linhas }],
        `Lideres_Filtro_${filtroSelecionado}_${programacaoAtiva?.data || "sem_data"}_${proc}_${tab === "PLAN" ? "Plano_do_dia" : "Liberado_agora"}`
      );
    } catch {
      toast("error", "Não foi possível exportar a tabela dos líderes.");
    }
  };

  return (
    <div className="leader-mobile-view">
      <PageHeader
        eyebrow="Operação"
        title="Líderes"
        description="Quantidades programadas por filtro, data e processo, da maior medida para a menor."
        actions={<button onClick={exportar}><FileSpreadsheet /> Exportar Excel</button>}
      />

      <section className="card mb leader-program-picker" aria-label="Selecionar filtro e data da programação">
        <div className="card-head">
          <div>
            <h2>Apontamento por filtro</h2>
            <small>Escolha um filtro primeiro. Os pedidos exibidos pertencem somente à programação e à data selecionadas.</small>
          </div>
        </div>
        <div className="card-body">
          <div className="leader-filter-tabs" role="tablist" aria-label="Filtros do Consistem">
            {filtrosDisponiveis.map((f) => (
              <button
                type="button"
                key={f}
                role="tab"
                aria-selected={filtroSelecionado === f}
                className={filtroSelecionado === f ? "is-selected" : ""}
                onClick={() => {
                  setFiltroSelecionado(f);
                  const doFiltro = programacoesDisponiveis.filter((x) => String(x.filtro || "").trim() === f);
                  const atual = doFiltro.find((x) => x.status === "ATIVA") || doFiltro[0];
                  setProgramacaoIdSelecionada(atual?.id || "");
                  setBusca("");
                  setPeca("TODAS");
                  setMedida("TODAS");
                }}
              >
                <span>Filtro</span><strong>{f}</strong>
              </button>
            ))}
          </div>
          <div className="leader-date-section">
            <div className="leader-date-heading">
              <div><b>Data da programação</b><small>Toque em uma data para abrir apenas os pedidos daquele filtro.</small></div>
              <span>{programacoesDoFiltro.length} {programacoesDoFiltro.length === 1 ? "opção de data/turno" : "opções de data/turno"}</span>
            </div>
            <div className="leader-date-options" role="group" aria-label={"Datas do filtro " + filtroSelecionado}>
              {programacoesDoFiltro.map((x) => (
                <button
                  type="button"
                  key={x.id}
                  aria-pressed={programacaoIdSelecionada === x.id}
                  className={programacaoIdSelecionada === x.id ? "is-selected" : ""}
                  onClick={() => {
                    setProgramacaoIdSelecionada(x.id);
                    setBusca("");
                    setPeca("TODAS");
                    setMedida("TODAS");
                  }}
                >
                  <span className="leader-date-main">{x.data}</span>
                  <span className="leader-date-sub">Turno {x.turno || "—"} · {x.status === "ATIVA" ? "Atual" : "Histórico"}</span>
                  <span className="leader-date-counts">{x.import_pedidos ?? "—"} pedidos <i>·</i> {x.import_ofs ?? "—"} OFs</span>
                </button>
              ))}
              {!programacoesDoFiltro.length && <p className="muted">Nenhuma programação encontrada para este filtro.</p>}
            </div>
          </div>
          <div className="leader-selected-program">
            <span className="leader-selected-dot" />
            <div><small>Programação selecionada</small><strong>{programacaoAtiva ? `Filtro ${programacaoAtiva.filtro} · ${programacaoAtiva.data}` : carregandoProgramacao ? "Carregando pedidos..." : "Selecione uma data"}</strong></div>
            {programacaoAtiva && <span className="leader-selected-turno">Turno {programacaoAtiva.turno || "—"}</span>}
          </div>
        </div>
      </section>

      {carregandoProgramacao && <p className="muted">Carregando pedidos e datas do filtro selecionado...</p>}
      {!carregandoProgramacao && !programacaoAtiva && <Card title="Nenhuma programação disponível" subtitle="Importe um filtro do Consistem para começar." />}

      <div className="leader-process-tabs">
        <Segmented value={proc} onChange={setProc} options={procs.map((p) => ({ value: p, label: LABELS[p] || p }))} />
      </div>

      {embalagemSelecionada && (
        <Card subtitle="Embalagem" title="Pedidos especiais" className="mb"
          actions={<small>Revenda usa a regra Revenda; Engenharia deve ser HS, Timadel ou Estância.</small>}>
          <DataTable head={["Pedido", "Tipo", "Montagem engenharia", "Destino na embalagem"]}>
            {pedidos.map((p) => (
              <tr key={p.pedido}>
                <td><b>{p.pedido}</b></td>
                <td style={{ width: 180 }}>
                  <select value={p.tipo} disabled={busyPedido === p.pedido} onChange={(e) => alterarPedido(p.pedido, e.target.value as TipoPedido, p.montagem)}>
                    <option value="NORMAL">Normal</option><option value="REVENDA">Revenda</option><option value="ENGENHARIA">Engenharia</option>
                  </select>
                </td>
                <td style={{ width: 220 }}>
                  {p.tipo === "ENGENHARIA" ? (
                    <select value={p.montagem} disabled={busyPedido === p.pedido} onChange={(e) => alterarPedido(p.pedido, "ENGENHARIA", e.target.value as MontagemEngenharia)}>
                      {MONTAGENS_ENGENHARIA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  ) : <span className="muted">-</span>}
                </td>
                <td>
                  {p.tipo === "REVENDA" ? <Badge tone="info">Embalagem · Revenda</Badge>
                    : p.tipo === "ENGENHARIA" ? <Badge tone="info">Embalagem · Engenharia · {MONTAGENS_ENGENHARIA.find((m) => m.value === p.montagem)?.label || p.montagem}</Badge>
                    : <span className="muted">Regra normal por componente</span>}
                </td>
              </tr>
            ))}
          </DataTable>
        </Card>
      )}

      <div className="stats">
        <StatCard label={`${LABELS[proc] || proc} · plano do dia`} value={fmt(planned)} hint="peças planejadas" />
        <StatCard label="Produzido" value={fmt(produced)} tone={produced ? "success" : "neutral"} />
        <StatCard label="Saldo" value={fmt(Math.max(0, planned - produced))} />
        <StatCard label="Andamento" value={fmtPct(pct(produced, planned))} />
      </div>

      <div style={{ marginBottom: "var(--sp-4)" }}>
        <Segmented value={tab} onChange={setTab} options={[
          { value: "PLAN", label: <>Plano do dia · <b>{fmt(planned)} pçs</b></> },
          { value: "NOW", label: <>Liberado agora · <b>{fmt(soma(now, "quantidade"))} pçs</b></> },
        ]} />
      </div>

      <section className="card mb leader-filter-card">
        <div className="card-head">
          <div className="row">
            <span className="stat-icon"><Filter /></span>
            <div><h2>Filtrar produção</h2><small>Encontre rapidamente peça, medida, material ou OF.</small></div>
          </div>
          {filtrosAtivos && <button type="button" onClick={() => { setBusca(""); setPeca("TODAS"); setMedida("TODAS"); }}><X /> Limpar</button>}
        </div>
        <div className="card-body form-grid">
          <Field label="Busca"><div className="search" style={{ maxWidth: "none" }}><Search /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Peça, material, OF, acabamento..." /></div></Field>
          <Field label="Peça"><select value={peca} onChange={(e) => setPeca(e.target.value)}><option value="TODAS">Todas as peças</option>{pecas.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
          <Field label="Medida / metragem"><select value={medida} onChange={(e) => setMedida(e.target.value)}><option value="TODAS">Todas as medidas</option>{medidas.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
          <div className="result-box"><small>Resultado</small><b>{rows.length}</b><small>{rows.length === 1 ? "linha encontrada" : "linhas encontradas"}</small></div>
        </div>
      </section>

      {!!pendenciasTecnicas.length && <details className="card mb" style={{padding:16}}>
        <summary><b>Conferência do catálogo: {pendenciasTecnicas.length} linha(s) com campos técnicos ausentes neste setor</b></summary>
        <p className="muted">Dados ausentes na programação ativa ou sem especificação no catálogo. Verifique o código no Catálogo Mestre. Não são preenchidos com valores presumidos.</p>
        <div style={{overflowX:"auto",maxHeight:300}}><table><thead><tr><th>Código</th><th>Pedido</th><th>OF</th><th>Campos para conferir</th></tr></thead><tbody>{pendenciasTecnicas.map((x,i)=><tr key={i}><td>{x.codigo}</td><td>{x.pedido}</td><td>{x.of}</td><td>{x.campos}</td></tr>)}</tbody></table></div>
      </details>}

      <div className="leader-mobile-cards" aria-label="Apontamento em formato de cartões">
        {rows.map((x) => (
          <article className="leader-mobile-row" key={x.key}>
            <div className="leader-mobile-row-head"><div className="leader-mobile-piece"><strong>{x.descricao || "Peça sem descrição"}</strong>{x.categoria && <Badge>{x.categoria}</Badge>}</div><span className="leader-mobile-measure">{x.medida || "Medida não informada"}</span></div>
            <div className="leader-mobile-of"><span>OF</span><strong>{x.listaOfs.length ? x.listaOfs.join(", ") : "-"}</strong></div>
            <div className="leader-mobile-meta">
              <div><span>Material</span><strong>{x.material || "-"}</strong></div><div><span>Rebaixo</span><strong>{x.rebaixo || "-"}</strong></div><div><span>Acabamento</span><strong>{x.acabamento || "-"}</strong></div><div><span>Cor</span><strong>{x.cor || "-"}</strong></div>
            </div>
            <div className="leader-mobile-quantities"><div><span>Planejado</span><strong>{fmt(x.quantidade)}</strong></div><div><span>Produzido</span><strong>{fmt(x.produzido)}</strong></div><div><span>Saldo</span><strong>{fmt(x.saldo)}</strong></div></div>
          </article>
        ))}
        {!rows.length && <Empty title="Nenhuma quantidade neste processo." />}
      </div>

      <div className="leader-desktop-table">
        <TableScroll className="leader">
          <table>
            <thead><tr><th>Peça</th><th>OF</th><th>Material</th><th>Medida</th><th>Rebaixo</th><th>Acabamento</th><th>Cor</th><th className="num">Planejado</th><th className="num">Produzido</th><th className="num">Saldo</th></tr></thead>
            <tbody>{rows.map((x) => <tr key={x.key}>
              <td><b>{x.descricao}</b> <Badge>{x.categoria}</Badge></td>
              <td className="mono" title={x.listaOfs.join(", ")} style={{maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{x.listaOfs.length ? x.listaOfs.join(", ") : "-"}</td>
              <td>{x.material || "-"}</td><td className="mono">{x.medida || "-"}</td><td>{x.rebaixo || "-"}</td><td>{x.acabamento || "-"}</td><td>{x.cor || "-"}</td>
              <td className="num bigQty">{fmt(x.quantidade)}</td><td className="num">{fmt(x.produzido)}</td><td className="num"><b>{fmt(x.saldo)}</b></td>
            </tr>)}</tbody>
            {!!rows.length && <tfoot><tr><td colSpan={7}>Total</td><td className="num">{fmt(soma(rows, "quantidade"))}</td><td className="num">{fmt(soma(rows, "produzido"))}</td><td className="num">{fmt(soma(rows, "saldo"))}</td></tr></tfoot>}
          </table>
          {!rows.length && <Empty title="Nenhuma quantidade neste processo." />}
        </TableScroll>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, DataTable, Empty, Field, Kpi, Modal, PageHeader, Panel, Segmented } from "@/components/ui";

type Row = Record<string, any>;
type Aba = "OFS" | "PADRAO" | "TAXAS" | "ESTOQUE" | "MARGEM";
const n2 = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—");
const dataPt = (v: unknown) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—");
const CAUSAS: Record<string, string> = { PRECO: "Preço do insumo", REFUGO: "Refugo", PERDA_OUTROS: "Consumo acima do padrão (outros)", EFICIENCIA: "Eficiência (tempo/máquina/GG)" };

async function api(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na operação.");
  return j;
}

export default function CustosPage() {
  const [aba, setAba] = useState<Aba>("OFS");
  const [d, setD] = useState<Row | null>(null);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [an, setAn] = useState<Row | null>(null);
  const [ofId, setOfId] = useState("");
  const [horas, setHoras] = useState<Record<string, string>>({});
  const [taxa, setTaxa] = useState<Row>({ centroId: "", custoHoraMo: "", custoHoraMaq: "", ggPercentual: "0", data: "" });
  const [preco, setPreco] = useState<Row>({ produtoId: "", custoUnitario: "", data: "" });
  const [pad, setPad] = useState<Row>({ produtoId: "", lote: "1", data: "" });
  const [det, setDet] = useState<Row | null>(null);
  const [agrup, setAgrup] = useState<"PEDIDO" | "CLIENTE" | "REPRESENTANTE">("PEDIDO");

  const carregar = useCallback(async () => { try { setD(await api("/api/custos")); setErro(""); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  const abrirOf = useCallback(async (id: string) => {
    try { const j = await api(`/api/custos?of=${id}`); setAn(j); setOfId(id); setHoras(Object.fromEntries(j.operacoes.map((o: Row) => [o.id, o.minutos == null ? "" : String(o.minutos)]))); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); }
  }, []);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true); setErro(""); setOk("");
    try { await fn(); setOk(msg); await carregar(); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } finally { setBusy(false); }
  };

  const margens = useMemo(() => {
    const m = new Map<string, Row>();
    for (const p of d?.pedidos ?? []) {
      const k = agrup === "PEDIDO" ? String(p.numero) : agrup === "CLIENTE" ? p.cliente : p.representante || "Sem representante";
      const x = m.get(k) ?? { chave: k, receita: 0, custo: 0, comissao: 0, n: 0 };
      x.receita += Number(p.receita); x.custo += Number(p.custo); x.comissao += Number(p.comissao); x.n += 1; m.set(k, x);
    }
    return [...m.values()].sort((a, b) => b.receita - a.receita);
  }, [d, agrup]);
  const totVal = (d?.valorizacao ?? []).reduce((s: number, v: Row) => s + Number(v.valor), 0);
  const semCusto = (d?.valorizacao ?? []).filter((v: Row) => v.sem_custo).length;
  const tot = an?.analise?.totais;

  return (
    <>
      <PageHeader eyebrow="Custos" title="Custos industriais" description="Custo padrão da BOM e do roteiro, padrão × real por OF com a variação explicada, valorização de estoque e margem real." />
      {erro && <div className="alert danger" role="alert">{erro}</div>}
      {ok && <div className="alert success">{ok}</div>}
      <div className="kpis">
        <Kpi label="Estoque valorizado" value={brl(totVal)} sub={semCusto ? `${semCusto} item(ns) sem custo` : undefined} tone={semCusto ? "warn" : ""} />
        <Kpi label="OFs analisadas" value={(d?.ofs ?? []).filter((o: Row) => o.registrado).length} />
        <Kpi label="Receita líquida" value={brl((d?.pedidos ?? []).reduce((s: number, p: Row) => s + Number(p.receita), 0))} />
        <Kpi label="Margem" value={brl((d?.pedidos ?? []).reduce((s: number, p: Row) => s + Number(p.margem), 0))} tone="success" />
      </div>
      <Segmented value={aba} onChange={setAba} options={[{ value: "OFS", label: "Padrão × real (OF)" }, { value: "PADRAO", label: "Custo padrão" }, { value: "TAXAS", label: "Taxas e preços" }, { value: "ESTOQUE", label: "Valorização" }, { value: "MARGEM", label: "Margem" }]} />

      {aba === "OFS" && (
        <Panel title="Ordens de fabricação">
          <DataTable head={["OF", "Produto", "Qtd", "Status", "Padrão", "Real", "Variação", ""]} empty={<Empty title="Nenhuma OF com ciclo industrial" />}>
            {(d?.ofs ?? []).map((o: Row) => (
              <tr key={o.id}><td data-label="OF">{o.numero}</td><td data-label="Produto">{o.codigo}</td><td data-label="Qtd">{n2(o.quantidade)}</td><td data-label="Status"><Badge tone="neutral">{o.status}</Badge></td>
                <td data-label="Padrão">{o.totais ? brl(o.totais.padrao) : "—"}</td><td data-label="Real">{o.totais ? brl(o.totais.real) : "—"}</td>
                <td data-label="Variação">{o.totais ? <Badge tone={Number(o.totais.variacao) > 0 ? "danger" : "success"}>{brl(o.totais.variacao)}</Badge> : "—"}</td>
                <td><button className="crm-secondary" onClick={() => abrirOf(o.id)}>Analisar</button></td></tr>
            ))}
          </DataTable>
        </Panel>
      )}

      {aba === "PADRAO" && (
        <Panel title="Custo padrão do produto">
          <div className="formGrid">
            <Field label="Produto *"><select value={pad.produtoId} onChange={(e) => setPad({ ...pad, produtoId: e.target.value })}><option value="">Selecione</option>{(d?.produtos ?? []).filter((p: Row) => p.classificacao !== "INSUMO").map((p: Row) => <option key={p.id} value={p.id}>{p.codigo} · {p.descricao}</option>)}</select></Field>
            <Field label="Lote de referência"><input inputMode="decimal" value={pad.lote} onChange={(e) => setPad({ ...pad, lote: e.target.value })} /></Field>
            <Field label="Data de referência"><input type="date" value={pad.data} onChange={(e) => setPad({ ...pad, data: e.target.value })} /></Field>
            <button className="primary" disabled={busy || !pad.produtoId} onClick={() => run(() => api("/api/custos", { acao: "CALCULAR_PADRAO", produtoId: pad.produtoId, lote: Number(String(pad.lote).replace(",", ".")), data: pad.data }), "Custo padrão calculado.")}>Calcular</button>
          </div>
          <DataTable head={["Produto", "Lote", "Material", "Mão de obra", "Máquina", "Gastos gerais", "Total unit.", "Pendências", ""]} empty={<Empty title="Nenhum custo padrão calculado" />}>
            {(d?.padroes ?? []).map((p: Row) => (
              <tr key={p.id}><td data-label="Produto">{p.codigo}</td><td data-label="Lote">{n2(p.lote)}</td><td data-label="Material">{brl(p.material)}</td><td data-label="Mão de obra">{brl(p.mao_obra)}</td><td data-label="Máquina">{brl(p.maquina)}</td><td data-label="Gastos gerais">{brl(p.gastos_gerais)}</td><td data-label="Total"><b>{brl(p.total)}</b></td>
                <td data-label="Pendências">{(p.detalhe?.pendencias ?? []).length ? <Badge tone="warning">{p.detalhe.pendencias.join(", ")}</Badge> : "—"}</td><td><button className="crm-secondary" onClick={() => setDet(p)}>Detalhe</button></td></tr>
            ))}
          </DataTable>
        </Panel>
      )}

      {aba === "TAXAS" && (
        <>
          <Panel title="Taxas por centro de trabalho (R$/hora)">
            <div className="formGrid">
              <Field label="Centro *"><select value={taxa.centroId} onChange={(e) => setTaxa({ ...taxa, centroId: e.target.value })}><option value="">Selecione</option>{(d?.centros ?? []).map((c: Row) => <option key={c.id} value={c.id}>{c.processo} · {c.maquina} ({c.turno})</option>)}</select></Field>
              <Field label="Mão de obra /h"><input inputMode="decimal" value={taxa.custoHoraMo} onChange={(e) => setTaxa({ ...taxa, custoHoraMo: e.target.value })} /></Field>
              <Field label="Máquina /h"><input inputMode="decimal" value={taxa.custoHoraMaq} onChange={(e) => setTaxa({ ...taxa, custoHoraMaq: e.target.value })} /></Field>
              <Field label="Gastos gerais (%)"><input inputMode="decimal" value={taxa.ggPercentual} onChange={(e) => setTaxa({ ...taxa, ggPercentual: e.target.value })} /></Field>
              <Field label="Vigência a partir de"><input type="date" value={taxa.data} onChange={(e) => setTaxa({ ...taxa, data: e.target.value })} /></Field>
              <button className="primary" disabled={busy || !taxa.centroId} onClick={() => run(() => api("/api/custos", { acao: "TAXA", ...taxa }), "Taxa registrada.")}>Registrar taxa</button>
            </div>
            <DataTable head={["Centro", "Vigência", "MO /h", "Máq /h", "GG %"]} empty={<Empty title="Nenhuma taxa" />}>
              {(d?.taxas ?? []).map((t: Row) => <tr key={t.id}><td data-label="Centro">{t.processo} · {t.maquina}</td><td data-label="Vigência">{dataPt(t.vigencia_inicio)}</td><td data-label="MO /h">{brl(t.custo_hora_mo)}</td><td data-label="Máq /h">{brl(t.custo_hora_maq)}</td><td data-label="GG %">{n2(t.gg_percentual)}</td></tr>)}
            </DataTable>
          </Panel>
          <Panel title="Preço padrão de insumos">
            <div className="formGrid">
              <Field label="Produto *"><select value={preco.produtoId} onChange={(e) => setPreco({ ...preco, produtoId: e.target.value })}><option value="">Selecione</option>{(d?.produtos ?? []).map((p: Row) => <option key={p.id} value={p.id}>{p.codigo} · {p.descricao}</option>)}</select></Field>
              <Field label="Custo unitário"><input inputMode="decimal" value={preco.custoUnitario} onChange={(e) => setPreco({ ...preco, custoUnitario: e.target.value })} /></Field>
              <Field label="Vigência a partir de"><input type="date" value={preco.data} onChange={(e) => setPreco({ ...preco, data: e.target.value })} /></Field>
              <button className="primary" disabled={busy || !preco.produtoId} onClick={() => run(() => api("/api/custos", { acao: "PRECO", ...preco }), "Preço padrão registrado.")}>Registrar preço</button>
            </div>
            <DataTable head={["Produto", "Vigência", "Custo unitário"]} empty={<Empty title="Nenhum preço padrão" />}>
              {(d?.precos ?? []).map((p: Row) => <tr key={p.produto_id}><td data-label="Produto">{p.codigo} · {p.descricao}</td><td data-label="Vigência">{dataPt(p.vigencia_inicio)}</td><td data-label="Custo">{brl(p.custo_unitario)}</td></tr>)}
            </DataTable>
          </Panel>
        </>
      )}

      {aba === "ESTOQUE" && (
        <Panel title="Valorização do estoque (razão de movimentos × físico)">
          <DataTable head={["Item", "Classe", "Físico", "Custo médio", "Custo padrão", "Valor"]} empty={<Empty title="Sem estoque" />}>
            {(d?.valorizacao ?? []).map((v: Row) => (
              <tr key={v.produto_id}><td data-label="Item">{v.codigo} · {v.descricao}</td><td data-label="Classe">{v.classificacao}</td><td data-label="Físico">{n2(v.fisico)}</td>
                <td data-label="Custo médio">{v.sem_custo ? <Badge tone="warning">sem custo</Badge> : brl(v.custo_medio)}</td><td data-label="Custo padrão">{v.custo_padrao == null ? "—" : brl(v.custo_padrao)}</td><td data-label="Valor"><b>{brl(v.valor)}</b></td></tr>
            ))}
          </DataTable>
        </Panel>
      )}

      {aba === "MARGEM" && (
        <Panel title="Margem real (receita líquida − custo expedido − comissão)">
          <Segmented value={agrup} onChange={setAgrup} options={[{ value: "PEDIDO", label: "Pedido" }, { value: "CLIENTE", label: "Cliente" }, { value: "REPRESENTANTE", label: "Representante" }]} />
          <DataTable head={[agrup === "PEDIDO" ? "Pedido" : agrup === "CLIENTE" ? "Cliente" : "Representante", "Receita", "Custo", "Margem", "%", "Comissão", "Margem líquida"]} empty={<Empty title="Sem pedidos faturados" />}>
            {margens.map((m) => (
              <tr key={m.chave}><td data-label="Grupo">{m.chave}</td><td data-label="Receita">{brl(m.receita)}</td><td data-label="Custo">{brl(m.custo)}</td><td data-label="Margem">{brl(m.receita - m.custo)}</td><td data-label="%">{pct(m.receita - m.custo, m.receita)}</td><td data-label="Comissão">{brl(m.comissao)}</td><td data-label="Margem líquida"><b>{brl(m.receita - m.custo - m.comissao)}</b></td></tr>
            ))}
          </DataTable>
        </Panel>
      )}

      <Modal open={!!an} onClose={() => setAn(null)} title={an ? `OF ${an.analise.of} · padrão × real` : ""}
        footer={<button className="primary" disabled={busy} onClick={() => run(async () => { await api("/api/custos", { acao: "REGISTRAR", ofId }); await abrirOf(ofId); }, "Análise registrada.")}>Registrar análise</button>}>
        {an && tot && (<>
          {an.analise.estimado && <div className="alert warning">Tempo real não informado em alguma operação: o valor usa o tempo padrão (eficiência neutra).</div>}
          {an.analise.pendencias.length > 0 && <div className="alert warning">Sem preço/taxa padrão: {an.analise.pendencias.join(", ")}.</div>}
          <div className="kpis"><Kpi label="Padrão" value={brl(tot.padrao)} /><Kpi label="Real" value={brl(tot.real)} /><Kpi label="Variação" value={brl(tot.variacao)} tone={Number(tot.variacao) > 0 ? "danger" : "success"} /><Kpi label="Unit. real" value={tot.real_unitario == null ? "—" : brl(tot.real_unitario)} sub={tot.padrao_unitario == null ? undefined : `padrão ${brl(tot.padrao_unitario)}`} /></div>
          <h4>Variação por causa</h4>
          <DataTable head={["Causa", "Valor"]}>{Object.entries(tot.causas).map(([k, v]) => <tr key={k}><td data-label="Causa">{CAUSAS[k] ?? k}</td><td data-label="Valor">{brl(v)}</td></tr>)}</DataTable>
          <h4>Materiais (boas {n2(an.analise.boas)} · refugo {n2(an.analise.refugo)})</h4>
          <DataTable head={["Item", "Qtd padrão", "Qtd real", "Preço padrão", "Custo real", "Var. preço", "Var. qtd"]}>
            {an.analise.material.map((m: Row) => <tr key={m.codigo}><td data-label="Item">{m.codigo}</td><td data-label="Qtd padrão">{n2(m.qtd_padrao)}</td><td data-label="Qtd real">{n2(m.qtd_real)}</td><td data-label="Preço padrão">{brl(m.preco_padrao)}</td><td data-label="Custo real">{brl(m.custo_real)}</td><td data-label="Var. preço">{brl(m.var_preco)}</td><td data-label="Var. qtd">{brl(m.var_quantidade)}</td></tr>)}
          </DataTable>
          <h4>Operações — informe o tempo real (min)</h4>
          <DataTable head={["Operação", "Min padrão", "Min real", "Custo padrão", "Custo real", "Var. eficiência"]}>
            {an.operacoes.map((o: Row) => {
              const l = an.analise.operacoes.find((x: Row) => x.sequencia === o.sequencia);
              return (<tr key={o.id}><td data-label="Operação">{o.sequencia} · {o.processo}</td><td data-label="Min padrão">{l ? n2(l.min_padrao) : "—"}</td>
                <td data-label="Min real"><input inputMode="decimal" value={horas[o.id] ?? ""} onChange={(e) => setHoras({ ...horas, [o.id]: e.target.value })} onBlur={() => { const v = Number(String(horas[o.id] ?? "").replace(",", ".")); if (horas[o.id] !== "" && Number.isFinite(v) && v >= 0) void run(async () => { await api("/api/custos", { acao: "HORAS", ofId, operacaoId: o.id, minutos: v }); await abrirOf(ofId); }, "Tempo registrado."); }} /></td>
                <td data-label="Custo padrão">{l ? brl(l.custo_padrao) : "—"}</td><td data-label="Custo real">{l ? brl(l.custo_real) : "—"}</td><td data-label="Var. eficiência">{l ? brl(l.var_eficiencia) : "—"}</td></tr>);
            })}
          </DataTable>
        </>)}
      </Modal>

      <Modal open={!!det} onClose={() => setDet(null)} title={det ? `Custo padrão · ${det.codigo}` : ""}>
        {det && (<>
          <DataTable head={["Componente", "Qtd", "Perda %", "Preço", "Origem"]}>
            {(det.detalhe.componentes ?? []).map((c: Row) => <tr key={c.codigo}><td data-label="Componente">{c.codigo}</td><td data-label="Qtd">{n2(c.quantidade)}</td><td data-label="Perda">{n2(c.perda_percentual)}</td><td data-label="Preço">{brl(c.preco)}</td><td data-label="Origem">{c.origem}</td></tr>)}
          </DataTable>
          <DataTable head={["Operação", "Min/un", "Mão de obra", "Máquina", "GG"]}>
            {(det.detalhe.operacoes ?? []).map((o: Row, i: number) => <tr key={i}><td data-label="Operação">{o.processo}</td><td data-label="Min/un">{n2(o.minutos_unitarios)}</td><td data-label="Mão de obra">{brl(o.mao_obra)}</td><td data-label="Máquina">{brl(o.maquina)}</td><td data-label="GG">{brl(o.gastos_gerais)}</td></tr>)}
          </DataTable>
        </>)}
      </Modal>
    </>
  );
}

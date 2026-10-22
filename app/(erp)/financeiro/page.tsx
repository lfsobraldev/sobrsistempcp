"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, DataTable, Empty, Field, Kpi, Modal, PageHeader, Panel, Segmented, type Tone } from "@/components/ui";

type Row = Record<string, any>;
type Aba = "TITULOS" | "FLUXO" | "CONCILIACAO" | "CONTABIL" | "ORCADO" | "CADASTROS";
const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataPt = (v: unknown) => (v ? new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—");
const tom: Record<string, Tone> = { ABERTO: "info", PARCIAL: "warning", LIQUIDADO: "success", CANCELADO: "neutral" } as Record<string, Tone>;
const hojeIso = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

async function api(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na operação.");
  return j;
}

export default function FinanceiroPage() {
  const [aba, setAba] = useState<Aba>("TITULOS");
  const [d, setD] = useState<Row | null>(null);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [tipo, setTipo] = useState<"" | "RECEBER" | "PAGAR">("");
  const [status, setStatus] = useState("");
  const [baixa, setBaixa] = useState<Row | null>(null);
  const [novo, setNovo] = useState<Row | null>(null);
  const [fluxo, setFluxo] = useState<Row | null>(null);
  const [conta, setConta] = useState("");
  const [conc, setConc] = useState<Row | null>(null);
  const [texto, setTexto] = useState("");
  const [ini, setIni] = useState(() => `${hojeIso().slice(0, 4)}-01-01`);
  const [fim, setFim] = useState(hojeIso());
  const [rel, setRel] = useState<Row | null>(null);
  const [razao, setRazao] = useState<Row[] | null>(null);
  const [orc, setOrc] = useState<Row[] | null>(null);
  const [orcIn, setOrcIn] = useState<Row>({ centroId: "", contaId: "", competencia: hojeIso().slice(0, 7), valor: "" });
  const [cx, setCx] = useState<Row>({ nome: "", banco: "", saldoInicial: "0", pixChave: "", pixCidade: "", pixNome: "" });
  const [cc, setCc] = useState<Row>({ codigo: "", nome: "" });
  const [pl, setPl] = useState<Row>({ codigo: "", nome: "", tipo: "DESPESA" });
  const [rg, setRg] = useState<Row>({ evento: "", debitoId: "", creditoId: "" });
  const [lan, setLan] = useState<Row>({ data: hojeIso(), historico: "", p: [{ contaId: "", debito: "", credito: "" }, { contaId: "", debito: "", credito: "" }] });
  const [pix, setPix] = useState("");

  const carregar = useCallback(async () => {
    try { setD(await api(`/api/financeiro?${new URLSearchParams({ ...(tipo ? { tipo } : {}), ...(status ? { status } : {}) })}`)); setErro(""); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); }
  }, [tipo, status]);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { if (aba === "FLUXO") api("/api/financeiro?fluxo=60").then(setFluxo).catch((e) => setErro(e.message)); }, [aba]);
  useEffect(() => { if (aba === "CONCILIACAO" && conta) api(`/api/financeiro?conciliacao=${conta}`).then(setConc).catch((e) => setErro(e.message)); }, [aba, conta]);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true); setErro(""); setOk("");
    try { await fn(); setOk(msg); await carregar(); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } finally { setBusy(false); }
  };
  const post = (b: Row) => api("/api/financeiro", b);
  const k = d?.kpi;

  return (
    <>
      <PageHeader eyebrow="Financeiro" title="Financeiro, contabilidade e controladoria" description="Contas a receber e a pagar geradas por vendas, compras e comissões; fluxo de caixa; conciliação; razão, balancete, DRE e orçado × realizado." />
      {erro && <div className="alert danger" role="alert">{erro}</div>}
      {ok && <div className="alert success">{ok}</div>}
      <div className="kpis">
        <Kpi label="A receber" value={brl(k?.receber)} sub={Number(k?.receber_vencido) ? `${brl(k.receber_vencido)} vencido` : undefined} tone={Number(k?.receber_vencido) ? "warn" : ""} />
        <Kpi label="A pagar" value={brl(k?.pagar)} sub={Number(k?.pagar_vencido) ? `${brl(k.pagar_vencido)} vencido` : undefined} tone={Number(k?.pagar_vencido) ? "danger" : ""} />
        <Kpi label="Caixa" value={brl(k?.caixa)} tone="success" />
        <Kpi label="Eventos sem regra contábil" value={(d?.pendencias ?? []).reduce((s: number, p: Row) => s + p.n, 0)} tone={(d?.pendencias ?? []).length ? "warn" : ""} />
      </div>
      <Segmented value={aba} onChange={setAba} options={[{ value: "TITULOS", label: "Títulos" }, { value: "FLUXO", label: "Fluxo de caixa" }, { value: "CONCILIACAO", label: "Conciliação" }, { value: "CONTABIL", label: "Contabilidade" }, { value: "ORCADO", label: "Orçado × realizado" }, { value: "CADASTROS", label: "Cadastros" }]} />

      {aba === "TITULOS" && (
        <Panel title="Contas a receber e a pagar">
          <div className="formGrid">
            <Field label="Tipo"><select value={tipo} onChange={(e) => setTipo(e.target.value as never)}><option value="">Todos</option><option value="RECEBER">A receber</option><option value="PAGAR">A pagar</option></select></Field>
            <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos</option>{["ABERTO", "PARCIAL", "LIQUIDADO", "CANCELADO"].map((s) => <option key={s}>{s}</option>)}</select></Field>
            <button className="primary" onClick={() => setNovo({ tipo: "PAGAR", parceiro: "", descricao: "", vencimento: hojeIso(), valor: "", centroId: "" })}>Novo título manual</button>
          </div>
          <DataTable head={["Nº", "Tipo", "Parceiro", "Descrição", "Venc.", "Valor", "Saldo", "Status", ""]} empty={<Empty title="Nenhum título" />}>
            {(d?.titulos ?? []).map((t: Row) => (
              <tr key={t.id}><td data-label="Nº">{t.numero}</td><td data-label="Tipo"><Badge tone={t.tipo === "RECEBER" ? "success" : "warning"}>{t.tipo}</Badge></td><td data-label="Parceiro">{t.parceiro}</td><td data-label="Descrição">{t.descricao}</td>
                <td data-label="Venc.">{dataPt(t.vencimento)}{["ABERTO", "PARCIAL"].includes(t.status) && t.vencimento < hojeIso() && <Badge tone="danger">vencido</Badge>}</td><td data-label="Valor">{brl(t.valor)}</td><td data-label="Saldo">{brl(Number(t.valor) - Number(t.valor_baixado))}</td><td data-label="Status"><Badge tone={tom[t.status] ?? "neutral"}>{t.status}</Badge></td>
                <td className="actions">
                  {["ABERTO", "PARCIAL"].includes(t.status) && <button className="primary" onClick={() => setBaixa({ t, contaId: d!.contas[0]?.id ?? "", valor: String(Number(t.valor) - Number(t.valor_baixado)), data: hojeIso(), juros: "0", multa: "0", desconto: "0" })}>Baixar</button>}
                  {t.tipo === "RECEBER" && ["ABERTO", "PARCIAL"].includes(t.status) && d!.contas[0] && <button className="crm-secondary" onClick={() => api(`/api/financeiro?pix=${t.id}&conta=${d!.contas[0].id}`).then((j) => setPix(j.copiaECola)).catch((e) => setErro(e.message))}>PIX</button>}
                  {t.status === "ABERTO" && <button className="crm-secondary" disabled={busy} onClick={() => run(() => post({ acao: "CANCELAR", tituloId: t.id }), "Título cancelado.")}>Cancelar</button>}</td></tr>
            ))}
          </DataTable>
          {pix && <Field label="PIX copia e cola"><textarea readOnly rows={3} value={pix} onFocus={(e) => e.currentTarget.select()} /></Field>}
        </Panel>
      )}

      {aba === "FLUXO" && (
        <Panel title={`Fluxo de caixa projetado (saldo atual ${brl(fluxo?.saldo)})`}>
          <DataTable head={["Dia", "Entradas", "Saídas", "Saldo do dia", "Saldo acumulado"]} empty={<Empty title="Sem dados" />}>
            {(fluxo?.fluxo ?? []).filter((x: Row) => Number(x.entradas) || Number(x.saidas)).map((x: Row) => (
              <tr key={x.dia}><td data-label="Dia">{dataPt(x.dia)}</td><td data-label="Entradas">{brl(x.entradas)}</td><td data-label="Saídas">{brl(x.saidas)}</td><td data-label="Saldo do dia">{brl(x.saldo_dia)}</td><td data-label="Saldo acumulado"><b style={{ color: Number(x.saldo_acum) < 0 ? "#b00020" : undefined }}>{brl(x.saldo_acum)}</b></td></tr>
            ))}
          </DataTable>
        </Panel>
      )}

      {aba === "CONCILIACAO" && (
        <Panel title="Conciliação bancária (OFX ou CSV: data;descricao;valor)">
          <div className="formGrid">
            <Field label="Conta"><select value={conta} onChange={(e) => setConta(e.target.value)}><option value="">Selecione</option>{(d?.contas ?? []).map((c: Row) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
          </div>
          <Field label="Cole o extrato"><textarea rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} /></Field>
          <button className="primary" disabled={busy || !conta || !texto.trim()} onClick={() => run(async () => { const j = await post({ acao: "EXTRATO_IMPORTAR", contaId: conta, texto }); setOk(`${j.novas} nova(s) de ${j.lidas} linha(s).`); setTexto(""); setConc(await api(`/api/financeiro?conciliacao=${conta}`)); }, "Extrato importado.")}>Importar</button>
          <DataTable head={["Data", "Descrição", "Valor", "Sugestão", ""]} empty={<Empty title="Nada a conciliar" />}>
            {(conc?.extratos ?? []).map((e: Row) => {
              const s = conc!.sugestoes.find((x: Row) => x.extratoId === e.id); const t = s?.tituloId ? conc!.titulos.find((x: Row) => x.id === s.tituloId) : null;
              return (<tr key={e.id}><td data-label="Data">{dataPt(e.data)}</td><td data-label="Descrição">{e.descricao}</td><td data-label="Valor"><b style={{ color: e.valor < 0 ? "#b00020" : undefined }}>{brl(e.valor)}</b></td>
                <td data-label="Sugestão">{t ? `${t.tipo} · ${t.parceiro} · ${brl(t.saldo)}` : <Badge tone="warning">{s?.motivo ?? "SEM_CANDIDATO"}</Badge>}</td>
                <td>{t && <button className="primary" disabled={busy} onClick={() => run(async () => { await post({ acao: "CONCILIAR", extratoId: e.id, tituloId: t.id }); setConc(await api(`/api/financeiro?conciliacao=${conta}`)); }, "Conciliado e baixado.")}>Confirmar</button>}</td></tr>);
            })}
          </DataTable>
        </Panel>
      )}

      {aba === "CONTABIL" && (<>
        <Panel title="Relatórios">
          <div className="formGrid">
            <Field label="De"><input type="date" value={ini} onChange={(e) => setIni(e.target.value)} /></Field>
            <Field label="Até"><input type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></Field>
            <button className="primary" onClick={() => api(`/api/financeiro?dre=${ini}|${fim}`).then((j) => setRel({ ...j, tipo: "DRE" })).catch((e) => setErro(e.message))}>DRE</button>
            <button className="crm-secondary" onClick={() => api(`/api/financeiro?balancete=${ini}|${fim}`).then((j) => setRel({ ...j, tipo: "BAL" })).catch((e) => setErro(e.message))}>Balancete</button>
          </div>
          {rel?.tipo === "DRE" && (<>
            <div className="kpis"><Kpi label="Receita líquida" value={brl(rel.dre.receita)} /><Kpi label="Custos" value={brl(rel.dre.custo)} /><Kpi label="Despesas" value={brl(rel.dre.despesa)} /><Kpi label="Resultado" value={brl(rel.dre.resultado)} tone={Number(rel.dre.resultado) >= 0 ? "success" : "danger"} /></div>
            <DataTable head={["Conta", "Tipo", "Valor"]}>{rel.dre.contas.map((c: Row) => <tr key={c.codigo}><td data-label="Conta">{c.codigo} {c.nome}</td><td data-label="Tipo">{c.tipo}</td><td data-label="Valor">{brl(c.valor)}</td></tr>)}</DataTable>
          </>)}
          {rel?.tipo === "BAL" && (
            <DataTable head={["Conta", "Saldo anterior", "Débitos", "Créditos", "Saldo final", ""]}>{rel.balancete.map((c: Row) => (
              <tr key={c.codigo}><td data-label="Conta">{c.codigo} {c.nome}</td><td data-label="Saldo anterior">{brl(c.saldo_anterior)}</td><td data-label="Débitos">{brl(c.debitos)}</td><td data-label="Créditos">{brl(c.creditos)}</td><td data-label="Saldo final">{brl(c.saldo_final)}</td>
                <td><button className="crm-secondary" onClick={() => { const id = d!.plano.find((p: Row) => p.codigo === c.codigo)?.id; if (id) api(`/api/financeiro?razao=${id}|${ini}|${fim}`).then((j) => setRazao(j.razao)).catch((e) => setErro(e.message)); }}>Razão</button></td></tr>
            ))}</DataTable>
          )}
        </Panel>
        <Modal open={!!razao} onClose={() => setRazao(null)} title="Razão da conta">
          <DataTable head={["Data", "Lanç.", "Histórico", "Débito", "Crédito", "Saldo"]} empty={<Empty title="Sem lançamentos" />}>{(razao ?? []).map((r, i) => <tr key={i}><td data-label="Data">{dataPt(r.data)}</td><td data-label="Lanç.">{r.numero}</td><td data-label="Histórico">{r.historico}</td><td data-label="Débito">{brl(r.debito)}</td><td data-label="Crédito">{brl(r.credito)}</td><td data-label="Saldo">{brl(r.saldo)}</td></tr>)}</DataTable>
        </Modal>
        <Panel title="Lançamento manual">
          <div className="formGrid">
            <Field label="Data"><input type="date" value={lan.data} onChange={(e) => setLan({ ...lan, data: e.target.value })} /></Field>
            <Field label="Histórico"><input value={lan.historico} onChange={(e) => setLan({ ...lan, historico: e.target.value })} /></Field>
          </div>
          {lan.p.map((p: Row, i: number) => (
            <div className="formGrid" key={i}>
              <Field label="Conta"><select value={p.contaId} onChange={(e) => setLan({ ...lan, p: lan.p.map((x: Row, j: number) => (j === i ? { ...x, contaId: e.target.value } : x)) })}><option value="">Selecione</option>{(d?.plano ?? []).filter((c: Row) => c.analitica).map((c: Row) => <option key={c.id} value={c.id}>{c.codigo} {c.nome}</option>)}</select></Field>
              <Field label="Débito"><input inputMode="decimal" value={p.debito} onChange={(e) => setLan({ ...lan, p: lan.p.map((x: Row, j: number) => (j === i ? { ...x, debito: e.target.value, credito: "" } : x)) })} /></Field>
              <Field label="Crédito"><input inputMode="decimal" value={p.credito} onChange={(e) => setLan({ ...lan, p: lan.p.map((x: Row, j: number) => (j === i ? { ...x, credito: e.target.value, debito: "" } : x)) })} /></Field>
            </div>
          ))}
          <button className="crm-secondary" onClick={() => setLan({ ...lan, p: [...lan.p, { contaId: "", debito: "", credito: "" }] })}>+ Partida</button>{" "}
          <button className="primary" disabled={busy} onClick={() => run(() => post({ acao: "LANCAMENTO", data: lan.data, historico: lan.historico, partidas: lan.p.filter((x: Row) => x.contaId) }), "Lançamento registrado.")}>Lançar</button>
        </Panel>
        <Panel title="Regras de lançamento automático">
          <div className="actions">
            <button className="crm-secondary" disabled={busy} onClick={() => run(async () => { const j = await post({ acao: "SEMEAR" }); setOk(`${j.criadas} conta(s) criada(s). Plano padrão e regras aplicados onde faltavam.`); }, "Plano padrão aplicado.")}>Aplicar plano de contas padrão</button>
            <button className="crm-secondary" disabled={busy} onClick={() => run(async () => { const j = await post({ acao: "REPROCESSAR" }); setOk(`${j.processados} evento(s) reprocessado(s).`); }, "Pendências reprocessadas.")}>Reprocessar pendências</button>
          </div>
          {(d?.pendencias ?? []).length > 0 && <div className="alert warning">Sem regra: {d!.pendencias.map((p: Row) => `${p.evento} (${p.n})`).join(", ")}</div>}
          <div className="formGrid">
            <Field label="Evento"><input value={rg.evento} onChange={(e) => setRg({ ...rg, evento: e.target.value.toUpperCase() })} placeholder="TITULO_PAGAR_COMPRA" /></Field>
            <Field label="Débito"><select value={rg.debitoId} onChange={(e) => setRg({ ...rg, debitoId: e.target.value })}><option value="">—</option>{(d?.plano ?? []).filter((c: Row) => c.analitica).map((c: Row) => <option key={c.id} value={c.id}>{c.codigo} {c.nome}</option>)}</select></Field>
            <Field label="Crédito"><select value={rg.creditoId} onChange={(e) => setRg({ ...rg, creditoId: e.target.value })}><option value="">—</option>{(d?.plano ?? []).filter((c: Row) => c.analitica).map((c: Row) => <option key={c.id} value={c.id}>{c.codigo} {c.nome}</option>)}</select></Field>
            <button className="primary" disabled={busy || !rg.evento || !rg.debitoId || !rg.creditoId} onClick={() => run(() => post({ acao: "REGRA", ...rg }), "Regra salva.")}>Salvar regra</button>
          </div>
          <DataTable head={["Evento", "Débito", "Crédito", "Ativa"]} empty={<Empty title="Nenhuma regra" />}>{(d?.regras ?? []).map((r: Row) => <tr key={r.evento}><td data-label="Evento">{r.evento}</td><td data-label="Débito">{r.debito}</td><td data-label="Crédito">{r.credito}</td><td data-label="Ativa">{r.ativo ? "Sim" : "Não"}</td></tr>)}</DataTable>
        </Panel>
      </>)}

      {aba === "ORCADO" && (
        <Panel title="Orçado × realizado por centro de custo">
          <div className="formGrid">
            <Field label="Centro"><select value={orcIn.centroId} onChange={(e) => setOrcIn({ ...orcIn, centroId: e.target.value })}><option value="">Selecione</option>{(d?.centros ?? []).map((c: Row) => <option key={c.id} value={c.id}>{c.codigo} · {c.nome}</option>)}</select></Field>
            <Field label="Conta"><select value={orcIn.contaId} onChange={(e) => setOrcIn({ ...orcIn, contaId: e.target.value })}><option value="">Selecione</option>{(d?.plano ?? []).filter((c: Row) => c.analitica && ["CUSTO", "DESPESA"].includes(c.tipo)).map((c: Row) => <option key={c.id} value={c.id}>{c.codigo} {c.nome}</option>)}</select></Field>
            <Field label="Competência"><input type="month" value={orcIn.competencia} onChange={(e) => setOrcIn({ ...orcIn, competencia: e.target.value })} /></Field>
            <Field label="Orçado (R$)"><input inputMode="decimal" value={orcIn.valor} onChange={(e) => setOrcIn({ ...orcIn, valor: e.target.value })} /></Field>
            <button className="primary" disabled={busy || !orcIn.centroId || !orcIn.contaId} onClick={() => run(() => post({ acao: "ORCAMENTO", ...orcIn }), "Orçamento salvo.")}>Salvar</button>
            <button className="crm-secondary" onClick={() => api(`/api/financeiro?orcado=${orcIn.competencia}|${orcIn.competencia}`).then((j) => setOrc(j.orcado)).catch((e) => setErro(e.message))}>Ver comparativo do mês</button>
          </div>
          <DataTable head={["Centro", "Conta", "Orçado", "Realizado", "Variação"]} empty={<Empty title="Sem comparativo" />}>
            {(orc ?? []).map((o, i) => <tr key={i}><td data-label="Centro">{o.centro}</td><td data-label="Conta">{o.conta}</td><td data-label="Orçado">{brl(o.orcado)}</td><td data-label="Realizado">{brl(o.realizado)}</td><td data-label="Variação"><Badge tone={Number(o.variacao) > 0 ? "danger" : "success"}>{brl(o.variacao)}</Badge></td></tr>)}
          </DataTable>
        </Panel>
      )}

      {aba === "CADASTROS" && (<>
        <Panel title="Contas bancárias">
          <div className="formGrid">
            <Field label="Nome *"><input value={cx.nome} onChange={(e) => setCx({ ...cx, nome: e.target.value })} /></Field>
            <Field label="Banco"><input value={cx.banco} onChange={(e) => setCx({ ...cx, banco: e.target.value })} /></Field>
            <Field label="Saldo inicial"><input inputMode="decimal" value={cx.saldoInicial} onChange={(e) => setCx({ ...cx, saldoInicial: e.target.value })} /></Field>
            <Field label="Chave PIX"><input value={cx.pixChave} onChange={(e) => setCx({ ...cx, pixChave: e.target.value })} /></Field>
            <Field label="Nome no PIX (25)"><input maxLength={25} value={cx.pixNome} onChange={(e) => setCx({ ...cx, pixNome: e.target.value })} /></Field>
            <Field label="Cidade (15)"><input maxLength={15} value={cx.pixCidade} onChange={(e) => setCx({ ...cx, pixCidade: e.target.value })} /></Field>
            <button className="primary" disabled={busy || !cx.nome} onClick={() => run(() => post({ acao: "CONTA", ...cx }), "Conta cadastrada.")}>Cadastrar</button>
          </div>
          <DataTable head={["Conta", "Banco", "Saldo inicial", "PIX"]} empty={<Empty title="Nenhuma conta" />}>{(d?.contas ?? []).map((c: Row) => <tr key={c.id}><td data-label="Conta">{c.nome}</td><td data-label="Banco">{c.banco}</td><td data-label="Saldo inicial">{brl(c.saldo_inicial)}</td><td data-label="PIX">{c.pix_chave || "—"}</td></tr>)}</DataTable>
        </Panel>
        <Panel title="Centros de custo">
          <div className="formGrid">
            <Field label="Código *"><input value={cc.codigo} onChange={(e) => setCc({ ...cc, codigo: e.target.value })} /></Field>
            <Field label="Nome *"><input value={cc.nome} onChange={(e) => setCc({ ...cc, nome: e.target.value })} /></Field>
            <button className="primary" disabled={busy || !cc.codigo || !cc.nome} onClick={() => run(() => post({ acao: "CENTRO", ...cc }), "Centro cadastrado.")}>Cadastrar</button>
          </div>
          <p>{(d?.centros ?? []).map((c: Row) => `${c.codigo} · ${c.nome}`).join("  |  ") || "Nenhum centro."}</p>
        </Panel>
        <Panel title="Plano de contas">
          <div className="formGrid">
            <Field label="Código *"><input value={pl.codigo} onChange={(e) => setPl({ ...pl, codigo: e.target.value })} /></Field>
            <Field label="Nome *"><input value={pl.nome} onChange={(e) => setPl({ ...pl, nome: e.target.value })} /></Field>
            <Field label="Tipo"><select value={pl.tipo} onChange={(e) => setPl({ ...pl, tipo: e.target.value })}>{["ATIVO", "PASSIVO", "PL", "RECEITA", "CUSTO", "DESPESA"].map((t) => <option key={t}>{t}</option>)}</select></Field>
            <button className="primary" disabled={busy || !pl.codigo || !pl.nome} onClick={() => run(() => post({ acao: "PLANO", ...pl }), "Conta criada.")}>Criar</button>
          </div>
          <DataTable head={["Código", "Nome", "Tipo", "Analítica"]} empty={<Empty title="Plano vazio — aplique o padrão na aba Contabilidade" />}>{(d?.plano ?? []).map((c: Row) => <tr key={c.id}><td data-label="Código">{c.codigo}</td><td data-label="Nome">{c.nome}</td><td data-label="Tipo">{c.tipo}</td><td data-label="Analítica">{c.analitica ? "Sim" : "Não"}</td></tr>)}</DataTable>
        </Panel>
      </>)}

      <Modal open={!!baixa} onClose={() => setBaixa(null)} title={baixa ? `Baixar título ${baixa.t.numero}` : ""} footer={<button className="primary" disabled={busy} onClick={() => run(async () => { await post({ acao: "BAIXAR_COMPLETO", tituloId: baixa!.t.id, contaId: baixa!.contaId, valor: baixa!.valor, juros: baixa!.juros, multa: baixa!.multa, desconto: baixa!.desconto, data: baixa!.data }); setBaixa(null); }, "Baixa registrada.")}>Confirmar baixa</button>}>
        {baixa && (<div className="formGrid">
          <Field label="Conta"><select value={baixa.contaId} onChange={(e) => setBaixa({ ...baixa, contaId: e.target.value })}>{(d?.contas ?? []).map((c: Row) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
          <Field label="Valor"><input inputMode="decimal" value={baixa.valor} onChange={(e) => setBaixa({ ...baixa, valor: e.target.value })} /></Field>
          <Field label="Data"><input type="date" value={baixa.data} onChange={(e) => setBaixa({ ...baixa, data: e.target.value })} /></Field>
          <Field label="Juros"><input inputMode="decimal" value={baixa.juros} onChange={(e) => setBaixa({ ...baixa, juros: e.target.value })} /></Field>
          <Field label="Multa"><input inputMode="decimal" value={baixa.multa} onChange={(e) => setBaixa({ ...baixa, multa: e.target.value })} /></Field>
          <Field label="Desconto" hint="reduz o valor do título"><input inputMode="decimal" value={baixa.desconto} onChange={(e) => setBaixa({ ...baixa, desconto: e.target.value })} /></Field>
          <button className="crm-secondary" type="button" disabled={busy} onClick={() => run(async () => { const j = await post({ acao: "ENCARGOS", tituloId: baixa!.t.id, data: baixa!.data }); const sg = j.sugestao; setBaixa({ ...baixa!, juros: String(sg.juros), multa: String(sg.multa) }); setOk(sg.dias_atraso > 0 ? `${sg.dias_atraso} dia(s) de atraso: multa 2% + juros 1% ao mês sugeridos.` : "Título em dia: sem encargos."); }, "")}>Sugerir encargos</button>
          <div className="muted">Total em caixa: <b>{brl(["valor", "juros", "multa"].reduce((a, k) => a + (Number(String(baixa[k]).replace(",", ".")) || 0), 0))}</b></div>
        </div>)}
      </Modal>
      <Modal open={!!novo} onClose={() => setNovo(null)} title="Novo título manual" footer={<button className="primary" disabled={busy} onClick={() => run(async () => { await post({ acao: "TITULO", ...novo }); setNovo(null); }, "Título criado.")}>Criar</button>}>
        {novo && (<div className="formGrid">
          <Field label="Tipo"><select value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })}><option value="PAGAR">A pagar</option><option value="RECEBER">A receber</option></select></Field>
          <Field label="Parceiro"><input value={novo.parceiro} onChange={(e) => setNovo({ ...novo, parceiro: e.target.value })} /></Field>
          <Field label="Descrição"><input value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} /></Field>
          <Field label="Vencimento"><input type="date" value={novo.vencimento} onChange={(e) => setNovo({ ...novo, vencimento: e.target.value })} /></Field>
          <Field label="Valor"><input inputMode="decimal" value={novo.valor} onChange={(e) => setNovo({ ...novo, valor: e.target.value })} /></Field>
          <Field label="Centro de custo"><select value={novo.centroId} onChange={(e) => setNovo({ ...novo, centroId: e.target.value })}><option value="">—</option>{(d?.centros ?? []).map((c: Row) => <option key={c.id} value={c.id}>{c.codigo}</option>)}</select></Field>
        </div>)}
      </Modal>
    </>
  );
}

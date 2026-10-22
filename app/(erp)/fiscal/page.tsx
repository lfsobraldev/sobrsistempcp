"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, DataTable, Empty, Field, Kpi, Modal, PageHeader, Panel, Segmented, type Tone } from "@/components/ui";

type Row = Record<string, any>;
type Aba = "DOCS" | "CADASTROS" | "REGRAS" | "APURACAO" | "PROVEDORES" | "XML";
const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataPt = (v: unknown) => (v ? new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—");
const tom: Record<string, Tone> = { PENDENCIA: "warning", PRONTO: "info", ENVIADO: "info", AUTORIZADO: "success", REJEITADO: "danger", CANCELADO: "neutral" } as Record<string, Tone>;
const mesAtual = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7);

async function api(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na operação.");
  return j;
}

export default function FiscalPage() {
  const [aba, setAba] = useState<Aba>("DOCS");
  const [d, setD] = useState<Row | null>(null);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [det, setDet] = useState<Row | null>(null);
  const [cancel, setCancel] = useState<Row | null>(null);
  const [em, setEm] = useState<Row>({ razaoSocial: "", cnpj: "", ie: "", uf: "", regime: "REAL" });
  const [pf, setPf] = useState<Row>({ produtoId: "", ncm: "", cest: "", origem: "0", unidade: "UN", classeIbsCbs: "" });
  const [cf, setCf] = useState<Row>({ clienteId: "", uf: "", ie: "", regime: "REAL" });
  const [cfop, setCfop] = useState<Row>({ codigo: "", descricao: "", sentido: "SAIDA" });
  const [rg, setRg] = useState<Row>({ descricao: "", operacao: "VENDA", ufOrigem: "", ufDestino: "", ncmPrefixo: "", regime: "", cfop: "", icms: "", ipi: "", ibsCst: "", ibsClasse: "", ibsAliquota: "0", cbsAliquota: "0", vigenciaInicio: "", vigenciaFim: "" });
  const [comp, setComp] = useState(mesAtual());
  const [ap, setAp] = useState<Row | null>(null);
  const [cred, setCred] = useState<Row>({ tributo: "ICMS", valor: "", origem: "", documento: "" });
  const [prov, setProv] = useState<Row>({ nome: "", adaptador: "SIMULADO", ambiente: "HOMOLOGACAO", segredoRef: "" });
  const [par, setPar] = useState<Row>({ chave: "IBS_CBS_INFORMAR", valor: "true", vigenciaInicio: "" });
  const [xml, setXml] = useState("");
  const [xres, setXres] = useState<Row | null>(null);

  const carregar = useCallback(async () => {
    try { const j = await api("/api/fiscal"); setD(j); if (j.emitente) setEm({ razaoSocial: j.emitente.razao_social, cnpj: j.emitente.cnpj, ie: j.emitente.ie, uf: j.emitente.uf, regime: j.emitente.regime }); setErro(""); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  const apurar = useCallback(async () => { try { setAp(await api(`/api/fiscal?apuracao=${comp}`)); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } }, [comp]);
  useEffect(() => { if (aba === "APURACAO") void apurar(); }, [aba, apurar]);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true); setErro(""); setOk("");
    try { await fn(); setOk(msg); await carregar(); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); await carregar(); } finally { setBusy(false); }
  };
  const post = (body: Row) => api("/api/fiscal", body);

  return (
    <>
      <PageHeader eyebrow="Fiscal" title="Documentos fiscais e tributação" description="Cadastros fiscais, regras com vigência, montagem do documento a partir da expedição, provedor de NF-e, apuração simplificada e exportação ao contador." />
      <div className="alert warning">O sistema não calcula tributos por conta própria nem assina XML: aplica as regras cadastradas pelo contador e entrega o documento ao provedor fiscal contratado. Valide regras e leiaute vigentes com o contador.</div>
      {erro && <div className="alert danger" role="alert">{erro}</div>}
      {ok && <div className="alert success">{ok}</div>}
      <div className="kpis">
        <Kpi label="Aguardando documento" value={d?.eventos.length ?? 0} tone={d?.eventos.length ? "warn" : ""} />
        <Kpi label="Pendências" value={(d?.documentos ?? []).filter((x: Row) => x.status === "PENDENCIA").length} tone="warn" />
        <Kpi label="Autorizados" value={(d?.documentos ?? []).filter((x: Row) => x.status === "AUTORIZADO").length} tone="success" />
        <Kpi label="Produtos sem NCM" value={(d?.produtos ?? []).filter((p: Row) => !p.ncm).length} />
      </div>
      <Segmented value={aba} onChange={setAba} options={[{ value: "DOCS", label: "Documentos" }, { value: "CADASTROS", label: "Cadastros fiscais" }, { value: "REGRAS", label: "Regras" }, { value: "APURACAO", label: "Apuração e contador" }, { value: "PROVEDORES", label: "Provedor e parâmetros" }, { value: "XML", label: "XML de entrada" }]} />

      {aba === "DOCS" && (<>
        <Panel title="Cargas fechadas sem documento">
          <DataTable head={["Remessa", "Cliente", "Total", "Data", ""]} empty={<Empty title="Nada aguardando documento" />}>
            {(d?.eventos ?? []).map((e: Row) => <tr key={e.id}><td data-label="Remessa">{e.remessa}</td><td data-label="Cliente">{e.cliente}</td><td data-label="Total">{brl(e.total)}</td><td data-label="Data">{dataPt(e.criado_em)}</td>
              <td><button className="primary" disabled={busy} onClick={() => run(() => post({ acao: "MONTAR", eventoId: e.id }), "Documento montado.")}>Montar NF-e</button></td></tr>)}
          </DataTable>
        </Panel>
        <Panel title="Documentos">
          <DataTable head={["Remessa", "Cliente", "Total", "Status", "Número", ""]} empty={<Empty title="Nenhum documento" />}>
            {(d?.documentos ?? []).map((x: Row) => <tr key={x.id}><td data-label="Remessa">{x.remessa}</td><td data-label="Cliente">{x.cliente}</td><td data-label="Total">{brl(x.total)}</td><td data-label="Status"><Badge tone={tom[x.status] ?? "neutral"}>{x.status}</Badge></td><td data-label="Número">{x.numero || "—"}</td>
              <td className="actions"><button className="crm-secondary" onClick={() => setDet(x)}>Detalhe</button>
                {x.status === "PENDENCIA" && <button className="crm-secondary" disabled={busy} onClick={() => run(() => post({ acao: "MONTAR", eventoId: x.evento_id }), "Documento remontado.")}>Remontar</button>}
                {["PRONTO"].includes(x.status) && <button className="primary" disabled={busy} onClick={() => run(() => post({ acao: "EMITIR", docId: x.id }), "Documento enviado ao provedor.")}>Emitir</button>}
                {x.status === "AUTORIZADO" && <button className="crm-secondary" onClick={() => setCancel({ id: x.id, justificativa: "" })}>Cancelar</button>}</td></tr>)}
          </DataTable>
        </Panel>
      </>)}

      {aba === "CADASTROS" && (<>
        <Panel title="Emitente">
          <div className="formGrid">
            <Field label="Razão social *"><input value={em.razaoSocial} onChange={(e) => setEm({ ...em, razaoSocial: e.target.value })} /></Field>
            <Field label="CNPJ *"><input inputMode="numeric" value={em.cnpj} onChange={(e) => setEm({ ...em, cnpj: e.target.value })} /></Field>
            <Field label="IE"><input value={em.ie} onChange={(e) => setEm({ ...em, ie: e.target.value })} /></Field>
            <Field label="UF *"><input maxLength={2} value={em.uf} onChange={(e) => setEm({ ...em, uf: e.target.value.toUpperCase() })} /></Field>
            <Field label="Regime"><select value={em.regime} onChange={(e) => setEm({ ...em, regime: e.target.value })}><option>SIMPLES</option><option>PRESUMIDO</option><option>REAL</option></select></Field>
            <button className="primary" disabled={busy} onClick={() => run(() => post({ acao: "EMITENTE", ...em }), "Emitente salvo.")}>Salvar emitente</button>
          </div>
        </Panel>
        <Panel title="Produto fiscal (NCM/CEST)">
          <div className="formGrid">
            <Field label="Produto *"><select value={pf.produtoId} onChange={(e) => { const p = d?.produtos.find((x: Row) => x.id === e.target.value); setPf({ ...pf, produtoId: e.target.value, ncm: p?.ncm ?? "", cest: p?.cest ?? "" }); }}><option value="">Selecione</option>{(d?.produtos ?? []).map((p: Row) => <option key={p.id} value={p.id}>{p.ncm ? "" : "Atenção: "}{p.codigo} · {p.descricao}</option>)}</select></Field>
            <Field label="NCM (8 dígitos) *"><input inputMode="numeric" value={pf.ncm} onChange={(e) => setPf({ ...pf, ncm: e.target.value })} /></Field>
            <Field label="CEST"><input inputMode="numeric" value={pf.cest} onChange={(e) => setPf({ ...pf, cest: e.target.value })} /></Field>
            <Field label="Origem (0-8)"><input inputMode="numeric" value={pf.origem} onChange={(e) => setPf({ ...pf, origem: e.target.value })} /></Field>
            <Field label="Unid. tributável"><input value={pf.unidade} onChange={(e) => setPf({ ...pf, unidade: e.target.value })} /></Field>
            <Field label="Classe IBS/CBS"><input value={pf.classeIbsCbs} onChange={(e) => setPf({ ...pf, classeIbsCbs: e.target.value })} /></Field>
            <button className="primary" disabled={busy || !pf.produtoId} onClick={() => run(() => post({ acao: "PRODUTO_FISCAL", ...pf }), "Produto fiscal salvo.")}>Salvar</button>
          </div>
        </Panel>
        <Panel title="Cliente fiscal">
          <div className="formGrid">
            <Field label="Cliente *"><select value={cf.clienteId} onChange={(e) => { const c = d?.clientes.find((x: Row) => x.id === e.target.value); setCf({ clienteId: e.target.value, uf: c?.uf ?? "", ie: c?.ie ?? "", regime: c?.regime_tributario ?? "REAL" }); }}><option value="">Selecione</option>{(d?.clientes ?? []).map((c: Row) => <option key={c.id} value={c.id}>{c.uf ? "" : "Atenção: "}{c.razao_social}</option>)}</select></Field>
            <Field label="UF *"><input maxLength={2} value={cf.uf} onChange={(e) => setCf({ ...cf, uf: e.target.value.toUpperCase() })} /></Field>
            <Field label="IE"><input value={cf.ie} onChange={(e) => setCf({ ...cf, ie: e.target.value })} /></Field>
            <Field label="Regime"><select value={cf.regime} onChange={(e) => setCf({ ...cf, regime: e.target.value })}><option>SIMPLES</option><option>PRESUMIDO</option><option>REAL</option></select></Field>
            <button className="primary" disabled={busy || !cf.clienteId} onClick={() => run(() => post({ acao: "CLIENTE_FISCAL", ...cf }), "Cliente atualizado.")}>Salvar</button>
          </div>
        </Panel>
        <Panel title="CFOP">
          <div className="formGrid">
            <Field label="Código *"><input inputMode="numeric" maxLength={4} value={cfop.codigo} onChange={(e) => setCfop({ ...cfop, codigo: e.target.value })} /></Field>
            <Field label="Descrição"><input value={cfop.descricao} onChange={(e) => setCfop({ ...cfop, descricao: e.target.value })} /></Field>
            <Field label="Sentido"><select value={cfop.sentido} onChange={(e) => setCfop({ ...cfop, sentido: e.target.value })}><option>SAIDA</option><option>ENTRADA</option></select></Field>
            <button className="primary" disabled={busy} onClick={() => run(() => post({ acao: "CFOP", ...cfop }), "CFOP salvo.")}>Salvar</button>
          </div>
          <p>{(d?.cfops ?? []).map((c: Row) => `${c.codigo} (${c.sentido})`).join(" · ") || "Nenhum CFOP cadastrado."}</p>
        </Panel>
      </>)}

      {aba === "REGRAS" && (<>
        <Panel title="Nova regra de tributação">
          <div className="formGrid">
            <Field label="Descrição"><input value={rg.descricao} onChange={(e) => setRg({ ...rg, descricao: e.target.value })} /></Field>
            <Field label="Operação"><select value={rg.operacao} onChange={(e) => setRg({ ...rg, operacao: e.target.value })}>{["VENDA", "COMPRA", "DEVOLUCAO_VENDA", "DEVOLUCAO_COMPRA", "REMESSA", "OUTRA"].map((o) => <option key={o}>{o}</option>)}</select></Field>
            <Field label="UF origem" hint="vazio = qualquer"><input maxLength={2} value={rg.ufOrigem} onChange={(e) => setRg({ ...rg, ufOrigem: e.target.value.toUpperCase() })} /></Field>
            <Field label="UF destino" hint="vazio = qualquer"><input maxLength={2} value={rg.ufDestino} onChange={(e) => setRg({ ...rg, ufDestino: e.target.value.toUpperCase() })} /></Field>
            <Field label="NCM (prefixo)" hint="vazio = qualquer"><input inputMode="numeric" value={rg.ncmPrefixo} onChange={(e) => setRg({ ...rg, ncmPrefixo: e.target.value })} /></Field>
            <Field label="Regime do destinatário"><select value={rg.regime} onChange={(e) => setRg({ ...rg, regime: e.target.value })}><option value="">Qualquer</option><option>SIMPLES</option><option>PRESUMIDO</option><option>REAL</option></select></Field>
            <Field label="CFOP *"><select value={rg.cfop} onChange={(e) => setRg({ ...rg, cfop: e.target.value })}><option value="">Selecione</option>{(d?.cfops ?? []).map((c: Row) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.descricao}</option>)}</select></Field>
            <Field label="ICMS %"><input inputMode="decimal" value={rg.icms} onChange={(e) => setRg({ ...rg, icms: e.target.value })} /></Field>
            <Field label="IPI %"><input inputMode="decimal" value={rg.ipi} onChange={(e) => setRg({ ...rg, ipi: e.target.value })} /></Field>
            <Field label="IBS CST"><input value={rg.ibsCst} onChange={(e) => setRg({ ...rg, ibsCst: e.target.value })} /></Field>
            <Field label="Classe trib. IBS/CBS"><input value={rg.ibsClasse} onChange={(e) => setRg({ ...rg, ibsClasse: e.target.value })} /></Field>
            <Field label="IBS %"><input inputMode="decimal" value={rg.ibsAliquota} onChange={(e) => setRg({ ...rg, ibsAliquota: e.target.value })} /></Field>
            <Field label="CBS %"><input inputMode="decimal" value={rg.cbsAliquota} onChange={(e) => setRg({ ...rg, cbsAliquota: e.target.value })} /></Field>
            <Field label="Vigência início *"><input type="date" value={rg.vigenciaInicio} onChange={(e) => setRg({ ...rg, vigenciaInicio: e.target.value })} /></Field>
            <Field label="Vigência fim"><input type="date" value={rg.vigenciaFim} onChange={(e) => setRg({ ...rg, vigenciaFim: e.target.value })} /></Field>
            <button className="primary" disabled={busy || !rg.cfop || !rg.vigenciaInicio} onClick={() => run(() => post({ acao: "REGRA", ...rg, tributos: [...(rg.icms !== "" ? [{ tributo: "ICMS", cst: "", aliquota: rg.icms }] : []), ...(rg.ipi !== "" ? [{ tributo: "IPI", cst: "", aliquota: rg.ipi }] : [])] }), "Regra criada.")}>Criar regra</button>
          </div>
        </Panel>
        <Panel title="Regras cadastradas">
          <DataTable head={["Regra", "Operação", "UF", "NCM", "CFOP", "Tributos", "Vigência", ""]} empty={<Empty title="Nenhuma regra" />}>
            {(d?.regras ?? []).map((r: Row) => <tr key={r.id}><td data-label="Regra">{r.descricao || r.id.slice(0, 8)} {!r.ativo && <Badge tone="neutral">inativa</Badge>}</td><td data-label="Operação">{r.operacao}</td><td data-label="UF">{r.uf_origem || "*"} → {r.uf_destino || "*"}</td><td data-label="NCM">{r.ncm_prefixo || "*"}</td><td data-label="CFOP">{r.cfop}</td>
              <td data-label="Tributos">{r.tributos.map((t: Row) => `${t.tributo} ${t.aliquota}%`).join(", ")}{Number(r.ibs_aliquota) || Number(r.cbs_aliquota) ? ` · IBS ${r.ibs_aliquota}% CBS ${r.cbs_aliquota}%` : ""}</td><td data-label="Vigência">{dataPt(r.vigencia_inicio)} → {r.vigencia_fim ? dataPt(r.vigencia_fim) : "aberta"}</td>
              <td>{r.ativo && <button className="crm-secondary" disabled={busy} onClick={() => run(() => post({ acao: "REGRA_DESATIVAR", regraId: r.id }), "Regra desativada.")}>Desativar</button>}</td></tr>)}
          </DataTable>
        </Panel>
      </>)}

      {aba === "APURACAO" && (
        <Panel title="Apuração simplificada e exportação">
          <div className="formGrid">
            <Field label="Competência"><input type="month" value={comp} onChange={(e) => setComp(e.target.value)} /></Field>
            <a className="crm-secondary" href={`/api/fiscal?export=sped-k&competencia=${comp}`}>Baixar Bloco K (SPED)</a>
            <a className="crm-secondary" href={`/api/fiscal?export=csv&competencia=${comp}`}>Baixar documentos (CSV)</a>
          </div>
          <p className="muted">Bloco K usa o estoque atual como saldo de fechamento: gere logo após o fechamento do mês e valide no PVA com o contador.</p>
          <DataTable head={["Tributo", "Débitos", "Créditos", "Saldo"]} empty={<Empty title="Sem movimento na competência" />}>
            {(ap?.apuracao ?? []).map((a: Row) => <tr key={a.tributo}><td data-label="Tributo">{a.tributo}</td><td data-label="Débitos">{brl(a.debito)}</td><td data-label="Créditos">{brl(a.credito)}</td><td data-label="Saldo"><b>{brl(a.saldo)}</b></td></tr>)}
          </DataTable>
          <h4>Lançar crédito</h4>
          <div className="formGrid">
            <Field label="Tributo"><input value={cred.tributo} onChange={(e) => setCred({ ...cred, tributo: e.target.value.toUpperCase() })} /></Field>
            <Field label="Valor"><input inputMode="decimal" value={cred.valor} onChange={(e) => setCred({ ...cred, valor: e.target.value })} /></Field>
            <Field label="Origem"><input value={cred.origem} onChange={(e) => setCred({ ...cred, origem: e.target.value })} /></Field>
            <Field label="Documento"><input value={cred.documento} onChange={(e) => setCred({ ...cred, documento: e.target.value })} /></Field>
            <button className="primary" disabled={busy || !cred.valor} onClick={() => run(async () => { await post({ acao: "CREDITO", competencia: comp, ...cred }); await apurar(); }, "Crédito lançado.")}>Lançar</button>
          </div>
        </Panel>
      )}

      {aba === "PROVEDORES" && (<>
        <Panel title="Provedor fiscal">
          <div className="formGrid">
            <Field label="Nome *"><input value={prov.nome} onChange={(e) => setProv({ ...prov, nome: e.target.value })} /></Field>
            <Field label="Adaptador"><select value={prov.adaptador} onChange={(e) => setProv({ ...prov, adaptador: e.target.value, ambiente: e.target.value === "SIMULADO" ? "HOMOLOGACAO" : prov.ambiente })}><option>SIMULADO</option><option>EXTERNO</option><option>MANUAL</option></select></Field>
            <Field label="Ambiente"><select value={prov.ambiente} onChange={(e) => setProv({ ...prov, ambiente: e.target.value })}><option>HOMOLOGACAO</option><option>PRODUCAO</option></select></Field>
            <Field label="Variável de ambiente do segredo" hint="nome da variável, nunca o segredo"><input value={prov.segredoRef} onChange={(e) => setProv({ ...prov, segredoRef: e.target.value })} /></Field>
            <button className="primary" disabled={busy || !prov.nome} onClick={() => run(() => post({ acao: "PROVEDOR", ...prov }), "Provedor cadastrado.")}>Cadastrar</button>
          </div>
          <DataTable head={["Nome", "Adaptador", "Ambiente", "Segredo (ref.)"]} empty={<Empty title="Nenhum provedor" />}>
            {(d?.provedores ?? []).map((p: Row) => <tr key={p.id}><td data-label="Nome">{p.nome}</td><td data-label="Adaptador">{p.adaptador}</td><td data-label="Ambiente"><Badge tone={p.ambiente === "PRODUCAO" ? "danger" : "info"}>{p.ambiente}</Badge></td><td data-label="Segredo">{p.segredo_ref || "—"}</td></tr>)}
          </DataTable>
        </Panel>
        <Panel title="Parâmetros com vigência (ex.: IBS_CBS_INFORMAR)">
          <div className="formGrid">
            <Field label="Chave"><input value={par.chave} onChange={(e) => setPar({ ...par, chave: e.target.value.toUpperCase() })} /></Field>
            <Field label="Valor"><input value={par.valor} onChange={(e) => setPar({ ...par, valor: e.target.value })} /></Field>
            <Field label="Vigência a partir de *"><input type="date" value={par.vigenciaInicio} onChange={(e) => setPar({ ...par, vigenciaInicio: e.target.value })} /></Field>
            <button className="primary" disabled={busy || !par.vigenciaInicio} onClick={() => run(() => post({ acao: "PARAMETRO", ...par }), "Parâmetro registrado.")}>Registrar</button>
          </div>
          <DataTable head={["Chave", "Vigência", "Valor"]} empty={<Empty title="Nenhum parâmetro" />}>
            {(d?.parametros ?? []).map((p: Row) => <tr key={p.chave + p.vigencia_inicio}><td data-label="Chave">{p.chave}</td><td data-label="Vigência">{dataPt(p.vigencia_inicio)}</td><td data-label="Valor">{p.valor}</td></tr>)}
          </DataTable>
        </Panel>
      </>)}

      {aba === "XML" && (
        <Panel title="Conferência fiscal da NF-e de entrada">
          <Field label="Cole o XML da NF-e"><textarea rows={8} value={xml} onChange={(e) => setXml(e.target.value)} /></Field>
          <button className="primary" disabled={busy || !xml.trim()} onClick={() => run(async () => setXres(await post({ acao: "XML_FISCAL", xml })), "XML conferido.")}>Conferir</button>
          {xres && (xres.divergencias.length === 0 ? <div className="alert success">{xres.itens} item(ns) sem divergência fiscal.</div> : (
            <DataTable head={["Item", "Produto", "Divergência", "XML", "Cadastro"]}>
              {xres.divergencias.map((x: Row, i: number) => <tr key={i}><td data-label="Item">{x.nItem}</td><td data-label="Produto">{x.codigo}</td><td data-label="Divergência"><Badge tone="danger">{x.tipo}</Badge></td><td data-label="XML">{x.xml || "—"}</td><td data-label="Cadastro">{x.cadastro || "—"}</td></tr>)}
            </DataTable>
          ))}
        </Panel>
      )}

      <Modal open={!!det} onClose={() => setDet(null)} title="Documento fiscal">
        {det && (<>
          <p><Badge tone={tom[det.status] ?? "neutral"}>{det.status}</Badge> {det.chave && <code>{det.chave}</code>}</p>
          {det.erro && <div className="alert danger">{det.erro}</div>}
          {det.pendencias.length > 0 && <div className="alert warning"><ul>{det.pendencias.map((p: string) => <li key={p}>{p}</li>)}</ul></div>}
          <p>{Object.entries(det.tributos ?? {}).map(([k, v]) => `${k}: ${brl(v)}`).join(" · ") || "Sem tributos calculados."}</p>
        </>)}
      </Modal>
      <Modal open={!!cancel} onClose={() => setCancel(null)} title="Cancelar documento" footer={<button className="primary" disabled={busy || (cancel?.justificativa ?? "").length < 15} onClick={() => run(async () => { await post({ acao: "CANCELAR", docId: cancel!.id, justificativa: cancel!.justificativa }); setCancel(null); }, "Documento cancelado.")}>Confirmar cancelamento</button>}>
        {cancel && <Field label="Justificativa (mín. 15 caracteres)"><textarea value={cancel.justificativa} onChange={(e) => setCancel({ ...cancel, justificativa: e.target.value })} /></Field>}
      </Modal>
    </>
  );
}

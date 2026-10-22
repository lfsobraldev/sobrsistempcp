"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Badge, DataTable, Empty, Field, Kpi, Modal, PageHeader, Panel, Segmented, type Tone } from "@/components/ui";

type Row = Record<string, any>;
type Aba = "APROVACOES" | "MATRIZ" | "ALCADAS" | "DELEGACOES" | "AUDITORIA" | "CONFIG";
const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataPt = (v: unknown) => (v ? new Date(String(v)).toLocaleString("pt-BR") : "—");
const diaPt = (v: unknown) => (v ? new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—");
const tom: Record<string, Tone> = { PENDENTE: "warning", APROVADO: "success", REJEITADO: "danger", CANCELADO: "neutral" } as Record<string, Tone>;

async function api(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na operação.");
  return j;
}
const post = (b: Row) => api("/api/seguranca", b);

export default function SegurancaPage() {
  const [ctx, setCtx] = useState<Row | null>(null);
  const [aba, setAba] = useState<Aba>("APROVACOES");
  const [erro, setErro] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);
  const [ap, setAp] = useState<Row | null>(null); const [mz, setMz] = useState<Row | null>(null); const [rg, setRg] = useState<Row | null>(null);
  const [dl, setDl] = useState<Row | null>(null); const [au, setAu] = useState<Row | null>(null); const [cf, setCf] = useState<Row[]>([]);
  const [det, setDet] = useState<{ a: Row; etapas: Row[] } | null>(null); const [dif, setDif] = useState<Row | null>(null);
  const [f, setF] = useState<Row>({}); const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => { api("/api/seguranca?visao=contexto").then(setCtx).catch((e) => setErro(e.message)); }, []);
  const carregar = useCallback(async () => {
    try {
      if (aba === "APROVACOES") setAp(await api("/api/seguranca?visao=pendentes"));
      if (aba === "MATRIZ") setMz(await api("/api/seguranca?visao=matriz"));
      if (aba === "ALCADAS") setRg(await api("/api/seguranca?visao=regras"));
      if (aba === "DELEGACOES") setDl(await api("/api/seguranca?visao=delegacoes"));
      if (aba === "AUDITORIA") setAu(await api(`/api/seguranca?visao=auditoria&entidade=${encodeURIComponent(f.aEnt || "")}&ator=${encodeURIComponent(f.aAtor || "")}&de=${f.aDe || ""}&ate=${f.aAte || ""}`));
      if (aba === "CONFIG") setCf((await api("/api/seguranca?visao=config")).config);
      setErro("");
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); }
  }, [aba, f.aEnt, f.aAtor, f.aDe, f.aAte]);
  useEffect(() => { void carregar(); }, [carregar]);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true); setErro(""); setOk("");
    try { await fn(); setOk(msg); await carregar(); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } finally { setBusy(false); }
  };
  const abrir = async (a: Row) => { try { setDet({ a, etapas: (await api("/api/seguranca?visao=aprovacao&id=" + a.id)).etapas }); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } };
  const admin = !!ctx?.admin;
  const celula = (cargo: string, modulo: string, acao: string) => mz?.linhas.find((l: Row) => l.cargo === cargo && l.modulo === modulo && l.acao === acao);

  return (
    <>
      <PageHeader eyebrow="Governança" title={`Segurança e aprovações${ctx?.empresa ? " · " + ctx.empresa : ""}`} description="Alçadas por valor, aprovação em níveis com separação de funções, delegação em ausência, matriz de autorização por cargo e trilha de auditoria." />
      {ctx && <p className="muted">Seu cargo: <b>{ctx.cargo}</b> (nível {ctx.nivel})</p>}
      {erro && <div className="alert danger" role="alert">{erro}</div>}
      {ok && <div className="alert success">{ok}</div>}
      <Segmented value={aba} onChange={(v) => setAba(v as Aba)} options={[
        { value: "APROVACOES", label: `Aprovações${ap?.pendentes?.filter((p: Row) => p.possoDecidir).length ? ` (${ap.pendentes.filter((p: Row) => p.possoDecidir).length})` : ""}` },
        { value: "MATRIZ", label: "Matriz de autorização" }, { value: "ALCADAS", label: "Alçadas" }, { value: "DELEGACOES", label: "Delegações" },
        { value: "AUDITORIA", label: "Auditoria" }, { value: "CONFIG", label: "Configuração" },
      ]} />

      {aba === "APROVACOES" && ap && (<>
        <div className="kpis">
          <Kpi label="Pendentes" value={ap.pendentes.length} tone={ap.pendentes.length ? "warn" : "success"} />
          <Kpi label="Para você decidir" value={ap.pendentes.filter((p: Row) => p.possoDecidir).length} />
          <Kpi label="Suas solicitações abertas" value={ap.minhas.filter((m: Row) => m.status === "PENDENTE").length} />
        </div>
        <Panel title="Nova solicitação de aprovação" subtitle="O sistema escolhe os níveis pela alçada cadastrada para o módulo, tipo e valor.">
          <div className="formGrid">
            <Field label="Módulo"><select value={f.sMod || "COMPRAS"} onChange={(e) => set("sMod", e.target.value)}>{(ctx?.modulos ?? []).map((m: string) => <option key={m}>{m}</option>)}</select></Field>
            <Field label="Tipo de documento" hint="ex.: PEDIDO_COMPRA, DESCONTO, PAGAMENTO"><input value={f.sTipo || ""} onChange={(e) => set("sTipo", e.target.value)} /></Field>
            <Field label="Código do documento"><input value={f.sDoc || ""} onChange={(e) => set("sDoc", e.target.value)} /></Field>
            <Field label="Referência"><input value={f.sRef || ""} onChange={(e) => set("sRef", e.target.value)} /></Field>
            <Field label="Valor (R$)"><input inputMode="decimal" value={f.sVal || ""} onChange={(e) => set("sVal", e.target.value)} /></Field>
            <Field label="Descrição" className="wide"><input value={f.sDesc || ""} onChange={(e) => set("sDesc", e.target.value)} /></Field>
            <button className="primary" disabled={busy || !f.sTipo || !f.sDoc || !f.sVal} onClick={() => run(async () => { await post({ acao: "SOLICITAR", modulo: f.sMod || "COMPRAS", tipoDocumento: f.sTipo, documentoId: f.sDoc, documentoRef: f.sRef, valor: f.sVal, descricao: f.sDesc }); setF({}); }, "Aprovação solicitada.")}>Solicitar</button>
          </div>
        </Panel>
        <Panel title="Fila de aprovação">
          <DataTable head={["Nº", "Módulo", "Documento", "Valor", "Solicitante", "Nível", "Exige", "Dias", ""]} empty={!ap.pendentes.length && <Empty title="Nada pendente" />}>
            {ap.pendentes.map((p: Row) => (
              <tr key={p.id}><td>{p.numero}</td><td>{p.modulo} · {p.tipo_documento}</td><td>{p.documento_ref}</td><td>{brl(p.valor)}</td><td>{p.solicitante}</td><td>{p.nivel_atual}/{p.niveis_total}</td><td>{p.cargo_exigido}</td><td>{p.dias}</td>
                <td className="row" style={{ gap: 6 }}>
                  <button onClick={() => abrir(p)}>Detalhes</button>
                  {p.possoDecidir && <button className="primary" disabled={busy} onClick={() => run(() => post({ acao: "DECIDIR", id: p.id, decisao: "APROVAR" }), "Decisão registrada.")}>Aprovar</button>}
                  {p.possoDecidir && <button disabled={busy} onClick={() => { const t = window.prompt("Motivo da rejeição:"); if (t) void run(() => post({ acao: "DECIDIR", id: p.id, decisao: "REJEITAR", parecer: t }), "Rejeitada."); }}>Rejeitar</button>}
                </td></tr>
            ))}
          </DataTable>
        </Panel>
        <Panel title="Minhas solicitações">
          <DataTable head={["Nº", "Documento", "Valor", "Status", "Nível", ""]} empty={!ap.minhas.length && <Empty title="Nenhuma solicitação" />}>
            {ap.minhas.map((m: Row) => <tr key={m.id}><td>{m.numero}</td><td>{m.modulo} · {m.documento_ref}</td><td>{brl(m.valor)}</td><td><Badge tone={tom[m.status]}>{m.status}</Badge></td><td>{m.nivel_atual}/{m.niveis_total}</td>
              <td>{m.status === "PENDENTE" && <button disabled={busy} onClick={() => run(() => post({ acao: "CANCELAR", id: m.id }), "Solicitação cancelada.")}>Cancelar</button>}</td></tr>)}
          </DataTable>
        </Panel>
        <Panel title="Últimas decisões">
          <DataTable head={["Nº", "Documento", "Valor", "Nível", "Decisão", "Por", "Em", "Parecer"]} empty={!ap.decididas.length && <Empty title="Sem decisões" />}>
            {ap.decididas.map((d: Row, i: number) => <tr key={i}><td>{d.numero}</td><td>{d.modulo} · {d.documento_ref}</td><td>{brl(d.valor)}</td><td>{d.nivel}</td><td><Badge tone={tom[d.etapa]}>{d.etapa}</Badge></td><td>{d.decidido_por}</td><td>{dataPt(d.decidido_em)}</td><td>{d.parecer}</td></tr>)}
          </DataTable>
        </Panel>
      </>)}

      {aba === "MATRIZ" && mz && (
        <Panel title="Matriz de autorização" subtitle={admin ? "Marque o que cada cargo pode fazer e o limite de valor por ação. Alterações ficam na auditoria." : "Somente PCP, Diretor e Administrador alteram a matriz."}>
          <div className="tableScroll"><div className="tableWrap">
            <table>
              <thead><tr><th>Módulo / ação</th>{mz.cargos.filter((c: Row) => c.nivel >= 4).map((c: Row) => <th key={c.cargo}>{c.cargo}</th>)}</tr></thead>
              <tbody>
                {mz.modulos.map((m: string) => (
                  <Fragment key={m}>
                    <tr><th colSpan={1 + mz.cargos.filter((c: Row) => c.nivel >= 4).length} style={{ textAlign: "left", background: "var(--surface-2)" }}>{m}</th></tr>
                    {["APROVAR", "CANCELAR", "EXPORTAR"].map((a) => (
                      <tr key={m + a}><td>{a}</td>
                        {mz.cargos.filter((c: Row) => c.nivel >= 4).map((c: Row) => {
                          const l = celula(c.cargo, m, a);
                          return <td key={c.cargo}>
                            <input type="checkbox" disabled={!admin || busy} checked={!!l?.permitido} onChange={(e) => run(() => post({ acao: "MATRIZ_SALVAR", cargo: c.cargo, modulo: m, acaoMatriz: a, permitido: e.target.checked, limite: l?.limite_valor ?? "" }), "Matriz atualizada.")} />
                            {a === "APROVAR" && l?.permitido && <input size={7} placeholder="sem limite" defaultValue={l.limite_valor ?? ""} disabled={!admin || busy} onBlur={(e) => { if (String(l.limite_valor ?? "") !== e.target.value) void run(() => post({ acao: "MATRIZ_SALVAR", cargo: c.cargo, modulo: m, acaoMatriz: a, permitido: true, limite: e.target.value }), "Limite atualizado."); }} />}
                          </td>;
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div></div>
        </Panel>
      )}

      {aba === "ALCADAS" && rg && (<>
        {admin && <Panel title="Nova regra de alçada" subtitle="Várias regras na mesma faixa de valor formam níveis em sequência (nível 1, depois 2...).">
          <div className="formGrid">
            <Field label="Módulo"><select value={f.rMod || "COMPRAS"} onChange={(e) => set("rMod", e.target.value)}>{(ctx?.modulos ?? []).map((m: string) => <option key={m}>{m}</option>)}</select></Field>
            <Field label="Tipo de documento"><input value={f.rTipo || ""} onChange={(e) => set("rTipo", e.target.value)} /></Field>
            <Field label="De (R$)"><input inputMode="decimal" value={f.rMin || ""} onChange={(e) => set("rMin", e.target.value)} /></Field>
            <Field label="Até (R$)" hint="vazio = sem teto"><input inputMode="decimal" value={f.rMax || ""} onChange={(e) => set("rMax", e.target.value)} /></Field>
            <Field label="Nível"><input inputMode="numeric" value={f.rNiv || "1"} onChange={(e) => set("rNiv", e.target.value)} /></Field>
            <Field label="Cargo aprovador"><select value={f.rCargo || "GERENTE"} onChange={(e) => set("rCargo", e.target.value)}>{rg.cargos.map((c: Row) => <option key={c.cargo}>{c.cargo}</option>)}</select></Field>
            <button className="primary" disabled={busy || !f.rTipo} onClick={() => run(() => post({ acao: "REGRA_SALVAR", modulo: f.rMod || "COMPRAS", tipoDocumento: f.rTipo, valorMin: f.rMin || 0, valorMax: f.rMax, nivel: f.rNiv || 1, cargoAprovador: f.rCargo || "GERENTE" }), "Regra criada.")}>Criar regra</button>
          </div>
        </Panel>}
        <Panel title="Alçadas cadastradas">
          <DataTable head={["Módulo", "Documento", "Faixa de valor", "Nível", "Aprovador", "Ativa"]} empty={!rg.regras.length && <Empty title="Sem regras" />}>
            {rg.regras.map((r: Row) => <tr key={r.id}><td>{r.modulo}</td><td>{r.tipo_documento}</td><td>{brl(r.valor_min)} → {r.valor_max == null ? "sem teto" : brl(r.valor_max)}</td><td>{r.nivel}</td><td>{r.cargo_aprovador}</td>
              <td><input type="checkbox" disabled={!admin || busy} checked={r.ativo} onChange={(e) => run(() => post({ acao: "REGRA_ATIVA", id: r.id, ativo: e.target.checked }), "Regra atualizada.")} /></td></tr>)}
          </DataTable>
        </Panel>
      </>)}

      {aba === "DELEGACOES" && dl && (<>
        <Panel title="Delegar minha alçada em uma ausência" subtitle="Quem assume decide com o cargo delegado (nunca acima do seu) durante o período.">
          <div className="formGrid">
            <Field label="Login de quem substitui"><input value={f.dPara || ""} onChange={(e) => set("dPara", e.target.value)} /></Field>
            <Field label="Cargo delegado"><select value={f.dCargo || "GERENTE"} onChange={(e) => set("dCargo", e.target.value)}>{dl.cargos.map((c: Row) => <option key={c.cargo}>{c.cargo}</option>)}</select></Field>
            <Field label="De"><input type="date" value={f.dIni || ""} onChange={(e) => set("dIni", e.target.value)} /></Field>
            <Field label="Até"><input type="date" value={f.dFim || ""} onChange={(e) => set("dFim", e.target.value)} /></Field>
            <button className="primary" disabled={busy || !f.dPara || !f.dIni || !f.dFim} onClick={() => run(() => post({ acao: "DELEGAR", paraUsuario: f.dPara, cargoDelegado: f.dCargo || "GERENTE", inicio: f.dIni, fim: f.dFim }), "Delegação criada.")}>Delegar</button>
          </div>
        </Panel>
        <Panel title="Delegações">
          <DataTable head={["De", "Para", "Cargo", "Período", "Situação", ""]} empty={!dl.delegacoes.length && <Empty title="Nenhuma delegação" />}>
            {dl.delegacoes.map((d: Row) => <tr key={d.id}><td>{d.de_usuario}</td><td>{d.para_usuario}</td><td>{d.cargo_delegado}</td><td>{diaPt(d.inicio)} → {diaPt(d.fim)}</td><td>{d.ativo ? <Badge tone="success">Ativa</Badge> : <Badge>Encerrada</Badge>}</td>
              <td>{d.ativo && <button disabled={busy} onClick={() => run(() => post({ acao: "DELEGACAO_ENCERRAR", id: d.id }), "Delegação encerrada.")}>Encerrar</button>}</td></tr>)}
          </DataTable>
        </Panel>
      </>)}

      {aba === "AUDITORIA" && (
        <Panel title="Trilha de auditoria" subtitle="Quem fez o quê, quando, com o antes e o depois. Registros não podem ser alterados nem apagados.">
          <div className="formGrid">
            <Field label="Entidade"><select value={f.aEnt || ""} onChange={(e) => set("aEnt", e.target.value)}><option value="">Todas</option>{(au?.entidades ?? []).map((e: string) => <option key={e}>{e}</option>)}</select></Field>
            <Field label="Usuário"><input value={f.aAtor || ""} onChange={(e) => set("aAtor", e.target.value)} /></Field>
            <Field label="De"><input type="date" value={f.aDe || ""} onChange={(e) => set("aDe", e.target.value)} /></Field>
            <Field label="Até"><input type="date" value={f.aAte || ""} onChange={(e) => set("aAte", e.target.value)} /></Field>
          </div>
          <DataTable head={["Quando", "Quem", "Ação", "Entidade", "Registro", ""]} empty={au && !au.eventos.length && <Empty title="Sem eventos" />}>
            {(au?.eventos ?? []).map((ev: Row) => <tr key={ev.id}><td>{dataPt(ev.criado_em)}</td><td>{ev.ator}</td><td><Badge tone={ev.acao === "DELETE" ? "danger" : ev.acao === "INSERT" ? "success" : "info"}>{ev.acao}</Badge></td><td>{ev.entidade}</td><td>{String(ev.entidade_id).slice(0, 8)}</td><td><button onClick={() => setDif(ev)}>Antes/depois</button></td></tr>)}
          </DataTable>
        </Panel>
      )}

      {aba === "CONFIG" && (
        <Panel title="Configuração da unidade" subtitle="A duração da sessão é definida na variável SESSAO_HORAS (1 a 24 h, padrão 12) no servidor.">
          <DataTable head={["Chave", "Valor", "Descrição"]}>
            {cf.map((c) => <tr key={c.chave}><td>{c.chave}</td><td><input defaultValue={c.valor} disabled={!admin} onBlur={(e) => { if (e.target.value !== c.valor) void run(() => post({ acao: "CONFIG_SALVAR", chave: c.chave, valor: e.target.value }), "Configuração salva."); }} /></td><td>{c.descricao}</td></tr>)}
          </DataTable>
        </Panel>
      )}

      <Modal open={!!det} title={det ? `Aprovação #${det.a.numero} · ${det.a.documento_ref}` : ""} onClose={() => setDet(null)}>
        {det && <DataTable head={["Nível", "Cargo exigido", "Situação", "Decidido por", "Em", "Parecer"]}>
          {det.etapas.map((e) => <tr key={e.nivel}><td>{e.nivel}</td><td>{e.cargo_exigido}</td><td><Badge tone={tom[e.status]}>{e.status}</Badge></td><td>{e.decidido_por || "—"}</td><td>{e.decidido_em ? dataPt(e.decidido_em) : "—"}</td><td>{e.parecer}</td></tr>)}
        </DataTable>}
      </Modal>
      <Modal open={!!dif} title={dif ? `${dif.entidade} · ${dif.acao}` : ""} onClose={() => setDif(null)}>
        {dif && <div className="grid2"><div><h4>Antes</h4><pre style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>{dif.antes ? JSON.stringify(dif.antes, null, 1) : "—"}</pre></div><div><h4>Depois</h4><pre style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>{dif.depois ? JSON.stringify(dif.depois, null, 1) : "—"}</pre></div></div>}
      </Modal>
    </>
  );
}

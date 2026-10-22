"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, DataTable, Empty, Field, Modal, PageHeader, Panel, Segmented, type Tone } from "@/components/ui";
import { useOps } from "@/components/operational-provider";

type Row = Record<string, any>;
type Aba = "DOCS" | "QUALIFICACAO";
const tom: Record<string, Tone> = { RASCUNHO: "neutral", EM_APROVACAO: "warning", APROVADA: "success", OBSOLETA: "neutral" } as Record<string, Tone>;
const dataPt = (v: unknown) => (v ? new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—");

async function api(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na operação.");
  return j;
}

export default function DocumentosPage() {
  const { me } = useOps();
  const [aba, setAba] = useState<Aba>("DOCS");
  const [d, setD] = useState<Row | null>(null);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [novo, setNovo] = useState<Row | null>(null);
  const [ver, setVer] = useState<Row | null>(null);
  const [vinc, setVinc] = useState<Row>({ documentoId: "", processo: "", produtoCodigo: "" });
  const [ql, setQl] = useState<Row>({ usuario: "", processo: "", nivel: "OPERADOR", validade: "" });
  const [req, setReq] = useState("");

  const carregar = useCallback(async () => { try { setD(await api("/api/documentos")); setErro(""); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true); setErro(""); setOk("");
    try { await fn(); setOk(msg); await carregar(); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } finally { setBusy(false); }
  };
  const post = (b: Row) => api("/api/documentos", b);
  const gerente = ["GERENTE", "PCP"].includes(me?.perfil || "");

  return (
    <>
      <PageHeader eyebrow="Qualidade e Produção" title="Documentos controlados e qualificação" description="Procedimentos, instruções e desenhos com versão e aprovação; a versão aprovada aparece na tela do operador, na operação do setor ou produto vinculado. Qualificação por posto limita quem pode apontar." />
      {erro && <div className="alert danger" role="alert">{erro}</div>}
      {ok && <div className="alert success">{ok}</div>}
      <Segmented value={aba} onChange={setAba} options={[{ value: "DOCS", label: "Documentos" }, { value: "QUALIFICACAO", label: "Qualificação por posto" }]} />

      {aba === "DOCS" && (<>
        <Panel title="Documentos">
          <button className="primary" onClick={() => setNovo({ codigo: "", titulo: "", tipo: "INSTRUCAO", conteudo: "", anexoUrl: "" })}>Novo documento</button>
          <DataTable head={["Código", "Título", "Tipo", "Vigente", "Em elaboração", "Vínculos", ""]} empty={<Empty title="Nenhum documento" />}>
            {(d?.documentos ?? []).map((x: Row) => {
              const vig = (x.versoes ?? []).find((v: Row) => v.status === "APROVADA"), pend = (x.versoes ?? []).find((v: Row) => ["RASCUNHO", "EM_APROVACAO"].includes(v.status));
              return (<tr key={x.id}><td data-label="Código">{x.codigo}</td><td data-label="Título">{x.titulo}</td><td data-label="Tipo">{x.tipo}</td>
                <td data-label="Vigente">{vig ? <Badge tone="success">v{vig.versao} · {dataPt(vig.vigencia_inicio)}</Badge> : "—"}</td>
                <td data-label="Em elaboração">{pend ? <Badge tone={tom[pend.status]}>v{pend.versao} {pend.status}</Badge> : "—"}</td>
                <td data-label="Vínculos">{(d?.vinculos ?? []).filter((l: Row) => l.documento_id === x.id).map((l: Row) => l.processo || l.produto_codigo).join(", ") || "—"}</td>
                <td className="actions"><button className="crm-secondary" onClick={() => setVer(x)}>Abrir</button>
                  {!pend && <button className="crm-secondary" disabled={busy} onClick={() => run(() => post({ acao: "VERSAO", documentoId: x.id, resumo: "Nova revisão" }), "Nova versão criada em rascunho.")}>Nova revisão</button>}</td></tr>);
            })}
          </DataTable>
        </Panel>
        <Panel title="Vincular a setor e/ou produto">
          <div className="formGrid">
            <Field label="Documento"><select value={vinc.documentoId} onChange={(e) => setVinc({ ...vinc, documentoId: e.target.value })}><option value="">Selecione</option>{(d?.documentos ?? []).map((x: Row) => <option key={x.id} value={x.id}>{x.codigo} · {x.titulo}</option>)}</select></Field>
            <Field label="Setor (processo)"><input value={vinc.processo} onChange={(e) => setVinc({ ...vinc, processo: e.target.value })} /></Field>
            <Field label="Produto (código)"><input value={vinc.produtoCodigo} onChange={(e) => setVinc({ ...vinc, produtoCodigo: e.target.value })} /></Field>
            <button className="primary" disabled={busy || !vinc.documentoId || (!vinc.processo && !vinc.produtoCodigo)} onClick={() => run(() => post({ acao: "VINCULO", ...vinc }), "Vínculo criado.")}>Vincular</button>
          </div>
          <DataTable head={["Documento", "Setor", "Produto", ""]} empty={<Empty title="Nenhum vínculo" />}>
            {(d?.vinculos ?? []).map((l: Row) => <tr key={l.id}><td data-label="Documento">{l.codigo}</td><td data-label="Setor">{l.processo || "—"}</td><td data-label="Produto">{l.produto_codigo || "—"}</td><td><button className="crm-secondary" disabled={busy} onClick={() => run(() => post({ acao: "VINCULO_REMOVER", vinculoId: l.id }), "Vínculo removido.")}>Remover</button></td></tr>)}
          </DataTable>
        </Panel>
      </>)}

      {aba === "QUALIFICACAO" && (<>
        <Panel title="Controle de qualificação">
          <p>Situação: {d?.qualificacaoAtiva ? <Badge tone="success">ATIVA — apontamento bloqueado sem qualificação nos setores exigidos</Badge> : <Badge tone="neutral">desligada</Badge>}</p>
          {gerente && <button className="crm-secondary" disabled={busy} onClick={() => run(() => post({ acao: "QUALIFICACAO_LIGAR", ativa: !d?.qualificacaoAtiva }), d?.qualificacaoAtiva ? "Controle desligado." : "Controle ligado.")}>{d?.qualificacaoAtiva ? "Desligar controle" : "Ligar controle"}</button>}
          <div className="formGrid">
            <Field label="Setor exigido"><input value={req} onChange={(e) => setReq(e.target.value)} /></Field>
            <button className="primary" disabled={busy || !req} onClick={() => run(() => post({ acao: "REQUISITO", processo: req }), "Setor passa a exigir qualificação.")}>Exigir</button>
          </div>
          <p>{(d?.requisitos ?? []).map((r: Row) => r.processo).join(" · ") || "Nenhum setor exige qualificação."}</p>
        </Panel>
        <Panel title="Qualificações vigentes">
          <div className="formGrid">
            <Field label="Usuário (login) *"><input value={ql.usuario} onChange={(e) => setQl({ ...ql, usuario: e.target.value })} /></Field>
            <Field label="Setor *"><input value={ql.processo} onChange={(e) => setQl({ ...ql, processo: e.target.value })} /></Field>
            <Field label="Nível"><select value={ql.nivel} onChange={(e) => setQl({ ...ql, nivel: e.target.value })}><option>APRENDIZ</option><option>OPERADOR</option><option>INSTRUTOR</option></select></Field>
            <Field label="Validade"><input type="date" value={ql.validade} onChange={(e) => setQl({ ...ql, validade: e.target.value })} /></Field>
            <button className="primary" disabled={busy || !ql.usuario || !ql.processo} onClick={() => run(() => post({ acao: "QUALIFICACAO", ...ql }), "Qualificação registrada.")}>Registrar</button>
          </div>
          <DataTable head={["Usuário", "Setor", "Nível", "Validade", ""]} empty={<Empty title="Nenhuma qualificação" />}>
            {(d?.qualificacoes ?? []).map((x: Row) => <tr key={x.id}><td data-label="Usuário">{x.usuario}</td><td data-label="Setor">{x.processo}</td><td data-label="Nível">{x.nivel}</td><td data-label="Validade">{x.validade ? <Badge tone={String(x.validade).slice(0, 10) < new Date().toISOString().slice(0, 10) ? "danger" : "neutral"}>{dataPt(x.validade)}</Badge> : "sem validade"}</td>
              <td><button className="crm-secondary" disabled={busy} onClick={() => run(() => post({ acao: "QUALIFICACAO", usuario: x.usuario, processo: x.processo, revogar: true }), "Qualificação revogada.")}>Revogar</button></td></tr>)}
          </DataTable>
        </Panel>
      </>)}

      <Modal open={!!novo} onClose={() => setNovo(null)} title="Novo documento" footer={<button className="primary" disabled={busy || !novo?.codigo || !novo?.titulo} onClick={() => run(async () => { await post({ acao: "DOCUMENTO", ...novo }); setNovo(null); }, "Documento criado em rascunho.")}>Criar</button>}>
        {novo && (<div className="formGrid">
          <Field label="Código *"><input value={novo.codigo} onChange={(e) => setNovo({ ...novo, codigo: e.target.value })} /></Field>
          <Field label="Título *"><input value={novo.titulo} onChange={(e) => setNovo({ ...novo, titulo: e.target.value })} /></Field>
          <Field label="Tipo"><select value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })}>{["PROCEDIMENTO", "INSTRUCAO", "DESENHO", "OUTRO"].map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Conteúdo"><textarea rows={6} value={novo.conteudo} onChange={(e) => setNovo({ ...novo, conteudo: e.target.value })} /></Field>
          <Field label="Link do anexo/desenho (https)"><input value={novo.anexoUrl} onChange={(e) => setNovo({ ...novo, anexoUrl: e.target.value })} /></Field>
        </div>)}
      </Modal>
      <Modal open={!!ver} onClose={() => setVer(null)} title={ver ? `${ver.codigo} · ${ver.titulo}` : ""}>
        {ver && (ver.versoes ?? []).map((v: Row) => (
          <div key={v.id} className="panel">
            <p><b>Versão {v.versao}</b> <Badge tone={tom[v.status]}>{v.status}</Badge> {v.aprovado_por && `· aprovada por ${v.aprovado_por}`} {v.resumo && `· ${v.resumo}`}</p>
            {v.status === "RASCUNHO" ? (<>
              <Field label="Conteúdo"><textarea rows={6} defaultValue={v.conteudo} id={`c-${v.id}`} /></Field>
              <Field label="Link do anexo"><input defaultValue={v.anexo_url} id={`a-${v.id}`} /></Field>
              <button className="crm-secondary" disabled={busy} onClick={() => run(() => post({ acao: "EDITAR", versaoId: v.id, conteudo: (document.getElementById(`c-${v.id}`) as HTMLTextAreaElement).value, anexoUrl: (document.getElementById(`a-${v.id}`) as HTMLInputElement).value, resumo: v.resumo }), "Rascunho salvo.")}>Salvar</button>{" "}
              <button className="primary" disabled={busy} onClick={() => run(() => post({ acao: "ENVIAR", versaoId: v.id }), "Enviada para aprovação.")}>Enviar para aprovação</button></>
            ) : (<p style={{ whiteSpace: "pre-wrap" }}>{v.conteudo || "(sem texto)"} {v.anexo_url && <a href={v.anexo_url} target="_blank" rel="noopener noreferrer">anexo</a>}</p>)}
            {v.status === "EM_APROVACAO" && gerente || v.status === "EM_APROVACAO" ? (<>
              <button className="primary" disabled={busy} onClick={() => run(() => post({ acao: "APROVAR", versaoId: v.id }), "Versão aprovada e publicada.")}>Aprovar</button>{" "}
              <button className="crm-secondary" disabled={busy} onClick={() => run(() => post({ acao: "REPROVAR", versaoId: v.id }), "Devolvida para rascunho.")}>Devolver</button></>) : null}
          </div>
        ))}
      </Modal>
    </>
  );
}

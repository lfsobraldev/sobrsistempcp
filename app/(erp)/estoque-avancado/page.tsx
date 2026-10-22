"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, DataTable, Empty, Field, Kpi, Modal, PageHeader, Panel, Segmented, type Tone } from "@/components/ui";
import { useOps } from "@/components/operational-provider";

type Row = Record<string, any>;
type Aba = "ENDERECOS" | "CICLICO" | "PEPS";
const n3 = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataPt = (v: unknown) => (v ? new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—");
const tom: Record<string, Tone> = { ABERTA: "warning", DIVERGENTE: "danger", CONFERIDA: "success", AJUSTADA: "info", CANCELADA: "neutral" } as Record<string, Tone>;

async function api(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na operação.");
  return j;
}

export default function EstoqueAvancadoPage() {
  const { me } = useOps();
  const podeEscrever = ["PCP", "GERENTE", "ENCARREGADO"].includes(me?.perfil || "");
  const podeAjustar = ["PCP", "GERENTE"].includes(me?.perfil || "");
  const [aba, setAba] = useState<Aba>("ENDERECOS");
  const [end, setEnd] = useState<Row | null>(null);
  const [cic, setCic] = useState<Row | null>(null);
  const [peps, setPeps] = useState<Row | null>(null);
  const [camadas, setCamadas] = useState<{ codigo: string; rows: Row[] } | null>(null);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [novo, setNovo] = useState<Row>({ localId: "", codigo: "", descricao: "", capacidade: "" });
  const [mover, setMover] = useState<Row | null>(null);
  const [contar, setContar] = useState<Row | null>(null);
  const [ajustar, setAjustar] = useState<Row | null>(null);
  const [limite, setLimite] = useState("20");

  const carregar = useCallback(async () => {
    try {
      if (aba === "ENDERECOS") setEnd(await api("/api/estoque-avancado?visao=enderecos"));
      if (aba === "CICLICO") setCic(await api("/api/estoque-avancado?visao=ciclico"));
      if (aba === "PEPS") setPeps(await api("/api/estoque-avancado?visao=peps"));
      setErro("");
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); }
  }, [aba]);
  useEffect(() => { void carregar(); }, [carregar]);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true); setErro(""); setOk("");
    try { await fn(); setOk(msg); await carregar(); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } finally { setBusy(false); }
  };
  const post = (b: Row) => api("/api/estoque-avancado", b);
  const abertas = (cic?.contagens ?? []).filter((c: Row) => ["ABERTA", "DIVERGENTE"].includes(c.status)).length;

  return (
    <>
      <PageHeader eyebrow="Estoque" title="Endereçamento, inventário cíclico e PEPS" description="Posição dentro do depósito, contagens periódicas por curva ABC sem parar a fábrica e camadas de custo por ordem de entrada." />
      {erro && <div className="alert danger" role="alert">{erro}</div>}
      {ok && <div className="alert success">{ok}</div>}
      <Segmented value={aba} onChange={(v) => setAba(v as Aba)} options={[{ value: "ENDERECOS", label: "Endereçamento" }, { value: "CICLICO", label: `Inventário cíclico${abertas ? ` (${abertas})` : ""}` }, { value: "PEPS", label: "Camadas PEPS" }]} />

      {aba === "ENDERECOS" && end && (<>
        <div className="kpis">
          <Kpi label="Endereços" value={end.enderecos.length} />
          <Kpi label="Itens a endereçar" value={end.pendentes.length} tone={end.pendentes.length ? "warn" : "success"} sub="saldo físico sem posição" />
        </div>
        {podeEscrever && (
          <Panel title="Novo endereço">
            <div className="formGrid">
              <Field label="Depósito *"><select value={novo.localId} onChange={(e) => setNovo({ ...novo, localId: e.target.value })}><option value="">Selecione</option>{end.locais.map((l: Row) => <option key={l.id} value={l.id}>{l.codigo}</option>)}</select></Field>
              <Field label="Código *" hint="rua-prateleira-nível, ex.: A-03-2"><input value={novo.codigo} onChange={(e) => setNovo({ ...novo, codigo: e.target.value })} /></Field>
              <Field label="Descrição"><input value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} /></Field>
              <Field label="Capacidade" hint="vazio = sem limite"><input inputMode="decimal" value={novo.capacidade} onChange={(e) => setNovo({ ...novo, capacidade: e.target.value })} /></Field>
              <button className="primary" disabled={busy || !novo.localId || !novo.codigo} onClick={() => run(async () => { await post({ acao: "ENDERECO", ...novo }); setNovo({ localId: novo.localId, codigo: "", descricao: "", capacidade: "" }); }, "Endereço criado.")}>Criar endereço</button>
            </div>
          </Panel>
        )}
        <Panel title="Itens aguardando endereçamento">
          <DataTable head={["Produto", "Depósito", "Físico", "Endereçado", "Pendente", ""]} empty={<Empty title="Tudo endereçado" />}>
            {end.pendentes.map((p: Row) => (
              <tr key={`${p.produto_id}${p.local_id}`}><td data-label="Produto">{p.codigo} · {p.descricao}</td><td data-label="Depósito">{p.deposito}</td><td data-label="Físico">{n3(p.fisico)}</td><td data-label="Endereçado">{n3(p.enderecado)}</td><td data-label="Pendente"><b>{n3(p.pendente)}</b></td>
                <td className="actions">{podeEscrever && <button className="primary" onClick={() => setMover({ produtoId: p.produto_id, produto: p.codigo, localId: p.local_id, deId: "", paraId: "", quantidade: String(p.pendente) })}>Endereçar</button>}</td></tr>
            ))}
          </DataTable>
        </Panel>
        <Panel title="Endereços e ocupação">
          <DataTable head={["Depósito", "Endereço", "Descrição", "Ocupação", "Conteúdo", ""]} empty={<Empty title="Nenhum endereço cadastrado" />}>
            {end.enderecos.map((e: Row) => {
              const itens = end.saldos.filter((s: Row) => s.endereco_id === e.id);
              return (
                <tr key={e.id}><td data-label="Depósito">{e.deposito}</td><td data-label="Endereço"><b>{e.codigo}</b> {!e.ativo && <Badge tone="neutral">inativo</Badge>}</td><td data-label="Descrição">{e.descricao || "—"}</td>
                  <td data-label="Ocupação">{n3(e.ocupado)}{e.capacidade ? ` / ${n3(e.capacidade)}` : ""}</td>
                  <td data-label="Conteúdo">{itens.map((s: Row) => `${s.codigo} ×${n3(s.quantidade)}`).join(", ") || "—"}</td>
                  <td className="actions">{podeEscrever && itens.length > 0 && <button className="crm-secondary" onClick={() => setMover({ produtoId: itens[0].produto_id, produto: itens[0].codigo, localId: e.local_id, deId: e.id, paraId: "", quantidade: String(itens[0].quantidade), itens })}>Mover</button>}
                    {podeEscrever && !itens.length && <button className="crm-secondary" disabled={busy} onClick={() => run(() => post({ acao: "ENDERECO_ATIVO", id: e.id, ativo: !e.ativo }), e.ativo ? "Endereço desativado." : "Endereço reativado.")}>{e.ativo ? "Desativar" : "Reativar"}</button>}</td></tr>
              );
            })}
          </DataTable>
        </Panel>
      </>)}

      {aba === "CICLICO" && cic && (<>
        <div className="kpis">
          <Kpi label="Devidos hoje" value={cic.devidos.length} tone={cic.devidos.length ? "warn" : "success"} sub="vencidos pela frequência da classe" />
          <Kpi label="Em andamento" value={abertas} />
          <Kpi label="Frequência" value={cic.regras.map((r: Row) => `${r.classe}:${r.frequencia_dias}d`).join("  ")} sub="A/B/C pela curva de consumo" />
        </div>
        {podeEscrever && (
          <Panel title="Gerar contagens do dia">
            <div className="formGrid">
              <Field label="Quantidade máxima"><input inputMode="numeric" value={limite} onChange={(e) => setLimite(e.target.value)} /></Field>
              <button className="primary" disabled={busy || !cic.devidos.length} onClick={() => run(async () => { const j = await post({ acao: "CICLICO_ABRIR", limite: Number(limite) }); setOk(`${j.abertas} contagem(ns) aberta(s).`); }, "")}>Abrir contagens</button>
            </div>
            <p className="muted">O depósito não é bloqueado: o ajuste usa a diferença entre a contagem e o saldo atual, então movimentos durante a contagem são respeitados.</p>
          </Panel>
        )}
        <Panel title="Contagens">
          <DataTable head={["#", "Produto", "Depósito", "Classe", "Sistema", "Contado", "Status", ""]} empty={<Empty title="Nenhuma contagem aberta" />}>
            {cic.contagens.map((c: Row) => (
              <tr key={c.id}><td data-label="#">{c.numero}</td><td data-label="Produto">{c.codigo} · {c.descricao}</td><td data-label="Depósito">{c.deposito}</td><td data-label="Classe">{c.classe}</td><td data-label="Sistema">{n3(c.saldo_sistema)}</td><td data-label="Contado">{c.contado == null ? "—" : n3(c.contado)}</td><td data-label="Status"><Badge tone={tom[c.status] ?? "neutral"}>{c.status}</Badge></td>
                <td className="actions">{podeEscrever && ["ABERTA", "DIVERGENTE"].includes(c.status) && <>
                  <button className="primary" onClick={() => setContar({ id: c.id, produto: c.codigo, contado: "" })}>{c.status === "ABERTA" ? "Contar" : "Recontar"}</button>
                  {c.status === "DIVERGENTE" && podeAjustar && <button className="crm-secondary" onClick={() => setAjustar({ id: c.id, produto: c.codigo, motivo: "" })}>Ajustar</button>}
                  <button className="crm-secondary" disabled={busy} onClick={() => run(() => post({ acao: "CICLICO_CANCELAR", id: c.id }), "Contagem cancelada.")}>Cancelar</button></>}</td></tr>
            ))}
          </DataTable>
        </Panel>
        <Panel title="Itens devidos">
          <DataTable head={["Produto", "Depósito", "Classe", "Última contagem", "Dias", "Saldo"]} empty={<Empty title="Nada vencido" />}>
            {cic.devidos.map((d: Row) => <tr key={`${d.produto_id}${d.local_id}`}><td data-label="Produto">{d.codigo} · {d.descricao}</td><td data-label="Depósito">{d.deposito}</td><td data-label="Classe">{d.classe}</td><td data-label="Última contagem">{dataPt(d.ultima)}</td><td data-label="Dias">{d.dias_sem_contar ?? "nunca"}</td><td data-label="Saldo">{n3(d.saldo)}</td></tr>)}
          </DataTable>
        </Panel>
      </>)}

      {aba === "PEPS" && peps && (<>
        <Panel title="Valorização: PEPS x custo médio" subtitle="Valor do saldo atual consumindo as entradas mais antigas primeiro, comparado ao custo médio.">
          <DataTable head={["Produto", "Saldo", "Valor PEPS", "Valor médio", "Diferença", ""]} empty={<Empty title="Sem saldo valorizado" />}>
            {peps.resumo.map((r: Row) => (
              <tr key={r.produto_id}><td data-label="Produto">{r.codigo} · {r.descricao}</td><td data-label="Saldo">{n3(r.saldo)}</td><td data-label="Valor PEPS">{brl(r.valor_peps)}</td><td data-label="Valor médio">{brl(r.valor_medio)}</td><td data-label="Diferença">{brl(r.diferenca)}</td>
                <td className="actions"><button className="crm-secondary" onClick={() => api(`/api/estoque-avancado?visao=peps&produto=${r.produto_id}`).then((j) => setCamadas({ codigo: r.codigo, rows: j.camadas })).catch((e) => setErro(e.message))}>Camadas</button></td></tr>
            ))}
          </DataTable>
        </Panel>
      </>)}

      <Modal open={!!mover} title={`Endereçar ${mover?.produto ?? ""}`} onClose={() => setMover(null)} footer={<><button className="crm-secondary" onClick={() => setMover(null)}>Fechar</button><button className="primary" disabled={busy || !mover?.paraId} onClick={() => run(async () => { await post({ acao: "MOVER", produtoId: mover!.produtoId, deId: mover!.deId, paraId: mover!.paraId, quantidade: mover!.quantidade }); setMover(null); }, "Movimentação registrada.")}>Confirmar</button></>}>
        {mover && (<div className="formGrid">
          {mover.itens && mover.itens.length > 1 && <Field label="Produto"><select value={mover.produtoId} onChange={(e) => setMover({ ...mover, produtoId: e.target.value, produto: mover.itens.find((i: Row) => i.produto_id === e.target.value)?.codigo })}>{mover.itens.map((i: Row) => <option key={i.produto_id} value={i.produto_id}>{i.codigo}</option>)}</select></Field>}
          <Field label="Destino *"><select value={mover.paraId} onChange={(e) => setMover({ ...mover, paraId: e.target.value })}><option value="">Selecione</option>{(end?.enderecos ?? []).filter((x: Row) => x.ativo && x.local_id === mover.localId && x.id !== mover.deId).map((x: Row) => <option key={x.id} value={x.id}>{x.codigo}</option>)}</select></Field>
          <Field label="Quantidade"><input inputMode="decimal" value={mover.quantidade} onChange={(e) => setMover({ ...mover, quantidade: e.target.value })} /></Field>
        </div>)}
      </Modal>
      <Modal open={!!contar} title={`Contagem de ${contar?.produto ?? ""}`} onClose={() => setContar(null)} footer={<><button className="crm-secondary" onClick={() => setContar(null)}>Fechar</button><button className="primary" disabled={busy || contar?.contado === ""} onClick={() => run(async () => { const j = await post({ acao: "CICLICO_CONTAR", id: contar!.id, contado: contar!.contado }); setOk(j.status === "CONFERIDA" ? "Contagem confere com o sistema." : "Divergência encontrada."); setContar(null); }, "")}>Registrar</button></>}>
        {contar && <Field label="Quantidade contada"><input autoFocus inputMode="decimal" value={contar.contado} onChange={(e) => setContar({ ...contar, contado: e.target.value })} /></Field>}
      </Modal>
      <Modal open={!!ajustar} title={`Ajustar ${ajustar?.produto ?? ""}`} onClose={() => setAjustar(null)} footer={<><button className="crm-secondary" onClick={() => setAjustar(null)}>Fechar</button><button className="primary" disabled={busy || (ajustar?.motivo ?? "").trim().length < 3} onClick={() => run(async () => { await post({ acao: "CICLICO_AJUSTAR", id: ajustar!.id, motivo: ajustar!.motivo }); setAjustar(null); }, "Ajuste lançado no estoque.")}>Lançar ajuste</button></>}>
        {ajustar && <Field label="Motivo do ajuste *"><input value={ajustar.motivo} onChange={(e) => setAjustar({ ...ajustar, motivo: e.target.value })} /></Field>}
      </Modal>
      <Modal open={!!camadas} title={`Camadas PEPS · ${camadas?.codigo ?? ""}`} onClose={() => setCamadas(null)}>
        <DataTable head={["Entrada", "Data", "Lote", "Restante", "Custo un.", "Valor"]} empty={<Empty title="Sem camadas abertas" />}>
          {(camadas?.rows ?? []).map((c: Row) => <tr key={c.entrada_id}><td data-label="Entrada">{c.entrada_id}</td><td data-label="Data">{dataPt(c.data)}</td><td data-label="Lote">{c.lote || "—"}</td><td data-label="Restante">{n3(c.restante)} de {n3(c.quantidade)}</td><td data-label="Custo un.">{brl(c.custo_unitario)}</td><td data-label="Valor">{brl(c.valor_restante)}</td></tr>)}
        </DataTable>
      </Modal>
    </>
  );
}

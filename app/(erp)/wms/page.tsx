"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, DataTable, Empty, Field, Kpi, Modal, PageHeader, Panel, Segmented, type Tone } from "@/components/ui";
import { useOps } from "@/components/operational-provider";
import { useImpressaoEtiquetas } from "@/components/etiquetas";

type Row = Record<string, any>;
type Aba = "PAINEL" | "MAPA" | "PALLETS" | "REVISOES" | "SOBRAS" | "SEPARACAO" | "RECEBIMENTO" | "ETIQUETAS";
const dataPt = (v: unknown) => (v ? new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—");
const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const TIPOS_SETOR = ["RECEBIMENTO", "ESTOQUE", "PRODUCAO", "EMBALAGEM", "EXPEDICAO", "REVISAO", "SOBRAS", "QUARENTENA"];
const tomStatus: Record<string, Tone> = { ABERTA: "warning", EM_ANALISE: "info", AGUARDANDO_FABRICA: "info", APLICADA: "success", REJEITADA: "neutral", DISPONIVEL: "success", RESERVADA: "info", CONSUMIDA: "neutral", REFUGO: "danger", LIBERADO: "success", BLOQUEADO: "danger" } as Record<string, Tone>;

async function api(url: string, body?: unknown) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na operação.");
  return j;
}
const post = (b: Row) => api("/api/wms", b);

export default function WmsPage() {
  const { me } = useOps();
  const perfil = me?.perfil || "";
  const podeEscrever = ["PCP", "GERENTE", "ENCARREGADO", "LOGISTICA"].includes(perfil);
  const podeAdmin = ["PCP", "GERENTE"].includes(perfil);
  const podeRevisar = ["PCP", "GERENTE", "ENCARREGADO"].includes(perfil);
  const podeAbrir = ["PCP", "GERENTE", "ENCARREGADO", "COMERCIAL"].includes(perfil);
  const [aba, setAba] = useState<Aba>("PAINEL");
  const [erro, setErro] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);
  const [ind, setInd] = useState<Row | null>(null);
  const [mapa, setMapa] = useState<Row | null>(null);
  const [pallets, setPallets] = useState<Row[]>([]); const [busca, setBusca] = useState("");
  const [rev, setRev] = useState<Row | null>(null); const [revDet, setRevDet] = useState<Row | null>(null);
  const [sob, setSob] = useState<Row | null>(null); const [fSob, setFSob] = useState({ medida: "", material: "", acabamento: "" });
  const [pk, setPk] = useState<Row | null>(null); const [lista, setLista] = useState<Row | null>(null); const [scan, setScan] = useState("");
  const [rc, setRc] = useState<Row | null>(null); const [rcDet, setRcDet] = useState<{ id: string; itens: Row[] } | null>(null);
  const [etq, setEtq] = useState<Row[]>([]);
  const [folha, setFolha] = useState<Row | null>(null);
  const { imprimir, area } = useImpressaoEtiquetas();

  const [novoSetor, setNovoSetor] = useState({ codigo: "", nome: "", tipo: "ESTOQUE", responsavel: "" });
  const [novoEnd, setNovoEnd] = useState({ localId: "", setorId: "", codigo: "", rua: "", modulo: "", nivel: "", tipoPosicao: "PALLET", capacidadePallets: "" });
  const [aloc, setAloc] = useState<Record<string, string>>({});
  const [novaRev, setNovaRev] = useState<Row>({ pedido: "", motivo: "", solicitante: "", prazo: "", itens: [{ acao: "SUBTRAI", descricao: "", medida: "", material: "", acabamento: "", mao: "", qtdAntes: "", qtdDepois: "" }] });
  const [novoRc, setNovoRc] = useState<Row>({ documento: "", fornecedor: "", itens: [{ produtoId: "", quantidade: "" }] });

  useEffect(() => { const limpar = () => setFolha(null); window.addEventListener("afterprint", limpar); return () => window.removeEventListener("afterprint", limpar); }, []);
  const carregar = useCallback(async () => {
    try {
      if (aba === "PAINEL") setInd((await api("/api/wms?visao=indicadores")).indicadores);
      if (aba === "MAPA" || aba === "PALLETS") setMapa(await api("/api/wms?visao=mapa"));
      if (aba === "PALLETS") setPallets((await api("/api/wms?visao=pallets&busca=" + encodeURIComponent(busca))).pallets);
      if (aba === "REVISOES") setRev(await api("/api/wms?visao=revisoes"));
      if (aba === "SOBRAS") setSob(await api(`/api/wms?visao=sobras&medida=${encodeURIComponent(fSob.medida)}&material=${encodeURIComponent(fSob.material)}&acabamento=${encodeURIComponent(fSob.acabamento)}`));
      if (aba === "SEPARACAO") setPk(await api("/api/wms?visao=picking"));
      if (aba === "RECEBIMENTO") setRc(await api("/api/wms?visao=recebimentos"));
      if (aba === "ETIQUETAS") setEtq((await api("/api/wms?visao=etiquetas")).etiquetas);
      setErro("");
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); }
  }, [aba, busca, fSob]);
  useEffect(() => { void carregar(); }, [carregar]);
  const run = async (fn: () => Promise<unknown>, msg: string, depois?: () => Promise<void>) => {
    setBusy(true); setErro(""); setOk("");
    try { await fn(); setOk(msg); await carregar(); if (depois) await depois(); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } finally { setBusy(false); }
  };
  const abrirRev = async (id: string) => { try { setRevDet({ id, ...(await api("/api/wms?visao=revisao&id=" + id)) }); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } };
  const abrirLista = async (id: string) => { try { setLista(await api("/api/wms?visao=lista&id=" + id)); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } };
  const abrirRc = async (id: string) => { try { setRcDet({ id, itens: (await api("/api/wms?visao=recebimento&id=" + id)).itens }); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); } };
  const reg = (tipo: string, referencia: string, pedido = "", revisao?: number | null, conteudo: Row = {}) => post({ acao: "ETIQUETA_REGISTRAR", tipo, referencia, pedido, revisao, conteudo }).catch(() => undefined);

  const enderecosLivres = (mapa?.posicoes ?? []).filter((p: Row) => p.ativo && !p.bloqueado && (p.capacidade_pallets == null || Number(p.pallets) < Number(p.capacidade_pallets)));
  const opcaoEndereco = (p: Row) => `${p.setor || "—"} · ${p.codigo} (${p.pallets}${p.capacidade_pallets ? "/" + p.capacidade_pallets : ""})`;

  const imprimirFolhaRevisao = () => {
    if (!revDet?.revisao) return;
    setFolha({ cab: revDet.revisao, itens: revDet.itens });
    setTimeout(() => window.print(), 150);
  };

  return (
    <>
      <PageHeader eyebrow="Logística e armazém" title="WMS: setores, pallets, sobras e revisões" description="Onde cada pallet está, o que fazer com peças que a revisão tira do pedido, separação com conferência por leitura e etiquetas com a revisão vigente." />
      {erro && <div className="alert danger" role="alert">{erro}</div>}
      {ok && <div className="alert success">{ok}</div>}
      <Segmented value={aba} onChange={(v) => setAba(v as Aba)} options={[
        { value: "PAINEL", label: "Painel" }, { value: "MAPA", label: "Setores e endereços" }, { value: "PALLETS", label: "Pallets" },
        { value: "REVISOES", label: `Revisões${rev?.paradas?.length ? ` (${rev.paradas.length})` : ""}` }, { value: "SOBRAS", label: "Sobras" },
        { value: "SEPARACAO", label: "Separação" }, { value: "RECEBIMENTO", label: "Recebimento" }, { value: "ETIQUETAS", label: "Etiquetas" },
      ]} />

      {aba === "PAINEL" && ind && (<>
        <div className="kpis">
          <Kpi label="Revisões paradas" value={ind.revisoesAbertas} tone={ind.revisoesAbertas ? "warn" : "success"} sub={`${ind.revisoesVencidas} vencida(s)`} />
          <Kpi label="Dias médios parado" value={ind.diasMedioParado} tone={Number(ind.diasMedioParado) > 3 ? "danger" : ""} />
          <Kpi label="Sobras disponíveis" value={ind.sobrasDisponiveis} sub={brl(ind.valorSobras) + " em sobra parada"} />
          <Kpi label="% sobra reaproveitada" value={(ind.sobrasTotal ? Math.round((ind.sobrasReaproveitadas / ind.sobrasTotal) * 100) : 0) + "%"} />
          <Kpi label="Pallets sem endereço" value={ind.palletsSemEndereco} tone={ind.palletsSemEndereco ? "warn" : "success"} />
          <Kpi label="Embalados com revisão aberta" value={ind.embaladosComRevisao} tone={ind.embaladosComRevisao ? "danger" : "success"} sub="meta: zero" />
          <Kpi label="Separações abertas" value={ind.pickingAbertos} />
          <Kpi label="Recebimentos divergentes" value={ind.recebimentosDivergentes} tone={ind.recebimentosDivergentes ? "warn" : "success"} />
        </div>
      </>)}

      {aba === "MAPA" && mapa && (<>
        <div className="kpis">
          {mapa.setores.map((s: Row) => {
            const ps = mapa.posicoes.filter((p: Row) => p.setor === s.codigo);
            return <Kpi key={s.id} label={s.nome} value={ps.reduce((a: number, p: Row) => a + Number(p.pallets), 0)} sub={`${ps.length} endereço(s) · ${s.tipo}`} />;
          })}
        </div>
        {podeAdmin && <Panel title="Novo setor">
          <div className="formGrid">
            <Field label="Código *"><input value={novoSetor.codigo} onChange={(e) => setNovoSetor({ ...novoSetor, codigo: e.target.value })} /></Field>
            <Field label="Nome *"><input value={novoSetor.nome} onChange={(e) => setNovoSetor({ ...novoSetor, nome: e.target.value })} /></Field>
            <Field label="Tipo"><select value={novoSetor.tipo} onChange={(e) => setNovoSetor({ ...novoSetor, tipo: e.target.value })}>{TIPOS_SETOR.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Responsável"><input value={novoSetor.responsavel} onChange={(e) => setNovoSetor({ ...novoSetor, responsavel: e.target.value })} /></Field>
            <button className="primary" disabled={busy || !novoSetor.codigo || !novoSetor.nome} onClick={() => run(async () => { await post({ acao: "SETOR_NOVO", ...novoSetor }); setNovoSetor({ ...novoSetor, codigo: "", nome: "" }); }, "Setor criado.")}>Criar setor</button>
          </div>
        </Panel>}
        {podeEscrever && <Panel title="Novo endereço" subtitle="Posição física: rua, módulo e nível. Em posição de PALLET a capacidade padrão é 1.">
          <div className="formGrid">
            <Field label="Depósito *"><select value={novoEnd.localId} onChange={(e) => setNovoEnd({ ...novoEnd, localId: e.target.value })}><option value="">Selecione</option>{mapa.locais.map((l: Row) => <option key={l.id} value={l.id}>{l.codigo}</option>)}</select></Field>
            <Field label="Setor *"><select value={novoEnd.setorId} onChange={(e) => setNovoEnd({ ...novoEnd, setorId: e.target.value })}><option value="">Selecione</option>{mapa.setores.map((s: Row) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></Field>
            <Field label="Código *"><input value={novoEnd.codigo} onChange={(e) => setNovoEnd({ ...novoEnd, codigo: e.target.value })} /></Field>
            <Field label="Rua"><input value={novoEnd.rua} onChange={(e) => setNovoEnd({ ...novoEnd, rua: e.target.value })} /></Field>
            <Field label="Módulo"><input value={novoEnd.modulo} onChange={(e) => setNovoEnd({ ...novoEnd, modulo: e.target.value })} /></Field>
            <Field label="Nível"><input value={novoEnd.nivel} onChange={(e) => setNovoEnd({ ...novoEnd, nivel: e.target.value })} /></Field>
            <Field label="Tipo"><select value={novoEnd.tipoPosicao} onChange={(e) => setNovoEnd({ ...novoEnd, tipoPosicao: e.target.value })}>{["PALLET", "PRATELEIRA", "CHAO", "DOCA"].map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Capacidade (pallets)" hint="vazio = padrão do tipo"><input inputMode="numeric" value={novoEnd.capacidadePallets} onChange={(e) => setNovoEnd({ ...novoEnd, capacidadePallets: e.target.value })} /></Field>
            <button className="primary" disabled={busy || !novoEnd.localId || !novoEnd.setorId || !novoEnd.codigo} onClick={() => run(async () => { await post({ acao: "ENDERECO_NOVO", ...novoEnd }); setNovoEnd({ ...novoEnd, codigo: "" }); }, "Endereço criado.")}>Criar endereço</button>
          </div>
        </Panel>}
        <Panel title="Pallets aguardando endereço">
          <DataTable head={["Pallet", "Pedido", "Cliente", "Status", "Endereço", ""]} empty={!mapa.semEndereco.length && <Empty title="Todos os pallets têm endereço" />}>
            {mapa.semEndereco.map((p: Row) => (
              <tr key={p.id}><td><b>{p.codigo}</b></td><td>{p.pedido}</td><td>{p.cliente}</td><td><Badge tone={tomStatus[p.status] || "neutral"}>{p.status}</Badge></td>
                <td><select value={aloc[p.id] || ""} onChange={(e) => setAloc({ ...aloc, [p.id]: e.target.value })}><option value="">Escolha</option>{enderecosLivres.map((e: Row) => <option key={e.id} value={e.id}>{opcaoEndereco(e)}</option>)}</select></td>
                <td>{podeEscrever && <button disabled={busy || !aloc[p.id]} onClick={() => run(() => post({ acao: "PALLET_ALOCAR", palletId: p.id, enderecoId: aloc[p.id], motivo: "Guarda inicial" }), "Pallet alocado.")}>Alocar</button>}</td></tr>
            ))}
          </DataTable>
        </Panel>
        <Panel title="Endereços">
          <DataTable head={["Setor", "Endereço", "Rua/Mód./Nível", "Tipo", "Ocupação", "Estado", ""]}>
            {mapa.posicoes.map((p: Row) => (
              <tr key={p.id}><td>{p.setor_nome || "—"}</td><td><b>{p.codigo}</b></td><td>{[p.rua, p.modulo, p.nivel].filter(Boolean).join("-") || "—"}</td><td>{p.tipo_posicao}</td>
                <td>{p.pallets}{p.capacidade_pallets ? ` / ${p.capacidade_pallets}` : ""}</td>
                <td>{p.bloqueado ? <Badge tone="danger">Bloqueado</Badge> : p.ativo ? <Badge tone="success">Ativo</Badge> : <Badge>Inativo</Badge>}</td>
                <td>{podeEscrever && <button disabled={busy} onClick={() => { const motivo = p.bloqueado ? "" : window.prompt("Motivo do bloqueio:") || ""; if (!p.bloqueado && !motivo) return; void run(() => post({ acao: "ENDERECO_BLOQUEAR", id: p.id, bloqueado: !p.bloqueado, motivo }), p.bloqueado ? "Endereço liberado." : "Endereço bloqueado."); }}>{p.bloqueado ? "Liberar" : "Bloquear"}</button>}</td></tr>
            ))}
          </DataTable>
        </Panel>
      </>)}

      {aba === "PALLETS" && (
        <Panel title="Localização de pallets" actions={<input placeholder="Buscar pallet, pedido ou cliente" value={busca} onChange={(e) => setBusca(e.target.value)} />}>
          <DataTable head={["Pallet", "Pedido", "Cliente", "Status", "Local atual", "Mover para", ""]} empty={!pallets.length && <Empty title="Nenhum pallet" />}>
            {pallets.map((p) => (
              <tr key={p.id}><td><b>{p.codigo}</b></td><td>{p.pedido} {p.em_revisao && <Badge tone="warning">Em revisão</Badge>}</td><td>{p.cliente}</td><td><Badge tone={tomStatus[p.status] || "neutral"}>{p.status}</Badge></td>
                <td>{p.endereco ? `${p.setor} · ${p.endereco}` : <span className="muted">sem endereço</span>}</td>
                <td>{podeEscrever && <select value={aloc[p.id] || ""} onChange={(e) => setAloc({ ...aloc, [p.id]: e.target.value })}><option value="">Escolha</option>{enderecosLivres.filter((e: Row) => e.id !== p.endereco_id).map((e: Row) => <option key={e.id} value={e.id}>{opcaoEndereco(e)}</option>)}</select>}</td>
                <td className="row" style={{ gap: 6 }}>
                  {podeEscrever && <button disabled={busy || !aloc[p.id]} onClick={() => run(() => post({ acao: "PALLET_ALOCAR", palletId: p.id, enderecoId: aloc[p.id], motivo: "Movimentação" }), "Pallet movido.")}>Mover</button>}
                  {podeEscrever && p.endereco && <button disabled={busy} onClick={() => run(() => post({ acao: "PALLET_RETIRAR", palletId: p.id, motivo: "Retirada" }), "Pallet retirado do endereço.")}>Retirar</button>}
                  <button onClick={async () => { await imprimir([{ titulo: `PALLET ${p.codigo}`, linhas: [`Pedido ${p.pedido}`, p.cliente, `Qtd ${p.quantidade} · Jogos ${p.jogos}`, p.endereco ? `Local ${p.endereco}` : "Sem endereço"], qr: `PALLET:${p.codigo}` }]); void reg("PALLET", p.codigo, p.pedido); }}>Etiqueta</button>
                </td></tr>
            ))}
          </DataTable>
        </Panel>
      )}

      {aba === "REVISOES" && rev && (<>
        {podeAbrir && <Panel title="Abrir revisão do pedido" subtitle="Registre linha a linha o que acrescenta, subtrai ou altera. Pedido com revisão aberta não é embalado, expedido nem separado.">
          <div className="formGrid">
            <Field label="Pedido *"><input value={novaRev.pedido} onChange={(e) => setNovaRev({ ...novaRev, pedido: e.target.value })} /></Field>
            <Field label="Solicitante"><input value={novaRev.solicitante} onChange={(e) => setNovaRev({ ...novaRev, solicitante: e.target.value })} /></Field>
            <Field label="Prazo de resposta *"><input type="date" value={novaRev.prazo} onChange={(e) => setNovaRev({ ...novaRev, prazo: e.target.value })} /></Field>
            <Field label="Motivo *" className="wide"><input value={novaRev.motivo} onChange={(e) => setNovaRev({ ...novaRev, motivo: e.target.value })} /></Field>
          </div>
          <DataTable head={["Ação", "Peça / descrição", "Medida", "Material", "Acabamento", "Mão", "Qtd antes", "Qtd depois", ""]}>
            {novaRev.itens.map((it: Row, i: number) => {
              const set = (patch: Row) => setNovaRev({ ...novaRev, itens: novaRev.itens.map((x: Row, j: number) => (j === i ? { ...x, ...patch } : x)) });
              return <tr key={i}>
                <td><select value={it.acao} onChange={(e) => set({ acao: e.target.value })}><option>ACRESCENTA</option><option>SUBTRAI</option><option>ALTERA</option></select></td>
                <td><input value={it.descricao} onChange={(e) => set({ descricao: e.target.value })} /></td>
                <td><input size={8} value={it.medida} onChange={(e) => set({ medida: e.target.value })} /></td>
                <td><input size={9} value={it.material} onChange={(e) => set({ material: e.target.value })} /></td>
                <td><input size={9} value={it.acabamento} onChange={(e) => set({ acabamento: e.target.value })} /></td>
                <td><select value={it.mao} onChange={(e) => set({ mao: e.target.value })}><option value="">—</option><option>D</option><option>E</option></select></td>
                <td><input size={5} inputMode="decimal" value={it.qtdAntes} onChange={(e) => set({ qtdAntes: e.target.value })} /></td>
                <td><input size={5} inputMode="decimal" value={it.qtdDepois} onChange={(e) => set({ qtdDepois: e.target.value })} /></td>
                <td><button onClick={() => setNovaRev({ ...novaRev, itens: novaRev.itens.filter((_: Row, j: number) => j !== i) })} disabled={novaRev.itens.length < 2}>×</button></td>
              </tr>;
            })}
          </DataTable>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button onClick={() => setNovaRev({ ...novaRev, itens: [...novaRev.itens, { acao: "SUBTRAI", descricao: "", medida: "", material: "", acabamento: "", mao: "", qtdAntes: "", qtdDepois: "" }] })}>+ linha</button>
            <button className="primary" disabled={busy || !novaRev.pedido || !novaRev.motivo || !novaRev.prazo} onClick={() => run(async () => { await post({ acao: "REVISAO_ABRIR", ...novaRev }); setNovaRev({ pedido: "", motivo: "", solicitante: "", prazo: "", itens: [{ acao: "SUBTRAI", descricao: "", medida: "", material: "", acabamento: "", mao: "", qtdAntes: "", qtdDepois: "" }] }); }, "Revisão aberta.")}>Abrir revisão</button>
          </div>
        </Panel>}
        <Panel title="Fila de revisões paradas" subtitle="Mais antigas e vencidas primeiro.">
          <DataTable head={["Pedido", "Rev.", "Status", "Dias parada", "Prazo", "Responsável", "Destinos pendentes", ""]} empty={!rev.paradas.length && <Empty title="Nenhuma revisão parada" />}>
            {rev.paradas.map((r: Row) => (
              <tr key={r.id}><td><b>{r.pedido}</b></td><td>R{r.numero}</td><td><Badge tone={tomStatus[r.status]}>{r.status.replace("_", " ")}</Badge></td>
                <td>{r.vencida ? <Badge tone="danger">{r.dias_espera} d · vencida</Badge> : `${r.dias_espera} d`}</td><td>{dataPt(r.prazo)}</td><td>{r.responsavel || "—"}</td><td>{r.destinos_pendentes}</td>
                <td><button onClick={() => abrirRev(r.id)}>Abrir</button></td></tr>
            ))}
          </DataTable>
        </Panel>
        <Panel title="Encerradas">
          <DataTable head={["Pedido", "Rev.", "Status", "Encerrada em", "Por", "Parecer"]} empty={!rev.historico.length && <Empty title="Sem histórico" />}>
            {rev.historico.map((r: Row) => <tr key={r.id}><td>{r.pedido}</td><td>R{r.numero}</td><td><Badge tone={tomStatus[r.status]}>{r.status}</Badge></td><td>{dataPt(r.encerrada_em)}</td><td>{r.encerrada_por}</td><td>{r.parecer}</td></tr>)}
          </DataTable>
        </Panel>
      </>)}

      {aba === "SOBRAS" && sob && (
        <Panel title="Sobras de peças" subtitle="Antes de produzir de novo, procure aqui uma sobra com a mesma medida, material e acabamento."
          actions={<div className="row" style={{ gap: 6 }}>{(["medida", "material", "acabamento"] as const).map((k) => <input key={k} placeholder={k} value={fSob[k]} onChange={(e) => setFSob({ ...fSob, [k]: e.target.value })} />)}</div>}>
          <DataTable head={["Nº", "Peça", "Medida", "Material", "Acabamento", "Mão", "Qtd", "Origem", "Local", "Status", ""]} empty={!sob.sobras.length && <Empty title="Nenhuma sobra" />}>
            {sob.sobras.map((s: Row) => (
              <tr key={s.id}><td>{s.numero}</td><td>{s.descricao}</td><td>{s.medida}</td><td>{s.material}</td><td>{s.acabamento}</td><td>{s.mao || "—"}</td><td>{s.quantidade}</td>
                <td>{s.origem_pedido}{s.origem_revisao ? ` · R${s.origem_revisao}` : ""}</td><td>{s.endereco || "—"}</td>
                <td><Badge tone={tomStatus[s.status]}>{s.status}</Badge>{s.reservada_pedido && <small> p/ {s.reservada_pedido}</small>}</td>
                <td className="row" style={{ gap: 6 }}>
                  {podeEscrever && s.status === "DISPONIVEL" && <button disabled={busy} onClick={() => { const ped = window.prompt("Pedido que vai aproveitar a sobra:"); if (ped) void run(() => post({ acao: "SOBRA_RESERVAR", id: s.id, pedido: ped }), "Sobra reservada."); }}>Reservar</button>}
                  {podeEscrever && s.status === "RESERVADA" && <button disabled={busy} onClick={() => run(() => post({ acao: "SOBRA_BAIXAR", id: s.id, status: "CONSUMIDA" }), "Sobra consumida.")}>Consumir</button>}
                  {podeEscrever && ["DISPONIVEL", "RESERVADA"].includes(s.status) && <button disabled={busy} onClick={() => { if (window.confirm("Descartar como refugo?")) void run(() => post({ acao: "SOBRA_BAIXAR", id: s.id, status: "REFUGO" }), "Sobra descartada."); }}>Refugo</button>}
                  {podeAdmin && ["DISPONIVEL", "RESERVADA"].includes(s.status) && <button disabled={busy} onClick={() => { const c = window.prompt("Custo da sobra (R$):", String(s.custo || 0)); if (c !== null) void run(() => post({ acao: "SOBRA_CUSTO", id: s.id, custo: c }), "Custo atualizado."); }}>Custo</button>}
                  <button onClick={async () => { await imprimir([{ titulo: `SOBRA #${s.numero}`, linhas: [s.descricao, `${s.medida} · ${s.material} · ${s.acabamento}${s.mao ? " · " + s.mao : ""}`, `Qtd ${s.quantidade}`, `Origem ${s.origem_pedido}${s.origem_revisao ? " R" + s.origem_revisao : ""}`, s.endereco ? `Local ${s.endereco}` : ""], qr: `SOBRA:${s.numero}` }]); void reg("SOBRA", String(s.numero), s.origem_pedido, s.origem_revisao); }}>Etiqueta</button>
                </td></tr>
            ))}
          </DataTable>
        </Panel>
      )}

      {aba === "SEPARACAO" && pk && (<>
        <Panel title="Pedidos prontos para separar" subtitle="Somente pallets LIBERADOS e de pedidos sem revisão aberta.">
          <DataTable head={["Pedido", "Pallets liberados", ""]} empty={!pk.pedidosProntos.length && <Empty title="Nada pronto para separar" />}>
            {pk.pedidosProntos.map((p: Row) => <tr key={p.pedido}><td><b>{p.pedido}</b></td><td>{p.pallets}</td><td>{podeEscrever && <button disabled={busy} onClick={() => run(async () => { const r = await post({ acao: "PICKING_CRIAR", pedido: p.pedido }); await abrirLista(r.id); }, "Lista de separação criada.")}>Criar lista</button>}</td></tr>)}
          </DataTable>
        </Panel>
        <Panel title="Listas de separação">
          <DataTable head={["Nº", "Pedido", "Status", "Conferidos", ""]} empty={!pk.listas.length && <Empty title="Nenhuma lista" />}>
            {pk.listas.map((l: Row) => <tr key={l.id}><td>{l.numero}</td><td>{l.pedido}</td><td><Badge tone={l.status === "CONCLUIDA" ? "success" : l.status === "CANCELADA" ? "neutral" : "warning"}>{l.status}</Badge></td><td>{l.conferidos}/{l.total}</td><td><button onClick={() => abrirLista(l.id)}>Abrir</button></td></tr>)}
          </DataTable>
        </Panel>
      </>)}

      {aba === "RECEBIMENTO" && rc && (<>
        {podeEscrever && <Panel title="Novo recebimento" subtitle="Registre o esperado da nota; a conferência é feita item a item.">
          <div className="formGrid">
            <Field label="Documento / NF"><input value={novoRc.documento} onChange={(e) => setNovoRc({ ...novoRc, documento: e.target.value })} /></Field>
            <Field label="Fornecedor"><input value={novoRc.fornecedor} onChange={(e) => setNovoRc({ ...novoRc, fornecedor: e.target.value })} /></Field>
          </div>
          {novoRc.itens.map((it: Row, i: number) => (
            <div className="row" style={{ gap: 8, marginTop: 6 }} key={i}>
              <select value={it.produtoId} onChange={(e) => setNovoRc({ ...novoRc, itens: novoRc.itens.map((x: Row, j: number) => (j === i ? { ...x, produtoId: e.target.value } : x)) })}><option value="">Produto</option>{rc.produtos.map((p: Row) => <option key={p.id} value={p.id}>{p.codigo} · {p.descricao}</option>)}</select>
              <input placeholder="Qtd esperada" inputMode="decimal" value={it.quantidade} onChange={(e) => setNovoRc({ ...novoRc, itens: novoRc.itens.map((x: Row, j: number) => (j === i ? { ...x, quantidade: e.target.value } : x)) })} />
            </div>
          ))}
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button onClick={() => setNovoRc({ ...novoRc, itens: [...novoRc.itens, { produtoId: "", quantidade: "" }] })}>+ item</button>
            <button className="primary" disabled={busy} onClick={() => run(async () => { await post({ acao: "RECEBIMENTO_NOVO", ...novoRc }); setNovoRc({ documento: "", fornecedor: "", itens: [{ produtoId: "", quantidade: "" }] }); }, "Recebimento registrado.")}>Registrar</button>
          </div>
        </Panel>}
        <Panel title="Recebimentos">
          <DataTable head={["Nº", "Documento", "Fornecedor", "Itens", "Status", ""]} empty={!rc.recebimentos.length && <Empty title="Nenhum recebimento" />}>
            {rc.recebimentos.map((r: Row) => <tr key={r.id}><td>{r.numero}</td><td>{r.documento}</td><td>{r.fornecedor}</td><td>{r.itens}</td><td><Badge tone={r.status === "CONFERIDO" ? "success" : r.status === "DIVERGENTE" ? "danger" : "warning"}>{r.status}</Badge></td><td><button onClick={() => abrirRc(r.id)}>Conferir</button></td></tr>)}
          </DataTable>
        </Panel>
      </>)}

      {aba === "ETIQUETAS" && (
        <Panel title="Etiquetas impressas" subtitle="Etiquetas de revisões antigas ficam marcadas como NÃO USAR quando a revisão nova é aplicada.">
          <DataTable head={["Tipo", "Referência", "Pedido", "Rev.", "Validade", "Por", "Em"]} empty={!etq.length && <Empty title="Nenhuma etiqueta impressa" />}>
            {etq.map((e) => <tr key={e.id}><td>{e.tipo}</td><td>{e.referencia}</td><td>{e.pedido}</td><td>{e.revisao != null ? `R${e.revisao}` : "—"}</td><td>{e.valida ? <Badge tone="success">Válida</Badge> : <Badge tone="danger">NÃO USAR</Badge>}</td><td>{e.impressa_por}</td><td>{new Date(e.impressa_em).toLocaleString("pt-BR")}</td></tr>)}
          </DataTable>
        </Panel>
      )}

      <Modal open={!!revDet} title={revDet?.revisao ? `Pedido ${revDet.revisao.pedido} · Revisão R${revDet.revisao.numero}` : "Revisão"} onClose={() => setRevDet(null)}
        footer={revDet?.revisao && !["APLICADA", "REJEITADA"].includes(revDet.revisao.status) ? (
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button onClick={imprimirFolhaRevisao}>Imprimir folha</button>
            {podeRevisar && revDet.revisao.status === "ABERTA" && <button disabled={busy} onClick={() => run(() => post({ acao: "REVISAO_AVANCAR", id: revDet.id, status: "EM_ANALISE" }), "Revisão em análise.", () => abrirRev(revDet.id))}>Pôr em análise</button>}
            {podeRevisar && revDet.revisao.status !== "AGUARDANDO_FABRICA" && <button disabled={busy} onClick={() => run(() => post({ acao: "REVISAO_AVANCAR", id: revDet.id, status: "AGUARDANDO_FABRICA" }), "Aguardando a fábrica.", () => abrirRev(revDet.id))}>Aguardando fábrica</button>}
            {podeRevisar && <button disabled={busy} onClick={() => { const p = window.prompt("Parecer da rejeição:"); if (p) void run(() => post({ acao: "REVISAO_AVANCAR", id: revDet.id, status: "REJEITADA", parecer: p }), "Revisão rejeitada.", async () => setRevDet(null)); }}>Rejeitar</button>}
            {podeAdmin && <button className="primary" disabled={busy} onClick={() => run(() => post({ acao: "REVISAO_APLICAR", id: revDet.id }), "Revisão aplicada. Etiquetas antigas invalidadas.", async () => setRevDet(null))}>Aplicar revisão</button>}
          </div>) : <button onClick={imprimirFolhaRevisao}>Imprimir folha</button>}>
        {revDet?.revisao && (<>
          <p><b>Motivo:</b> {revDet.revisao.motivo} · <b>Prazo:</b> {dataPt(revDet.revisao.prazo)} · <Badge tone={tomStatus[revDet.revisao.status]}>{revDet.revisao.status}</Badge></p>
          <DataTable head={["Ação", "Peça", "Medida / material / acabamento", "Antes → Depois", "Destino do que sai", "Sugestão de sobra"]}>
            {revDet.itens.map((it: Row) => {
              const reduz = it.acao !== "ACRESCENTA" && Number(it.qtd_depois) < Number(it.qtd_antes);
              const fechada = ["APLICADA", "REJEITADA"].includes(revDet.revisao.status);
              const sug = revDet.sugestoes.filter((s: Row) => s.linha === it.linha);
              return <tr key={it.linha} style={{ background: it.acao === "SUBTRAI" ? "rgba(220,38,38,.06)" : it.acao === "ACRESCENTA" ? "rgba(22,163,74,.06)" : undefined }}>
                <td><Badge tone={it.acao === "SUBTRAI" ? "danger" : it.acao === "ACRESCENTA" ? "success" : "warning"}>{it.acao}</Badge></td>
                <td>{it.descricao}{it.mao ? ` (${it.mao})` : ""}</td><td>{[it.medida, it.material, it.acabamento].filter(Boolean).join(" · ") || "—"}</td>
                <td>{it.qtd_antes} → {it.qtd_depois}</td>
                <td>{reduz ? (fechada || !podeRevisar ? <span>{it.destino}{it.endereco_destino ? ` · ${it.endereco_destino}` : ""}</span> : (
                  <span className="row" style={{ gap: 6 }}>
                    <select value={it.destino} onChange={(e) => { const d = e.target.value; if (d === "PENDENTE") return; const end = d === "SOBRA" ? (aloc["rev-" + it.linha] || rev?.enderecos?.[0]?.id || "") : ""; void run(() => post({ acao: "REVISAO_DESTINO", id: revDet.id, linha: it.linha, destino: d, enderecoId: end }), "Destino registrado.", () => abrirRev(revDet.id)); }}>
                      <option value="PENDENTE">Escolha…</option><option value="CANCELAR_OF">Cancelar OF (não produzida)</option><option value="SOBRA">Guardar como sobra</option><option value="REFUGO">Refugo</option>
                    </select>
                    {(rev?.enderecos ?? []).length > 0 && <select value={aloc["rev-" + it.linha] || ""} onChange={(e) => setAloc({ ...aloc, ["rev-" + it.linha]: e.target.value })}><option value="">Endereço da sobra</option>{rev!.enderecos.map((e: Row) => <option key={e.id} value={e.id}>{e.codigo}</option>)}</select>}
                  </span>)) : "—"}</td>
                <td>{sug.length ? sug.map((s: Row) => <div key={s.sobra_id}><Badge tone="info">Sobra #{s.numero}</Badge> {s.quantidade} un · {s.endereco || "sem local"}</div>) : "—"}</td>
              </tr>;
            })}
          </DataTable>
        </>)}
      </Modal>

      <Modal open={!!lista?.lista} title={lista?.lista ? `Separação #${lista.lista.numero} · pedido ${lista.lista.pedido}` : ""} onClose={() => setLista(null)}
        footer={lista?.lista && <div className="row" style={{ gap: 8 }}>
          <button onClick={() => { setFolha({ picking: lista }); setTimeout(() => window.print(), 150); }}>Imprimir lista</button>
          {lista.lista.status !== "CONCLUIDA" && lista.lista.status !== "CANCELADA" && <button disabled={busy} onClick={() => run(() => post({ acao: "PICKING_CANCELAR", id: lista.lista.id }), "Lista cancelada.", async () => setLista(null))}>Cancelar lista</button>}
        </div>}>
        {lista?.lista && (<>
          {!["CONCLUIDA", "CANCELADA"].includes(lista.lista.status) && podeEscrever && (
            <form className="row" style={{ gap: 8, marginBottom: 8 }} onSubmit={(e) => { e.preventDefault(); const c = scan.trim(); if (!c) return; void run(async () => { await post({ acao: "PICKING_CONFERIR", id: lista.lista.id, codigo: c }); setScan(""); await abrirLista(lista.lista.id); }, "Pallet conferido."); }}>
              <input autoFocus placeholder="Leia ou digite o código do pallet" value={scan} onChange={(e) => setScan(e.target.value)} /><button className="primary" disabled={busy}>Conferir</button>
            </form>)}
          <DataTable head={["Ordem", "Pallet", "Local", "Qtd", "Jogos", "Conferido"]}>
            {lista.itens.map((i: Row) => <tr key={i.ordem}><td>{i.ordem}</td><td><b>{i.codigo}</b></td><td>{i.endereco_codigo || "—"}</td><td>{i.quantidade}</td><td>{i.jogos}</td><td>{i.conferido ? <Badge tone="success">{i.conferido_por}</Badge> : <Badge tone="warning">Pendente</Badge>}</td></tr>)}
          </DataTable>
        </>)}
      </Modal>

      <Modal open={!!rcDet} title="Conferência de recebimento" onClose={() => setRcDet(null)}
        footer={rcDet && podeEscrever && <button className="primary" disabled={busy} onClick={() => run(() => post({ acao: "RECEBIMENTO_FECHAR", id: rcDet.id }), "Recebimento fechado.", async () => setRcDet(null))}>Fechar recebimento</button>}>
        {rcDet && <DataTable head={["Item", "Esperado", "Conferido", ""]}>
          {rcDet.itens.map((i) => <tr key={i.linha}><td>{i.codigo} · {i.descricao}</td><td>{i.qtd_esperada}</td>
            <td><input size={6} inputMode="decimal" defaultValue={i.qtd_conferida ?? ""} onBlur={(e) => { if (e.target.value !== "" && podeEscrever) void run(() => post({ acao: "RECEBIMENTO_CONFERIR", id: rcDet.id, linha: i.linha, quantidade: e.target.value }), "Contagem registrada.", () => abrirRc(rcDet.id)); }} /></td>
            <td>{i.qtd_conferida != null && (Number(i.qtd_conferida) === Number(i.qtd_esperada) ? <Badge tone="success">OK</Badge> : <Badge tone="danger">Divergente</Badge>)}</td></tr>)}
        </DataTable>}
      </Modal>

      {area}
      <div className="print-area folha" aria-hidden>
        {folha?.cab && (<>
          <h2>Folha de revisão · Pedido {folha.cab.pedido} · R{folha.cab.numero}</h2>
          <p>{folha.cab.motivo} · Prazo {dataPt(folha.cab.prazo)}</p>
          <table><thead><tr><th>Ação</th><th>Peça</th><th>Medida / material / acabamento</th><th>Antes → Depois</th><th>Destino</th></tr></thead>
            <tbody>{folha.itens.map((it: Row) => <tr key={it.linha} className={it.acao === "SUBTRAI" ? "retirar" : it.acao === "ACRESCENTA" ? "produzir" : ""}><td>{it.acao === "SUBTRAI" ? "RETIRAR" : it.acao === "ACRESCENTA" ? "PRODUZIR" : "ALTERAR"}</td><td>{it.descricao}{it.mao ? ` (${it.mao})` : ""}</td><td>{[it.medida, it.material, it.acabamento].filter(Boolean).join(" · ")}</td><td>{it.qtd_antes} → {it.qtd_depois}</td><td>{it.destino}{it.endereco_destino ? ` · ${it.endereco_destino}` : ""}</td></tr>)}</tbody></table>
        </>)}
        {folha?.picking && (<>
          <h2>Lista de separação #{folha.picking.lista.numero} · Pedido {folha.picking.lista.pedido}</h2>
          <table><thead><tr><th>Ordem</th><th>Pallet</th><th>Local</th><th>Qtd</th><th>Jogos</th><th>OK</th></tr></thead>
            <tbody>{folha.picking.itens.map((i: Row) => <tr key={i.ordem}><td>{i.ordem}</td><td>{i.codigo}</td><td>{i.endereco_codigo}</td><td>{i.quantidade}</td><td>{i.jogos}</td><td>☐</td></tr>)}</tbody></table>
        </>)}
      </div>
    </>
  );
}

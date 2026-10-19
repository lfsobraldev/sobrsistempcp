"use client";

import { useEffect, useState } from "react";
import { ChevronRight, FileSpreadsheet, FileText, Trash2, UploadCloud, X } from "lucide-react";
import type { ImportResult, TipoPedido } from "@/types/pcp";
import { useOps } from "@/components/operational-provider";
import { Badge, Card, DataTable, Field, PageHeader, StatCard, type Tone } from "@/components/ui";
import { LABELS } from "@/lib/metrics";
import { modeloProduto } from "@/lib/presentation";
import { resumoPorSetor } from "@/lib/programacao-auditoria";
import { auditarCoberturaRomaneio } from "@/lib/romaneio/source-audit";
import { compareProduto } from "@/lib/sort";
import { familiaIndustrial } from "@/lib/domain/industrial";
import { contagemKitsPedido } from "@/lib/industrial/kits";

export default function Programacao() {
  const { refresh, toast, pg } = useOps();
  const [mode, setMode] = useState<"FILTRO" | "PEDIDO">("FILTRO");
  const [filter, setFilter] = useState<File | null>(null);
  const [catalogoFile, setCatalogoFile] = useState<File | null>(null);
  const [catalogoBusy, setCatalogoBusy] = useState(false);
  const [catalogoResumo, setCatalogoResumo] = useState("");
  useEffect(() => {
    fetch("/api/catalogo-produtos",{cache:"no-store"})
      .then(async r=>{if(!r.ok) return null;return r.json();})
      .then(j=>{if(j?.ativo) setCatalogoResumo(`Catálogo ativo: ${Number(j.ativo.total_linhas||0)>0?Number(j.ativo.total_linhas).toLocaleString("pt-BR")+" linhas importadas · ":""}${Number(j.ativo.total||0).toLocaleString("pt-BR")} códigos únicos · ${Number(j.ativo.conflitos||0).toLocaleString("pt-BR")} códigos com narrativas divergentes. ${Number(j.ativo.total_linhas||0)>0?"":"Reimporte o catálogo para conferir o total de linhas da planilha. "}Não precisa reenviar para cada filtro.`);})
      .catch(()=>{});
  }, []);

  const [pedido, setPedido] = useState<File | null>(null);
  const [usinagem, setUsinagem] = useState<File | null>(null);
  const [draft, setDraft] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [requisicaoId, setRequisicaoId] = useState("");
  const [analiseIA, setAnaliseIA] = useState("");
  const [correcoesIA, setCorrecoesIA] = useState<Array<{ id: string; campo: string; valor: string; evidencia: string; metodo: string }>>([]);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [turno, setTurno] = useState("A");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [descricaoExpandida, setDescricaoExpandida] = useState(true);

  async function cadastrarCatalogo() {
    if(!catalogoFile || catalogoBusy) return;
    setCatalogoBusy(true);
    setCatalogoResumo("Importando e conferindo os códigos...");
    try {
      const fd = new FormData();
      fd.append("arquivo", catalogoFile);
      const r = await fetch("/api/catalogo-produtos",{method:"POST",body:fd});
      const j = await r.json();
      if(!r.ok) throw new Error(j.error || "Falha ao cadastrar catálogo.");
      const msg = `${j.totalLinhas.toLocaleString("pt-BR")} linhas importadas · ${j.total.toLocaleString("pt-BR")} códigos únicos · ${j.linhasRepetidas.toLocaleString("pt-BR")} linhas de códigos repetidos · ${j.conflitos} códigos com narrativas divergentes · ${j.linhasSemCodigo} linhas sem código · ${j.semNarrativa} sem narrativa`;
      setCatalogoResumo(msg);
      toast("success","Catálogo atualizado. Os próximos filtros consultarão as narrativas.");
    } catch(e:any) {
      setCatalogoResumo("");
      toast("error",e.message || "Falha ao cadastrar produtos.");
    } finally {setCatalogoBusy(false);}
  }

  async function process() {
    setRequisicaoId("");
    setCorrecoesIA([]);
    setBusy(true);
    try {
      const fd = new FormData();
      let ep = "";
      if (mode === "FILTRO") {
        if (!filter) throw new Error("Selecione o CSV do filtro.");
        fd.append("filtro", filter);
        ep = "/api/importar/filtro";
      } else {
        if (!pedido || !usinagem) throw new Error("Selecione Pedido e Usinagem.");
        fd.append("pedido", pedido);
        fd.append("usinagem", usinagem);
        ep = "/api/importar/pedido";
      }

      const r = await fetch(ep, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);

      let parsed = {
        ...j,
        produtos: (j.produtos || []).map((p: any) => ({ ...p, tipoPedido: p.tipoPedido || "NORMAL" })),
      };
      // A API processa apenas 12 registros por requisição, sem ultrapassar
      // o limite do servidor. Cada resposta é aplicada exclusivamente pelo ID.
      if (mode === "FILTRO" && j.complementoIA) {
        const ids = new Set<string>();
        if (parsed.produtos.some((p: any) => !p.id || ids.has(p.id) || !ids.add(p.id))) {
          throw new Error("IDs duplicados ou ausentes no arquivo. Importação não liberada.");
        }
        const elegiveis = parsed.produtos.filter((p: any) =>
          ["material", "medida"].some((k) => !String(p[k] || "").trim()) &&
          /\b(MDF|ULTRA|STD|RU|HDF|PINUS)\b|(?:^|[\s(])(?:U|UL|ULT|ULTR)(?=[\s)(]|$)|\d{3,4}[X×]\d{2,4}/i.test([p.descricao, p.descricaoModelo, p.outrasCaracteristicas].filter(Boolean).join(" "))
        );
        const updates = new Map<string, any>();
        const rastreio: Array<{ id: string; campo: string; valor: string; evidencia: string; metodo: string }> = [];
        for (let i = 0; i < elegiveis.length; i += 12) {
          setAnaliseIA(`Analisando campos incompletos: ${Math.min(i + 12, elegiveis.length)} de ${elegiveis.length}`);
          const resposta = await fetch("/api/importar/complementar", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ produtos: elegiveis.slice(i, i + 12) }),
          });
          const dados = await resposta.json();
          if (!resposta.ok) throw new Error(dados.error || "Falha ao analisar lote da IA.");
          const permitidos = new Set(elegiveis.slice(i, i + 12).map((p: any) => p.id));
          for (const p of dados.produtos || []) if (permitidos.has(p.id)) updates.set(p.id, p);
          for (const a of dados.alteracoes || []) if (permitidos.has(a.id)) rastreio.push(a);
        }
        const aplicar = (produtos: any[]) => produtos.map((p: any) => {
          const revisado = updates.get(p.id);
          if (!revisado) return p;
          const complemento: any = { ...p };
          for (const campo of ["tipo", "material", "medida", "cor", "acabamento", "rebaixo", "canal"]) {
            if (!String(p[campo] || "").trim() && String(revisado[campo] || "").trim()) complemento[campo] = revisado[campo];
          }
          return complemento;
        });
        parsed = { ...parsed, produtos: aplicar(parsed.produtos), romaneioProdutos: aplicar(parsed.romaneioProdutos || []) };
        setCorrecoesIA(rastreio);
      }
      setAnaliseIA("");
      setRequisicaoId(crypto.randomUUID());
      setDraft({ ...parsed, produtos: [...parsed.produtos].sort(compareProduto), romaneioProdutos: [...(parsed.romaneioProdutos || parsed.produtos)].sort(compareProduto) });
      toast("success", "Arquivo interpretado e complementado. Revise os dados antes de liberar.");
    } catch (e: any) {
      toast("error", e.message);
    } finally {
      setAnaliseIA("");
      setBusy(false);
    }
  }

  function definirTipoPedido(pedidoNumero: string, tipoPedido: TipoPedido) {
    setDraft((atual) => {
      if (!atual) return atual;
      return {
        ...atual,
        produtos: atual.produtos.map((produto) => (produto.pedido === pedidoNumero ? { ...produto, tipoPedido } : produto)),
      };
    });
  }

  async function release() {
    if (!draft || busy || !requisicaoId) return;
    setBusy(true);
    try {
      const r = await fetch("/api/programacoes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filtro: draft.filtro,
          requisicaoId,
          data,
          turno,
          origem: mode,
          diagnostico: {
            linhas: draft.linhas,
            pedidos: draft.pedidos,
            ofs: draft.ofs,
            pecas: draft.pecas,
            operacoes: draft.operacoes,
            semRota: draft.semRota,
            inconsistenciasRota: draft.inconsistenciasRota,
            processos: draft.processos,
          },
          produtos: [...draft.produtos].sort(compareProduto),
          auditoriaComplemento: correcoesIA,
          romaneioProdutos: [...(draft.romaneioProdutos || draft.produtos)].sort(compareProduto).map((item) => {
            const tipo = draft.produtos.find((p) => p.pedido === item.pedido)?.tipoPedido || item.tipoPedido || "NORMAL";
            return { ...item, tipoPedido: tipo };
          }),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      const preparados = Number(j.romaneios?.preparados || 0);
      toast("success", preparados > 0 ? `Programação liberada. ${preparados} romaneio(s) pré-pronto(s) gerado(s).` : "Programação liberada para a fábrica.");
      setDraft(null);
      await refresh();
    } catch (e: any) {
      toast("error", e.message);
    } finally {
      setBusy(false);
    }
  }

  async function excluirFiltroAtual() {
    if (!pg) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setBusy(true);
    try {
      const r = await fetch("/api/programacoes/ativa", { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao excluir filtro.");
      setConfirmDelete(false);
      setDraft(null);
      setFilter(null);
      toast("success", j.mensagem || "Filtro atual excluído.");
      await refresh();
    } catch (e: any) {
      toast("error", e.message || "Falha ao excluir filtro.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Planejamento"
        title="Programação do Dia"
        description="Importação revisada antes da liberação para o chão de fábrica."
        actions={pg ? (
          <button
            type="button"
            className={confirmDelete ? "danger" : ""}
            disabled={busy}
            onClick={() => void excluirFiltroAtual()}
          >
            <Trash2 />
            {confirmDelete ? `Confirmar exclusão do filtro ${pg.filtro || "atual"}` : `Excluir filtro ${pg.filtro || "atual"}`}
          </button>
        ) : undefined}
      />

      <Card title="Catálogo Mestre de Produtos" subtitle="Base permanente no Neon — atualização apenas quando o cadastro da empresa mudar" className="mb">
        <div className="file-upload-layout">
          <div className="file-upload-control">
            <input id="catalogo-file-input" className="file-upload-input" type="file" accept=".xlsx,.xls" disabled={catalogoBusy} onChange={(e)=>setCatalogoFile(e.target.files?.[0] || null)} aria-label="Planilha do catálogo" />
            <label htmlFor="catalogo-file-input" className={`file-upload-dropzone ${catalogoBusy ? "is-disabled" : ""}`}>
              <span className="file-upload-icon"><UploadCloud size={22}/></span>
              <span className="file-upload-copy">
                <strong>{catalogoFile ? "Planilha pronta para importar" : "Selecione a planilha do catálogo"}</strong>
                <small>{catalogoFile ? catalogoFile.name : "Clique aqui para procurar o arquivo no computador"}</small>
              </span>
              <span className="file-upload-action">{catalogoFile ? "Trocar arquivo" : "Escolher arquivo"}</span>
            </label>
            <div className="file-upload-meta"><FileSpreadsheet size={14}/> Formatos aceitos: Excel (.xlsx, .xls)</div>
          </div>
          <div className="file-upload-submit">
            <button type="button" disabled={!catalogoFile || catalogoBusy} onClick={()=>void cadastrarCatalogo()}>
              <UploadCloud size={17}/> {catalogoBusy ? "Cadastrando catálogo…" : "Cadastrar / atualizar produtos"}
            </button>
          </div>
        </div>
        <p className="muted">{catalogoResumo || "Importe Eng Empresa 34.xlsx uma vez. Nas próximas programações, o código Produto recuperará automaticamente a narrativa cadastrada. Códigos com narrativas divergentes só são usados quando a variante puder ser identificada com segurança; os demais são sinalizados para conferência."}</p>
      </Card>

      {!draft ? (
        <div className="split-form" style={{ gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)" }}>
          <Card subtitle="Passo 1" title="Fonte da programação">
            <div className="stack">
              <div className="mount-options" role="tablist" aria-label="Fonte da programação">
                <button type="button" role="tab" aria-selected={mode === "FILTRO"} className={mode === "FILTRO" ? "active" : ""} onClick={() => setMode("FILTRO")}>
                  <FileSpreadsheet />
                  <span><b>Filtro do Consistem</b><small>Recomendado · rota real</small></span>
                </button>
                <button type="button" role="tab" aria-selected={mode === "PEDIDO"} className={mode === "PEDIDO" ? "active" : ""} onClick={() => setMode("PEDIDO")}>
                  <FileText />
                  <span><b>Pedido + Usinagem</b><small>Modo secundário</small></span>
                </button>
              </div>

              {mode === "FILTRO" ? (
                <Drop file={filter} set={setFilter} accept=".csv,.txt,.xls,.xlsx" title="Filtro diário do Consistem" />
              ) : (
                <div className="form-grid">
                  <Drop file={pedido} set={setPedido} accept=".pdf" title="Pedido desmembrado" />
                  <Drop file={usinagem} set={setUsinagem} accept=".xls,.xlsx" title="Usinagem" />
                </div>
              )}

              <div className="form-grid" style={{ alignItems: "end" }}>
                <Field label="Data"><input type="date" value={data} onChange={(e) => setData(e.target.value)} /></Field>
                <Field label="Turno">
                  <select value={turno} onChange={(e) => setTurno(e.target.value)}>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="A + B">A + B</option>
                  </select>
                </Field>
                <button type="button" className="primary" style={{ minHeight: 44 }} disabled={busy} onClick={process}>
                  {busy ? (analiseIA || "Processando…") : <>Processar <ChevronRight /></>}
                </button>
              </div>
            </div>
          </Card>

          <Card subtitle="Passo 2" title="Validações da importação">
            <p className="muted" style={{ marginBottom: "var(--sp-3)" }}>As divergências ficam visíveis antes da liberação.</p>
            <ul className="rules">
              <li>N/A, vazio, hífen e N/D não pertencem à rota.</li>
              <li>0 = pendente; 1–99,99 = parcial; 100 = concluído.</li>
              <li>O conteúdo do filtro pode mudar diariamente com novos pedidos, reposições e alterações de produção.</li>
              <li>Itens sem rota e inconsistências ficam visíveis para revisão, sem bloquear automaticamente a programação.</li>
            </ul>
          </Card>
        </div>
      ) : (
        <Review d={draft} busy={busy} back={() => setDraft(null)} release={release} setTipoPedido={definirTipoPedido} correcoes={correcoesIA} descricaoExpandida={descricaoExpandida} setDescricaoExpandida={setDescricaoExpandida} />
      )}
    </>
  );
}

function Drop({ file, set, accept, title }: { file: File | null; set: (file: File | null) => void; accept: string; title: string }) {
  return (
    <label className={`drop ${file ? "ready" : ""}`}>
      <UploadCloud />
      <span>
        <b>{file?.name || title}</b>
        <small>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : accept}</small>
      </span>
      {file && (
        <button
          type="button"
          className="ghost"
          style={{ marginLeft: "auto" }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); set(null); }}
          aria-label={`Remover ${file.name}`}
        >
          <X /> Remover
        </button>
      )}
      <input type="file" accept={accept} aria-label={title} onChange={(e) => set(e.target.files?.[0] || null)} />
    </label>
  );
}

const tomPrio = (v: string): Tone => (/URGENTE/i.test(v) ? "danger" : /ALTA/i.test(v) ? "warning" : "neutral");
const ordenarPedidos = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true });

function Review({ d, busy, back, release, setTipoPedido, correcoes, descricaoExpandida, setDescricaoExpandida }: {
  d: ImportResult;
  busy: boolean;
  back: () => void;
  release: () => void;
  setTipoPedido: (pedido: string, tipo: TipoPedido) => void;
  correcoes: Array<{ id: string; campo: string; valor: string; evidencia: string; metodo: string }>;
  descricaoExpandida: boolean;
  setDescricaoExpandida: (value: boolean) => void;
}) {
  const hasWarnings = d.semRota > 0 || d.inconsistenciasRota > 0;
  const pedidosOrdenados = [...new Set(d.produtos.map((p) => p.pedido))].sort(ordenarPedidos);
  // Ferragens ficam no romaneio, mas não se tornam operações produtivas do PCP.
  const ferragens = (d.romaneioProdutos || []).filter((p) => familiaIndustrial(p) === "FERRAGENS");
  const itensPreview = [...d.produtos, ...ferragens].sort(compareProduto);
  const catalogo = (d as ImportResult & { catalogoMestre?: { correspondencias: number; conflitos: string[]; naoEncontrados: string[] } }).catalogoMestre;
  const resumoSetores = resumoPorSetor(d.produtos);
  const auditoriaRomaneio = auditarCoberturaRomaneio(d.produtos, d.romaneioProdutos || (d.filtro === "PEDIDO" ? d.produtos : []));
  const totalPendencias = resumoSetores.reduce((n, setor) => n + setor.materiaisAusentes + setor.medidasAusentes, 0);

  return (
    <>
      <div className="ph" style={{ marginBottom: "var(--sp-3)" }}>
        <div className="ph-text">
          <span className="ph-eyebrow">Revisão de importação</span>
          <h2>{d.filtro === "PEDIDO" ? "Pedido + Usinagem" : `Filtro ${d.filtro}`}</h2>
        </div>
        <div className="ph-actions">
          <button onClick={back}>Voltar</button>
          <button className="primary" disabled={busy || auditoriaRomaneio.length > 0} onClick={release}>{busy ? "Validando e liberando..." : "Liberar para a fábrica"}</button>
        </div>
      </div>

      <div className="stats">
        <StatCard label="Linhas" value={d.linhas} />
        <StatCard label="Pedidos" value={d.pedidos} />
        <StatCard label="OFs" value={d.ofs} />
        <StatCard label="Peças" value={Math.round(d.pecas).toLocaleString("pt-BR")} />
        <StatCard label="Operações" value={d.operacoes} />
        <StatCard label="Sem rota" value={d.semRota} tone={d.semRota ? "warning" : "neutral"} />
        <StatCard label="Inconsistências" value={d.inconsistenciasRota} tone={d.inconsistenciasRota ? "warning" : "neutral"} />
      </div>

      <Card title="Programação pronta para os setores" subtitle="Quantidades por operação. Não soma a mesma peça de processos diferentes como produção total." className="mb">
        <DataTable head={["Setor / máquina", "Pedidos", "OFs", "Linhas", "Qtd. programada", "Sem material", "Sem medida"]}>
          {resumoSetores.map((setor) => (
            <tr key={setor.setor}>
              <td><b>{setor.setor}</b></td>
              <td className="num">{setor.pedidos}</td>
              <td className="num">{setor.ofs}</td>
              <td className="num">{setor.linhas}</td>
              <td className="num"><b>{setor.pecas.toLocaleString("pt-BR")}</b></td>
              <td><Badge tone={setor.materiaisAusentes ? "warning" : "success"}>{setor.materiaisAusentes}</Badge></td>
              <td><Badge tone={setor.medidasAusentes ? "warning" : "success"}>{setor.medidasAusentes}</Badge></td>
            </tr>
          ))}
        </DataTable>
        {resumoSetores.length === 0 && <p className="muted">Nenhuma operação produtiva identificada. Confira o roteamento antes de liberar.</p>}
        {totalPendencias > 0 && (
          <p className="muted"><b>{totalPendencias}</b> campo(s) ausente(s) nas linhas por operação. Revise a tabela de itens antes de imprimir; uma peça pode aparecer em mais de um setor.</p>
        )}
      </Card>

      <Card title="Auditoria da fonte de romaneios" subtitle="Conferência por pedido e família: PCP × fonte completa do Consistem" className="mb">
        {auditoriaRomaneio.length > 0 ? (
          <>
            <p className="muted"><b>{auditoriaRomaneio.length} divergência(s)</b> detectada(s). A liberação fica bloqueada até corrigir o arquivo ou a leitura.</p>
            <DataTable head={["Pedido", "Família", "PCP", "Romaneio", "Diferença"]}>
              {auditoriaRomaneio.slice(0, 100).map((d, i) => (
                <tr key={`${d.pedido}-${d.familia}-${i}`}>
                  <td>{d.pedido}</td><td>{d.familia}</td>
                  <td className="num">{d.quantidadePCP}</td>
                  <td className="num">{d.quantidadeRomaneio}</td>
                  <td><Badge tone="danger">{d.diferenca}</Badge></td>
                </tr>
              ))}
            </DataTable>
          </>
        ) : <p className="muted">Quantidades conferidas por família entre programação e romaneios. Ferragens são tratadas somente no romaneio.</p>}
      </Card>

      {catalogo && (
        <Card title="Conferência do Catálogo Mestre" subtitle="Códigos do filtro × narrativas armazenadas no Neon" className="mb">
          <div className="stats">
            <StatCard label="Itens relacionados" value={catalogo.correspondencias} />
            <StatCard label="Códigos conflitantes" value={catalogo.conflitos.length} tone={catalogo.conflitos.length ? "warning" : "neutral"} />
            <StatCard label="Códigos não encontrados" value={catalogo.naoEncontrados.length} tone={catalogo.naoEncontrados.length ? "warning" : "neutral"} />
          </div>
          {catalogo.conflitos.length > 0 && <p className="muted">Conflitos sem resolução segura: {catalogo.conflitos.slice(0,30).join(", ")}{catalogo.conflitos.length>30 ? "…" : ""}. Confira a narrativa com o cadastro responsável; o sistema não escolhe descrição contraditória.</p>}
          {catalogo.naoEncontrados.length > 0 && <p className="muted">Sem código no catálogo: {catalogo.naoEncontrados.slice(0,30).join(", ")}{catalogo.naoEncontrados.length>30 ? "…" : ""}. Esses produtos conservam o que veio no filtro.</p>}
        </Card>
      )}

      {correcoes.length > 0 && (
        <Card subtitle="Revisão antes da liberação" title={`Complementações auditáveis (${correcoes.length})`} className="mb">
          <p className="muted">Somente atributos vazios foram complementados, com evidência da própria descrição.</p>
          <DataTable head={["OF", "Campo", "Valor", "Evidência", "Método"]}>
            {correcoes.slice(0, 250).map((a, i) => {
              const p = d.produtos.find((item) => item.id === a.id);
              return <tr key={`${a.id}-${a.campo}-${i}`}><td>{p?.of || "-"}</td><td>{a.campo}</td><td><b>{a.valor}</b></td><td>{a.evidencia}</td><td>{a.metodo}</td></tr>;
            })}
          </DataTable>
          {correcoes.length > 250 && <p className="muted">Exibidas 250 correções; todas seguem na auditoria da liberação.</p>}
        </Card>
      )}

      {hasWarnings && (
        <div className="warningBox" style={{ flexDirection: "column" }}>
          <b>Atenção — revisão recomendada</b>
          {d.semRota > 0 && <span>{d.semRota} item(ns) sem rota identificada.</span>}
          {d.inconsistenciasRota > 0 && <span>{d.inconsistenciasRota} inconsistência(s) de rota identificada(s).</span>}
          <span>Esses avisos não bloqueiam a liberação da programação.</span>
        </div>
      )}

      <Card subtitle="Campos que antes eram preenchidos manualmente na programação do gerente" title="Resumo automático por pedido" className="mb">
        <DataTable head={["Pedido", "Qtd. kits", "Planilha usinagem", "Medidas de alizar", "Material"]}>
          {pedidosOrdenados.map((pedidoNumero) => {
            const produtos = d.produtos.filter((p) => p.pedido === pedidoNumero);
            const kits = contagemKitsPedido(produtos).kits;
            const medidasAlizar = [...new Set(
              produtos
                .filter((p) => String(p.categoria || "").toUpperCase().startsWith("ALIZAR"))
                .map((p) => {
                  const m = String(p.medida || "").match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i);
                  if (!m) return "";
                  const largura = Number(m[2].replace(",", "."));
                  const espessura = Number(m[3].replace(",", "."));
                  if (!(largura > 0 && espessura > 0)) return "";
                  return `${largura}x${espessura}`;
                })
                .filter(Boolean)
            )].sort((a, b) => {
              const [la, ea] = a.split("x").map(Number);
              const [lb, eb] = b.split("x").map(Number);
              return lb - la || eb - ea;
            });
            const materialTexto = produtos
              .map((p) => [p.material, p.tipo, p.descricao].filter(Boolean).join(" "))
              .join(" ")
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toUpperCase();
            const ultra = materialTexto.includes("ULTRA");
            const std = /(^|[^A-Z])STD([^A-Z]|$)/.test(materialTexto);
            const material = ultra && std ? "ULTRA/STD" : ultra ? "ULTRA" : std ? "STD" : "-";
            const temUsinagem = produtos.some((p) => p.usinagemPlanilha);
            return (
              <tr key={pedidoNumero}>
                <td><b>{pedidoNumero}</b></td>
                <td className="num"><b>{kits}</b></td>
                <td><Badge tone={temUsinagem ? "success" : "warning"}>{temUsinagem ? "Sim" : "Não"}</Badge></td>
                <td>{medidasAlizar.length ? medidasAlizar.join(" / ") : "-"}</td>
                <td><b>{material}</b></td>
              </tr>
            );
          })}
        </DataTable>
      </Card>

      <Card subtitle="Marque somente os pedidos especiais. Os demais continuam com a regra normal." title="Tipo de pedido / Embalagem" className="mb">
        <DataTable head={["Pedido", "Tipo", "Regra de embalagem"]}>
          {pedidosOrdenados.map((pedidoNumero) => {
            const produto = d.produtos.find((p) => p.pedido === pedidoNumero);
            const tipo = (produto?.tipoPedido || "NORMAL") as TipoPedido;
            return (
              <tr key={pedidoNumero}>
                <td><b>{pedidoNumero}</b></td>
                <td style={{ width: 200 }}>
                  <select value={tipo} onChange={(e) => setTipoPedido(pedidoNumero, e.target.value as TipoPedido)}>
                    <option value="NORMAL">Normal</option>
                    <option value="REVENDA">Revenda</option>
                    <option value="ENGENHARIA">Engenharia</option>
                  </select>
                </td>
                <td>
                  {tipo === "REVENDA" ? <Badge tone="info">Embalagem Revenda · separada da produção normal</Badge>
                    : tipo === "ENGENHARIA" ? <Badge tone="info">Embalagem Engenharia · separada da produção normal</Badge>
                    : <span className="muted">Embalagens normais por componente</span>}
                </td>
              </tr>
            );
          })}
        </DataTable>
      </Card>

      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 12 }}>
        <button type="button" onClick={() => setDescricaoExpandida(!descricaoExpandida)}>
          {descricaoExpandida ? "Visualização compacta" : "Expandir descrições e colunas"}
        </button>
      </div>
      <Card subtitle={`Prévia de até 250 linhas · ${d.produtos.length} peças da programação + ${ferragens.length} ferragens do romaneio`} title="Itens da programação" className="mb">
        <DataTable head={["Seq.", "Pedido", "Item", "OF", "Produto", "Família", "Descrição", "Descrição Máscara", "Material", "Tipo", "Canal", "Rebaixo", "Acabamento", "Cor", "Qtd programada", "Comp.", "Larg.", "Esp.", "Prioridade", "Rota"]}>
          {itensPreview.slice(0, 250).map((p, index) => {
            const m = modeloProduto(p);
            return (
              <tr key={p.id}>
                <td className="mono">{String(index + 1).padStart(2, "0")}</td>
                <td>{m.pedido}</td><td>{m.item}</td><td><b>{m.of}</b></td><td>{m.produto}</td>
                <td><Badge>{m.familia}</Badge></td>
                <td className="descCell" title={p.descricao} style={descricaoExpandida ? { minWidth: 540, maxWidth: 750, width: 640, whiteSpace: "normal", overflowWrap: "anywhere", lineHeight: 1.5 } : undefined}><b>{p.descricao}</b></td>
                <td title={p.descricaoModelo || ""} style={descricaoExpandida ? { minWidth: 300, whiteSpace: "normal", overflowWrap: "anywhere" } : undefined}>{p.descricaoModelo || "-"}</td>
                <td>{p.material || "-"}</td>
                <td style={descricaoExpandida ? { minWidth: 140, whiteSpace: "normal" } : undefined}>{m.tipo}</td><td>{m.canal}</td><td style={descricaoExpandida ? { minWidth: 135, whiteSpace: "normal" } : undefined}>{m.rebaixo}</td><td>{m.acabamento}</td><td>{m.cor}</td>
                <td className="num">{m.planejado}</td>
                <td className="num mono">{m.comprimento || "-"}</td>
                <td className="num mono">{m.largura || "-"}</td>
                <td className="num mono">{m.espessura || "-"}</td>
                <td><Badge tone={tomPrio(String(m.prioridade))}>{m.prioridade}</Badge></td>
                <td>
                  <div className="route-chips">
                    {p.operacoes.map((o, i) => (
                      <span key={o.id}>{LABELS[o.processo] || o.processo}{i < p.operacoes.length - 1 && <i>›</i>}</span>
                    ))}
                    {!p.operacoes.length && <Badge tone="danger">Sem rota</Badge>}
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </Card>

      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button onClick={back}>Voltar</button>
        <button className="primary" disabled={busy} onClick={release}>{busy ? "Validando e liberando..." : "Liberar para a fábrica"}</button>
      </div>
    </>
  );
}

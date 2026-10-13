"use client";

import { useState } from "react";
import { ChevronRight, FileSpreadsheet, FileText, UploadCloud, X } from "lucide-react";
import type { ImportResult, TipoPedido } from "@/types/pcp";
import { useOps } from "@/components/operational-provider";
import { Badge, Card, DataTable, Field, PageHeader, StatCard, type Tone } from "@/components/ui";
import { LABELS } from "@/lib/metrics";
import { modeloProduto } from "@/lib/presentation";

export default function Programacao() {
  const { refresh, toast } = useOps();
  const [mode, setMode] = useState<"FILTRO" | "PEDIDO">("FILTRO");
  const [filter, setFilter] = useState<File | null>(null);
  const [pedido, setPedido] = useState<File | null>(null);
  const [usinagem, setUsinagem] = useState<File | null>(null);
  const [draft, setDraft] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [turno, setTurno] = useState("A");

  async function process() {
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

      setDraft({
        ...j,
        produtos: (j.produtos || []).map((p: any) => ({ ...p, tipoPedido: p.tipoPedido || "NORMAL" })),
      });
      toast("success", "Arquivo interpretado. Revise os dados antes de liberar.");
    } catch (e: any) {
      toast("error", e.message);
    } finally {
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
    if (!draft) return;
    setBusy(true);
    try {
      const r = await fetch("/api/programacoes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filtro: draft.filtro,
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
          produtos: draft.produtos,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      toast("success", "Programação liberada para a fábrica.");
      setDraft(null);
      await refresh();
    } catch (e: any) {
      toast("error", e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Planejamento" title="Programação do Dia" description="Importação revisada antes da liberação para o chão de fábrica." />

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
                  {busy ? "Processando…" : <>Processar <ChevronRight /></>}
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
        <Review d={draft} busy={busy} back={() => setDraft(null)} release={release} setTipoPedido={definirTipoPedido} />
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

function Review({ d, busy, back, release, setTipoPedido }: {
  d: ImportResult;
  busy: boolean;
  back: () => void;
  release: () => void;
  setTipoPedido: (pedido: string, tipo: TipoPedido) => void;
}) {
  const hasWarnings = d.semRota > 0 || d.inconsistenciasRota > 0;
  const pedidosOrdenados = [...new Set(d.produtos.map((p) => p.pedido))].sort(ordenarPedidos);

  return (
    <>
      <div className="ph" style={{ marginBottom: "var(--sp-3)" }}>
        <div className="ph-text">
          <span className="ph-eyebrow">Revisão de importação</span>
          <h2>{d.filtro === "PEDIDO" ? "Pedido + Usinagem" : `Filtro ${d.filtro}`}</h2>
        </div>
        <div className="ph-actions">
          <button onClick={back}>Voltar</button>
          <button className="primary" disabled={busy} onClick={release}>{busy ? "Liberando…" : "Liberar para a fábrica"}</button>
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
            const kits = produtos
              .filter((p) => {
                const categoria = String(p.categoria || "").toUpperCase();
                return categoria.includes("KIT CORRER") && !categoria.includes("SUPORTE");
              })
              .reduce((sum, p) => sum + Number(p.quantidade || 0), 0);
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

      <Card subtitle={`Prévia limitada a 250 linhas · a programação completa (${d.produtos.length}) será salva`} title="Itens da programação" className="mb">
        <DataTable head={["Seq.", "Pedido", "Item", "OF", "Produto", "Família", "Descrição", "Tipo", "Canal", "Rebaixo", "Acabamento", "Cor", "Qtd programada", "Comp.", "Larg.", "Esp.", "Prioridade", "Rota"]}>
          {d.produtos.slice(0, 250).map((p, index) => {
            const m = modeloProduto(p);
            return (
              <tr key={p.id}>
                <td className="mono">{String(index + 1).padStart(2, "0")}</td>
                <td>{m.pedido}</td><td>{m.item}</td><td><b>{m.of}</b></td><td>{m.produto}</td>
                <td><Badge>{m.familia}</Badge></td>
                <td className="descCell"><b>{m.descricao}</b></td>
                <td>{m.tipo}</td><td>{m.canal}</td><td>{m.rebaixo}</td><td>{m.acabamento}</td><td>{m.cor}</td>
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
        <button className="primary" disabled={busy} onClick={release}>{busy ? "Liberando…" : "Liberar para a fábrica"}</button>
      </div>
    </>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Layers3,
  PackageSearch,
  RefreshCw,
  Search,
  Wrench,
} from "lucide-react";
import { useOpsVisao as useOps } from "@/components/operational-provider";
import { LABELS } from "@/lib/metrics";
import { Badge, Card, DataTable, Empty, Field, PageHeader, Segmented, StatCard } from "@/components/ui";

type Excecao = {
  id: string;
  produtoId: string | null;
  pedido: string;
  of: string;
  tipo: "FALTA_PECA" | "REPOSICAO" | "RETRABALHO";
  quantidade: number;
  motivo: string;
  processoRetorno: string;
  observacao: string;
  status: string;
  criadoPor: string;
  criadoEm: string;
  descricao: string;
  categoria: string;
  medida: string;
  material: string;
};

const TIPOS = [
  { value: "FALTA_PECA", label: "Falta de peça", icon: AlertTriangle },
  { value: "REPOSICAO", label: "Reposição", icon: Layers3 },
  { value: "RETRABALHO", label: "Retrabalho", icon: Wrench },
] as const;

function fmt(v: number) {
  return Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function labelTipo(tipo: string) {
  return TIPOS.find((x) => x.value === tipo)?.label || tipo;
}

export default function ExcecoesPage() {
  const { pg, refresh, toast, lastSync,recorteQuery } = useOps();
  const produtos = pg?.produtos || [];

  const [itens, setItens] = useState<Excecao[]>([]);
  const [pedido, setPedido] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [tipo, setTipo] = useState<Excecao["tipo"]>("FALTA_PECA");
  const [quantidade, setQuantidade] = useState("1");
  const [motivo, setMotivo] = useState("");
  const [processoRetorno, setProcessoRetorno] = useState("");
  const [observacao, setObservacao] = useState("");
  const [busca, setBusca] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/gestao-producao?recorte=1&"+recorteQuery, { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      setItens(j.excecoes || []);
    }
  }

  useEffect(() => {
    void load();
  }, [pg?.id, lastSync?.getTime(),recorteQuery]);

  const pedidos = useMemo(
    () =>
      [...new Set(produtos.map((p) => p.pedido).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "pt-BR", { numeric: true })
      ),
    [produtos]
  );

  const pecasPedido = useMemo(
    () =>
      produtos
        .filter((p) => !pedido || p.pedido === pedido)
        .sort((a, b) =>
          [a.categoria, a.medida, a.descricao]
            .join("|")
            .localeCompare([b.categoria, b.medida, b.descricao].join("|"), "pt-BR", {
              numeric: true,
            })
        ),
    [produtos, pedido]
  );

  const processos = useMemo(
    () =>
      [...new Set(produtos.flatMap((p) => p.operacoes.map((o) => o.processo)))].sort(
        (a, b) => a.localeCompare(b, "pt-BR")
      ),
    [produtos]
  );

  const abertas = itens.filter((x) => x.status === "ABERTA");
  const filtradas = itens.filter((x) => {
    const q = busca.trim().toUpperCase();
    if (!q) return true;
    return [
      x.pedido,
      x.of,
      x.tipo,
      x.descricao,
      x.categoria,
      x.medida,
      x.material,
      x.motivo,
      x.processoRetorno,
    ]
      .join(" ")
      .toUpperCase()
      .includes(q);
  });

  async function registrar() {
    const peca = produtos.find((p) => p.id === produtoId);
    const pedidoFinal = pedido || peca?.pedido || "";

    if (!pedidoFinal) {
      toast("error", "Selecione o pedido.");
      return;
    }

    setBusy(true);
    try {
      const r = await fetch("/api/gestao-producao?recorte=1&"+recorteQuery, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pedido: pedidoFinal,
          produtoId: produtoId || null,
          tipo,
          quantidade: Number(quantidade || 0),
          motivo,
          processoRetorno,
          observacao,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao registrar ocorrência.");

      toast("success", `${labelTipo(tipo)} registrada para o pedido ${pedidoFinal}.`);
      setQuantidade("1");
      setMotivo("");
      setObservacao("");
      setProdutoId("");
      await load();
      await refresh();
    } catch (e: any) {
      toast("error", e?.message || "Falha ao registrar ocorrência.");
    } finally {
      setBusy(false);
    }
  }

  async function resolver(id: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/gestao-producao?recorte=1&"+recorteQuery, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "RESOLVER_EXCECAO", id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao resolver ocorrência.");
      toast("success", "Ocorrência resolvida.");
      await load();
      await refresh();
    } catch (e: any) {
      toast("error", e?.message || "Falha ao resolver ocorrência.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Controle de exceções"
        title="Faltas, reposições e retrabalho"
        description="Registre a exceção em poucos campos e mantenha a peça vinculada ao pedido e à rota."
        actions={<button onClick={() => void load()}><RefreshCw /> Atualizar</button>}
      />

      <div className="stats">
        <StatCard icon={<PackageSearch />} label="Abertas" value={abertas.length} tone={abertas.length ? "warning" : "neutral"} />
        <StatCard icon={<AlertTriangle />} label="Falta de peça" value={abertas.filter((x) => x.tipo === "FALTA_PECA").length} />
        <StatCard icon={<Layers3 />} label="Reposições" value={abertas.filter((x) => x.tipo === "REPOSICAO").length} />
        <StatCard icon={<Wrench />} label="Retrabalhos" value={abertas.filter((x) => x.tipo === "RETRABALHO").length} />
      </div>

      <div className="split-form">
        <Card subtitle="Nova ocorrência" title="Registrar em menos de 1 minuto">
          <div className="stack">
            <Field label="Tipo">
              <Segmented value={tipo} onChange={setTipo} options={TIPOS.map((x) => ({ value: x.value, label: x.label }))} />
            </Field>
            <Field label="Pedido">
              <select value={pedido} onChange={(e) => { setPedido(e.target.value); setProdutoId(""); }}>
                <option value="">Selecione o pedido</option>
                {pedidos.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Peça / OF">
              <select value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
                <option value="">Peça não especificada</option>
                {pecasPedido.slice(0, 500).map((p) => (
                  <option key={p.id} value={p.id}>{p.of ? `${p.of} · ` : ""}{p.categoria} · {p.medida || "-"} · {p.descricao}</option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Quantidade">
                <input type="number" min="0.001" step="1" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
              </Field>
              <Field label="Retornar para">
                <select value={processoRetorno} onChange={(e) => setProcessoRetorno(e.target.value)}>
                  <option value="">Sem retorno definido</option>
                  {processos.map((p) => <option key={p} value={p}>{LABELS[p] || p}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Motivo">
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: quebra, medida incorreta, acabamento, peça faltante..." />
            </Field>
            <Field label="Observação">
              <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Informação complementar, se necessário." />
            </Field>
            <button className="primary" style={{ minHeight: 44 }} disabled={busy} onClick={registrar}>
              {busy ? "Registrando…" : "Registrar ocorrência"}
            </button>
          </div>
        </Card>

        <Card
          subtitle="Controle"
          title="Ocorrências da programação"
          actions={
            <div className="search" style={{ width: 260 }}>
              <Search />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pedido, OF, peça..." />
            </div>
          }
        >
          {filtradas.length ? (
            <DataTable head={["Status", "Tipo", "Pedido", "OF", "Peça", "Medida", "Qtd.", "Motivo", "Retorno", "Aberto por", "Ação"]}>
              {filtradas.map((x) => (
                <tr key={x.id} className={x.status === "ABERTA" ? "critRow" : ""}>
                  <td><Badge tone={x.status === "ABERTA" ? "warning" : "success"}>{x.status}</Badge></td>
                  <td><b>{labelTipo(x.tipo)}</b></td>
                  <td><b>{x.pedido}</b></td>
                  <td>{x.of || "-"}</td>
                  <td>{x.descricao || x.categoria || "-"}</td>
                  <td className="mono">{x.medida || "-"}</td>
                  <td className="num"><b>{fmt(x.quantidade)}</b></td>
                  <td>{x.motivo || "-"}</td>
                  <td>{x.processoRetorno ? LABELS[x.processoRetorno] || x.processoRetorno : "-"}</td>
                  <td>{x.criadoPor || "-"}</td>
                  <td>
                    {x.status === "ABERTA" ? (
                      <button className="success" disabled={busy} onClick={() => resolver(x.id)}><CheckCircle2 /> Resolver</button>
                    ) : <Badge tone="success">Resolvida</Badge>}
                  </td>
                </tr>
              ))}
            </DataTable>
          ) : <Empty title="Nenhuma ocorrência registrada." />}
        </Card>
      </div>
    </>
  );
}

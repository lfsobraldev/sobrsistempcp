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
import { useOps } from "@/components/operational-provider";
import { LABELS } from "@/lib/metrics";

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
  const { pg, refresh, toast, lastSync } = useOps();
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
    const r = await fetch("/api/gestao-producao", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      setItens(j.excecoes || []);
    }
  }

  useEffect(() => {
    void load();
  }, [pg?.id, lastSync?.getTime()]);

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
      const r = await fetch("/api/gestao-producao", {
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
      const r = await fetch("/api/gestao-producao", {
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
      <div className="pageTitle v12PageTitle">
        <div>
          <span>CONTROLE DE EXCEÇÕES</span>
          <h1>Faltas, reposições e retrabalho</h1>
          <p>Registre a exceção em poucos campos e mantenha a peça vinculada ao pedido e à rota.</p>
        </div>
        <button className="secondary" onClick={() => void load()}>
          <RefreshCw /> Atualizar
        </button>
      </div>

      <section className="v12ExceptionKpis">
        <article><PackageSearch /><div><span>ABERTAS</span><b>{abertas.length}</b></div></article>
        <article><AlertTriangle /><div><span>FALTA DE PEÇA</span><b>{abertas.filter((x) => x.tipo === "FALTA_PECA").length}</b></div></article>
        <article><Layers3 /><div><span>REPOSIÇÕES</span><b>{abertas.filter((x) => x.tipo === "REPOSICAO").length}</b></div></article>
        <article><Wrench /><div><span>RETRABALHOS</span><b>{abertas.filter((x) => x.tipo === "RETRABALHO").length}</b></div></article>
      </section>

      <section className="v12ExceptionLayout">
        <article className="v12Card">
          <header>
            <div><span>NOVA OCORRÊNCIA</span><h2>Registrar em menos de 1 minuto</h2></div>
          </header>

          <div className="v12ExceptionForm">
            <label>
              <span>TIPO</span>
              <div className="v12TypeButtons">
                {TIPOS.map((x) => {
                  const Icon = x.icon;
                  return (
                    <button
                      key={x.value}
                      className={tipo === x.value ? "active" : ""}
                      type="button"
                      onClick={() => setTipo(x.value)}
                    >
                      <Icon /> {x.label}
                    </button>
                  );
                })}
              </div>
            </label>

            <label>
              <span>PEDIDO</span>
              <select
                value={pedido}
                onChange={(e) => {
                  setPedido(e.target.value);
                  setProdutoId("");
                }}
              >
                <option value="">Selecione o pedido</option>
                {pedidos.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>

            <label>
              <span>PEÇA / OF</span>
              <select value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
                <option value="">Peça não especificada</option>
                {pecasPedido.slice(0, 500).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.of ? `${p.of} • ` : ""}{p.categoria} • {p.medida || "-"} • {p.descricao}
                  </option>
                ))}
              </select>
            </label>

            <div className="v12FormSplit">
              <label>
                <span>QUANTIDADE</span>
                <input
                  type="number"
                  min="0.001"
                  step="1"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                />
              </label>

              <label>
                <span>RETORNAR PARA</span>
                <select value={processoRetorno} onChange={(e) => setProcessoRetorno(e.target.value)}>
                  <option value="">Sem retorno definido</option>
                  {processos.map((p) => (
                    <option key={p} value={p}>{LABELS[p] || p}</option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              <span>MOTIVO</span>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: quebra, medida incorreta, acabamento, peça faltante..."
              />
            </label>

            <label>
              <span>OBSERVAÇÃO</span>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Informação complementar, se necessário."
              />
            </label>

            <button className="primary v12FullButton" disabled={busy} onClick={registrar}>
              {busy ? "REGISTRANDO..." : "REGISTRAR OCORRÊNCIA"}
            </button>
          </div>
        </article>

        <article className="v12Card v12Wide">
          <header>
            <div><span>CONTROLE</span><h2>Ocorrências da programação</h2></div>
            <label className="v12InlineSearch">
              <Search />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pedido, OF, peça..." />
            </label>
          </header>

          <div className="tableWrap v12ExceptionsTable">
            <table>
              <thead>
                <tr>
                  <th>STATUS</th>
                  <th>TIPO</th>
                  <th>PEDIDO</th>
                  <th>OF</th>
                  <th>PEÇA</th>
                  <th>MEDIDA</th>
                  <th className="num">QTD.</th>
                  <th>MOTIVO</th>
                  <th>RETORNO</th>
                  <th>ABERTO POR</th>
                  <th>AÇÃO</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((x) => (
                  <tr key={x.id} className={x.status === "ABERTA" ? "v12OpenException" : ""}>
                    <td>
                      <span className={`managerStatus ${x.status === "ABERTA" ? "alert" : "done"}`}>
                        {x.status}
                      </span>
                    </td>
                    <td><b>{labelTipo(x.tipo)}</b></td>
                    <td><b>{x.pedido}</b></td>
                    <td>{x.of || "-"}</td>
                    <td>{x.descricao || x.categoria || "-"}</td>
                    <td>{x.medida || "-"}</td>
                    <td className="num"><b>{fmt(x.quantidade)}</b></td>
                    <td>{x.motivo || "-"}</td>
                    <td>{x.processoRetorno ? LABELS[x.processoRetorno] || x.processoRetorno : "-"}</td>
                    <td>{x.criadoPor || "-"}</td>
                    <td>
                      {x.status === "ABERTA" ? (
                        <button className="v12Resolve" disabled={busy} onClick={() => resolver(x.id)}>
                          <CheckCircle2 /> Resolver
                        </button>
                      ) : (
                        <span className="v12Resolved">Resolvida</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtradas.length && <div className="empty"><span>Nenhuma ocorrência registrada.</span></div>}
          </div>
        </article>
      </section>
    </>
  );
}

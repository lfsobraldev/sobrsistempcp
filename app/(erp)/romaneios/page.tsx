"use client";

import {
  Boxes,
  FileSpreadsheet,
  PackageCheck,
  RefreshCw,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge, Card, DataTable, Field, PageHeader, StatCard } from "@/components/ui";
import { GerarComIABotao } from "@/components/romaneio-ai";
import type {
  MountType,
  ProcessingResult,
} from "@/lib/romaneio/types";
import type { Produto } from "@/types/pcp";

type PreparedEntry = {
  pedido: string;
  cliente: string;
  tipoPedido: string;
  montagem: MountType;
  status: "PRE_PRONTO" | "PRONTO" | "ATENCAO" | string;
  hasMachining: boolean;
  origemUsinagem: string;
  warnings: string[];
  resultado: ProcessingResult;
};

const MONTAGENS: Array<{
  value: MountType;
  label: string;
  detalhe: string;
}> = [
  {
    value: "MONTADO_HS",
    label: "Montado HS",
    detalhe: "Regra de montagem HS",
  },
  {
    value: "MONTADO_TIMADEL",
    label: "Montado Timadel",
    detalhe: "Regra de montagem Timadel",
  },
  {
    value: "REVENDA",
    label: "Revenda",
    detalhe: "Regra específica de revenda",
  },
  {
    value: "MONTADO_ESTANCIA",
    label: "Montado Estância",
    detalhe: "Regra de montagem Estância",
  },
];

export default function RomaneiosPage() {
  const [pedido, setPedido] = useState<File | null>(null);
  const [usinagem, setUsinagem] = useState<File | null>(null);
  const [produtosFiltro, setProdutosFiltro] = useState<Produto[]>([]);
  const [preparados, setPreparados] = useState<PreparedEntry[]>([]);
  const [pedidoFiltro, setPedidoFiltro] = useState("");
  const [carregandoFiltro, setCarregandoFiltro] = useState(true);
  const [mountType, setMountType] = useState<MountType>("MONTADO_HS");
  const [filtro, setFiltro] = useState("");
  const [pagina, setPagina] = useState("");
  const [conferente, setConferente] = useState("");
  const [separador, setSeparador] = useState("");
  const [motorista, setMotorista] = useState("");
  const [transportadora, setTransportadora] = useState("");
  const [placa, setPlaca] = useState("");
  const [notaFiscal, setNotaFiscal] = useState("");
  const [complemento, setComplemento] = useState(false);
  const [resultado, setResultado] = useState<ProcessingResult | null>(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let active = true;

    Promise.all([
      fetch("/api/programacoes/ativa", { cache: "no-store" }),
      fetch("/api/romaneios/preparados", { cache: "no-store" }),
    ])
      .then(async ([response, preparedResponse]) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Falha ao carregar Filtro do Consistem.");
        const preparedData = await preparedResponse.json().catch(() => ({ itens: [] }));
        if (!active) return;
        const products = (data.programacao?.produtos || []) as Produto[];
        setProdutosFiltro(products);
        setPreparados(Array.isArray(preparedData.itens) ? preparedData.itens : []);
        const filtroAtual = String(data.programacao?.filtro || "");
        if (filtroAtual) setFiltro((current) => current || filtroAtual);
      })
      .catch(() => {
        if (active) {
          setProdutosFiltro([]);
          setPreparados([]);
        }
      })
      .finally(() => {
        if (active) setCarregandoFiltro(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const preparadosPorPedido = useMemo(
    () => new Map(preparados.map((item) => [String(item.pedido), item])),
    [preparados]
  );

  const pedidosFiltro = useMemo(() => {
    const map = new Map<string, Produto[]>();

    for (const produto of produtosFiltro) {
      const key = String(produto.pedido || "").trim();
      if (!key) continue;
      const list = map.get(key) || [];
      list.push(produto);
      map.set(key, list);
    }

    return [...map.entries()]
      .map(([numero, produtos]) => ({
        numero,
        produtos,
        pecas: produtos.reduce((sum, produto) => sum + Number(produto.quantidade || 0), 0),
        itens: produtos.length,
        tipoPedido: produtos.find((produto) => produto.tipoPedido && produto.tipoPedido !== "NORMAL")?.tipoPedido || "NORMAL",
        montagem: produtos.find((produto) => produto.montagemEngenharia)?.montagemEngenharia || "MONTADO_HS",
      }))
      .sort((a, b) => a.numero.localeCompare(b.numero, "pt-BR", { numeric: true }));
  }, [produtosFiltro]);

  async function processarFiltro(comUsinagem: boolean) {
    if (!pedidoFiltro) return;
    if (comUsinagem && !usinagem) return;

    setResultado(null);
    setBusy(comUsinagem ? "PROCESSAR_FILTRO" : "TESTAR_FILTRO");

    try {
      const fd = new FormData();
      fd.append("pedido", pedidoFiltro);
      if (comUsinagem && usinagem) fd.append("usinagem", usinagem);
      fd.append("mountType", mountType);
      fd.append(
        "orderOptions",
        JSON.stringify({
          mountType,
          filtro,
          pagina,
          conferente,
          separador,
          motorista,
          transportadora,
          placa,
          notaFiscal,
          complementoObra: complemento,
        })
      );

      const response = await fetch("/api/romaneios/processar-filtro", {
        method: "POST",
        body: fd,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            (comUsinagem
              ? "Falha ao finalizar romaneio pelo Filtro do Consistem."
              : "Falha ao testar romaneio sem usinagem.")
        );
      }

      setResultado(data);

      if (!comUsinagem) {
        const download = await fetch("/api/romaneios/gerar", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        });

        if (!download.ok) {
          const errorData = await download.json().catch(() => ({}));
          throw new Error(
            errorData.error || "Falha ao gerar o romaneio de teste."
          );
        }

        const blob = await download.blob();
        const disposition = download.headers.get("content-disposition") || "";
        const match = disposition.match(/filename="?([^"]+)"?/i);
        const nome =
          match?.[1] ||
          `Romaneio_Teste_${pedidoFiltro || "Filtro51"}.xlsx`;

        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = nome;
        document.body.appendChild(a);
        a.click();
        a.remove();

        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
    } catch (e: any) {
      alert(
        e?.message ||
          (comUsinagem
            ? "Falha ao finalizar romaneio."
            : "Falha ao testar romaneio.")
      );
    } finally {
      setBusy("");
    }
  }

  async function processar() {
    if (!pedido) return;

    setBusy("PROCESSAR");

    try {
      const fd = new FormData();
      fd.append("pedido", pedido);
      if (usinagem) fd.append("usinagem", usinagem);
      fd.append("mountType", mountType);
      fd.append(
        "orderOptions",
        JSON.stringify({
          mountType,
          filtro,
          pagina,
          conferente,
          separador,
          motorista,
          transportadora,
          placa,
          notaFiscal,
          complementoObra: complemento,
        })
      );

      const r = await fetch("/api/romaneios/processar", {
        method: "POST",
        body: fd,
      });

      const j = await r.json();

      if (!r.ok) {
        throw new Error(j.error || "Falha ao processar romaneio.");
      }

      setResultado(j);
    } catch (e: any) {
      alert(e?.message || "Falha ao processar romaneio.");
    } finally {
      setBusy("");
    }
  }

  async function baixar(tipo: "ROMANEIO" | "ETIQUETAS") {
    if (!resultado) return;

    setBusy(tipo);

    try {
      const rota =
        tipo === "ROMANEIO"
          ? "/api/romaneios/gerar"
          : "/api/romaneios/etiquetas";

      const r = await fetch(rota, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(resultado),
      });

      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(
          j.error ||
            (tipo === "ROMANEIO"
              ? "Falha ao gerar romaneio."
              : "Falha ao gerar etiquetas.")
        );
      }

      const blob = await r.blob();
      const disposition = r.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const nome =
        match?.[1] ||
        (tipo === "ROMANEIO" ? "Romaneio.xlsx" : "Etiquetas.xlsx");

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e: any) {
      alert(e?.message || "Falha ao gerar arquivo.");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Expedição"
        title="Gerador de Romaneios"
        description="Todos os pedidos do Filtro do Consistem já ficam pré-prontos automaticamente. A IA auxilia conferência e exceções; a planilha de usinagem é opcional para corrigir/complementar quando necessário."
        actions={<GerarComIABotao />}
      />

      <Card subtitle="Passo 1" title="Romaneios da programação ativa" className="mb">
        <p className="muted" style={{ marginBottom: "var(--sp-4)" }}>
          Ao liberar o Filtro do Consistem, o PCP prepara automaticamente todos os romaneios. Abra um pedido para revisar e exportar. Se houver divergência, envie a planilha de usinagem como segunda opção para refazer o pedido.
        </p>
        {carregandoFiltro ? (
          <div className="warningBox"><b>Carregando programação…</b><span>Lendo os pedidos da programação ativa.</span></div>
        ) : pedidosFiltro.length ? (
          <>
            <DataTable head={["Pedido", "Itens", "Peças", "Tipo", "Status", ""]}>
              {pedidosFiltro.map((entry) => {
                const ativo = pedidoFiltro === entry.numero;
                const preparado = preparadosPorPedido.get(entry.numero);
                const status = preparado?.status || "PREPARANDO";
                return (
                  <tr key={entry.numero}>
                    <td><b>{entry.numero}</b></td>
                    <td>{entry.itens}</td>
                    <td>{entry.pecas}</td>
                    <td><Badge>{entry.tipoPedido}</Badge></td>
                    <td>
                      {ativo ? <Badge tone="info">Em edição</Badge>
                        : status === "PRONTO" ? <Badge tone="success">Pronto</Badge>
                        : status === "ATENCAO" ? <Badge tone="warning">Revisar</Badge>
                        : status === "PRE_PRONTO" ? <Badge tone="info">Pré-pronto</Badge>
                        : <span className="muted">Preparando…</span>}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className={ativo ? "primary" : ""}
                        onClick={() => {
                          if (ativo) {
                            setPedidoFiltro("");
                            setUsinagem(null);
                            setResultado(null);
                            return;
                          }
                          // Seleção exclusiva: no máximo UM pedido ativo no gerador.
                          setPedidoFiltro(entry.numero);
                          setUsinagem(null);
                          const preparado = preparadosPorPedido.get(entry.numero);
                          setResultado(preparado?.resultado || null);
                          if (preparado?.montagem) setMountType(preparado.montagem);
                          else if (entry.tipoPedido === "REVENDA") setMountType("REVENDA");
                          else if (entry.tipoPedido === "ENGENHARIA") setMountType(entry.montagem as MountType);
                          else setMountType("MONTADO_HS");
                        }}
                      >
                        {ativo ? "Desmarcar" : "Selecionar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </DataTable>

            {pedidoFiltro && (
              <div className="selected-order">
                <div className="row between" style={{ flexWrap: "wrap" }}>
                  <div><small>Pedido selecionado</small><div className="big-value">{pedidoFiltro}</div></div>
                  <div><small>Montagem</small><div><b>{mountType.replaceAll("_", " ")}</b></div></div>
                </div>
                <div className="actions-grid">
                  <button
                    type="button"
                    disabled={!resultado || !!busy}
                    onClick={() => baixar("ROMANEIO")}
                  >
                    <FileSpreadsheet />
                    Baixar pré-pronto
                  </button>
                  <label className={`drop ${usinagem ? "ready" : ""}`}>
                    <UploadCloud />
                    <span>
                      <b>{usinagem?.name || "Usinagem opcional / correção"}</b>
                      <small>{usinagem ? "Planilha selecionada para refazer" : "Use apenas se precisar complementar ou corrigir · .xlsx / .xls"}</small>
                    </span>
                    <input type="file" accept=".xlsx,.xls" onChange={(e) => setUsinagem(e.target.files?.[0] || null)} />
                  </label>
                  <button type="button" className="primary" disabled={!usinagem || !!busy} onClick={() => processarFiltro(true)}>
                    <RefreshCw className={busy === "PROCESSAR_FILTRO" ? "spin" : ""} />
                    {busy === "PROCESSAR_FILTRO" ? "Refazendo…" : "Refazer com usinagem"}
                  </button>
                </div>
                <small>O romaneio pré-pronto usa o Filtro do Consistem. A planilha de usinagem não é obrigatória: ela funciona como fonte adicional/fallback quando houver mãos, aplicações ou detalhes que precisem de correção.</small>
              </div>
            )}
          </>
        ) : (
          <div className="warningBox"><b>Sem programação ativa</b><span>Importe e libere o Filtro do Consistem para os pedidos aparecerem aqui.</span></div>
        )}
      </Card>

      <Card subtitle="Alternativa" title="Modo manual" className="mb">
        <p className="muted" style={{ marginBottom: "var(--sp-4)" }}>Use somente para pedidos que ainda não estejam no Filtro do Consistem.</p>
        <div className="form-grid">
          <label className={`drop ${pedido ? "ready" : ""}`}>
            <UploadCloud />
            <span><b>{pedido?.name || "Pedido em PDF"}</b><small>{pedido ? "Arquivo selecionado" : ".pdf"}</small></span>
            <input type="file" accept=".pdf" onChange={(e) => setPedido(e.target.files?.[0] || null)} />
          </label>
          <label className={`drop ${usinagem ? "ready" : ""}`}>
            <UploadCloud />
            <span><b>{usinagem?.name || "Usinagem (opcional)"}</b><small>{usinagem ? "Arquivo selecionado" : ".xlsx / .xls"}</small></span>
            <input type="file" accept=".xlsx,.xls" onChange={(e) => setUsinagem(e.target.files?.[0] || null)} />
          </label>
        </div>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: "var(--sp-4)" }}>
          <button className="primary" disabled={!pedido || !!busy} onClick={processar}>
            <RefreshCw className={busy === "PROCESSAR" ? "spin" : ""} />
            {busy === "PROCESSAR" ? "Processando…" : "Processar modo manual"}
          </button>
        </div>
      </Card>

      <Card subtitle="Passo 2" title="Configuração do romaneio" className="mb">
        <div className="mount-options">
          {MONTAGENS.map((item) => (
            <button key={item.value} type="button" className={mountType === item.value ? "active" : ""} onClick={() => setMountType(item.value)}>
              <Boxes />
              <span><b>{item.label}</b><small>{item.detalhe}</small></span>
            </button>
          ))}
        </div>
        <div className="form-grid" style={{ marginTop: "var(--sp-4)" }}>
          <Field label="Filtro"><input value={filtro} onChange={(e) => setFiltro(e.target.value)} /></Field>
          <Field label="Página"><input value={pagina} onChange={(e) => setPagina(e.target.value)} /></Field>
          <Field label="Conferente"><input value={conferente} onChange={(e) => setConferente(e.target.value)} /></Field>
          <Field label="Separado por"><input value={separador} onChange={(e) => setSeparador(e.target.value)} /></Field>
          <Field label="Motorista"><input value={motorista} onChange={(e) => setMotorista(e.target.value)} /></Field>
          <Field label="Transportadora"><input value={transportadora} onChange={(e) => setTransportadora(e.target.value)} /></Field>
          <Field label="Placa"><input value={placa} onChange={(e) => setPlaca(e.target.value)} /></Field>
          <Field label="Nota fiscal"><input value={notaFiscal} onChange={(e) => setNotaFiscal(e.target.value)} /></Field>
          <Field label="Complemento de obra">
            <select value={complemento ? "SIM" : "NAO"} onChange={(e) => setComplemento(e.target.value === "SIM")}>
              <option value="NAO">Não</option>
              <option value="SIM">Sim</option>
            </select>
          </Field>
        </div>
      </Card>

      {resultado && (
        <>
          <Card subtitle="Passo 3" title="Resultado" className="mb">
            <div className="stats">
              <StatCard label="Pedido" value={resultado.orderNumber || "-"} hint={resultado.client || "Cliente não identificado"} />
              <StatCard label="Pallets" value={resultado.packages.length} hint="gerados pela regra selecionada" />
              <StatCard label="Montagem" value={resultado.mountType.replaceAll("_", " ")} hint={resultado.destination || "Destino não informado"} />
              <StatCard label="Avisos" value={resultado.warnings?.length || 0} hint="itens para conferência" tone={resultado.warnings?.length ? "warning" : "neutral"} />
              {resultado.orderAudit && (
                <StatCard
                  label="Confiança da leitura"
                  value={`${resultado.orderAudit.confidence}%`}
                  hint={`${resultado.orderAudit.foundItems}/${resultado.orderAudit.expectedItems} itens lidos`}
                  tone={resultado.orderAudit.confidence >= 90 ? "success" : resultado.orderAudit.confidence >= 60 ? "warning" : "danger"}
                />
              )}
            </div>

            {!!resultado.warnings?.length && (
              <div className="warningBox" style={{ flexDirection: "column", marginBottom: "var(--sp-4)" }}>
                <b>Conferir antes de gerar</b>
                {resultado.warnings.map((w, i) => <span key={i}>{w}</span>)}
              </div>
            )}

            <DataTable head={["Pallet", "Tipo", "Jogos", "Linhas", "m³", "Regra"]}>
              {resultado.packages.map((pkg) => (
                <tr key={pkg.number}>
                  <td><b>{pkg.number}</b></td>
                  <td>{pkg.packageType || "-"}</td>
                  <td>{pkg.games || "-"}</td>
                  <td>{pkg.rows.length}</td>
                  <td className="num">{Number(pkg.totalVolume || 0).toFixed(3)}</td>
                  <td>{pkg.ruleApplied || "-"}</td>
                </tr>
              ))}
            </DataTable>
          </Card>

          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button disabled={!!busy} onClick={() => baixar("ETIQUETAS")}>
              <PackageCheck /> {busy === "ETIQUETAS" ? "Gerando…" : "Gerar etiquetas"}
            </button>
            <button className="primary" disabled={!!busy} onClick={() => baixar("ROMANEIO")}>
              <FileSpreadsheet /> {busy === "ROMANEIO" ? "Gerando…" : "Gerar romaneio"}
            </button>
          </div>
        </>
      )}
    </>
  );
}

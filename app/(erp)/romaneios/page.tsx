"use client";

import {
  Boxes,
  FileSpreadsheet,
  PackageCheck,
  RefreshCw,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/ui";
import type {
  MountType,
  ProcessingResult,
} from "@/lib/romaneio/types";
import type { Produto } from "@/types/pcp";

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

    fetch("/api/programacoes/ativa", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Falha ao carregar Filtro 51.");
        if (!active) return;
        const products = (data.programacao?.produtos || []) as Produto[];
        setProdutosFiltro(products);
        const filtroAtual = String(data.programacao?.filtro || "");
        if (filtroAtual) setFiltro((current) => current || filtroAtual);
      })
      .catch(() => {
        if (active) setProdutosFiltro([]);
      })
      .finally(() => {
        if (active) setCarregandoFiltro(false);
      });

    return () => {
      active = false;
    };
  }, []);

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

  async function processarFiltro() {
    if (!pedidoFiltro || !usinagem) return;

    setBusy("PROCESSAR_FILTRO");

    try {
      const fd = new FormData();
      fd.append("pedido", pedidoFiltro);
      fd.append("usinagem", usinagem);
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
        throw new Error(data.error || "Falha ao finalizar romaneio pelo Filtro 51.");
      }

      setResultado(data);
    } catch (e: any) {
      alert(e?.message || "Falha ao finalizar romaneio.");
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
      <div className="pageTitle">
        <div>
          <span>EXPEDIÇÃO</span>
          <h1>Gerador de Romaneios</h1>
          <p>
            Gerador nativo do PCP com as regras de montagem do romaneio.
            Sem outro sistema e sem outra tela de login.
          </p>
        </div>
      </div>

      <Panel
        title="Romaneios preparados pelo Filtro 51"
        subtitle="Os pedidos já vêm da programação. Selecione um pedido e envie somente a usinagem para finalizar o romaneio."
      >
        {carregandoFiltro ? (
          <div className="warningBox">
            <b>CARREGANDO PROGRAMAÇÃO</b>
            <span>Lendo os pedidos da programação ativa.</span>
          </div>
        ) : pedidosFiltro.length ? (
          <>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>PEDIDO</th>
                    <th>ITENS</th>
                    <th>PEÇAS</th>
                    <th>TIPO</th>
                    <th>STATUS</th>
                    <th>AÇÃO</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidosFiltro.map((entry) => (
                    <tr key={entry.numero}>
                      <td><b>{entry.numero}</b></td>
                      <td>{entry.itens}</td>
                      <td>{entry.pecas}</td>
                      <td>{entry.tipoPedido}</td>
                      <td><b>AGUARDANDO USINAGEM</b></td>
                      <td>
                        <button
                          type="button"
                          className={pedidoFiltro === entry.numero ? "primary" : "secondary"}
                          onClick={() => {
                            setPedidoFiltro(entry.numero);
                            if (entry.tipoPedido === "REVENDA") {
                              setMountType("REVENDA");
                            } else if (entry.tipoPedido === "ENGENHARIA") {
                              setMountType(entry.montagem as MountType);
                            }
                            setResultado(null);
                          }}
                        >
                          {pedidoFiltro === entry.numero ? "SELECIONADO" : "SELECIONAR"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pedidoFiltro && (
              <div className="reviewBar">
                <label className={`drop ${usinagem ? "ready" : ""}`} style={{ maxWidth: 520 }}>
                  <UploadCloud />
                  <span>
                    <b>{usinagem?.name || `Usinagem do pedido ${pedidoFiltro}`}</b>
                    <small>{usinagem ? "Planilha pronta para cruzamento" : ".xlsx / .xls"}</small>
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => setUsinagem(e.target.files?.[0] || null)}
                  />
                </label>

                <button
                  className="primary"
                  disabled={!usinagem || !!busy}
                  onClick={processarFiltro}
                >
                  <RefreshCw className={busy === "PROCESSAR_FILTRO" ? "spin" : ""} />
                  {busy === "PROCESSAR_FILTRO"
                    ? "FINALIZANDO..."
                    : "FINALIZAR ROMANEIO COM USINAGEM"}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="warningBox">
            <b>SEM PROGRAMAÇÃO ATIVA</b>
            <span>Importe e libere o Filtro 51 para os pedidos aparecerem automaticamente aqui.</span>
          </div>
        )}
      </Panel>

      <Panel
        title="Modo manual"
        subtitle="Mantido como alternativa: pedido em PDF + usinagem."
      >
        <small>Use somente quando o pedido ainda não estiver disponível no Filtro 51.</small>
      </Panel>

      <Panel
        title="1. Arquivos do pedido"
        subtitle="Envie o pedido em PDF e, quando houver, a planilha de usinagem."
      >
        <div className="doubleDrop">
          <label className={`drop ${pedido ? "ready" : ""}`}>
            <UploadCloud />
            <span>
              <b>{pedido?.name || "Pedido em PDF"}</b>
              <small>{pedido ? "Arquivo selecionado" : ".pdf"}</small>
            </span>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setPedido(e.target.files?.[0] || null)}
            />
          </label>

          <label className={`drop ${usinagem ? "ready" : ""}`}>
            <UploadCloud />
            <span>
              <b>{usinagem?.name || "Usinagem (opcional)"}</b>
              <small>{usinagem ? "Arquivo selecionado" : ".xlsx / .xls"}</small>
            </span>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setUsinagem(e.target.files?.[0] || null)}
            />
          </label>
        </div>
      </Panel>

      <Panel
        title="2. Tipo de montagem"
        subtitle="Revenda usa a regra Revenda. Engenharia usa HS, Timadel ou Estância."
      >
        <div className="sourceTabs">
          {MONTAGENS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={mountType === item.value ? "active" : ""}
              onClick={() => setMountType(item.value)}
            >
              <Boxes />
              <span>
                <b>{item.label}</b>
                <small>{item.detalhe}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="formRow">
          <label>
            Filtro
            <input value={filtro} onChange={(e) => setFiltro(e.target.value)} />
          </label>

          <label>
            Página
            <input value={pagina} onChange={(e) => setPagina(e.target.value)} />
          </label>

          <label>
            Conferente
            <input
              value={conferente}
              onChange={(e) => setConferente(e.target.value)}
            />
          </label>

          <label>
            Separado por
            <input
              value={separador}
              onChange={(e) => setSeparador(e.target.value)}
            />
          </label>

          <label>
            Motorista
            <input
              value={motorista}
              onChange={(e) => setMotorista(e.target.value)}
            />
          </label>

          <label>
            Transportadora
            <input
              value={transportadora}
              onChange={(e) => setTransportadora(e.target.value)}
            />
          </label>

          <label>
            Placa
            <input value={placa} onChange={(e) => setPlaca(e.target.value)} />
          </label>

          <label>
            Nota fiscal
            <input
              value={notaFiscal}
              onChange={(e) => setNotaFiscal(e.target.value)}
            />
          </label>

          <label>
            Complemento de obra
            <select
              value={complemento ? "SIM" : "NAO"}
              onChange={(e) => setComplemento(e.target.value === "SIM")}
            >
              <option value="NAO">NÃO</option>
              <option value="SIM">SIM</option>
            </select>
          </label>
        </div>

        <div className="reviewBar">
          <button
            className="primary"
            disabled={!pedido || !!busy}
            onClick={processar}
          >
            <RefreshCw className={busy === "PROCESSAR" ? "spin" : ""} />
            {busy === "PROCESSAR" ? "PROCESSANDO..." : "PROCESSAR ROMANEIO"}
          </button>
        </div>
      </Panel>

      {resultado && (
        <>
          <Panel
            title="3. Resultado"
            subtitle="Confira a montagem antes de gerar os arquivos."
          >
            <section className="pcpMetricStrip">
              <article>
                <span>PEDIDO</span>
                <b>{resultado.orderNumber || "-"}</b>
                <small>{resultado.client || "Cliente não identificado"}</small>
              </article>
              <article>
                <span>PALLETS</span>
                <b>{resultado.packages.length}</b>
                <small>gerados pela regra selecionada</small>
              </article>
              <article>
                <span>MONTAGEM</span>
                <b>{resultado.mountType.replaceAll("_", " ")}</b>
                <small>{resultado.destination || "Destino não informado"}</small>
              </article>
              <article>
                <span>AVISOS</span>
                <b>{resultado.warnings?.length || 0}</b>
                <small>itens para conferência</small>
              </article>
            </section>

            {!!resultado.warnings?.length && (
              <div className="warningBox">
                <b>CONFERIR ANTES DE GERAR</b>
                {resultado.warnings.map((w, i) => (
                  <span key={i}>{w}</span>
                ))}
              </div>
            )}

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>PALLET</th>
                    <th>TIPO</th>
                    <th>JOGOS</th>
                    <th>LINHAS</th>
                    <th>m³</th>
                    <th>REGRA</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.packages.map((pkg) => (
                    <tr key={pkg.number}>
                      <td><b>{pkg.number}</b></td>
                      <td>{pkg.packageType || "-"}</td>
                      <td>{pkg.games || "-"}</td>
                      <td>{pkg.rows.length}</td>
                      <td>{Number(pkg.totalVolume || 0).toFixed(3)}</td>
                      <td>{pkg.ruleApplied || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="reviewBar">
            <button
              className="primary"
              disabled={!!busy}
              onClick={() => baixar("ROMANEIO")}
            >
              <FileSpreadsheet />
              {busy === "ROMANEIO" ? "GERANDO..." : "GERAR ROMANEIO"}
            </button>

            <button
              className="secondary"
              disabled={!!busy}
              onClick={() => baixar("ETIQUETAS")}
            >
              <PackageCheck />
              {busy === "ETIQUETAS" ? "GERANDO..." : "GERAR ETIQUETAS"}
            </button>
          </div>
        </>
      )}
    </>
  );
}

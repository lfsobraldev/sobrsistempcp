"use client";

import { Boxes, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useOps } from "@/components/operational-provider";
import { Panel } from "@/components/ui";
import type { TipoPedido } from "@/types/pcp";

type Montagem =
  | "MONTADO_HS"
  | "MONTADO_TIMADEL"
  | "REVENDA"
  | "MONTADO_ESTANCIA";

const MONTAGENS: { value: Montagem; label: string; detalhe: string }[] = [
  {
    value: "MONTADO_HS",
    label: "Montado HS",
    detalhe: "Até 32 portas por pallet • regra normal do romaneio",
  },
  {
    value: "MONTADO_TIMADEL",
    label: "Montado Timadel",
    detalhe: "Até 34 portas por pallet",
  },
  {
    value: "REVENDA",
    label: "Revenda",
    detalhe: "Até 34 portas • 28 em papelão/41 mm • alizar até 100 jogos",
  },
  {
    value: "MONTADO_ESTANCIA",
    label: "Montado Estância",
    detalhe: "Até 34 portas • alizar até 250 jogos",
  },
];

export default function RomaneiosPage() {
  const { pg, refresh, toast } = useOps();
  const [montagem, setMontagem] = useState<Montagem>("MONTADO_HS");
  const [pedidoSelecionado, setPedidoSelecionado] = useState("");
  const [filtro, setFiltro] = useState(pg?.filtro || "");
  const [pagina, setPagina] = useState("");
  const [conferente, setConferente] = useState("");
  const [separador, setSeparador] = useState("");
  const [complemento, setComplemento] = useState(false);
  const [busy, setBusy] = useState("");

  const pedidos = useMemo(() => {
    const map = new Map<string, TipoPedido>();

    for (const p of pg?.produtos || []) {
      const atual = (p.tipoPedido || "NORMAL") as TipoPedido;
      const existente = map.get(p.pedido);

      if (!existente || existente === "NORMAL") {
        map.set(p.pedido, atual);
      }
    }

    return [...map.entries()]
      .map(([pedido, tipo]) => ({ pedido, tipo }))
      .sort((a, b) =>
        a.pedido.localeCompare(b.pedido, "pt-BR", { numeric: true })
      );
  }, [pg]);

  async function alterarTipo(pedido: string, tipo: TipoPedido) {
    setBusy(pedido);

    try {
      const r = await fetch("/api/pedidos/tipo", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pedido, tipo }),
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao alterar o pedido.");

      toast("success", `Pedido ${pedido} classificado como ${tipo}.`);
      await refresh();
    } catch (e: any) {
      toast("error", e?.message || "Falha ao alterar o pedido.");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <div className="pageTitle">
        <div>
          <span>EXPEDIÇÃO</span>
          <h1>Romaneios</h1>
          <p>
            Opções do romaneio dentro do PCP, sem abrir outro sistema e sem
            tela de login separada.
          </p>
        </div>

        <button className="secondary" onClick={refresh}>
          <RefreshCw /> Atualizar
        </button>
      </div>

      <Panel
        title="Tipo de montagem"
        subtitle="Mesmas regras operacionais usadas no gerador de romaneios"
      >
        <div className="sourceTabs">
          {MONTAGENS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={montagem === item.value ? "active" : ""}
              onClick={() => setMontagem(item.value)}
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
            Pedido
            <select
              value={pedidoSelecionado}
              onChange={(e) => setPedidoSelecionado(e.target.value)}
            >
              <option value="">Selecione o pedido</option>
              {pedidos.map((p) => (
                <option key={p.pedido} value={p.pedido}>
                  {p.pedido} {p.tipo !== "NORMAL" ? `• ${p.tipo}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            Filtro
            <input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Filtro"
            />
          </label>

          <label>
            Página
            <input
              value={pagina}
              onChange={(e) => setPagina(e.target.value)}
              placeholder="Página"
            />
          </label>

          <label>
            Conferente
            <input
              value={conferente}
              onChange={(e) => setConferente(e.target.value)}
              placeholder="Conferente"
            />
          </label>

          <label>
            Separado por
            <input
              value={separador}
              onChange={(e) => setSeparador(e.target.value)}
              placeholder="Separador"
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
      </Panel>

      <Panel
        title="Pedidos especiais de embalagem"
        subtitle="Somente os pedidos marcados mudam de fluxo; os demais permanecem normais"
      >
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>PEDIDO</th>
                <th>TIPO ATUAL</th>
                <th>DEFINIR</th>
                <th>EMBALAGEM</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.pedido}>
                  <td><b>{p.pedido}</b></td>
                  <td>
                    <span className="tag">{p.tipo}</span>
                  </td>
                  <td>
                    <select
                      value={p.tipo}
                      disabled={busy === p.pedido}
                      onChange={(e) =>
                        alterarTipo(p.pedido, e.target.value as TipoPedido)
                      }
                    >
                      <option value="NORMAL">NORMAL</option>
                      <option value="REVENDA">REVENDA</option>
                      <option value="ENGENHARIA">ENGENHARIA</option>
                    </select>
                  </td>
                  <td>
                    {p.tipo === "REVENDA"
                      ? "Embalagem Revenda"
                      : p.tipo === "ENGENHARIA"
                      ? "Embalagem Engenharia"
                      : "Regras normais por componente"}
                  </td>
                </tr>
              ))}

              {!pedidos.length && (
                <tr>
                  <td colSpan={4}>
                    <div className="empty">
                      <b>Nenhum pedido na programação ativa.</b>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Regra Revenda"
        subtitle="Referência operacional trazida da lógica atual do romaneio"
      >
        <ul className="checks">
          <li>Máximo de 34 portas por pallet.</li>
          <li>Portas em papelão: máximo de 28 por pallet.</li>
          <li>Portas com espessura 41 mm: máximo de 28 por pallet.</li>
          <li>Limite de 1,800 m³ por pallet.</li>
          <li>Alizares: até 100 jogos por pallet.</li>
          <li>Batentes: até 100 jogos por pallet.</li>
        </ul>
      </Panel>
    </>
  );
}

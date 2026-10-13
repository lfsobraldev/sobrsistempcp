"use client";

import { FileSpreadsheet, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useOps } from "@/components/operational-provider";
import { LABELS } from "@/lib/metrics";
import { exportarExcel } from "@/lib/export";
import { fmt } from "@/lib/format";
import { Badge, DataTable, Empty, PageHeader, StatCard, type Tone } from "@/components/ui";

type Nivel = "NORMAL" | "ALTA" | "URGENTE";

type PedidoResumo = {
  pedido: string;
  prioridade: Nivel;
  saldo: number;
  ofs: Set<string>;
  processos: Set<string>;
  alertas: Set<string>;
};

const PESO: Record<Nivel, number> = {
  NORMAL: 0,
  ALTA: 1,
  URGENTE: 2,
};

function nivel(v: string): Nivel {
  return v === "URGENTE" || v === "ALTA" ? v : "NORMAL";
}

export default function Prioridades() {
  const { pg, refresh, toast } = useOps();
  const [busy, setBusy] = useState("");

  const pedidos = useMemo<PedidoResumo[]>(() => {
    const map = new Map<string, PedidoResumo>();

    for (const p of pg?.produtos || []) {
      const atual = p.operacoes.find((o) => o.status !== "CONCLUIDA");
      if (!atual) continue;

      const saldo = Math.max(
        0,
        Number(atual.quantidadePlanejada || 0) -
          Number(atual.quantidadeProduzida || 0)
      );

      const prioridade = nivel(String(p.prioridade || "NORMAL"));
      const existente = map.get(p.pedido);

      if (existente) {
        existente.saldo += saldo;
        if (p.of) existente.ofs.add(p.of);
        existente.processos.add(atual.processo);

        if (PESO[prioridade] > PESO[existente.prioridade]) {
          existente.prioridade = prioridade;
        }

        if (atual.status === "BLOQUEADA") {
          existente.alertas.add("BLOQUEADA");
        }

        if (atual.status === "DIVERGENCIA") {
          existente.alertas.add("DIVERGÊNCIA");
        }
      } else {
        const alertas = new Set<string>();

        if (atual.status === "BLOQUEADA") alertas.add("BLOQUEADA");
        if (atual.status === "DIVERGENCIA") alertas.add("DIVERGÊNCIA");

        map.set(p.pedido, {
          pedido: p.pedido,
          prioridade,
          saldo,
          ofs: new Set<string>(p.of ? [p.of] : []),
          processos: new Set<string>([atual.processo]),
          alertas,
        });
      }
    }

    return [...map.values()].sort(
      (a, b) =>
        PESO[b.prioridade] - PESO[a.prioridade] ||
        b.alertas.size - a.alertas.size ||
        a.pedido.localeCompare(b.pedido, "pt-BR", { numeric: true })
    );
  }, [pg]);

  async function alterar(pedido: string, prioridade: Nivel) {
    setBusy(pedido);

    try {
      const r = await fetch("/api/prioridades", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pedido, prioridade }),
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao alterar prioridade.");

      toast("success", `Pedido ${pedido}: ${prioridade}.`);
      await refresh();
    } catch (e: any) {
      toast("error", e?.message || "Falha ao alterar prioridade.");
    } finally {
      setBusy("");
    }
  }

  function exportar() {
    const linhas = pedidos
      .filter((x) => x.prioridade !== "NORMAL" || x.alertas.size > 0)
      .map((x) => ({
        Prioridade: x.prioridade,
        Pedido: x.pedido,
        OFs: [...x.ofs].join(", "),
        "Processo atual": [...x.processos]
          .map((proc) => LABELS[proc] || proc)
          .join(" / "),
        Saldo: x.saldo,
        Observação: [...x.alertas].join(" / "),
      }));

    exportarExcel(
      [{ nome: "PRIORIDADES", linhas }],
      "Prioridades_do_Turno"
    );
  }

  const importantes = pedidos.filter(
    (x) => x.prioridade !== "NORMAL" || x.alertas.size > 0
  );

  const tomPrioridade = (n: Nivel): Tone => (n === "URGENTE" ? "danger" : n === "ALTA" ? "warning" : "neutral");

  return (
    <>
      <PageHeader
        eyebrow="Controle do turno"
        title="Prioridades"
        description="Defina somente exceções que realmente precisam passar na frente."
        actions={
          <>
            <button onClick={refresh}><RefreshCw /> Atualizar</button>
            <button className="primary" onClick={exportar}><FileSpreadsheet /> Exportar prioridades</button>
          </>
        }
      />

      <div className="stats">
        <StatCard label="Pedidos ativos" value={pedidos.length} hint="na programação" />
        <StatCard label="Com prioridade" value={importantes.length} hint="para orientar os líderes" tone={importantes.length ? "warning" : "neutral"} />
        <StatCard label="Urgentes" value={pedidos.filter((x) => x.prioridade === "URGENTE").length} hint="passam na frente" tone="danger" />
      </div>

      <DataTable head={["Prioridade", "Pedido", "OFs", "Processo atual", "Saldo", "Alerta", "Definir"]} empty={!pedidos.length && <Empty title="Nenhum pedido ativo." />}>
        {pedidos.map((x) => (
          <tr key={x.pedido}>
            <td><Badge tone={tomPrioridade(x.prioridade)}>{x.prioridade}</Badge></td>
            <td><b>{x.pedido}</b></td>
            <td>{[...x.ofs].join(", ") || "-"}</td>
            <td>{[...x.processos].map((proc) => LABELS[proc] || proc).join(" / ")}</td>
            <td className="num"><b>{fmt(x.saldo)}</b></td>
            <td>{x.alertas.size ? [...x.alertas].map((a) => <Badge key={a} tone="danger">{a}</Badge>) : "-"}</td>
            <td style={{ width: 150 }}>
              <select
                value={x.prioridade}
                disabled={busy === x.pedido}
                onChange={(e) => alterar(x.pedido, e.target.value as Nivel)}
                aria-label={`Prioridade do pedido ${x.pedido}`}
              >
                <option value="NORMAL">Normal</option>
                <option value="ALTA">Alta</option>
                <option value="URGENTE">Urgente</option>
              </select>
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}

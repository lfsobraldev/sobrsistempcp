"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge, DataTable, Empty, PageHeader, Panel } from "@/components/ui";

type Row = Record<string, any>;
const NOME: Record<string, string> = { PREPARACAO: "Preparação", COLAGEM_PORTAS: "Colagem de portas", ESQUADRIAS_BORDAS: "Esquadrias e bordas", RECOBRIDORA_PERFIL: "Recobridora de perfil", USINAGEM: "Usinagem", USINAGEM_2: "Usinagem 2", CNC: "CNC", LUSTRACAO: "Lustração", PLASTIFICADORA: "Plastificadora", PLASTIFICADORA_PORTAS: "Plastificadora de portas", EMBALAGEM: "Embalagem", EXPEDICAO: "Expedição" };
const dia = (v: unknown) => (v ? new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—");

function Ficha() {
  const pedido = (useSearchParams().get("pedido") || "").trim();
  const [d, setD] = useState<Row | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    if (!pedido) return;
    fetch(`/api/mapa-fabrica?pedido=${encodeURIComponent(pedido)}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Falha ao carregar o pedido."); setD(j); })
      .catch((e) => setErro(e.message));
  }, [pedido]);

  if (!pedido) return <Empty title="Nenhum pedido informado" sub="Leia o QR de um romaneio ou de uma etiqueta de pallet." />;
  const cab: Row = d?.pedido ?? { pedido };
  const etapas: Row[] = d?.etapas ?? [];
  return (
    <>
      <PageHeader eyebrow="Ficha do pedido" title={`Pedido ${pedido}`} description={[cab.cliente, cab.previsao_saida && `Saída prevista ${dia(cab.previsao_saida)}`].filter(Boolean).join(" · ") || undefined}
        actions={<Link className="primary" href={`/romaneios?pedido=${encodeURIComponent(pedido)}`}>Abrir romaneio</Link>} />
      {erro && <p className="error">{erro}</p>}
      <Panel title="Andamento por setor" subtitle="Datas de início e fim lançadas pelos líderes">
        {etapas.length ? (
          <DataTable head={["Setor", "Início", "Fim", "Situação"]}>
            {etapas.map((e) => (
              <tr key={e.etapa}><td>{NOME[e.etapa] || e.etapa}</td><td>{dia(e.data_inicio)}</td><td>{dia(e.data_conclusao)}</td>
                <td><Badge tone={e.data_conclusao ? "success" : e.data_inicio ? "info" : "neutral"}>{e.data_conclusao ? "Concluído" : e.data_inicio ? "Em andamento" : "Aguardando"}</Badge></td></tr>
            ))}
          </DataTable>
        ) : <Empty title="Sem apontamentos" sub="Nenhum setor registrou este pedido ainda." />}
      </Panel>
    </>
  );
}

export default function FichaPage() { return <Suspense fallback={null}><Ficha /></Suspense>; }

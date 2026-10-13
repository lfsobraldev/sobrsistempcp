"use client";

import { useEffect, useState } from "react";
import { Badge, DataTable, Card, PageHeader, Empty, type Tone } from "@/components/ui";

type Programacao = { id: string; filtro: string; data: string; turno: string; origem: string; import_pedidos: number; import_ofs: number; import_pecas: number; status: string };
type Evento = { id: string; criado_em: string; usuario: string; tipo: string; of?: string; processo?: string; descricao: string };

const tone = (s: string): Tone => (s === "ATIVA" ? "success" : s === "ARQUIVADA" ? "neutral" : "info");

export default function Historico() {
  const [h, setH] = useState<Programacao[]>([]);
  const [a, setA] = useState<Evento[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/programacoes/historico", { cache: "no-store" }),
      fetch("/api/auditoria", { cache: "no-store" }),
    ]).then(async ([x, y]) => {
      if (x.ok) setH((await x.json()).itens || []);
      if (y.ok) setA((await y.json()).itens || []);
    });
  }, []);

  return (
    <>
      <PageHeader eyebrow="Análise" title="Histórico e Auditoria" description="Programações anteriores e trilha de ações operacionais." />

      <Card subtitle="Últimas 50 liberações" title="Programações" className="mb">
        {h.length ? (
          <DataTable head={["Filtro", "Data", "Turno", "Origem", "Pedidos", "OFs", "Peças", "Status"]}>
            {h.map((x) => (
              <tr key={x.id}>
                <td><b>{x.filtro}</b></td>
                <td>{x.data}</td>
                <td>{x.turno}</td>
                <td>{x.origem}</td>
                <td className="num">{x.import_pedidos}</td>
                <td className="num">{x.import_ofs}</td>
                <td className="num">{Number(x.import_pecas || 0).toLocaleString("pt-BR")}</td>
                <td><Badge tone={tone(x.status)}>{x.status}</Badge></td>
              </tr>
            ))}
          </DataTable>
        ) : <Empty title="Nenhuma programação liberada" />}
      </Card>

      <Card subtitle="Usuário, ação, OF, processo, antes e depois" title="Auditoria operacional">
        {a.length ? (
          <DataTable head={["Horário", "Usuário", "Ação", "OF", "Processo", "Descrição"]}>
            {a.map((x) => (
              <tr key={x.id}>
                <td>{new Date(x.criado_em).toLocaleString("pt-BR")}</td>
                <td>{x.usuario}</td>
                <td><Badge tone="info">{x.tipo}</Badge></td>
                <td>{x.of || "-"}</td>
                <td>{x.processo || "-"}</td>
                <td>{x.descricao}</td>
              </tr>
            ))}
          </DataTable>
        ) : <Empty title="Sem eventos registrados" />}
      </Card>
    </>
  );
}

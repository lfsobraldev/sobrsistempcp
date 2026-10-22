"use client";

import { useEffect, useState } from "react";
import { Activity, AlertOctagon, CheckCheck, Timer } from "lucide-react";
import { useOpsVisao as useOps } from "@/components/operational-provider";
import { LABELS, resumoMaquinas } from "@/lib/metrics";
import { Card, DataTable, PageHeader, StatCard } from "@/components/ui";
import { calcOee } from "@/lib/domain/industrial";
import { fmt, fmtPct } from "@/lib/format";

export default function Performance() {
  const { pg,recorteQuery } = useOps();
  const p = pg?.produtos || [];
  const m = resumoMaquinas(p);
  const ops = p.flatMap((x) => x.operacoes);
  const [caps, setCaps] = useState<any[]>([]);
  const [losses, setLosses] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([fetch("/api/capacidades").then((r) => r.json()), fetch("/api/perdas?recorte=1&"+recorteQuery).then((r) => r.json())]).then(([a, b]) => {
      setCaps(a.capacidades || []);
      setLosses(b.itens || []);
    });
  }, [recorteQuery]);

  const ref = ops.reduce((s, o) => s + o.quantidadeRefugo, 0);
  const prod = ops.reduce((s, o) => s + o.quantidadeProduzida, 0);
  const parado = losses.reduce((s, x) => s + Number(x.minutos || 0), 0) / 60;

  return (
    <>
      <PageHeader eyebrow="Análise industrial" title="Performance" description="Disponibilidade, performance e qualidade apenas quando existem dados suficientes." />
      <div className="stats">
        <StatCard icon={<Activity />} label="Produção registrada" value={fmt(prod)} />
        <StatCard icon={<AlertOctagon />} label="Refugo" value={fmt(ref)} tone={ref ? "warning" : "neutral"} />
        <StatCard icon={<CheckCheck />} label="Operações concluídas" value={ops.filter((o) => o.status === "CONCLUIDA").length} />
        <StatCard icon={<Timer />} label="Tempo parado hoje" value={`${parado.toFixed(1)} h`} />
      </div>
      <Card subtitle="OEE só aparece quando capacidade, tempo e qualidade permitem cálculo" title="Performance por processo">
        <DataTable head={["Processo", "Programado", "Produzido", "Refugo", "Disp.", "Perf.", "Qualidade", "OEE"]}>
          {m.map((x: any) => {
            const c = caps.find((c: any) => c.processo === x.processo);
            const stop = losses.filter((l: any) => l.processo === x.processo).reduce((s: number, l: any) => s + Number(l.minutos || 0), 0);
            const o = calcOee({
              plannedMinutes: c ? Number(c.minutos_disponiveis || 0) : undefined,
              stopMinutes: stop,
              idealRate: c ? Number(c.pecas_hora || 0) : undefined,
              produced: x.produzidas,
              good: Math.max(0, x.produzidas - x.refugo),
            });
            return (
              <tr key={x.processo}>
                <td><b>{LABELS[x.processo] || x.processo}</b></td>
                <td className="num">{fmt(x.pecasPlanejadas)}</td>
                <td className="num">{fmt(x.produzidas)}</td>
                <td className="num">{fmt(x.refugo)}</td>
                {o ? (
                  <>
                    <td>{fmtPct(o.availability * 100)}</td>
                    <td>{fmtPct(o.performance * 100)}</td>
                    <td>{fmtPct(o.quality * 100)}</td>
                    <td><b>{fmtPct(o.oee * 100)}</b></td>
                  </>
                ) : <td colSpan={4}><span className="na">Dados insuficientes</span></td>}
              </tr>
            );
          })}
        </DataTable>
      </Card>
    </>
  );
}

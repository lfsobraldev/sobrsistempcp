import { NextResponse } from "next/server";
import { session } from "@/lib/auth";
import { sql } from "@/lib/db";
import { analisarRiscos, capacidadeProcessos, localHoje, planejarFabrica } from "@/lib/ia/intelligence";

export const runtime = "nodejs";

export async function GET() {
  try {
    const s = await session();
    if (!s) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const db = sql();
    const [pg] = await db`
      select id,filtro,data_programacao,turno
      from pcp_programacoes
      where status='ATIVA'
      order by criado_em desc
      limit 1
    `;

    if (!pg) {
      return NextResponse.json({ programacao: null, riscos: [], capacidade: [], acoes: [] }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const [riscos, capacidade, plano] = await Promise.all([
      analisarRiscos(db, pg),
      capacidadeProcessos(db, pg),
      planejarFabrica(db, pg),
    ]);

    const criticos = riscos.filter((r: any) => r.risco === "CRITICO" || r.risco === "ALTO");
    const gargalos = capacidade.filter((c: any) => c.gargalo === true);
    const acoes: Array<{ nivel: "critico" | "atencao" | "info"; titulo: string; detalhe: string }> = [];

    for (const r of criticos.slice(0, 4) as any[]) {
      acoes.push({
        nivel: r.risco === "CRITICO" ? "critico" : "atencao",
        titulo: `Pedido ${r.pedido} · risco ${r.risco.toLowerCase()}`,
        detalhe: (r.sinais || []).slice(0, 3).join(" · ") || "Revisar programação e prazo.",
      });
    }

    for (const g of gargalos.slice(0, 3) as any[]) {
      acoes.push({
        nivel: "atencao",
        titulo: `Gargalo em ${g.processo}`,
        detalhe: `Saldo ${Math.round(g.saldo)} vs capacidade ${Math.round(g.capacidadeTurno || 0)} · carga ${g.cargaPct ?? "-"}%`,
      });
    }

    if (!acoes.length) {
      acoes.push({
        nivel: "info",
        titulo: "Operação sem alerta crítico detectado",
        detalhe: "Continue acompanhando prazos, capacidade, qualidade e exceções do turno.",
      });
    }

    return NextResponse.json({
      data: localHoje(),
      programacao: pg,
      riscos: riscos.slice(0, 8),
      capacidade,
      acoes,
      processosPlanejados: Array.isArray((plano as any).sequencias) ? (plano as any).sequencias.length : 0,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao gerar inteligência operacional." }, { status: 500 });
  }
}

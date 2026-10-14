import { sql } from "@/lib/db";
import { projetarFilaPorCapacidade } from "@/lib/ia/capacity-projection";

export function localHoje() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Maceio",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function diasAte(data: unknown) {
  if (!data) return null;
  const target = new Date(`${String(data).slice(0, 10)}T12:00:00-03:00`).getTime();
  const today = new Date(`${localHoje()}T12:00:00-03:00`).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.ceil((target - today) / 86_400_000);
}

export async function capacidadeProcessos(
  db: ReturnType<typeof sql>,
  pg: any
) {
  const cargas = await db`
    select
      o.processo,
      coalesce(sum(greatest(o.quantidade_planejada-o.quantidade_produzida,0)),0)::float saldo
    from pcp_operacoes o
    join pcp_produtos p on p.id=o.produto_id
    where p.programacao_id=${pg.id}
      and o.status<>'CONCLUIDA'
    group by o.processo
    order by o.processo
  `;

  const caps = await db`
    select
      processo,
      coalesce(sum(
        coalesce(pecas_hora,0) *
        (coalesce(minutos_disponiveis,0)/60.0) *
        (coalesce(eficiencia,100)/100.0)
      ),0)::float capacidade_turno,
      count(*)::int configuracoes
    from pcp_capacidades_maquina
    where turno=${pg.turno}
    group by processo
  `;

  const map = new Map(caps.map((x: any) => [String(x.processo), x]));

  return cargas.map((x: any) => {
    const cap: any = map.get(String(x.processo));
    const capacidade = Number(cap?.capacidade_turno || 0);
    const saldo = Number(x.saldo || 0);
    return {
      processo: x.processo,
      saldo,
      capacidadeTurno: capacidade || null,
      cargaPct: capacidade > 0 ? Math.round((saldo / capacidade) * 1000) / 10 : null,
      gargalo: capacidade > 0 ? saldo > capacidade : null,
      capacidadeCadastrada: Boolean(cap?.configuracoes),
    };
  });
}

export async function analisarRiscos(
  db: ReturnType<typeof sql>,
  pg: any,
  pedidoFiltro = ""
) {
  const pedidos = await db`
    select
      p.pedido,
      case max(case p.prioridade when 'URGENTE' then 3 when 'ALTA' then 2 else 1 end)
        when 3 then 'URGENTE'
        when 2 then 'ALTA'
        else 'NORMAL'
      end prioridade,
      count(distinct nullif(p.of,''))::int ofs,
      count(*)::int itens,
      coalesce(sum(p.quantidade),0)::float pecas,
      coalesce(avg(p.percentual_produto),0)::float progresso,
      pc.cliente,
      pc.data_entrega,
      pc.status_entrega,
      (
        select count(*)::int
        from pcp_operacoes o2
        join pcp_produtos p2 on p2.id=o2.produto_id
        where p2.programacao_id=${pg.id}
          and p2.pedido=p.pedido
          and o2.status in ('BLOQUEADA','DIVERGENCIA')
      ) operacoes_criticas,
      (
        select count(*)::int
        from pcp_excecoes_peca e
        where e.programacao_id=${pg.id}
          and e.pedido=p.pedido
          and upper(e.status) not in ('RESOLVIDA','RESOLVIDO','FECHADA','CONCLUIDA')
      ) excecoes,
      (
        select count(*)::int
        from pcp_andon a
        join pcp_operacoes ao on ao.id=a.operacao_id
        join pcp_produtos ap on ap.id=ao.produto_id
        where ap.programacao_id=${pg.id}
          and ap.pedido=p.pedido
          and upper(a.status)<>'RESOLVIDO'
      ) andons,
      (
        select count(*)::int
        from pcp_pallets pal
        where pal.pedido=p.pedido
          and (
            upper(coalesce(pal.status,'')) like '%BLOQ%'
            or upper(coalesce(pal.qualidade_status,'')) in ('REPROVADO','BLOQUEADO','NAO_CONFORME')
            or upper(coalesce(pal.msac_status,'')) in ('REPROVADO','BLOQUEADO','NAO_CONFORME')
          )
      ) qualidade_bloqueada
    from pcp_produtos p
    left join pcp_pedido_controle pc
      on pc.programacao_id=p.programacao_id and pc.pedido=p.pedido
    where p.programacao_id=${pg.id}
    group by p.pedido,pc.cliente,pc.data_entrega,pc.status_entrega
  `;

  const capacidade = await capacidadeProcessos(db, pg);
  const gargalos = new Set(
    capacidade
      .filter((x: any) => x.gargalo === true)
      .map((x: any) => String(x.processo))
  );

  const pedidoProcessos = await db`
    select
      p.pedido,
      o.processo,
      coalesce(sum(greatest(o.quantidade_planejada-o.quantidade_produzida,0)),0)::float saldo
    from pcp_produtos p
    join pcp_operacoes o on o.produto_id=p.id
    where p.programacao_id=${pg.id}
      and o.status<>'CONCLUIDA'
    group by p.pedido,o.processo
  `;

  const gargaloPorPedido = new Map<string, string[]>();
  for (const r of pedidoProcessos as any[]) {
    if (!gargalos.has(String(r.processo)) || Number(r.saldo || 0) <= 0) continue;
    const k = String(r.pedido);
    gargaloPorPedido.set(k, [...(gargaloPorPedido.get(k) || []), String(r.processo)]);
  }

  const riscos = (pedidos as any[]).map((p) => {
    const sinais: string[] = [];
    let score = 0;
    const dias = diasAte(p.data_entrega);
    const progresso = Number(p.progresso || 0);

    if (dias !== null && dias < 0) {
      score += 45;
      sinais.push(`prazo vencido há ${Math.abs(dias)} dia(s)`);
    } else if (dias !== null && dias <= 1) {
      score += 35;
      sinais.push(`entrega em ${dias} dia(s)`);
    } else if (dias !== null && dias <= 3) {
      score += 20;
      sinais.push(`entrega em ${dias} dia(s)`);
    }

    if (p.prioridade === "URGENTE") {
      score += 12;
      sinais.push("prioridade URGENTE");
    } else if (p.prioridade === "ALTA") {
      score += 6;
      sinais.push("prioridade ALTA");
    }

    if (progresso < 40) {
      score += 18;
      sinais.push(`progresso baixo (${Math.round(progresso)}%)`);
    } else if (progresso < 75) {
      score += 8;
      sinais.push(`progresso parcial (${Math.round(progresso)}%)`);
    }

    const criticas = Number(p.operacoes_criticas || 0);
    if (criticas > 0) {
      score += Math.min(24, criticas * 8);
      sinais.push(`${criticas} operação(ões) bloqueada(s)/divergente(s)`);
    }

    const excecoes = Number(p.excecoes || 0);
    if (excecoes > 0) {
      score += Math.min(20, excecoes * 6);
      sinais.push(`${excecoes} falta(s)/retrabalho(s) em aberto`);
    }

    const andons = Number(p.andons || 0);
    if (andons > 0) {
      score += Math.min(16, andons * 5);
      sinais.push(`${andons} Andon(s) aberto(s)`);
    }

    const qualidade = Number(p.qualidade_bloqueada || 0);
    if (qualidade > 0) {
      score += Math.min(20, qualidade * 8);
      sinais.push(`${qualidade} pallet(s) bloqueado(s)/não conforme(s)`);
    }

    const gp = [...new Set(gargaloPorPedido.get(String(p.pedido)) || [])];
    if (gp.length) {
      score += Math.min(20, gp.length * 7);
      sinais.push(`passa por gargalo(s): ${gp.join(", ")}`);
    }

    if (dias === null) sinais.push("sem data de entrega cadastrada");

    const risco =
      score >= 65 ? "CRITICO" :
      score >= 40 ? "ALTO" :
      score >= 20 ? "MEDIO" : "BAIXO";

    return {
      pedido: p.pedido,
      cliente: p.cliente || "",
      prioridade: p.prioridade,
      dataEntrega: p.data_entrega,
      diasParaEntrega: dias,
      progresso: Math.round(progresso * 10) / 10,
      ofs: Number(p.ofs || 0),
      pecas: Number(p.pecas || 0),
      risco,
      score: Math.min(100, score),
      sinais,
    };
  });

  return riscos
    .filter((r) => !pedidoFiltro || String(r.pedido) === pedidoFiltro)
    .sort(
      (a, b) =>
        b.score - a.score ||
        String(a.pedido).localeCompare(String(b.pedido), "pt-BR", { numeric: true })
    );
}

export async function planejarFabrica(
  db: ReturnType<typeof sql>,
  pg: any
) {
  const rows = await db`
    select
      o.processo,
      p.pedido,
      case max(case p.prioridade when 'URGENTE' then 3 when 'ALTA' then 2 else 1 end)
        when 3 then 'URGENTE'
        when 2 then 'ALTA'
        else 'NORMAL'
      end prioridade,
      pc.data_entrega,
      coalesce(sum(greatest(o.quantidade_planejada-o.quantidade_produzida,0)),0)::float saldo,
      min(o.ordem_fila)::int ordem_fila,
      bool_or(coalesce(o.fixada,false)) fixada,
      count(distinct nullif(p.of,''))::int ofs
    from pcp_produtos p
    join pcp_operacoes o on o.produto_id=p.id
    left join pcp_pedido_controle pc
      on pc.programacao_id=p.programacao_id and pc.pedido=p.pedido
    where p.programacao_id=${pg.id}
      and o.status<>'CONCLUIDA'
      and greatest(o.quantidade_planejada-o.quantidade_produzida,0)>0
    group by o.processo,p.pedido,pc.data_entrega
  `;

  const capacidade = await capacidadeProcessos(db, pg);
  const porProcesso = new Map<string, any[]>();

  for (const r of rows as any[]) {
    const dias = diasAte(r.data_entrega);
    let score = 0;
    if (r.prioridade === "URGENTE") score += 50;
    else if (r.prioridade === "ALTA") score += 25;

    if (dias !== null && dias < 0) score += 60;
    else if (dias !== null && dias <= 1) score += 45;
    else if (dias !== null && dias <= 3) score += 25;
    else if (dias === null) score -= 5;

    const item = {
      pedido: r.pedido,
      prioridade: r.prioridade,
      dataEntrega: r.data_entrega,
      diasParaEntrega: dias,
      saldo: Number(r.saldo || 0),
      ofs: Number(r.ofs || 0),
      ordemFilaAtual: Number(r.ordem_fila || 0),
      fixada: Boolean(r.fixada),
      scorePrioridade: score,
    };

    const key = String(r.processo);
    porProcesso.set(key, [...(porProcesso.get(key) || []), item]);
  }

  const sequencias = [...porProcesso.entries()].map(([processo, itens]) => {
    const cap = capacidade.find((c: any) => c.processo === processo) || null;
    const filaOrdenada = itens.sort((a, b) => {
      if (a.fixada !== b.fixada) return a.fixada ? -1 : 1;
      if (a.fixada && b.fixada) return a.ordemFilaAtual - b.ordemFilaAtual;
      return (
        b.scorePrioridade - a.scorePrioridade ||
        (a.diasParaEntrega ?? 9999) - (b.diasParaEntrega ?? 9999) ||
        a.ordemFilaAtual - b.ordemFilaAtual
      );
    });
    const projetadas = projetarFilaPorCapacidade(filaOrdenada, cap?.capacidadeTurno);
    return {
      processo,
      capacidade: cap,
      totalPedidosNaFila: filaOrdenada.length,
      turnosMinimosEstimados: cap?.capacidadeTurno
        ? Math.ceil(filaOrdenada.reduce((sum, item) => sum + item.saldo, 0) / cap.capacidadeTurno)
        : null,
      filaSugerida: projetadas.slice(0, 25),
      ressalva: "Projeção por capacidade agregada do processo. Sem setups, paradas, transferências, dependências ou disponibilidade específica de cada máquina.",
    };
  });

  return {
    programacao: pg,
    observacao:
      "Sugestão operacional. Filas fixadas são preservadas; a sequência final deve respeitar medidas, famílias e restrições reais da máquina.",
    sequencias,
  };
}

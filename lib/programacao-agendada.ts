import type { sql } from "@/lib/db";

type Db = ReturnType<typeof sql>;

/** Diferença de meses (data - hoje, fuso de Brasília): 0 = mês atual, 1 = próximo mês, <0 passado. */
export async function mesesAdiante(db: Db, data: string): Promise<number> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error("Data da programação inválida.");
  const [r] = await db`
    select ((extract(year from ${data}::date)*12+extract(month from ${data}::date))
          - (extract(year from (now() at time zone 'America/Sao_Paulo'))*12+extract(month from (now() at time zone 'America/Sao_Paulo'))))::int as d`;
  return Number(r?.d ?? 0);
}

/**
 * Programações AGENDADAS (filtro do próximo mês) só passam a valer quando o mês chega:
 * a mais recente do mês vigente vira ATIVA e a anterior é encerrada; as demais viram ENCERRADA.
 * Idempotente e atômico em uma instrução.
 */
export async function promoverAgendadas(db: Db) {
  await db`
    with vencidas as (
      select id, row_number() over (order by data_programacao desc, criado_em desc) rn
        from pcp_programacoes
       where status = 'AGENDADA'
         and date_trunc('month', data_programacao) <= date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)
    ), encerra as (
      update pcp_programacoes set status = 'ENCERRADA', encerrado_em = now()
       where status = 'ATIVA' and exists (select 1 from vencidas)
      returning id
    ), antigas as (
      update pcp_programacoes set status = 'ENCERRADA', encerrado_em = now()
       where id in (select id from vencidas where rn > 1)
      returning id
    )
    update pcp_programacoes set status = 'ATIVA'
     where id in (select id from vencidas where rn = 1)`;
}

import type { sql } from "@/lib/db";

/** Diferença de meses (data - hoje, fuso de Brasília): 0 = mês atual, 1 = próximo mês, <0 passado. */
export async function mesesAdiante(db: ReturnType<typeof sql>, data: string): Promise<number> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error("Data da programação inválida.");
  const [r] = await db`
    select ((extract(year from ${data}::date)*12+extract(month from ${data}::date))
          - (extract(year from (now() at time zone 'America/Sao_Paulo'))*12+extract(month from (now() at time zone 'America/Sao_Paulo'))))::int as d`;
  return Number(r?.d ?? 0);
}

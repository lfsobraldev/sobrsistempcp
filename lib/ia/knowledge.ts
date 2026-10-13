import { sql } from "@/lib/db";

export async function conhecimentoTreinavelPrompt(limit = 80) {
  try {
    const db = sql();
    const rows = await db`
      select titulo,area,situacao,regra,exemplo,observacao,prioridade
      from pcp_ia_conhecimento
      where ativo=true
      order by prioridade desc, atualizado_em desc
      limit ${limit}
    `;
    if (!rows.length) return "";

    const body = rows.map((r:any, i:number) => {
      const parts = [
        `${i + 1}. [${String(r.area || "GERAL")}] ${String(r.titulo || "")}`,
        r.situacao ? `Situação: ${r.situacao}` : "",
        `Regra: ${r.regra}`,
        r.exemplo ? `Exemplo: ${r.exemplo}` : "",
        r.observacao ? `Observação: ${r.observacao}` : "",
      ].filter(Boolean);
      return parts.join("\n");
    }).join("\n\n");

    return `
CONHECIMENTO ENSINADO PELA EQUIPE
As regras abaixo foram cadastradas pela equipe da fábrica e complementam o manual técnico.
- Trate-as como regras operacionais internas.
- Se uma regra ensinada conflitar com dados reais do banco, não altere o dado: explique o conflito.
- Se duas regras ensinadas conflitarem entre si, priorize a de maior prioridade e sinalize a divergência.

${body}
`;
  } catch {
    return "";
  }
}

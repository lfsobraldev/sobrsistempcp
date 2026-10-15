import { sql } from "@/lib/db";

export async function conhecimentoTreinavelPrompt(pergunta = "", limit = 12) {
  try {
    const db = sql();
    const texto=String(pergunta||"").trim().slice(0,600);
    const rows = texto
      ? await db`
        select titulo,area,situacao,regra,exemplo,observacao,prioridade,atualizado_em
        from pcp_ia_conhecimento
        where ativo=true and
          to_tsvector('portuguese', concat_ws(' ',titulo,area,situacao,regra,exemplo,observacao))
          @@ websearch_to_tsquery('portuguese',${texto})
        order by
          ts_rank(
            to_tsvector('portuguese',concat_ws(' ',titulo,area,situacao,regra,exemplo,observacao)),
            websearch_to_tsquery('portuguese',${texto})
          ) desc,
          prioridade desc, atualizado_em desc
        limit ${Math.max(1,Math.min(30,limit))}
      `
      : await db`
        select titulo,area,situacao,regra,exemplo,observacao,prioridade,atualizado_em
        from pcp_ia_conhecimento
        where ativo=true order by prioridade desc,atualizado_em desc
        limit ${Math.max(1,Math.min(12,limit))}
      `;
    // Perguntas naturais costumam combinar termos não cadastrados; se não houver
    // correspondência textual exata, recupere um conjunto de regras de alta prioridade
    // como contexto GERAL, sem apresentá-las como resposta ao pedido atual.
    if (!rows.length && texto) {
      const fallback=await db`
        select titulo,area,situacao,regra,exemplo,observacao,prioridade,atualizado_em
        from pcp_ia_conhecimento
        where ativo=true and area in ('GERAL','PCP','PRODUCAO')
        order by prioridade desc,atualizado_em desc limit ${Math.max(1,Math.min(6,limit))}
      `;
      rows.push(...fallback);
    }
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
CONHECIMENTO DA EQUIPE RECUPERADO PARA A CONSULTA
As referências abaixo foram cadastradas pela equipe. Elas são informações de apoio, não dados de produção atuais.
- Trate-as como regras operacionais internas.
- Se uma regra ensinada conflitar com dados reais do banco, não altere o dado: explique o conflito.
- Se duas regras ensinadas conflitarem entre si, priorize a de maior prioridade e sinalize a divergência.

${body}
`;
  } catch {
    return "";
  }
}

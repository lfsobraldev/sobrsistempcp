import { sql } from "@/lib/db";

export async function conhecimentoTreinavelPrompt(pergunta = "", limit = 12) {
  try {
    const db = sql();
    const bruto=String(pergunta||"").trim().slice(0,600);
    // Perguntas naturais raramente contêm TODOS os termos de uma regra: usar OR entre palavras relevantes.
    const STOP=new Set(["quais","qual","como","para","pelo","pela","sobre","quantas","quantos","essa","esse","isso","tem","uma","uns","das","dos","que","com","por","nos","nas","mais","menos","fazer","favor"]);
    const palavras=[...new Set(bruto.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(w=>w.length>=3&&!STOP.has(w)))].slice(0,10);
    const texto=palavras.join(" | ");
    const rows = texto
      ? await db`
        select titulo,area,situacao,regra,exemplo,observacao,prioridade,atualizado_em
        from pcp_ia_conhecimento
        where ativo=true and
          to_tsvector('portuguese', concat_ws(' ',titulo,area,situacao,regra,exemplo,observacao))
          @@ to_tsquery('portuguese',${texto})
        order by
          ts_rank(
            to_tsvector('portuguese',concat_ws(' ',titulo,area,situacao,regra,exemplo,observacao)),
            to_tsquery('portuguese',${texto})
          ) * (case when titulo like 'Correção validada%' then 1.5 else 1 end) desc,
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
        `${i + 1}. [${String(r.area || "GERAL")}]${/^Correção validada/.test(String(r.titulo||"")) ? "[CORREÇÃO CONFIRMADA]" : ""} ${String(r.titulo || "")}`,
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
- Trate-as como regras operacionais internas. Itens [CORREÇÃO CONFIRMADA] foram validados por revisor e prevalecem sobre sua interpretação anterior (nunca sobre dados reais do banco).
- Se uma regra ensinada conflitar com dados reais do banco, não altere o dado: explique o conflito.
- Se duas regras ensinadas conflitarem entre si, priorize a de maior prioridade e sinalize a divergência.

${body}
`;
  } catch {
    return "";
  }
}

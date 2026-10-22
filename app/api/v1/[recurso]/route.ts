import { NextResponse } from "next/server";
import { identitySql } from "@/lib/db";
import { verificarBanco } from "@/lib/unidades/access";
import { multiAtiva, unidadeSchema } from "@/lib/unidades/core";
import { criarLimitador, hashToken, unidadeDoToken } from "@/lib/integracoes";

export const runtime = "nodejs";
/** API pública somente leitura, autenticada por token (Authorization: Bearer sbl.<unidade>.<segredo>). */
const H = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const limitado = criarLimitador(60);
const dia = (v: string | null, pad: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : pad);
const ESCOPO: Record<string, string> = { indicadores: "indicadores", alertas: "alertas" };

export async function GET(req: Request, ctx: { params: Promise<{ recurso: string }> }) {
  const nao = (s: number, m: string) => NextResponse.json({ error: m }, { status: s, headers: H });
  try {
    const { recurso } = await ctx.params;
    const escopo = ESCOPO[recurso];
    if (!escopo) return nao(404, "Recurso inexistente.");
    const token = /^Bearer (\S{20,160})$/.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
    const un = unidadeDoToken(token);
    if (!un) return nao(401, "Token inválido.");
    if (limitado(hashToken(token))) return nao(429, "Limite de requisições excedido. Aguarde um minuto.");
    let db;
    if (multiAtiva()) { const p = unidadeSchema.safeParse(un); if (!p.success) return nao(401, "Token inválido."); db = await verificarBanco(p.data); } else db = identitySql();
    const [t] = await db`update sys_tokens_api set ultimo_uso=now() where token_hash=${hashToken(token)} and ativo and (expira_em is null or expira_em>now()) returning escopos`;
    if (!t) return nao(401, "Token inválido, expirado ou revogado.");
    if (!t.escopos.includes(escopo) && !t.escopos.includes("leitura")) return nao(403, "Escopo insuficiente.");
    if (recurso === "alertas") {
      const alertas = await db`select tipo,chave,severidade,mensagem,criado_em from sys_alertas where resolvido_em is null order by criado_em desc limit 500`;
      return NextResponse.json({ alertas }, { headers: H });
    }
    const u = new URL(req.url);
    const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    const fim = dia(u.searchParams.get("fim"), hoje), ini = dia(u.searchParams.get("ini"), `${fim.slice(0, 8)}01`);
    const [r] = await db`select ind_painel(${ini}::date,${fim}::date) p`;
    return NextResponse.json({ indicadores: r.p }, { headers: H });
  } catch {
    return nao(503, "Não foi possível atender a requisição.");
  }
}

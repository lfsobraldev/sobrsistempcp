import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { identitySql } from "@/lib/db";
import { verificarBanco } from "@/lib/unidades/access";
import { multiAtiva, unidadeSchema } from "@/lib/unidades/core";

export const runtime = "nodejs";
const H = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const hits = new Map<string, number[]>();
function limitado(ip: string) {
  const agora = Date.now();
  const l = (hits.get(ip) ?? []).filter((t) => agora - t < 60_000);
  l.push(agora); hits.set(ip, l);
  if (hits.size > 5000) hits.clear();
  return l.length > 30;
}
async function banco(token: string) {
  const [u] = token.split(".");
  if (!multiAtiva()) return identitySql();
  const p = unidadeSchema.safeParse(u);
  if (!p.success) return null;
  return verificarBanco(p.data);
}
async function achar(token: string) {
  if (!token || token.length > 160) return null;
  const db = await banco(token);
  if (!db) return null;
  const hash = createHash("sha256").update(token).digest("hex");
  const [t] = await db`select id,remessa_id from exp_portal_tokens where token_hash=${hash} and revogado_em is null and expira_em>now()`;
  return t ? { db, t } : null;
}
export async function POST(req: Request) {
  try {
    const ip = (req.headers.get("x-forwarded-for") || "x").split(",")[0].trim();
    if (limitado(ip)) return NextResponse.json({ error: "Muitas tentativas. Aguarde um minuto." }, { status: 429, headers: H });
    const b = await req.json();
    const token = typeof b.token === "string" ? b.token : "";
    const r = await achar(token);
    if (!r) return NextResponse.json({ error: "Link indisponível ou expirado." }, { status: 404, headers: H });
    const { db, t } = r;
    if (b.ocorrencia) {
      const desc = String(b.ocorrencia).trim().slice(0, 500);
      if (desc.length < 3) return NextResponse.json({ error: "Descreva a ocorrência." }, { status: 400, headers: H });
      await db`insert into exp_ocorrencias(remessa_id,tipo,descricao,origem,criado_por) values(${t.remessa_id},'OUTRO',${desc},'CLIENTE','portal-cliente')`;
    }
    const [rem] = await db`select r.numero,r.status,r.previsao_entrega::text previsao,r.fechada_em::text fechada_em,r.entregue_em::text entregue_em,r.nota_numero,tr.nome transportadora,p.numero pedido,p.pedido_cliente
      from exp_remessas r join crm_pedidos_venda p on p.id=r.pedido_venda_id left join exp_transportadoras tr on tr.id=r.transportadora_id where r.id=${t.remessa_id}`;
    const itens = await db`select pr.codigo,pr.descricao,i.quantidade::float8 quantidade from exp_remessa_itens i join est_produtos pr on pr.id=i.produto_id where i.remessa_id=${t.remessa_id} order by i.linha`;
    const eventos = await db`select tipo,descricao,origem,criado_em::text criado_em from exp_ocorrencias where remessa_id=${t.remessa_id} order by criado_em desc limit 30`;
    await db`update exp_portal_tokens set usado_em=now() where id=${t.id}`;
    return NextResponse.json({ remessa: rem, itens, eventos }, { headers: H });
  } catch {
    return NextResponse.json({ error: "Não foi possível consultar a entrega." }, { status: 503, headers: H });
  }
}

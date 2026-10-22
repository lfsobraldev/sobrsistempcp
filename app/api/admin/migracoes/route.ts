import {administradorCentral} from "@/lib/unidades/users";
import { NextResponse } from "next/server";
import { z } from "zod";
import { applyPendingMigrations, canApplyAdminMigrations, getMigrationCatalog, revertLastMigration } from "@/lib/migration-service";

const applyBody = z.object({
  actor: z.string().min(3).max(160).optional(),
  confirm: z.string().min(3).max(80).optional(),
  mode: z.enum(["apply", "revert"]).default("apply"),
});

export async function GET() {
  try { await administradorCentral(); } catch { return NextResponse.json({error:"Sem permissão."},{status:403}); }
  const enabled = await canApplyAdminMigrations();
  const payload = await getMigrationCatalog().catch(() => null);
  if (!payload) return NextResponse.json({error:"Módulo aguardando migração ou conferência do registro. Estado de aplicação desconhecido."},{status:503});
  return NextResponse.json({ enabled, ...payload }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  let sessao; try { sessao=await administradorCentral(); } catch { return NextResponse.json({error:"Sem permissão."},{status:403}); }
  const enabled = await canApplyAdminMigrations();
  if (!enabled) {
    return NextResponse.json({ error: "Aplicação automática indisponível. Utilize docs/BANCO_IMPLANTACAO.md com o administrador." }, { status: 403 });
  }

  const body = applyBody.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const actor = sessao.usuario;
  const confirm = body.data.confirm || "";
  if (confirm.trim().toLowerCase() !== "produção" && confirm.trim().toLowerCase() !== "homologacao") {
    return NextResponse.json({ error: "Confirmação inválida. Digite a palavra do ambiente para prosseguir." }, { status: 400 });
  }

  if (body.data.mode === "revert") {
    const result = await revertLastMigration(actor);
    return NextResponse.json({ ok: result.ok, result }, { status: 200 });
  }

  const result = await applyPendingMigrations(actor);
  return NextResponse.json({ ok: result.ok, result }, { status: 200 });
}

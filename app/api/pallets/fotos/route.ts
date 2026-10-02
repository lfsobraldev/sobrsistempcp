import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles } from "@/lib/auth";

function clean(v: unknown, max = 300) { return String(v ?? "").trim().slice(0, max); }

export async function POST(req: Request) {
  try {
    const s = await requireRoles(["PCP", "GERENTE", "ENCARREGADO", "LIDER"]);
    const b = await req.json();
    const palletId = clean(b.palletId, 80);
    const dataUrl = String(b.dataUrl || "");
    const area = clean(b.area, 20).toUpperCase();
    if (!palletId) return NextResponse.json({ error: "Pallet não informado." }, { status: 400 });
    if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(dataUrl)) return NextResponse.json({ error: "Formato de imagem inválido." }, { status: 400 });
    if (dataUrl.length > 3_000_000) return NextResponse.json({ error: "Foto muito grande. Limite aproximado de 2 MB após compressão." }, { status: 413 });
    const db = sql();
    const [p] = await db`select id,pallet from pcp_pallets where id=${palletId}`;
    if (!p) return NextResponse.json({ error: "Pallet não encontrado." }, { status: 404 });
    const [foto] = await db`
      insert into pcp_pallet_fotos(pallet_id,data_url,legenda,area,usuario)
      values(${palletId},${dataUrl},${clean(b.legenda,300)},${area || 'QUALIDADE'},${s.usuario}) returning id
    `;
    await db`
      insert into pcp_pallet_eventos(pallet_id,usuario,tipo,descricao,depois)
      values(${palletId},${s.usuario},'FOTO_ADICIONADA',${`Foto adicionada ao pallet ${p.pallet}`},${JSON.stringify({fotoId:foto.id,area})}::jsonb)
    `;
    return NextResponse.json({ ok: true, id: foto.id }, { status: 201 });
  } catch (e: any) {
    const status = e?.message === "SEM_PERMISSAO" ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Sem permissão." : e?.message || "Falha ao salvar foto." }, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const s = await requireRoles(["PCP", "GERENTE", "ENCARREGADO"]);
    const url = new URL(req.url);
    const id = clean(url.searchParams.get("id"), 80);
    const db = sql();
    const [old] = await db`select * from pcp_pallet_fotos where id=${id}`;
    if (!old) return NextResponse.json({ error: "Foto não encontrada." }, { status: 404 });
    await db`delete from pcp_pallet_fotos where id=${id}`;
    await db`
      insert into pcp_pallet_eventos(pallet_id,usuario,tipo,descricao,antes)
      values(${old.pallet_id},${s.usuario},'FOTO_REMOVIDA','Foto removida',${JSON.stringify({id:old.id,area:old.area,legenda:old.legenda})}::jsonb)
    `;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e?.message === "SEM_PERMISSAO" ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Sem permissão." : e?.message || "Falha ao remover foto." }, { status });
  }
}

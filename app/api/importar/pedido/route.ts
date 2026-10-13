import { NextResponse } from "next/server";
import { parsePedidoUsinagem } from "@/lib/order-import";
import { requireRoles } from "@/lib/auth";
export const runtime="nodejs";
export const maxDuration=60;

export async function POST(req:Request){
  try{
    await requireRoles(["PCP"]);
    const fd=await req.formData();
    const pedido=fd.get("pedido"),usinagem=fd.get("usinagem");
    if(!(pedido instanceof File)||!(usinagem instanceof File))
      return NextResponse.json({error:"Envie Pedido PDF e Usinagem XLS/XLSX."},{status:400});
    return NextResponse.json(await parsePedidoUsinagem(pedido,usinagem),{headers:{"Cache-Control":"no-store"}});
  }catch(e:any){
    const status=e?.message==="SEM_PERMISSAO"?403:500;
    return NextResponse.json({error:status===403?"Sem permissão.":e?.message||"Falha ao ler Pedido + Usinagem."},{status});
  }
}

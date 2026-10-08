import { NextResponse } from "next/server";
import pdf from "pdf-parse";
import { session } from "@/lib/auth";
import { buildProcessing } from "@/lib/romaneio/parser";
import { createLayoutPageRenderer } from "@/lib/romaneio/pdf-layout";
import { sanitizeConfig } from "@/lib/romaneio/settings";
import type { MountType, OrderOptions } from "@/lib/romaneio/types";

export const runtime = "nodejs";

const mounts = new Set<MountType>(["MONTADO_HS","MONTADO_TIMADEL","REVENDA","MONTADO_ESTANCIA"]);

export async function POST(req:Request){
  try{
    if(!(await session())) return NextResponse.json({error:"Não autenticado."},{status:401});

    const fd=await req.formData();
    const order=fd.get("pedido");
    const mach=fd.get("usinagem");

    if(!(order instanceof File)) return NextResponse.json({error:"Envie o PDF do pedido."},{status:400});
    if(!order.name.toLowerCase().endsWith(".pdf")) return NextResponse.json({error:"O pedido precisa estar em PDF."},{status:400});

    const mountRaw=String(fd.get("mountType")||"MONTADO_HS") as MountType;
    const mountType=mounts.has(mountRaw)?mountRaw:"MONTADO_HS";
    const mixedOrder=String(fd.get("mixedOrder")||"")==="true";

    let orderOptions:OrderOptions={mountType};
    const optionsRaw=String(fd.get("orderOptions")||"");
    if(optionsRaw){
      const x=JSON.parse(optionsRaw);
      orderOptions={
        mountType,
        complementoObra:Boolean(x.complementoObra),
        motorista:String(x.motorista||"").trim(),
        transportadora:String(x.transportadora||"").trim(),
        placa:String(x.placa||"").trim(),
        notaFiscal:String(x.notaFiscal||"").trim(),
        filtro:String(x.filtro||"").trim(),
        pagina:String(x.pagina||"").trim(),
        conferente:String(x.conferente||"").trim(),
        separador:String(x.separador||"").trim(),
        romaneioExtraText:String(x.romaneioExtraText||"").trim(),
        etiquetaExtraText:String(x.etiquetaExtraText||"").trim(),
      };
    }

    const orderBuf=Buffer.from(await order.arrayBuffer());
    const parsed=await pdf(orderBuf,{pagerender:createLayoutPageRenderer()} as any);
    const machBuf=mach instanceof File?Buffer.from(await mach.arrayBuffer()):undefined;
    const config=sanitizeConfig();

    const result=buildProcessing(parsed.text,machBuf,{mountType,config,mixedOrder,orderOptions});
    result.orderOptions=orderOptions;
    result.complementoObra=Boolean(orderOptions.complementoObra);
    result.sourceMode="PEDIDO";

    return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
  }catch(e:any){
    return NextResponse.json({error:e?.message||"Não foi possível processar o pedido."},{status:500});
  }
}
import { NextResponse } from "next/server";
import { session } from "@/lib/auth";
import { createRomaneioWorkbook } from "@/lib/romaneio/excel";
import { createLabelsWorkbook } from "@/lib/romaneio/labels";
import { validateProcessing } from "@/lib/romaneio/validation";
import type { ProcessingResult } from "@/lib/romaneio/types";

export const runtime="nodejs";

export async function POST(req:Request){
  try{
    if(!(await session())) return new NextResponse("Não autenticado.",{status:401});
    const body=await req.json();
    const action=String(body.action||"");
    const data=body.data as ProcessingResult;

    const errors=validateProcessing(data).filter(x=>x.severity==="ERROR");
    if(errors.length) return new NextResponse(errors.map(x=>x.message).join("\n"),{status:422});

    if(action==="ROMANEIO"){
      const buffer=await createRomaneioWorkbook(data);
      return new NextResponse(new Uint8Array(buffer),{headers:{
        "content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition":`attachment; filename="Romaneio-${data.orderNumber}.xlsx"`,
        "cache-control":"no-store"
      }});
    }

    if(action==="ETIQUETAS"){
      const buffer=await createLabelsWorkbook(data);
      return new NextResponse(new Uint8Array(buffer),{headers:{
        "content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition":`attachment; filename="Etiquetas-${data.orderNumber}.xlsx"`,
        "cache-control":"no-store"
      }});
    }

    return NextResponse.json({error:"Ação inválida."},{status:400});
  }catch(e:any){
    return NextResponse.json({error:e?.message||"Falha ao gerar arquivo."},{status:500});
  }
}
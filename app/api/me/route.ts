import { NextResponse } from "next/server";
import { multiAtiva } from "@/lib/unidades/core";
import { estadoUnidades } from "@/lib/unidades/access";
import { session } from "@/lib/auth";
export async function GET(){
  const s=await session();
  if(!s)return NextResponse.json({error:"Não autenticado."},{status:401});
  const unidades=await estadoUnidades().catch(()=>null);
  return NextResponse.json({...s,cicloIndustrial:process.env.ERP_CICLO_INDUSTRIAL==="enabled",multiunidade:multiAtiva(),unidadeAtiva:unidades?.selecionada??null},{headers:{"Cache-Control":"no-store"}});
}

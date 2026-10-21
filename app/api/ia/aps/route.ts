import { unidadeHandler } from "@/lib/unidades/handler";
import { NextResponse } from "next/server";
import { session } from "@/lib/auth";
import { consultarAPS } from "@/lib/ia/aps-service";

export const runtime="nodejs";
export const maxDuration=60;
async function unidadeGET(){
  try {
    if(!await session())return NextResponse.json({error:"Não autenticado."},{status:401});
    const resultado=await consultarAPS();
    if("erro" in resultado)return NextResponse.json({error:resultado.erro},{status:422});
    return NextResponse.json({
      ...resultado,
      totalAlocacoes:resultado.alocacoes.length,
      alocacoes:resultado.alocacoes.slice(0,300),
      totalPendentes:resultado.pendentes.length,
      pendentes:resultado.pendentes.slice(0,100),
      avisoExibicao:"A tela mostra até 300 alocações e 100 pendências; os totais por máquina abrangem as operações consultadas."
    },{headers:{"Cache-Control":"private, no-store"}});
  }catch(e:any){return NextResponse.json({error:e?.message||"Falha na simulação APS."},{status:500});}
}

export const GET = unidadeHandler(unidadeGET);

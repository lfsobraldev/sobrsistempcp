import { unidadeHandler } from "@/lib/unidades/handler";
import { NextResponse } from "next/server";
import { session } from "@/lib/auth";
import { runTool } from "@/lib/ia/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Centro de inteligência: leitura dos dados reais, sem executar mutações de PCP. */
async function unidadeGET() {
  try {
    const user = await session();
    if (!user) return NextResponse.json({error:"Não autenticado."},{status:401});
    const analise = await runTool("diagnostico_integrado",{},{
      user,attachments:[]
    });
    if (analise && typeof analise==="object" && "erro" in analise) {
      return NextResponse.json({error:String((analise as {erro:string}).erro)},{status:422});
    }
    return NextResponse.json({ok:true,analise},{headers:{"Cache-Control":"private, no-store"}});
  } catch(e:unknown) {
    return NextResponse.json({error:e instanceof Error?e.message:"Falha na inteligência operacional."},{status:500});
  }
}

export const GET = unidadeHandler(unidadeGET);

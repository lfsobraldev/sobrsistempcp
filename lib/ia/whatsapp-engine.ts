import {generateText,stepCountIs,tool} from "ai";
import {z} from "zod";
import type {Sessao} from "@/types/pcp";
import {SYSTEM_BASE,MODEL,assertGatewayConfigured} from "@/lib/ia/claude";
import {runTool,TOOL_META} from "@/lib/ia/tools";
import {conhecimentoTreinavelPrompt} from "@/lib/ia/knowledge";
import {whatsappAnswer} from "@/lib/ia/whatsapp";

export async function answerWhatsapp(question:string,user:Sessao):Promise<string> {
  assertGatewayConfigured();
  const ctx={user,attachments:[]};
  const knowledge=await conhecimentoTreinavelPrompt(question,8);
  const result=await generateText({
    model:MODEL,
    system:SYSTEM_BASE+"\nCANAL WHATSAPP: escreva de forma natural, objetiva e organizada. Entenda apelidos e perguntas informais. Consulte dados atuais antes de afirmar quantidades. Informe o filtro e se são peças programadas ou produzidas. Não suponha dados não disponíveis. Não realize nenhuma alteração no sistema.\n"+knowledge,
    prompt:question,
    stopWhen:stepCountIs(6),
    maxOutputTokens:1200,
    tools:{
      mapa_fontes_sistema:tool({description:TOOL_META.mapa_fontes_sistema,inputSchema:z.object({}),execute:()=>runTool("mapa_fontes_sistema",{},ctx)}),
      consultar_panorama_pecas:tool({description:TOOL_META.consultar_panorama_pecas,inputSchema:z.object({busca:z.string().max(120).optional(),pedido:z.string().max(80).optional(),setor:z.string().max(80).optional(),material:z.enum(["TODOS","PINUS","STD","ULTRA","NAO_CLASSIFICADO"]).optional()}),execute:v=>runTool("consultar_panorama_pecas",v,ctx)}),
      consultar_catalogo:tool({description:TOOL_META.consultar_catalogo,inputSchema:z.object({codigo:z.string().min(1).max(80)}),execute:v=>runTool("consultar_catalogo",v,ctx)}),
      consultar_conhecimento:tool({description:TOOL_META.consultar_conhecimento,inputSchema:z.object({assunto:z.string().min(2).max(120)}),execute:v=>runTool("consultar_conhecimento",v,ctx)}),
      buscar_pedido:tool({description:TOOL_META.buscar_pedido,inputSchema:z.object({pedido:z.string().min(1).max(80)}),execute:v=>runTool("buscar_pedido",v,ctx)}),
    }
  });
  return whatsappAnswer(result.text);
}

import { multiAtiva } from "@/lib/unidades/core";
import { unidadesPermitidas,verificarBanco } from "@/lib/unidades/access";
import { contextoUnidade } from "@/lib/unidades/context";
import {NextResponse,after} from "next/server";
import {identitySql} from "@/lib/db";
import {verifyMetaSignature,whatsappUser,whatsappAuthorizationDiagnostic,textMessages,whatsappAnswer} from "@/lib/ia/whatsapp";
import {answerWhatsapp} from "@/lib/ia/whatsapp-engine";
export const runtime="nodejs";
export const maxDuration=60;

export async function GET(req:Request) {
  const params=new URL(req.url).searchParams;
  const mode=params.get("hub.mode");
  const provided=params.get("hub.verify_token");
  const challenge=params.get("hub.challenge");
  const expected=process.env.WHATSAPP_VERIFY_TOKEN;
  // Never log the secret, provided token, challenge or full request URL.
  const reason=!expected?"VERIFY_TOKEN_NOT_CONFIGURED":
    mode!=="subscribe"?"INVALID_MODE":
    provided===null?"VERIFY_TOKEN_MISSING":
    provided!==expected?"VERIFY_TOKEN_MISMATCH":
    challenge===null?"CHALLENGE_MISSING":"OK";
  console.info("[WhatsApp webhook verification]",{
    result:reason,
    hasChallenge:challenge!==null,
    hasVerifyToken:provided!==null,
    environment:process.env.VERCEL_ENV||"unknown"
  });
  if(reason==="OK")return new Response(challenge!,{status:200,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});
  return new Response("Forbidden",{status:403,headers:{"Cache-Control":"no-store"}});
}
async function processarWhatsapp(messages:ReturnType<typeof textMessages>) {
  const db=identitySql();
  await db`create table if not exists pcp_ia_whatsapp_recebidas(id varchar(180) primary key,telefone varchar(20) not null,criado_em timestamptz default now())`;
  for(const message of messages) {
    try {
      const user=whatsappUser(message.from,process.env.WHATSAPP_ALLOWED_USERS_JSON);
      if(!user) {
        console.warn("[WhatsApp] sender not authorized",{
          messageId:message.id,...whatsappAuthorizationDiagnostic(message.from,process.env.WHATSAPP_ALLOWED_USERS_JSON)
        });
        continue;
      }
      const inserted=await db`insert into pcp_ia_whatsapp_recebidas(id,telefone) values(${message.id},${message.from}) on conflict(id) do nothing returning id`;
      if(!inserted.length){console.info("[WhatsApp] duplicate message",{messageId:message.id});continue;}
      let answer:string;
      try{
        if(multiAtiva()){
          const unidade=user.unidadeAtiva;
          if(!unidade||!(await unidadesPermitidas(user)).includes(unidade))throw new Error('Unidade do remetente não autorizada');
          await verificarBanco(unidade);
          answer=await contextoUnidade.run({unidade,usuario:user.usuario},()=>answerWhatsapp(message.text,user));
        }else answer=await answerWhatsapp(message.text,user);
      }
      catch(error) {
        console.error("[WhatsApp] AI processing failed",{
          messageId:message.id,error:error instanceof Error?error.message:"unknown"
        });
        answer="A Sobral IA está temporariamente indisponível. Tente novamente em instantes.";
      }
      const version=process.env.WHATSAPP_GRAPH_VERSION||"v23.0";
      const response=await fetch(`https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,{
        method:"POST",headers:{Authorization:`Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,"Content-Type":"application/json"},
        body:JSON.stringify({messaging_product:"whatsapp",to:message.from,type:"text",text:{preview_url:false,body:whatsappAnswer(answer)}}),
        signal:AbortSignal.timeout(12000)
      });
      if(!response.ok) {
        const errorBody=(await response.text()).slice(0,1200);
        await db`delete from pcp_ia_whatsapp_recebidas where id=${message.id}`;
        console.error("[WhatsApp] delivery failed",{
          messageId:message.id,status:response.status,body:errorBody.replace(/"access_token"\\s*:\\s*"[^"]+"/gi,'"access_token":"[redacted]"')
        });
        continue;
      }
      console.info("[WhatsApp] reply accepted by Meta",{messageId:message.id});
    } catch(error) {
      console.error("[WhatsApp] processing failed",{messageId:message.id,error:error instanceof Error?error.message:"unknown"});
      // Permitir reprocessamento caso não tenha ocorrido entrega.
      try {await db`delete from pcp_ia_whatsapp_recebidas where id=${message.id}`;}catch{}
    }
  }
}

export async function POST(req:Request) {
  const raw=await req.text();
  if(!verifyMetaSignature(raw,req.headers.get("x-hub-signature-256"),process.env.WHATSAPP_APP_SECRET||"")) {
    console.warn("[WhatsApp] signature invalid",{hasSecret:!!process.env.WHATSAPP_APP_SECRET,hasSignature:!!req.headers.get("x-hub-signature-256")});
    return NextResponse.json({error:"Invalid signature"},{status:403});
  }
  if(!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    console.error("[WhatsApp] missing delivery configuration",{
      hasAccessToken:!!process.env.WHATSAPP_ACCESS_TOKEN,
      hasPhoneNumberId:!!process.env.WHATSAPP_PHONE_NUMBER_ID
    });
    return NextResponse.json({error:"WhatsApp not configured"},{status:503});
  }
  let body:any;
  try{body=JSON.parse(raw);}catch{return NextResponse.json({error:"Invalid JSON"},{status:400});}
  const messages=textMessages(body);
  console.info("[WhatsApp] received event",{
    messageCount:messages.length,
    eventTypes:(body?.entry||[]).flatMap((e:any)=>(e?.changes||[]).map((c:any)=>c.field)).slice(0,10)
  });
  if(messages.length) after(async()=>{try{await processarWhatsapp(messages);}catch(e){console.error("[WhatsApp] background handler failed",e instanceof Error?e.message:"unknown");}});
  // O webhook da Meta deve receber HTTP 200 imediatamente; processamento segue após a resposta.
  return NextResponse.json({ok:true});
}

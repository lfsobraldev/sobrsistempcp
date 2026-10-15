import {NextResponse} from "next/server";
import {sql} from "@/lib/db";
import {verifyMetaSignature,whatsappUser,textMessages,whatsappAnswer} from "@/lib/ia/whatsapp";
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
export async function POST(req:Request) {
  const raw=await req.text();
  if(!verifyMetaSignature(raw,req.headers.get("x-hub-signature-256"),process.env.WHATSAPP_APP_SECRET||""))
    return NextResponse.json({error:"Invalid signature"},{status:403});
  if(!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID)
    return NextResponse.json({error:"WhatsApp not configured"},{status:503});
  let body:any;
  try{body=JSON.parse(raw);}catch{return NextResponse.json({error:"Invalid JSON"},{status:400});}
  const db=sql();
  await db`create table if not exists pcp_ia_whatsapp_recebidas(id varchar(180) primary key,telefone varchar(20) not null,criado_em timestamptz default now())`;
  for(const message of textMessages(body)) {
    const user=whatsappUser(message.from,process.env.WHATSAPP_ALLOWED_USERS_JSON);
    if(!user)continue;
    const inserted=await db`insert into pcp_ia_whatsapp_recebidas(id,telefone) values(${message.id},${message.from}) on conflict(id) do nothing returning id`;
    if(!inserted.length)continue;
    let answer:string;
    try{answer=await answerWhatsapp(message.text,user);}
    catch{answer="Não consegui consultar os dados agora. Tente novamente mais tarde.";}
    const version=process.env.WHATSAPP_GRAPH_VERSION||"v23.0";
    const response=await fetch(`https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,{
      method:"POST",headers:{Authorization:`Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,"Content-Type":"application/json"},
      body:JSON.stringify({messaging_product:"whatsapp",to:message.from,type:"text",text:{preview_url:false,body:whatsappAnswer(answer)}})
    });
    if(!response.ok) {
      await db`delete from pcp_ia_whatsapp_recebidas where id=${message.id}`;
      console.error("WhatsApp delivery failed",response.status);
      return NextResponse.json({error:"Delivery failed"},{status:502});
    }
  }
  return NextResponse.json({ok:true});
}

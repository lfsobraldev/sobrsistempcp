import crypto from "node:crypto";
import type { Sessao, Perfil } from "@/types/pcp";

const roles = new Set(["PCP","GERENTE","ENCARREGADO","LIDER"]);
export function verifyMetaSignature(payload:string,signature:string|null,secret:string):boolean {
  if(!secret || !signature || !/^sha256=[0-9a-f]{64}$/i.test(signature))return false;
  const expected=crypto.createHmac("sha256",secret).update(payload).digest();
  return crypto.timingSafeEqual(expected,Buffer.from(signature.slice(7),"hex"));
}
export function whatsappUser(phone:string,serialized:string|undefined):Sessao|null {
  if(!/^\d{10,15}$/.test(phone) || !serialized)return null;
  try {
    const users=JSON.parse(serialized);
    const found=Array.isArray(users)?users.find(u=>u?.phone===phone):null;
    if(!found || !roles.has(found.role) || typeof found.user!=="string" || !found.user.trim())return null;
    return {usuario:found.user.slice(0,120),perfil:found.role as Perfil,processos:Array.isArray(found.processes)?found.processes.filter((x:unknown)=>typeof x==="string").slice(0,40):[]};
  }catch{return null;}
}
export function textMessages(body:any):Array<{id:string;from:string;text:string}> {
  if(body?.object!=="whatsapp_business_account")return [];
  const messages:Array<{id:string;from:string;text:string}>=[];
  for(const entry of Array.isArray(body.entry)?body.entry:[])
    for(const change of Array.isArray(entry.changes)?entry.changes:[])
      for(const m of Array.isArray(change.value?.messages)?change.value.messages:[])
        if(m?.type==="text" && typeof m.text?.body==="string" && /^\d{10,15}$/.test(String(m.from||"")) && typeof m.id==="string")
          messages.push({id:m.id.slice(0,180),from:m.from,text:m.text.body.slice(0,2500)});
  return messages.slice(0,10);
}
export function whatsappAnswer(text:string):string {
  return String(text||"Não foi possível confirmar os dados solicitados.").replace(/\r/g,"").replace(/\n{3,}/g,"\n\n").trim().slice(0,3900);
}

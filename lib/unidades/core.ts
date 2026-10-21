import { z } from "zod";
import { createHmac, timingSafeEqual } from "node:crypto";
export const unidadeSchema=z.enum(['SUL','NORDESTE']);
export type Unidade=z.infer<typeof unidadeSchema>;
export const multiAtiva=()=>process.env.ERP_MULTIUNIDADE==='enabled';
export function identificarBanco(url:string){const u=new URL(url);return `${u.hostname.replace(/-pooler(?=\.)/,'')}:${u.port||'5432'}${u.pathname}`;}
export function urlDaUnidade(unidade:Unidade,env:Record<string,string|undefined>=process.env){
 const sul=env.DATABASE_URL_SUL,ne=env.DATABASE_URL_NORDESTE;
 if(!sul||!ne)throw new Error('As conexões das duas unidades precisam estar configuradas.');
 if(identificarBanco(sul)===identificarBanco(ne))throw new Error('Sul e Nordeste não podem apontar para o mesmo banco.');
 const url=unidade==='SUL'?sul:ne;
 if(env.DATABASE_URL&&identificarBanco(url)===identificarBanco(env.DATABASE_URL)&&env.ERP_LEGACY_UNIT!==unidade)throw new Error('A unidade dos dados legados ainda não foi confirmada.');
 return url;
}
export function assinarUnidade(usuario:string,unidade:Unidade,secret:string,agora=Date.now()){
 if(!secret)throw new Error('AUTH_SECRET não configurada.');
 const payload=Buffer.from(JSON.stringify({usuario,unidade,expira:agora+12*60*60*1000})).toString('base64url');
 return payload+'.'+createHmac('sha256',secret).update('erp-unidade:v1:'+payload).digest('base64url');
}
export function verificarUnidade(token:string|undefined,usuario:string,secret:string,agora=Date.now()):Unidade|null{
 if(!token||!secret||token.length>1000)return null;
 const [payload,sig,...resto]=token.split('.');if(!payload||!sig||resto.length)return null;
 const expected=createHmac('sha256',secret).update('erp-unidade:v1:'+payload).digest();
 const actual=Buffer.from(sig,'base64url');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
 try{const j=z.object({usuario:z.string(),unidade:unidadeSchema,expira:z.number().finite()}).parse(JSON.parse(Buffer.from(payload,'base64url').toString()));
 return j.usuario===usuario&&j.expira>agora&&j.expira<=agora+12*60*60*1000?j.unidade:null;
 }catch{return null;}
}

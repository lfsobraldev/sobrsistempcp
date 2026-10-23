import { createHmac, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function criarTokenRastreioPallet(id: string, secret: string) {
  const palletId = String(id).trim().toLowerCase();
  if (!UUID.test(palletId)) throw new Error("Identificador de pallet inválido.");
  if (!secret) throw new Error("AUTH_SECRET não configurada.");
  const signature = createHmac("sha256", secret).update(`pallet-tracking:v1:${palletId}`).digest("base64url");
  return `${palletId}.${signature}`;
}

export function verificarTokenRastreioPallet(token: string, secret: string) {
  if (!secret || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [palletId, signature] = parts;
  if (!UUID.test(palletId) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;

  const expected = createHmac("sha256", secret).update(`pallet-tracking:v1:${palletId.toLowerCase()}`).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  return palletId.toLowerCase();
}

/** V2 vincula o QR à unidade; v1 permanece restrito ao banco legado. */
export function criarTokenRastreioUnidade(id:string,unidade:'SUL'|'NORDESTE'|'MADEIRAS',secret:string){
 const palletId=id.toLowerCase();if(!UUID.test(palletId)||!secret)throw new Error('Pallet ou chave inválida.');
 const payload=`v2.${unidade}.${palletId}`;
 return payload+'.'+createHmac('sha256',secret).update('pallet-tracking:'+payload).digest('base64url');
}
export function verificarTokenRastreioUnidade(token:string,secret:string):{id:string;unidade:'SUL'|'NORDESTE'|'MADEIRAS'}|null{
 const [v,unidade,id,sig,...rest]=token.split('.');
 if(!secret||v!=='v2'||!['SUL','NORDESTE','MADEIRAS'].includes(unidade)||!UUID.test(id||'')||!sig||rest.length)return null;
 const expected=createHmac('sha256',secret).update(`pallet-tracking:v2.${unidade}.${id}`).digest();
 const received=Buffer.from(sig,'base64url');
 if(received.length!==expected.length||!timingSafeEqual(received,expected))return null;
 return {id,unidade:unidade as 'SUL'|'NORDESTE'};
}

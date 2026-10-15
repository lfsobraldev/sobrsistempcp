import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {verifyMetaSignature,whatsappUser,textMessages,whatsappAnswer} from "../lib/ia/whatsapp";
test("verifica assinatura Meta de forma segura",()=>{
  const body='{"object":"whatsapp_business_account"}',secret="teste";
  const signature="sha256="+crypto.createHmac("sha256",secret).update(body).digest("hex");
  assert.equal(verifyMetaSignature(body,signature,secret),true);
  assert.equal(verifyMetaSignature(body,signature,"wrong"),false);
  assert.equal(verifyMetaSignature(body,null,secret),false);
});
test("numero nao cadastrado nao acessa dados",()=>{
  const users=JSON.stringify([{phone:"5579999999999",user:"gerente",role:"GERENTE"}]);
  assert.equal(whatsappUser("5579999999999",users)?.perfil,"GERENTE");
  assert.equal(whatsappUser("5579888888888",users),null);
});
test("mensagens em formato de texto e respostas legiveis",()=>{
  const messages=textMessages({object:"whatsapp_business_account",entry:[{changes:[{value:{messages:[{id:"wamid.1",from:"5579999999999",type:"text",text:{body:"Quantos kits?"}},{id:"wamid.2",from:"5579999999999",type:"image"}]}}]}]});
  assert.equal(messages.length,1);
  assert.equal(messages[0].text,"Quantos kits?");
  assert.equal(whatsappAnswer("Teste\n\n\nResposta"),"Teste\n\nResposta");
});

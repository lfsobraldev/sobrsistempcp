import test from "node:test";
import assert from "node:assert/strict";
import QRCode from "qrcode";
import { criarTokenRastreioPallet, verificarTokenRastreioPallet } from "../lib/pallet-tracking";

const id = "123e4567-e89b-12d3-a456-426614174000";
const secret = "local-test-secret";

test("token de rastreio assinado retorna somente o pallet correspondente", () => {
  const token = criarTokenRastreioPallet(id, secret);
  assert.equal(verificarTokenRastreioPallet(token, secret), id);
  assert.equal(verificarTokenRastreioPallet(token, "outra-chave"), null);
});

test("token inválido, adulterado ou com UUID inválido é recusado", () => {
  const token = criarTokenRastreioPallet(id, secret);
  assert.equal(verificarTokenRastreioPallet(`${id.replace("123e", "223e")}.${token.split(".")[1]}`, secret), null);
  assert.equal(verificarTokenRastreioPallet("não-é-token", secret), null);
  assert.throws(() => criarTokenRastreioPallet("pallet-1", secret), /Identificador de pallet inválido/);
});

test("QR gera imagem com token no fragmento da URL de rastreio", async () => {
  const token = criarTokenRastreioPallet(id, secret);
  const url = new URL("https://sobral.app/rastreio/pallet");
  url.hash = new URLSearchParams({ token }).toString();
  const image = await QRCode.toDataURL(url.toString(), { errorCorrectionLevel: "M" });

  assert.match(image, /^data:image\/png;base64,/);
  assert.equal(new URL(url.toString()).search, "");
  assert.equal(new URLSearchParams(url.hash.slice(1)).get("token"), token);
});
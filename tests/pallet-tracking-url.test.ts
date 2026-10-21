import test from "node:test";
import assert from "node:assert/strict";
import QRCode from "qrcode";
import { criarUrlRastreioPallet } from "../lib/pallet-tracking-url";

test("QR de pallet aponta ao portal e mantém a credencial fora da query", async () => {
  const token = "123e4567-e89b-12d3-a456-426614174000.signature";
  const url = new URL(criarUrlRastreioPallet("https://sobrsistem.app", token));
  assert.equal(url.pathname, "/rastreio/pallet");
  assert.equal(url.search, "");
  assert.equal(new URLSearchParams(url.hash.slice(1)).get("token"), token);

  const image = await QRCode.toDataURL(url.toString(), { errorCorrectionLevel: "M", margin: 1, width: 240 });
  assert.match(image, /^data:image\/png;base64,/);
});
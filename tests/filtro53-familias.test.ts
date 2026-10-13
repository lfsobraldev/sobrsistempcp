import test from "node:test";
import assert from "node:assert/strict";
import { File } from "node:buffer";
import { parseFiltro } from "../lib/filter-parser";

const COLUNAS = [
  "Filtro", "Pedido", "Item", "Produto", "OF's", "Descrição",
  "Descrição Máscara", "Tipo", "Canal", "Rebaixo", "Acabamento", "Cor",
  "Quantidade Pecas", "Comprimento", "Largura", "Espessura",
  "Outras Características", "EMBALAGEM",
];
const LINHAS = [
  ["53","25981","1","1001","610401","BAG P/VEN PINUS 2200X25X7 RTO PET CAP M","BAGUETE EM MADEIRA DE PINUS","","","","PET","BRANCO CARRARA","12","2200","25","7","","0"],
  ["53","25981","1","1002","610402","SUP TRILHO ULTRA KIT DE CORRER EM MDF ULTRA","KIT DE CORRER EM MDF ULTRA","","","","PET","BRANCO CARRARA","4","2200","55","45","","0"],
  ["53","25982","1","1003","610403","FO P COR HI C HDF 6 RU 2100X720X35 PET","FOLHA DE PORTA DE CORRER HIVE CORE","LISA","","","PET","BRANCO CARRARA","2","2100","720","35","","0"],
  ["53","25982","1","1004","610404","PE KIT CORR KIT DE CORRER EM MADEIRA DE PINUS","KIT DE CORRER EM MADEIRA DE PINUS","","","","PET","BRANCO CARRARA","6","2200","55","45","","0"],
  ["53","25983","1","1005","610405","SEM DADOS DIMENSIONAIS","PRODUTO NÃO CLASSIFICADO","","","","","","1","","","","","0"],
];
test("Filtro Consistem: usa máscara e dimensões reais de cada linha para famílias especiais", async () => {
  const csv = [COLUNAS.join(";"),...LINHAS.map(l=>l.join(";"))].join("\n");
  const file = new File([csv], "filtro53.csv", {type:"text/csv"});
  const result = await parseFiltro(file as unknown as globalThis.File);
  const linhas = result.romaneioProdutos;
  const byOf = (of: string) => {
    const p = linhas.find(x=>x.of===of);
    assert.ok(p, "OF ausente: "+of);
    return p;
  };
  const baguete = byOf("610401");
  assert.equal(baguete.categoria, "BAGUETE");
  assert.equal(baguete.material, "PINUS");
  assert.equal(baguete.medida, "2200x25x7");
  assert.equal(baguete.tipo, "PINUS");
  assert.equal(baguete.descricaoModelo, "BAGUETE EM MADEIRA DE PINUS");

  const suporte = byOf("610402");
  assert.equal(suporte.categoria, "SUPORTE TRILHO");
  assert.equal(suporte.material, "MDF ULTRA");
  assert.equal(suporte.medida, "2200x55x45");
  assert.equal(suporte.tipo, "ULTRA");

  const correr = byOf("610403");
  assert.equal(correr.categoria, "PORTA");
  assert.equal(correr.tipo, "LISA");
  assert.equal(correr.material, "HDF");
  assert.equal(correr.medida, "2100x720x35");

  const kit = byOf("610404");
  assert.equal(kit.material, "PINUS");
  assert.equal(kit.medida, "2200x55x45");
  assert.equal(kit.tipo, "PINUS");

  const sem = byOf("610405");
  assert.equal(sem.medida, "");
  assert.equal(sem.material, "");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { bancoCompleto } from "./helpers-chain";

test("Postgres: embalagem, MRP por horizonte e demais fases do ERP", async () => {
  const { db, one, all, n } = await bancoCompleto();
  try {
    // ---------- Fase 2: plano de embalagem
    const plano = JSON.stringify([
      { tipo: "PORTA", limiteM3: 2, volumeM3: 1.2, limiteQtd: 32, status: "VALIDO", regra: "HS: 32 portas", itens: [{ descricao: "Porta 80x210", medida: "80x210", quantidade: 10 }, { descricao: "Porta 70x210", medida: "70x210", quantidade: 5 }] },
      { tipo: "BATENTE", limiteM3: 2, volumeM3: 0.8, status: "VALIDO", regra: "250 jogos", itens: [{ descricao: "Batente 15cm", quantidade: 20 }] },
      { tipo: "PORTA", limiteM3: 2, volumeM3: 2.4, status: "INVALIDO", regra: "excede m³", itens: [{ descricao: "Porta 90", quantidade: 40 }] },
    ]);
    await assert.rejects(one("select emb_plano_criar('','HS','[]'::jsonb,'t')"), /pedido/);
    await assert.rejects(one("select emb_plano_criar('5000','HS','[]'::jsonb,'t')"), /não tem pallets/);
    const { id: pl } = await one("select emb_plano_criar('5000','MONTADO_HS',$1::jsonb,'emb1') id", [plano]);
    await assert.rejects(one("select emb_plano_criar('5000','MONTADO_HS',$1::jsonb,'emb1')", [plano]), /em aberto|unique|duplicate/i);
    assert.equal(n((await one("select count(*) c from emb_itens where plano_id=$1", [pl])).c), 4);
    // conferir: divergência exige observação
    await assert.rejects(one("select emb_conferir($1,1,1,9,'','emb1')", [pl]), /DIVERGENCIA/);
    await one("select emb_conferir($1,1,1,10,'','emb1')", [pl]);
    await assert.rejects(one("select emb_pallet_fechar($1,1,'emb1')", [pl]), /sem conferência/); // item 2 ainda sem conferir
    await one("select emb_conferir($1,1,2,4,'faltou 1 porta','emb1')", [pl]);
    await assert.rejects(one("select emb_pallet_fechar($1,1,'emb1')", [pl]), /DIVERGENCIA/); // conferido ≠ plano
    await one("select emb_conferir($1,1,2,5,'','emb1')", [pl]);
    const pid = (await one("select emb_pallet_fechar($1,1,'emb1') id", [pl])).id as string;
    assert.equal((await one("select codigo from pcp_pallets where id=$1", [pid])).codigo, "5000-P01");
    assert.equal((await one("select status from emb_planos where id=$1", [pl])).status, "EM_EMBALAGEM");
    await assert.rejects(one("select emb_conferir($1,1,1,10,'','emb1')", [pl]), /já está fechado/);
    // pallet inválido não fecha
    await one("select emb_conferir($1,3,1,40,'','emb1')", [pl]);
    await assert.rejects(one("select emb_pallet_fechar($1,3,'emb1')", [pl]), /PALLET_INVALIDO/);
    await assert.rejects(one("select emb_plano_cancelar($1,'emb1')", [pl]), /pallet fechado/);
    await one("select emb_conferir($1,2,1,20,'','emb1')", [pl]);
    await one("select emb_pallet_fechar($1,2,'emb1')", [pl]);
    // revisão aberta bloqueia embalagem
    await one("select wms_revisao_abrir('5000','mudou','c',current_date+2,$1::jsonb,'pcp')", [JSON.stringify([{ acao: "ACRESCENTA", descricao: "x", qtdAntes: 0, qtdDepois: 1 }])]);
    await assert.rejects(one("select emb_pallet_fechar($1,3,'emb1')", [pl]), /REVISAO_ABERTA/);
    await assert.rejects(one("select emb_plano_criar('5000','HS',$1::jsonb,'x')", [plano]), /REVISAO_ABERTA/);
    const rs = await one<{ pallets: string; fechados: string; invalidos: string }>("select pallets,fechados,invalidos from emb_v_resumo where id=$1", [pl]);
    assert.deepEqual([n(rs.pallets), n(rs.fechados), n(rs.invalidos)], [3, 2, 1]);

    // ---------- Fase 2: MRP por horizonte
    const { id: local } = await one("insert into est_locais(codigo) values('MRP') returning id");
    assert.ok(local);
    const sem = await all("select * from erp_mrp_liquido_periodo(current_date, current_date + 30)");
    assert.equal(sem.length, 0);
    assert.equal((await all("select * from erp_mrp_liquido_periodo(null, null)")).length, 0);
  } finally { await db.close(); }
});

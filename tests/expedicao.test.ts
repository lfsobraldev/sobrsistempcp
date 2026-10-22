import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const up = async (f: string) => (await readFile(`database/migrations/${f}`, "utf8")).split("-- migrate:down")[0].replace(/create extension if not exists pgcrypto;/gi, "");
test("Postgres: expedição - ATP, reserva, leitura de pallet, fechamento, devolução e estorno de comissão (migration 19)", async () => {
  const db = new PGlite();
  try {
    await db.exec((await readFile("database/schema.sql", "utf8")).replace(/create extension if not exists pgcrypto;/gi, ""));
    await db.exec("create table if not exists pcp_capacidades_maquina(id uuid primary key default gen_random_uuid(),processo text,maquina text,turno text);");
    await db.exec(await up("2026-10-21_fundacao_multiempresa.sql"));
    for (const f of ["2026-10-21_06_engenharia_of.sql", "2026-10-22_09_historico_seguro.sql", "2026-10-22_10_ciclo_industrial.sql", "2026-10-22_13_controle_of.sql", "2026-10-20_crm_comercial.sql", "2026-10-23_14_vendas_comissoes.sql", "2026-10-23_15_vendas_producao.sql", "2026-10-24_16_compras_terceiros.sql", "2026-10-25_17_qualidade_inspecao.sql", "2026-10-26_18_mrp_aps.sql", "2026-10-27_19_expedicao_logistica.sql"]) {
      const s = await up(f); await db.exec(s); if (/_10_|_13_|_16_|_17_|_18_|_19_/.test(f)) await db.exec(s);
    }
    const one = async <T extends Record<string, unknown>>(q: string, a: unknown[] = []) => (await db.query<T>(q, a)).rows[0];
    const { id: local } = await one("insert into est_locais(codigo) values('PADRAO') returning id");
    const { id: prod } = await one("insert into est_produtos(codigo,unidade_base,classificacao) values('PAL','UN','ACABADO') returning id");
    await db.query("insert into est_saldos(produto_id,local_id,fisico) values($1,$2,100)", [prod, local]);
    await db.query("insert into est_movimentos(tipo,produto_id,local_destino_id,quantidade_base,quantidade_informada,unidade_informada,usuario,custo_total) values('ENTRADA',$1,$2,100,100,'UN','t',500)", [prod, local]);
    const { id: cli } = await one("insert into crm_clientes(razao_social,criado_por,atualizado_por) values('ACME','t','t') returning id");
    const { id: rep } = await one("insert into crm_representantes(nome,criado_por,atualizado_por) values('Rep','t','t') returning id");
    // pedido: 10 peças a R$100 = 1000; comissão 5% = 50 (base FATURADO), já faturado 1000 e comissão liberada 50
    const { id: pv } = await one("insert into crm_pedidos_venda(cliente_id,representante_id,pedido_pcp,status,total,faturado_valor,criado_por,atualizado_por) values($1,$2,'0555','APROVADO',1000,1000,'t','t') returning id", [cli, rep]);
    await db.query("insert into crm_pedido_venda_itens(pedido_id,linha,item_codigo,descricao,quantidade,preco_unitario,total) values($1,1,'PAL','Pallet',10,100,1000)", [pv]);
    const { id: prov } = await one("insert into crm_comissoes(pedido_id,representante_id,tipo,base,valor_base,valor,competencia,criado_por) values($1,$2,'PROVISAO','FATURADO',1000,50,'2026-10','t') returning id", [pv, rep]);
    await db.query("insert into crm_comissoes(pedido_id,representante_id,tipo,base,valor_base,valor,status,competencia,referencia_id,criado_por) values($1,$2,'LIBERACAO','FATURADO',1000,50,'A_PAGAR','2026-10',$3,'t')", [pv, rep, prov]);

    // ATP
    const atp = await one<{ livre_agora: string; atende: boolean }>("select * from exp_atp($1,10,'2026-12-31')", [prod]);
    assert.deepEqual([Number(atp.livre_agora), atp.atende], [100, true]);
    assert.equal((await one<{ atende: boolean }>("select * from exp_atp($1,500,'2026-12-31')", [prod])).atende, false);

    // reserva
    await one("select exp_reservar($1,$2,$3,10,'t')", [pv, prod, local]);
    assert.equal(Number((await one<{ reservado: string }>("select reservado from est_saldos where produto_id=$1", [prod])).reservado), 10);
    await assert.rejects(one("select exp_reservar($1,$2,$3,95,'t')", [pv, prod, local]), /SALDO_INSUFICIENTE/);

    // pallets: P1 liberado, P2 não liberado (mesmo pedido), P3 liberado de outro pedido
    const pal = async (cod: string, pedido: string, status: string) => (await one("insert into pcp_pallets(codigo,pedido,pallet,status) values($1,$2,'1',$3) returning id", [cod, pedido, status])).id;
    await pal("P1", "555", "LIBERADO"); const p2 = await pal("P2", "555", "AGUARDANDO_INSPECAO"); await pal("P3", "999", "LIBERADO");
    const { id: rem } = await one("insert into exp_remessas(pedido_venda_id,cliente_id,local_id,criado_por) values($1,$2,$3,'t') returning id", [pv, cli, local]);
    await db.query("insert into exp_remessa_itens(remessa_id,linha,pedido_linha,produto_id,quantidade) values($1,1,1,$2,10)", [rem, prod]);
    await assert.rejects(one("select exp_ler_pallet($1,'P2','t')", [rem]), /não liberado/);
    await assert.rejects(one("select exp_ler_pallet($1,'P3','t')", [rem]), /outro pedido/);
    await assert.rejects(one("select exp_ler_pallet($1,'XX','t')", [rem]), /não encontrado/);
    await one("select exp_ler_pallet($1,'P1','t')", [rem]);
    await assert.rejects(one("select exp_ler_pallet($1,'P1','t')", [rem]), /já foi lido/);
    // P2 do mesmo pedido ainda não lido/liberado => carga não fecha
    await assert.rejects(one("select exp_fechar_remessa($1,'t')", [rem]), /Pallets do pedido não lidos/);
    await db.query("update pcp_pallets set status='LIBERADO' where id=$1", [p2]);
    await assert.rejects(one("select exp_fechar_remessa($1,'t')", [rem]), /não lidos/);
    await one("select exp_ler_pallet($1,'P2','t')", [rem]);
    await one("select exp_fechar_remessa($1,'t')", [rem]);
    const s = await one<{ fisico: string; reservado: string }>("select fisico,reservado from est_saldos where produto_id=$1", [prod]);
    assert.deepEqual([Number(s.fisico), Number(s.reservado)], [90, 0]);
    assert.equal((await one<{ status: string }>("select status from crm_pedidos_venda where id=$1", [pv])).status, "ATENDIDO");
    assert.equal(Number((await one<{ c: string }>("select custo_total c from est_movimentos where tipo='SAIDA' and documento like 'REMESSA%'")).c), 50);
    const ev = await one<{ payload: { itens: Array<{ valor: number }> } }>("select payload from exp_eventos_faturamento where remessa_id=$1", [rem]);
    assert.equal(ev.payload.itens[0].valor, 1000);
    await assert.rejects(one("select exp_fechar_remessa($1,'t')", [rem]), /não pode ser fechada/);

    // devolução de 4 peças (R$ 400) à quarentena: estoque +4 (bloqueado), devolvido 400, estorno 20 (50 × 400/1000)
    await assert.rejects(one("select exp_devolver($1,$2,11,'ESTOQUE','Cliente recusou',$3,'t')", [rem, prod, local]), /maior que o expedido/);
    await assert.rejects(one("select exp_devolver($1,$2,4,'ESTOQUE','',$3,'t')", [rem, prod, local]), /motivo/);
    await one("select exp_devolver($1,$2,4,'QUARENTENA','Peças avariadas',$3,'t')", [rem, prod, local]);
    assert.equal(Number((await one<{ c: string }>("select custo_total c from est_movimentos where documento like 'DEV REMESSA%' order by id limit 1")).c), 20);
    const s2 = await one<{ fisico: string; bloqueado: string }>("select fisico,bloqueado from est_saldos where produto_id=$1", [prod]);
    assert.deepEqual([Number(s2.fisico), Number(s2.bloqueado)], [94, 4]);
    assert.equal(Number((await one<{ devolvido_valor: string }>("select devolvido_valor from crm_pedidos_venda where id=$1", [pv])).devolvido_valor), 400);
    assert.equal(Number((await one<{ v: string }>("select coalesce(sum(valor),0) v from crm_comissoes where pedido_id=$1 and tipo='ESTORNO'", [pv])).v), -20);
    // segunda devolução acumula: +6 => devolvido 1000 => estorno total 50
    await one("select exp_devolver($1,$2,6,'ESTOQUE','Pedido cancelado pelo cliente',$3,'t')", [rem, prod, local]);
    assert.equal(Number((await one<{ v: string }>("select coalesce(sum(valor),0) v from crm_comissoes where pedido_id=$1 and tipo='ESTORNO'", [pv])).v), -50);
    await assert.rejects(one("select exp_devolver($1,$2,1,'ESTOQUE','Mais uma devolução',$3,'t')", [rem, prod, local]), /maior que o expedido/);

    await one("select exp_entregar($1,'NF-9','t')", [rem]);
    assert.equal((await one<{ status: string }>("select status from exp_remessas where id=$1", [rem])).status, "ENTREGUE");

    const down = (await readFile("database/migrations/2026-10-27_19_expedicao_logistica.sql", "utf8")).split("-- migrate:down")[1];
    await db.exec(down);
    assert.equal(((await db.query("select to_regclass('exp_remessas') t")).rows[0] as { t: unknown }).t, null);
  } finally { await db.close(); }
});

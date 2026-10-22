import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const up = async (f: string) => (await readFile(`database/migrations/${f}`, "utf8")).split("-- migrate:down")[0].replace(/create extension if not exists pgcrypto;/gi, "");

test("Postgres: necessidade do pedido, disponibilidade, onde-usado e rastreio (migration 15)", async () => {
  const db = new PGlite();
  try {
    await db.exec((await readFile("database/schema.sql", "utf8")).replace(/create extension if not exists pgcrypto;/gi, ""));
    await db.exec("create table if not exists pcp_capacidades_maquina(id uuid primary key default gen_random_uuid(),processo text,maquina text,turno text);");
    await db.exec(await up("2026-10-21_fundacao_multiempresa.sql"));
    for (const f of ["2026-10-21_06_engenharia_of.sql", "2026-10-22_10_ciclo_industrial.sql", "2026-10-22_13_controle_of.sql", "2026-10-20_crm_comercial.sql", "2026-10-23_14_vendas_comissoes.sql"]) {
      const s = await up(f); await db.exec(s); if (/_10_|_13_/.test(f)) await db.exec(s);
    }
    const m15 = await up("2026-10-23_15_vendas_producao.sql");
    await db.exec(m15); await db.exec(m15);
    const one = async <T extends Record<string, unknown>>(q: string, a: unknown[] = []) => (await db.query<T>(q, a)).rows[0];

    const { id: emp } = await one("insert into pcp_empresas(codigo,razao_social) values('T','T') returning id");
    const { id: fil } = await one("insert into pcp_filiais(empresa_id,codigo,nome) values($1,'SUL','Sul') returning id", [emp]);
    const { id: local } = await one("insert into est_locais(codigo) values('PADRAO') returning id");
    const prod = async (c: string, t: string) => (await one("insert into est_produtos(codigo,unidade_base,classificacao) values($1,'UN',$2) returning id", [c, t])).id;
    const raw = await prod("RAW", "INSUMO"), semi = await prod("SEMI", "SEMIACABADO"), final = await prod("FINAL", "ACABADO");
    const bom = async (p: unknown, c: unknown, q: number) => {
      const { id } = await one("select erp_criar_estrutura($1,$2,$3,'t') id", [p, JSON.stringify([{ componente_id: c, quantidade: q, perda_percentual: 0 }]), crypto.randomUUID()]);
      await one("select erp_aprovar_estrutura($1,'t')", [id]); return id as string;
    };
    await bom(semi, raw, 3); const bomFinal = await bom(final, semi, 2);

    // onde-usado: RAW usado por SEMI (nível 1, x3) e FINAL (nível 2, x6)
    const ou = (await db.query<{ nivel: number; pai_codigo: string; quantidade_acumulada: string }>("select * from erp_onde_usado($1)", [raw])).rows;
    assert.deepEqual(ou.map((r) => [r.nivel, r.pai_codigo, Number(r.quantidade_acumulada)]), [[1, "SEMI", 3], [2, "FINAL", 6]]);

    // disponibilidade: FINAL x10 precisa de 20 SEMI; sem saldo => GERA_OF_FILHA; com saldo 20 => OK
    let d = (await db.query<{ situacao: string; necessidade: string; falta: string }>("select * from erp_disponibilidade_estrutura($1,10,$2)", [bomFinal, local])).rows;
    assert.deepEqual([d[0].situacao, Number(d[0].necessidade)], ["GERA_OF_FILHA", 20]);
    await db.query("insert into est_saldos(produto_id,local_id,fisico,reservado) values($1,$2,25,5)", [semi, local]);
    d = (await db.query<{ situacao: string; necessidade: string; falta: string }>("select * from erp_disponibilidade_estrutura($1,10,$2)", [bomFinal, local])).rows;
    assert.equal(d[0].situacao, "OK");
    d = (await db.query<{ situacao: string; necessidade: string; falta: string }>("select * from erp_disponibilidade_estrutura($1,11,$2)", [bomFinal, local])).rows;
    assert.deepEqual([d[0].situacao, Number(d[0].falta)], ["GERA_OF_FILHA", 2]);

    // pedido de venda e necessidade
    const { id: cli } = await one("insert into crm_clientes(razao_social,criado_por,atualizado_por) values('ACME','t','t') returning id");
    const { id: rep } = await one("insert into crm_representantes(nome,criado_por,atualizado_por) values('Rep','t','t') returning id");
    const { id: pv } = await one("insert into crm_pedidos_venda(cliente_id,representante_id,pedido_pcp,total,criado_por,atualizado_por) values($1,$2,'0123',1000,'t','t') returning id", [cli, rep]);
    await db.query("insert into crm_pedido_venda_itens(pedido_id,linha,item_codigo,descricao,quantidade,preco_unitario,total) values($1,1,'final','Final',10,100,1000),($1,2,'XYZ','Sem cadastro',1,1,1)", [pv]);
    await db.query("insert into est_saldos(produto_id,local_id,fisico) values($1,$2,4)", [final, local]);
    let nec = (await db.query<{ linha: number; situacao: string; saldo_livre: string; falta_producao: string }>("select * from erp_necessidade_pedido($1)", [pv])).rows;
    assert.deepEqual([nec[0].situacao, Number(nec[0].saldo_livre), Number(nec[0].falta_producao)], ["PRODUZIR", 4, 6]);
    assert.equal(nec[1].situacao, "SEM_PRODUTO_ESTOQUE");

    // OF em curso para o mesmo pedido (pcp '123' == '0123') reduz a falta
    const pg = crypto.randomUUID(), origem = crypto.randomUUID();
    await db.query("insert into pcp_programacoes(id,filtro,data_programacao,turno,status) values($1,'F','2026-10-01','A','ATIVA')", [pg]);
    await db.query("insert into pcp_produtos(id,programacao_id,produto,pedido,of,descricao,quantidade) values($1,$2,'FINAL','123','1','Final',6)", [origem, pg]);
    const vv = await one("select id from erp_estruturas where produto_id=$1", [final]);
    const { id: ofId } = await one("insert into erp_ordens_fabricacao(origem_produto_id,produto_estoque_id,estrutura_id,quantidade,pedido,criado_por,prazo) values($1,$2,$3,6,'123','t','2026-10-31') returning id", [origem, final, vv.id]);
    nec = (await db.query("select * from erp_necessidade_pedido($1)", [pv])).rows as typeof nec;
    assert.deepEqual([nec[0].situacao, Number(nec[0].falta_producao)], ["COBERTO", 0]);
    const com = await one<{ cliente_nome: string; representante_nome: string; pedido_venda_numero: string }>("select * from erp_v_of_comercial where of_id=$1", [ofId]);
    assert.deepEqual([com.cliente_nome, com.representante_nome], ["ACME", "Rep"]);

    // rastreio: lote de RAW consumido pela OF e entrada do acabado
    const { id: lote } = await one("insert into est_lotes(empresa_id,filial_id,produto_id,codigo,criado_por) values($1,$2,$3,'L-001','t') returning id", [emp, fil, raw]);
    const { id: loteF } = await one("insert into est_lotes(empresa_id,filial_id,produto_id,codigo,criado_por) values($1,$2,$3,'F-001','t') returning id", [emp, fil, final]);
    await db.query("insert into est_movimentos(tipo,produto_id,local_origem_id,quantidade_base,quantidade_informada,unidade_informada,of_id,lote_id,usuario) values('SAIDA',$1,$2,18,18,'UN',$3,$4,'t')", [raw, local, ofId, lote]);
    await db.query("insert into est_movimentos(tipo,produto_id,local_destino_id,quantidade_base,quantidade_informada,unidade_informada,of_id,lote_id,usuario) values('ENTRADA',$1,$2,6,6,'UN',$3,$4,'t')", [final, local, ofId, loteF]);
    await db.query("insert into pcp_pallets(codigo,pedido,pallet,tipo_produto,quantidade) values('PAL-1','123','1','Final',6)");
    const r = (await db.query<{ sentido: string; tipo: string; referencia: string }>("select * from erp_rastreio_of($1)", [ofId])).rows;
    const k = r.map((x) => `${x.sentido}:${x.tipo}:${x.referencia}`).sort();
    assert.deepEqual(k, ["DESTINO:ENTRADA_PRODUZIDA:F-001", "DESTINO:PALLET:PAL-1", "DESTINO:PEDIDO_VENDA:" + com.pedido_venda_numero, "ORIGEM:MATERIAL_CONSUMIDO:L-001"].sort());
    const fw = (await db.query<{ cliente: string; quantidade_consumida: string }>("select * from erp_rastreio_lote($1)", [lote])).rows;
    assert.deepEqual([fw.length, fw[0].cliente, Number(fw[0].quantidade_consumida)], [1, "ACME", 18]);

    const down = (await readFile("database/migrations/2026-10-23_15_vendas_producao.sql", "utf8")).split("-- migrate:down")[1];
    await db.exec(down);
    assert.equal(((await db.query("select to_regprocedure('erp_onde_usado(uuid)') t")).rows[0] as { t: unknown }).t, null);
  } finally { await db.close(); }
});

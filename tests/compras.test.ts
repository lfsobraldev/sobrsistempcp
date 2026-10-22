import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { agruparPorFornecedor, conferirNfe, lerNfeXml, melhorProposta, perfilExigido, podeAprovar, podeTransicionarPC, totalPC } from "../lib/compras";

const CHAVE = "35261012345678000190550010000001231000000019";
const XML = `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe${CHAVE}" versao="4.00"><ide><nNF>123</nNF></ide><emit><CNPJ>12345678000190</CNPJ><xNome>Madeireira &amp; Cia</xNome></emit>
<det nItem="1"><prod><cProd>RAW</cProd><xProd>Tábua</xProd><qCom>10.0000</qCom><vUnCom>5.5000</vUnCom><vProd>55.00</vProd></prod></det>
<det nItem="2"><prod><cProd>XYZ</cProd><xProd>Outro</xProd><qCom>1.0000</qCom><vUnCom>2.0000</vUnCom><vProd>2.00</vProd></prod></det>
<total><ICMSTot><vNF>57.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`;

test("alçada, transições, total e cotação", () => {
  const al = [{ valorAte: null, perfil: "GERENTE" as const }, { valorAte: 5000, perfil: "PCP" as const }];
  assert.equal(perfilExigido(5000, al), "PCP");
  assert.equal(perfilExigido(5000.01, al), "GERENTE");
  assert.equal(podeAprovar("PCP", "GERENTE"), false);
  assert.equal(podeAprovar("GERENTE", "PCP"), true);
  assert.equal(podeAprovar("COMERCIAL", "PCP"), false);
  assert.equal(podeTransicionarPC("APROVADO", "RASCUNHO"), false);
  assert.equal(podeTransicionarPC("RECEBIDO", "CANCELADO"), false);
  assert.equal(totalPC([{ produtoId: "a", quantidade: 3, precoUnitario: 33.33 }]), 99.99);
  assert.throws(() => totalPC([]), /ao menos um/);
  assert.throws(() => totalPC([{ produtoId: "a", quantidade: 0, precoUnitario: 1 }]), /quantidade/);
  const p = melhorProposta([{ linha: 1, fornecedorId: "B", precoUnitario: 10, prazoDias: 5 }, { linha: 1, fornecedorId: "A", precoUnitario: 10, prazoDias: 3 }, { linha: 1, fornecedorId: "C", precoUnitario: 12, prazoDias: 1 }]);
  assert.equal(p?.fornecedorId, "A");
  assert.equal(agruparPorFornecedor([{ fornecedorId: "A" }, { fornecedorId: "B" }, { fornecedorId: "A" }]).get("A")?.length, 2);
});

test("NF-e: leitura e conferência", () => {
  const n = lerNfeXml(XML);
  assert.equal(n.chave, CHAVE);
  assert.deepEqual([n.numero, n.emitenteNome, n.itens.length, n.totalNota], ["123", "Madeireira & Cia", 2, 57]);
  const c = conferirNfe(n, [{ linha: 1, codigo: "raw", pendente: 10, precoUnitario: 5.5 }]);
  assert.deepEqual(c.map((x) => x.situacao), ["OK", "SEM_ITEM_NO_PEDIDO"]);
  assert.equal(conferirNfe(n, [{ linha: 1, codigo: "RAW", pendente: 10, precoUnitario: 5 }])[0].situacao, "PRECO_DIVERGE");
  assert.equal(conferirNfe(n, [{ linha: 1, codigo: "RAW", pendente: 5, precoUnitario: 5.5 }])[0].situacao, "ACIMA_DO_PENDENTE");
  assert.throws(() => lerNfeXml("<a/>"), /NF-e válida/);
  assert.throws(() => lerNfeXml('<!DOCTYPE x [<!ENTITY a "b">]>' + XML), /DOCTYPE/);
});

const up = async (f: string) => (await readFile(`database/migrations/${f}`, "utf8")).split("-- migrate:down")[0].replace(/create extension if not exists pgcrypto;/gi, "");
test("Postgres: compra ponta a ponta, tolerância, terceiros, sugestão e ABC (migration 16)", async () => {
  const db = new PGlite();
  try {
    await db.exec((await readFile("database/schema.sql", "utf8")).replace(/create extension if not exists pgcrypto;/gi, ""));
    await db.exec("create table if not exists pcp_capacidades_maquina(id uuid primary key default gen_random_uuid(),processo text,maquina text,turno text);");
    await db.exec(await up("2026-10-21_fundacao_multiempresa.sql"));
    for (const f of ["2026-10-21_06_engenharia_of.sql", "2026-10-22_10_ciclo_industrial.sql", "2026-10-22_13_controle_of.sql", "2026-10-20_crm_comercial.sql", "2026-10-23_14_vendas_comissoes.sql", "2026-10-23_15_vendas_producao.sql", "2026-10-24_16_compras_terceiros.sql"]) {
      const s = await up(f); await db.exec(s); if (/_10_|_13_|_16_/.test(f)) await db.exec(s);
    }
    const one = async <T extends Record<string, unknown>>(q: string, a: unknown[] = []) => (await db.query<T>(q, a)).rows[0];
    const { id: local } = await one("insert into est_locais(codigo) values('PADRAO') returning id");
    const { id: raw } = await one("insert into est_produtos(codigo,unidade_base,classificacao,estoque_minimo,estoque_seguranca,lote_compra) values('RAW','UN','INSUMO',10,5,20) returning id");
    const { id: forn } = await one("insert into cmp_fornecedores(razao_social,documento,criado_por) values('Madeireira','12.345.678/0001-90','t') returning id");
    const { id: pc } = await one("insert into cmp_pedidos(fornecedor_id,status,total,criado_por) values($1,'APROVADO',55,'t') returning id", [forn]);
    await db.query("insert into cmp_pedido_itens(pedido_id,linha,produto_id,quantidade,preco_unitario) values($1,1,$2,10,5.5)", [pc, raw]);

    // sugestão antes do recebimento: projeção 0 + em compra 10 = 10 < alvo 15 => faltam 5 => lote 20
    let sug = (await db.query<{ em_compra: string; sugerido: string; disponivel: string; custo_medio: string }>("select * from cmp_sugestao_compra()")).rows;
    assert.deepEqual([Number(sug[0].em_compra), Number(sug[0].sugerido)], [10, 20]);

    // recebimento parcial com divergência de preço
    await one("select cmp_receber($1,'123',$2,$3,$4::jsonb,'t')", [pc, CHAVE, local, JSON.stringify([{ linha: 1, quantidade: 6, precoNf: 6 }])]);
    assert.equal((await one<{ status: string }>("select status from cmp_pedidos where id=$1", [pc])).status, "PARCIAL");
    assert.equal((await one<{ divergente: boolean }>("select divergente from cmp_recebimentos")).divergente, true);
    assert.equal(Number((await one<{ fisico: string }>("select fisico from est_saldos where produto_id=$1", [raw])).fisico), 6);
    await assert.rejects(one("select cmp_receber($1,'124',$2,$3,$4::jsonb,'t')", [pc, CHAVE, local, JSON.stringify([{ linha: 1, quantidade: 1, precoNf: 5.5 }])]), /duplicate|unique/);
    await assert.rejects(one("select cmp_receber($1,'125',null,$2,$3::jsonb,'t')", [pc, local, JSON.stringify([{ linha: 1, quantidade: 6, precoNf: 5.5 }])]), /tolerância/);
    await one("select cmp_receber($1,'126',null,$2,$3::jsonb,'t')", [pc, local, JSON.stringify([{ linha: 1, quantidade: 4, precoNf: 5.5 }])]);
    assert.equal((await one<{ status: string }>("select status from cmp_pedidos where id=$1", [pc])).status, "RECEBIDO");
    await assert.rejects(one("select cmp_receber($1,'127',null,$2,$3::jsonb,'t')", [pc, local, JSON.stringify([{ linha: 1, quantidade: 1, precoNf: 5.5 }])]), /não está liberado/);

    // sugestão após: disponível 10, alvo 15 => falta 5 => lote 20
    sug = (await db.query<{ em_compra: string; sugerido: string; disponivel: string; custo_medio: string }>("select * from cmp_sugestao_compra()")).rows;
    assert.deepEqual([Number(sug[0].disponivel), Number(sug[0].sugerido)], [10, 20]);
    assert.ok(Number(sug[0].custo_medio) > 5.5 && Number(sug[0].custo_medio) < 6);

    // terceirização: remessa 4, retorno 3 (+custo), retorno acima do saldo falha, saldo fecha
    const { id: t } = await one("insert into cmp_fornecedores(razao_social,terceirizador,criado_por) values('Usinagem Terceira',true,'t') returning id");
    await one("select cmp_terceiro_mov('REMESSA',$1,$2,null,4,0,$3,'N1',null,'t')", [t, raw, local]);
    assert.equal(Number((await one<{ fisico: string }>("select fisico from est_saldos where produto_id=$1", [raw])).fisico), 6);
    await one("select cmp_terceiro_mov('RETORNO',$1,$2,null,3,30,$3,'N2',null,'t')", [t, raw, local]);
    await assert.rejects(one("select cmp_terceiro_mov('RETORNO',$1,$2,null,2,0,$3,'N3',null,'t')", [t, raw, local]), /maior que o saldo/);
    const sd = await one<{ saldo: string; custo_servico: string }>("select * from cmp_saldo_terceiros where fornecedor_id=$1", [t]);
    assert.deepEqual([Number(sd.saldo), Number(sd.custo_servico)], [1, 30]);

    // ABC/XYZ roda sobre saídas com custo
    await db.query("insert into est_movimentos(tipo,produto_id,local_origem_id,quantidade_base,quantidade_informada,unidade_informada,custo_total,usuario) values('SAIDA',$1,$2,2,2,'UN',10,'t')", [raw, local]);
    const abc = (await db.query<{ classe_abc: string; classe_xyz: string }>("select * from cmp_curva_abc_xyz(30)")).rows;
    assert.deepEqual([abc[0].classe_abc, abc[0].classe_xyz], ["A", "X"]);

    // consulta de solicitações/cotação usada pela API executa sem erro e traz propostas
    const { id: sol } = await one("insert into cmp_solicitacoes(status,criado_por) values('APROVADA','t') returning id");
    await db.query("insert into cmp_solicitacao_itens(solicitacao_id,linha,produto_id,quantidade) values($1,1,$2,5)", [sol, raw]);
    await db.query("insert into cmp_cotacao_propostas(solicitacao_id,linha,fornecedor_id,preco_unitario,prazo_dias,criado_por) values($1,1,$2,4,3,'t')", [sol, forn]);
    const src = await readFile("app/api/compras/route.ts", "utf8");
    const m = /q\(`(select s\.\*,\(select json_agg[^`]+)`\)/.exec(src);
    assert.ok(m);
    const sols = (await db.query<{ itens: Array<{ propostas: Array<{ preco: number }> }> }>(m![1])).rows;
    assert.equal(sols[0].itens[0].propostas[0].preco, 4);

    const down = (await readFile("database/migrations/2026-10-24_16_compras_terceiros.sql", "utf8")).split("-- migrate:down")[1];
    await db.exec(down);
    assert.equal(((await db.query("select to_regclass('cmp_pedidos') t")).rows[0] as { t: unknown }).t, null);
  } finally { await db.close(); }
});

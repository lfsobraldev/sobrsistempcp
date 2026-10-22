import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { crc16, criarProvedorCobranca, pixCopiaECola } from "../lib/financeiro/cobranca";
import { parseCsvExtrato, parseOfx, sugerirConciliacao } from "../lib/financeiro/extrato";

test("PIX copia e cola: CRC16/CCITT e estrutura EMV", () => {
  assert.equal(crc16("123456789"), "29B1");
  const p = pixCopiaECola({ chave: "pix@sobral.com.br", nome: "Sobral Indústria", cidade: "São Paulo", valor: 150.5, txid: "TIT123" });
  assert.ok(p.startsWith("000201010212"));
  assert.ok(p.includes("0014br.gov.bcb.pix0117pix@sobral.com.br"));
  assert.ok(p.includes("5406150.50"));
  assert.ok(p.includes("5916SOBRAL INDUSTRIA"));
  assert.equal(p.slice(-4), crc16(p.slice(0, -4)));
  assert.throws(() => pixCopiaECola({ chave: "", nome: "A", cidade: "B" }), /chave/);
  assert.throws(() => criarProvedorCobranca("EXTERNO", "HOMOLOGACAO"), /não configurado/);
});

test("extrato: OFX, CSV pt-BR e sugestão de conciliação sem reutilizar título", () => {
  const ofx = `OFXHEADER:100\n<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261105120000<TRNAMT>500.00<FITID>A1<MEMO>PIX ACME LTDA</STMTTRN><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261106<TRNAMT>-120,30<FITID>B2<MEMO>TARIFA</STMTTRN></BANKTRANLIST></OFX>`;
  const o = parseOfx(ofx);
  assert.deepEqual(o.map((x) => [x.fitid, x.data, x.valor]), [["A1", "2026-11-05", 500], ["B2", "2026-11-06", -120.3]]);
  const c = parseCsvExtrato("Data;Descrição;Valor\n05/11/2026;PIX ACME;1.500,25\n06/11/2026;Fornecedor;-80,00");
  assert.deepEqual(c.map((x) => [x.data, x.valor]), [["2026-11-05", 1500.25], ["2026-11-06", -80]]);
  assert.throws(() => parseCsvExtrato("a;b\n1;2"), /colunas/);
  const s = sugerirConciliacao([{ id: "e1", fitid: "1", data: "2026-11-05", valor: 500, descricao: "PIX ACME LTDA" }, { id: "e2", fitid: "2", data: "2026-11-05", valor: 500, descricao: "PIX OUTRO" }, { id: "e3", fitid: "3", data: "2026-11-05", valor: -9, descricao: "x" }],
    [{ id: "t1", tipo: "RECEBER", saldo: 500, vencimento: "2026-11-01", parceiro: "Beta SA" }, { id: "t2", tipo: "RECEBER", saldo: 500, vencimento: "2026-11-30", parceiro: "ACME LTDA" }]);
  assert.deepEqual(s.map((x) => [x.tituloId, x.motivo]), [["t2", "VALOR_E_NOME"], ["t1", "VALOR_EXATO"], [null, "SEM_CANDIDATO"]]);
});

const up = async (f: string) => (await readFile(`database/migrations/${f}`, "utf8")).split("-- migrate:down")[0].replace(/create extension if not exists pgcrypto;/gi, "");
test("Postgres: financeiro e contabilidade - títulos automáticos, baixa, conciliação, razão, DRE e fluxo (migration 22)", async () => {
  const db = new PGlite();
  try {
    await db.exec((await readFile("database/schema.sql", "utf8")).replace(/create extension if not exists pgcrypto;/gi, ""));
    await db.exec("create table if not exists pcp_capacidades_maquina(id uuid primary key default gen_random_uuid(),processo text,maquina text,turno text);");
    await db.exec(await up("2026-10-21_fundacao_multiempresa.sql"));
    const files = ["2026-10-21_06_engenharia_of.sql", "2026-10-22_09_historico_seguro.sql", "2026-10-22_10_ciclo_industrial.sql", "2026-10-22_13_controle_of.sql", "2026-10-20_crm_comercial.sql", "2026-10-23_14_vendas_comissoes.sql", "2026-10-23_15_vendas_producao.sql", "2026-10-24_16_compras_terceiros.sql", "2026-10-25_17_qualidade_inspecao.sql", "2026-10-26_18_mrp_aps.sql", "2026-10-27_19_expedicao_logistica.sql", "2026-10-28_20_custos_industriais.sql", "2026-10-29_21_fiscal.sql", "2026-10-30_22_financeiro_contabil.sql"];
    for (const f of files) { const s = await up(f); await db.exec(s); if (/_10_|_13_|_16_|_17_|_18_|_19_|_20_|_21_|_22_/.test(f)) await db.exec(s); }
    const one = async <T extends Record<string, unknown>>(q: string, a: unknown[] = []) => (await db.query<T>(q, a)).rows[0];
    const all = async <T extends Record<string, unknown>>(q: string, a: unknown[] = []) => (await db.query<T>(q, a)).rows;
    const n = (v: unknown) => Number(v);
    await one("select ctb_semear_plano('t')");
    assert.equal(n((await one<{ n: string }>("select count(*) n from ctb_regras_lancamento")).n), 13);
    const conta = async (cod: string) => (await one("select id from ctb_contas where codigo=$1", [cod])).id;
    const { id: banco } = await one("insert into fin_contas_bancarias(nome,saldo_inicial,saldo_inicial_data,criado_por) values('Itaú',1000,'2026-01-01','t') returning id");
    const { id: cc } = await one("insert into fin_centros_custo(codigo,nome) values('ADM','Administrativo') returning id");

    // pedido de venda faturado em 30/60 => 2 títulos de 500 e lançamento D clientes / C receita
    const { id: cli } = await one("insert into crm_clientes(razao_social,criado_por,atualizado_por) values('ACME','t','t') returning id");
    const { id: rep } = await one("insert into crm_representantes(nome,criado_por,atualizado_por) values('Rep','t','t') returning id");
    const { id: pv } = await one("insert into crm_pedidos_venda(cliente_id,representante_id,status,condicao_pagamento,total,criado_por,atualizado_por) values($1,$2,'APROVADO','30/60',1000,'t','t') returning id", [cli, rep]);
    await db.query("update crm_pedidos_venda set faturado_valor=1000,status='FATURADO' where id=$1", [pv]);
    const tit = await all<{ id: string; valor: string; parcela: number; vencimento: string }>("select id,valor,parcela,vencimento::text from fin_titulos where tipo='RECEBER' order by parcela");
    assert.deepEqual(tit.map((t) => n(t.valor)), [500, 500]);
    const hoje = (await one<{ d: string }>("select current_date::text d")).d;
    assert.equal((await one<{ ok: boolean }>("select vencimento=current_date+30 ok from fin_titulos where id=$1", [tit[0].id])).ok, true);
    assert.equal(n((await one<{ v: string }>("select sum(p.credito) v from ctb_partidas p join ctb_contas c on c.id=p.conta_id where c.codigo='3.1.01'")).v), 1000);
    // reprocessar faturamento não duplica
    await db.query("update crm_pedidos_venda set faturado_valor=1000 where id=$1", [pv]);
    assert.equal(n((await one<{ n: string }>("select count(*) n from fin_titulos")).n), 2);

    // baixa parcial e total; baixa maior que o saldo é recusada
    await assert.rejects(one("select fin_baixar($1,$2,current_date,600,null,'t')", [tit[0].id, banco]), /maior que o saldo/);
    const { fin_baixar: b1 } = await one<{ fin_baixar: string }>("select fin_baixar($1,$2,current_date,200,null,'t')", [tit[0].id, banco]);
    assert.equal((await one<{ status: string }>("select status from fin_titulos where id=$1", [tit[0].id])).status, "PARCIAL");
    await one("select fin_baixar($1,$2,current_date,300,null,'t')", [tit[0].id, banco]);
    assert.equal((await one<{ status: string }>("select status from fin_titulos where id=$1", [tit[0].id])).status, "LIQUIDADO");
    await assert.rejects(one("select fin_baixar($1,$2,current_date,1,null,'t')", [tit[0].id, banco]), /não aceita baixa/);
    // estorno de baixa reabre o saldo e estorna o lançamento
    await one("select fin_estornar_baixa($1,'t')", [b1]);
    assert.equal(n((await one<{ v: string }>("select valor_baixado v from fin_titulos where id=$1", [tit[0].id])).v), 300);
    await assert.rejects(one("select fin_estornar_baixa($1,'t')", [b1]), /já estornada/);

    // conciliação: extrato de crédito 200 baixa o saldo da parcela 1
    const { id: ext } = await one("insert into fin_extratos(conta_id,data,descricao,valor,fitid,criado_por) values($1,current_date,'PIX ACME',200,'F1','t') returning id", [banco]);
    await assert.rejects(db.query("insert into fin_extratos(conta_id,data,descricao,valor,fitid,criado_por) values($1,current_date,'dup',200,'F1','t')", [banco]), /duplicate/);
    await one("select fin_conciliar($1,$2,'t')", [ext, tit[0].id]);
    assert.notEqual((await one<{ baixa_id: unknown }>("select baixa_id from fin_extratos where id=$1", [ext])).baixa_id, null);
    await assert.rejects(one("select fin_conciliar($1,$2,'t')", [ext, tit[1].id]), /já conciliada/);

    // devolução de 200 abate a última parcela (500 -> 300) e lança dedução de receita
    await db.query("update crm_pedidos_venda set devolvido_valor=200 where id=$1", [pv]);
    assert.equal(n((await one<{ v: string }>("select valor v from fin_titulos where id=$1", [tit[1].id])).v), 300);
    assert.equal(n((await one<{ v: string }>("select sum(p.debito) v from ctb_partidas p join ctb_contas c on c.id=p.conta_id where c.codigo='3.1.02'")).v), 200);

    // comissão liberada gera conta a pagar; estorno abate
    const { id: prov } = await one("insert into crm_comissoes(pedido_id,representante_id,tipo,base,valor_base,valor,competencia,criado_por) values($1,$2,'PROVISAO','FATURADO',1000,50,'2026-10','t') returning id", [pv, rep]);
    await db.query("insert into crm_comissoes(pedido_id,representante_id,tipo,base,valor_base,valor,status,competencia,referencia_id,criado_por) values($1,$2,'LIBERACAO','FATURADO',1000,50,'A_PAGAR','2026-10',$3,'t')", [pv, rep, prov]);
    const cp = await one<{ valor: string; vencimento: string }>("select valor,vencimento::text from fin_titulos where tipo='PAGAR' and origem='COMISSAO'");
    assert.deepEqual([n(cp.valor), cp.vencimento], [50, "2026-11-10"]);
    await db.query("insert into crm_comissoes(pedido_id,representante_id,tipo,base,valor_base,valor,status,competencia,referencia_id,criado_por) values($1,$2,'ESTORNO','FATURADO',200,-10,'A_PAGAR','2026-10',$3,'t')", [pv, rep, prov]);
    assert.equal(n((await one<{ v: string }>("select valor v from fin_titulos where tipo='PAGAR' and origem='COMISSAO'")).v), 40);

    // compra recebida gera conta a pagar com prazo do fornecedor
    const { id: forn } = await one("insert into cmp_fornecedores(razao_social,prazo_medio_dias,criado_por) values('Aço SA',15,'t') returning id");
    const { id: local } = await one("insert into est_locais(codigo) values('PADRAO') returning id");
    const { id: raw } = await one("insert into est_produtos(codigo,unidade_base,classificacao) values('RAW','UN','INSUMO') returning id");
    const { id: pc } = await one("insert into cmp_pedidos(fornecedor_id,status,total,criado_por) values($1,'APROVADO',100,'t') returning id", [forn]);
    await db.query("insert into cmp_pedido_itens(pedido_id,linha,produto_id,quantidade,preco_unitario) values($1,1,$2,10,10)", [pc, raw]);
    await db.query("update cmp_pedido_itens set quantidade_recebida=10 where pedido_id=$1", [pc]);
    const cmp = await one<{ valor: string; ok: boolean }>("select valor,vencimento=current_date+15 ok from fin_titulos where origem='COMPRA'");
    assert.deepEqual([n(cmp.valor), cmp.ok], [100, true]);
    await one("select fin_baixar((select id from fin_titulos where origem='COMPRA'),$1,current_date,100,null,'t')", [banco]);

    // despesa manual com centro de custo e orçamento
    const { id: dm } = await one("select fin_criar_titulo('PAGAR','MANUAL',gen_random_uuid(),'ALUGUEL',1,'Imob',null,'Aluguel',current_date,300,$1,'t') id", [cc]);
    assert.ok(dm);
    await db.query("insert into fin_orcamento values($1,$2,to_char(current_date,'YYYY-MM'),250)", [cc, await conta("5.1.02")]);
    const orc = await one<{ orcado: string; realizado: string; variacao: string }>("select * from ctb_orcado_realizado(to_char(current_date,'YYYY-MM'),to_char(current_date,'YYYY-MM'))");
    assert.deepEqual([n(orc.orcado), n(orc.realizado), n(orc.variacao)], [250, 300, 50]);

    // CMV por remessa e devolução (custo vem do movimento de estoque)
    const { id: fin } = await one("insert into est_produtos(codigo,unidade_base,classificacao) values('FIN','UN','ACABADO') returning id");
    const { id: rem } = await one("insert into exp_remessas(pedido_venda_id,cliente_id,local_id,status,criado_por) values($1,$2,$3,'ABERTA','t') returning id", [pv, cli, local]);
    const mv = (await one("insert into est_movimentos(tipo,produto_id,local_origem_id,quantidade_base,quantidade_informada,unidade_informada,usuario,custo_total) values('SAIDA',$1,$2,10,10,'UN','t',400) returning id", [fin, local])).id;
    await db.query("insert into exp_remessa_itens(remessa_id,linha,pedido_linha,produto_id,quantidade,movimento_id) values($1,1,1,$2,10,$3)", [rem, fin, mv]);
    await db.query("update exp_remessas set status='FECHADA' where id=$1", [rem]);
    assert.equal(n((await one<{ v: string }>("select sum(p.debito) v from ctb_partidas p join ctb_contas c on c.id=p.conta_id where c.codigo='4.1.01'")).v), 400);

    // evento sem regra vira pendência e é reprocessado depois
    await db.query("update ctb_regras_lancamento set ativo=false where evento='TITULO_PAGAR_MANUAL'");
    await one("select fin_criar_titulo('PAGAR','MANUAL',gen_random_uuid(),'LUZ',1,'Cia Luz',null,'Energia',current_date,80,$1,'t') id", [cc]);
    assert.equal(n((await one<{ n: string }>("select count(*) n from ctb_pendencias")).n), 1);
    await db.query("update ctb_regras_lancamento set ativo=true where evento='TITULO_PAGAR_MANUAL'");
    assert.equal(n((await one<{ r: string }>("select ctb_reprocessar('t') r")).r), 1);
    assert.equal(n((await one<{ n: string }>("select count(*) n from ctb_pendencias")).n), 0);

    // lançamento manual desbalanceado é recusado; lançamentos são imutáveis
    await assert.rejects(one("select ctb_lancar(current_date,'x',null,null,$1,'t')", [JSON.stringify([{ conta_id: await conta("1.1.01"), debito: 10 }, { conta_id: await conta("3.1.01"), credito: 9 }])]), /desbalanceado/);
    await assert.rejects(one("select ctb_lancar(current_date,'x',null,null,$1,'t')", [JSON.stringify([{ conta_id: await conta("1"), debito: 10 }, { conta_id: await conta("3.1.01"), credito: 10 }])]), /sintética|inválida/);
    await assert.rejects(db.query("update ctb_partidas set debito=1 where id=1"), /imutável/);
    await assert.rejects(db.query("delete from ctb_lancamentos"), /imutável/);

    // RAZÃO × BALANCETE × DRE fecham entre si
    const bal = await all<{ codigo: string; tipo: string; debitos: string; creditos: string; saldo_final: string }>("select * from ctb_balancete(date '2026-01-01', current_date)");
    const sd = bal.reduce((s, b) => s + n(b.debitos), 0), sc = bal.reduce((s, b) => s + n(b.creditos), 0);
    assert.equal(Math.round(sd * 100), Math.round(sc * 100));
    assert.equal(Math.round(bal.reduce((s, b) => s + n(b.saldo_final), 0) * 100), 0);
    const dre = (await one<{ d: any }>("select ctb_dre(date '2026-01-01', current_date) d")).d;
    // receita líquida = 1000 - 200; custo 400; despesas = comissão 40 + despesas adm (300 + 80)
    assert.deepEqual([dre.receita, dre.custo, dre.despesa, dre.resultado], [800, 400, 420, -20]);
    const resultadoBalancete = -bal.filter((b) => ["RECEITA", "CUSTO", "DESPESA"].includes(b.tipo)).reduce((s, b) => s + n(b.saldo_final), 0);
    assert.equal(Math.round(resultadoBalancete * 100), Math.round(n(dre.resultado) * 100));
    const rz = await all<{ saldo: string }>("select * from ctb_razao($1,date '2026-01-01',current_date)", [await conta("1.1.02")]);
    const clientes = bal.find((b) => b.codigo === "1.1.02")!;
    assert.equal(n(rz[rz.length - 1].saldo), n(clientes.saldo_final));

    // fluxo de caixa: saldo de hoje = saldo inicial + recebido - pago; títulos abertos entram no vencimento
    const saldo = n((await one<{ s: string }>("select fin_saldo_caixa(current_date) s")).s);
    assert.equal(saldo, 1000 + 300 + 200 - 100); // parcela 1: 300 + 200 conciliado (baixa estornada não conta); compra paga
    const fl = await all<{ dia: string; entradas: string; saidas: string; saldo_acum: string }>("select dia::text,entradas,saidas,saldo_acum from fin_fluxo(current_date,70)");
    assert.equal(fl.length, 70);
    assert.equal(n(fl[0].saidas), 380); // aluguel 300 + luz 80 vencem hoje
    assert.equal(n(fl[30].entradas), 0);
    assert.ok(fl.some((x) => n(x.entradas) === 300)); // parcela 2 reduzida pela devolução
    const comDentro = (await one<{ ok: boolean }>("select vencimento<=current_date+69 ok from fin_titulos where origem='COMISSAO'")).ok;
    assert.equal(n(fl[69].saldo_acum), saldo + 300 - 380 - (comDentro ? 40 : 0));

    // cancelar título sem baixa estorna o lançamento
    await one("select fin_cancelar_titulo((select id from fin_titulos where parceiro='Cia Luz'),'t')", []);
    assert.equal(n((await one<{ n: string }>("select count(*) n from ctb_lancamentos where estorno_de is not null")).n) > 0, true);

    const down = (await readFile("database/migrations/2026-10-30_22_financeiro_contabil.sql", "utf8")).split("-- migrate:down")[1];
    await db.exec(down);
    assert.equal(((await db.query("select to_regclass('fin_titulos') t")).rows[0] as { t: unknown }).t, null);
    void hoje;
  } finally { await db.close(); }
});

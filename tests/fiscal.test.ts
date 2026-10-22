import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { criarProvedor, dvChave, montarChave, validarChaveNfe } from "../lib/fiscal/provedor";
import { gerarBlocoK } from "../lib/fiscal/sped-k";
import { conferirFiscalEntrada, extrairFiscalNfe } from "../lib/fiscal/entrada";

test("chave de acesso: dígito verificador módulo 11 e validação", () => {
  const chave = montarChave({ uf: "SP", data: new Date(Date.UTC(2026, 9, 5)), cnpj: "11222333000181", serie: 1, numero: 123, codigo: 456 });
  assert.equal(chave.length, 44);
  assert.equal(chave.slice(0, 6), "352610");
  assert.ok(validarChaveNfe(chave));
  assert.ok(!validarChaveNfe(chave.slice(0, 43) + ((Number(chave[43]) + 1) % 10)));
  assert.equal(dvChave("0".repeat(43)), 0);
  assert.throws(() => montarChave({ uf: "XX", data: new Date(), cnpj: "11222333000181", serie: 1, numero: 1, codigo: 1 }), /UF inválida/);
});

test("provedor: simulado só em homologação; adaptador real não configurado falha explícito", async () => {
  assert.throws(() => criarProvedor("SIMULADO", "PRODUCAO", () => 1), /homologação/);
  assert.throws(() => criarProvedor("EXTERNO", "HOMOLOGACAO", () => 1), /não está configurado/);
  let n = 100;
  const p = criarProvedor("SIMULADO", "HOMOLOGACAO", () => ++n);
  const r = await p.emitir({ id: "1", tipo: "NFE", total: 10, payload: { emitente: { uf: "SP", cnpj: "11222333000181" }, itens: [{}] } });
  assert.equal(r.status, "AUTORIZADO");
  if (r.status === "AUTORIZADO") assert.ok(validarChaveNfe(r.chave));
  assert.equal((await p.emitir({ id: "2", tipo: "NFE", total: 0, payload: { emitente: { uf: "SP", cnpj: "11222333000181" }, itens: [] } })).status, "REJEITADO");
  assert.equal((await p.cancelar("123", "justificativa longa o bastante")).ok, false);
});

test("SPED Bloco K: K001/K100/K200/K230/K235/K990 e período sem movimento", () => {
  const txt = gerarBlocoK({ ini: "2026-10-01", fim: "2026-10-31", estoque: [{ codItem: "FINAL", qtd: 18 }],
    ops: [{ docOp: "OF-7", codItem: "SEMI", dtIni: "2026-10-05", dtFin: "2026-10-09", qtdEnc: 18, insumos: [{ data: "2026-10-05", codItem: "RAW", qtd: 60 }] }] });
  const l = txt.trim().split("\r\n");
  assert.deepEqual(l, ["|K001|0|", "|K100|01102026|31102026|", "|K200|31102026|FINAL|18,000|0||", "|K230|05102026|09102026|OF-7|SEMI|18,000|", "|K235|05102026|RAW|60,000||", "|K990|6|"]);
  assert.deepEqual(gerarBlocoK({ ini: "2026-10-01", fim: "2026-10-31", ops: [], estoque: [] }).trim().split("\r\n"), ["|K001|1|", "|K990|2|"]);
  assert.throws(() => gerarBlocoK({ ini: "2026-10-31", fim: "2026-10-01", ops: [], estoque: [] }), /Período/);
  assert.throws(() => gerarBlocoK({ ini: "2026-10-01", fim: "2026-10-31", ops: [], estoque: [{ codItem: "X", qtd: -1 }] }), /negativo/);
});

test("NF-e de entrada: NCM do XML diverge do cadastro fiscal e CFOP inválido são apontados", () => {
  const xml = `<nfeProc><NFe><infNFe><det nItem="1"><prod><cProd>RAW</cProd><NCM>72104900</NCM><CFOP>1101</CFOP></prod></det><det nItem="2"><prod><cProd>NOVO</cProd><NCM>39269090</NCM><CFOP>5101</CFOP></prod></det></infNFe></NFe></nfeProc>`;
  const itens = extrairFiscalNfe(xml);
  assert.equal(itens.length, 2);
  const d = conferirFiscalEntrada(itens, new Map([["RAW", "72104910"]]), new Set(["1101", "2101"]));
  assert.deepEqual(d.map((x) => [x.nItem, x.tipo]), [[1, "NCM_DIVERGE"], [2, "SEM_CADASTRO_FISCAL"], [2, "CFOP_ENTRADA_INVALIDO"]]);
});

const up = async (f: string) => (await readFile(`database/migrations/${f}`, "utf8")).split("-- migrate:down")[0].replace(/create extension if not exists pgcrypto;/gi, "");
test("Postgres: fiscal - regras com vigência, pendências, montagem, estados, apuração (migration 21)", async () => {
  const db = new PGlite();
  try {
    await db.exec((await readFile("database/schema.sql", "utf8")).replace(/create extension if not exists pgcrypto;/gi, ""));
    await db.exec("create table if not exists pcp_capacidades_maquina(id uuid primary key default gen_random_uuid(),processo text,maquina text,turno text);");
    await db.exec(await up("2026-10-21_fundacao_multiempresa.sql"));
    const files = ["2026-10-21_06_engenharia_of.sql", "2026-10-22_09_historico_seguro.sql", "2026-10-22_10_ciclo_industrial.sql", "2026-10-22_13_controle_of.sql", "2026-10-20_crm_comercial.sql", "2026-10-23_14_vendas_comissoes.sql", "2026-10-23_15_vendas_producao.sql", "2026-10-24_16_compras_terceiros.sql", "2026-10-25_17_qualidade_inspecao.sql", "2026-10-26_18_mrp_aps.sql", "2026-10-27_19_expedicao_logistica.sql", "2026-10-28_20_custos_industriais.sql", "2026-10-29_21_fiscal.sql"];
    for (const f of files) { const s = await up(f); await db.exec(s); if (/_10_|_13_|_16_|_17_|_18_|_19_|_20_|_21_/.test(f)) await db.exec(s); }
    const one = async <T extends Record<string, unknown>>(q: string, a: unknown[] = []) => (await db.query<T>(q, a)).rows[0];
    const n = (v: unknown) => Number(v);
    const { id: local } = await one("insert into est_locais(codigo) values('PADRAO') returning id");
    const { id: prod } = await one("insert into est_produtos(codigo,unidade_base,classificacao) values('PAL','UN','ACABADO') returning id");
    const { id: cli } = await one("insert into crm_clientes(razao_social,documento,criado_por,atualizado_por) values('ACME','11222333000181','t','t') returning id");
    const { id: pv } = await one("insert into crm_pedidos_venda(cliente_id,status,total,faturado_valor,criado_por,atualizado_por) values($1,'ATENDIDO',1000,0,'t','t') returning id", [cli]);
    const { id: rem } = await one("insert into exp_remessas(pedido_venda_id,cliente_id,local_id,status,criado_por) values($1,$2,$3,'FECHADA','t') returning id", [pv, cli, local]);
    const payload = { remessa: 1, pedido_venda: 1, pedido_cliente: "PC1", cliente_id: cli, frete: 0, itens: [{ produto: "PAL", descricao: "Pallet", quantidade: 10, preco_unitario: 100, valor: 1000 }] };
    const { id: ev } = await one("insert into exp_eventos_faturamento(remessa_id,payload) values($1,$2) returning id", [rem, JSON.stringify(payload)]);

    // tudo faltando => pendências explícitas
    let doc = await one<{ id: string }>("select fis_montar_nfe($1,'2026-11-10','t') id", [ev]);
    let d = await one<{ status: string; pendencias: string[] }>("select status,pendencias from fis_documentos where id=$1", [doc.id]);
    assert.equal(d.status, "PENDENCIA");
    assert.ok(d.pendencias.some((p) => p.startsWith("EMITENTE")) && d.pendencias.some((p) => p.includes("UF")) && d.pendencias.some((p) => p.includes("PAL: sem NCM")));

    // cadastros
    await db.query("insert into fis_emitente(razao_social,cnpj,ie,uf,regime,atualizado_por) values('Sobral','99888777000166','123','SP','REAL','t')");
    await db.query("update crm_clientes set uf='MG',regime_tributario='REAL' where id=$1", [cli]);
    await db.query("insert into fis_produto_fiscal(produto_id,ncm,origem,atualizado_por) values($1,'73089090',0,'t')", [prod]);
    await db.query("insert into fis_cfop values('6101','Venda interestadual','SAIDA'),('5101','Venda no estado','SAIDA')");
    const ic = (a: number) => JSON.stringify([{ tributo: "ICMS", cst: "00", aliquota: a, reducao_base: 0 }, { tributo: "IPI", cst: "50", aliquota: 5, reducao_base: 0 }]);
    await db.query("insert into fis_regras(descricao,operacao,uf_origem,ncm_prefixo,cfop,tributos,vigencia_inicio,criado_por) values('Interestadual SP->qualquer','VENDA','SP','','6101',$1,'2026-01-01','t')", [ic(12)]);
    // regra mais específica (NCM 7308) vence a genérica
    await db.query("insert into fis_regras(descricao,operacao,uf_origem,uf_destino,ncm_prefixo,cfop,tributos,vigencia_inicio,criado_por) values('Estruturas MG','VENDA','SP','MG','7308','6101',$1,'2026-01-01','t')", [ic(7)]);
    doc = await one("select fis_montar_nfe($1,'2026-11-10','t') id", [ev]);
    d = await one("select status,pendencias,tributos,total from fis_documentos where id=$1", [doc.id]) as never;
    assert.equal((d as any).status, "PRONTO");
    assert.deepEqual([n((d as any).tributos.ICMS), n((d as any).tributos.IPI), n((d as any).total)], [70, 50, 1000]);
    assert.equal((d as any).tributos.IBS, undefined);

    // vigência: nova regra de ICMS a partir de dezembro muda o cálculo sem tocar em código
    await db.query("update fis_regras set vigencia_fim='2026-11-30' where descricao='Estruturas MG'");
    await db.query("insert into fis_regras(descricao,operacao,uf_origem,uf_destino,ncm_prefixo,cfop,tributos,vigencia_inicio,criado_por) values('Estruturas MG nova','VENDA','SP','MG','7308','6101',$1,'2026-12-01','t')", [ic(4)]);
    doc = await one("select fis_montar_nfe($1,'2026-12-05','t') id", [ev]);
    assert.equal(n((await one<{ i: string }>("select tributos->>'ICMS' i from fis_documentos where id=$1", [doc.id])).i), 40);

    // IBS/CBS só entra quando o parâmetro vigente manda; alíquotas vêm da regra
    await db.query("update fis_regras set ibs_cst='000',ibs_classe='000001',ibs_aliquota=0.1,cbs_aliquota=0.9 where descricao='Estruturas MG nova'");
    await db.query("insert into fis_parametros(chave,vigencia_inicio,valor,criado_por) values('IBS_CBS_INFORMAR','2027-01-01','true','t')");
    doc = await one("select fis_montar_nfe($1,'2026-12-05','t') id", [ev]);
    assert.equal((await one<{ i: unknown }>("select tributos->'IBS' i from fis_documentos where id=$1", [doc.id])).i, null);
    doc = await one("select fis_montar_nfe($1,'2027-01-10','t') id", [ev]);
    // sem regra vigente em 2027? a nova regra não tem fim => segue valendo
    const t27 = await one<{ t: any }>("select tributos t from fis_documentos where id=$1", [doc.id]);
    assert.deepEqual([n(t27.t.IBS), n(t27.t.CBS)], [1, 9]);

    // máquina de estados: só retorno do provedor autoriza, com chave válida
    await assert.rejects(one("select fis_mudar_status($1,'AUTORIZADO',null,null,null,null,null,'t')", [doc.id]), /Transição inválida/);
    await one("select fis_mudar_status($1,'ENVIADO',null,null,null,null,null,'t')", [doc.id]);
    await assert.rejects(one("select fis_mudar_status($1,'AUTORIZADO','123','1','P',null,null,'t')", [doc.id]), /44 dígitos/);
    await assert.rejects(one("select fis_montar_nfe($1,'2027-01-10','t')", [ev]), /não pode ser remontado/);
    const chave = montarChave({ uf: "SP", data: new Date(Date.UTC(2027, 0, 10)), cnpj: "99888777000166", serie: 1, numero: 1, codigo: 1 });
    await one("select fis_mudar_status($1,'AUTORIZADO',$2,'1','PROT1',null,null,'t')", [doc.id, chave]);
    assert.equal((await one<{ status: string }>("select status from exp_eventos_faturamento where id=$1", [ev])).status, "ENVIADO");
    await assert.rejects(one("select fis_mudar_status($1,'CANCELADO',null,null,null,'curto',null,'t')", [doc.id]), /justificativa/);

    // apuração: débitos do documento autorizado × créditos lançados
    const comp = (await one<{ c: string }>("select to_char(autorizado_em at time zone 'America/Sao_Paulo','YYYY-MM') c from fis_documentos where id=$1", [doc.id])).c;
    await db.query("insert into fis_creditos(competencia,tributo,valor,origem,criado_por) values($1,'ICMS',15,'NF entrada','t')", [comp]);
    const ap = (await db.query<{ tributo: string; debito: string; credito: string; saldo: string }>("select * from fis_apurar($1)", [comp])).rows;
    const icms = ap.find((x) => x.tributo === "ICMS")!;
    assert.deepEqual([n(icms.debito), n(icms.credito), n(icms.saldo)], [40, 15, 25]);

    // cancelamento com justificativa
    await one("select fis_mudar_status($1,'CANCELADO',null,null,null,'Erro de digitacao no pedido do cliente',null,'t')", [doc.id]);
    assert.equal((await db.query("select * from fis_apurar($1)", [comp])).rows.length, 1); // só crédito restante
    assert.equal((await one<{ status: string }>("select status from exp_eventos_faturamento where id=$1", [ev])).status, "CANCELADO");

    const down = (await readFile("database/migrations/2026-10-29_21_fiscal.sql", "utf8")).split("-- migrate:down")[1];
    await db.exec(down);
    assert.equal(((await db.query("select to_regclass('fis_regras') t")).rows[0] as { t: unknown }).t, null);
  } finally { await db.close(); }
});

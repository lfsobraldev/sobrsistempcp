import {podeOperarProcesso} from '../lib/apontamento';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {enriquecerClientes,consultaIdentidades} from '../lib/clientes-operacionais';
import {lerFiltrosPCP,parametrosPCP,recortePCP} from '../lib/pcp-filters';
test('cliente mestre, código, representante, fallback e filtros combinados em SQL real',async()=>{
 const db=new PGlite();try{
 await db.exec((await readFile('database/schema.sql','utf8')).replace(/create extension if not exists pgcrypto;/gi,''));
 await db.exec("create table pcp_controle_entregas(pedido text primary key,cliente text,representante text,crm_cliente_id uuid,crm_representante_id uuid)");
 await db.exec((await readFile('database/migrations/2026-10-20_crm_comercial.sql','utf8')).replace(/create extension if not exists pgcrypto;/gi,''));
 const up=(await readFile('database/migrations/2026-10-22_12_identidades_operacionais.sql','utf8')).split('-- migrate:down')[0];await db.exec(up);await db.exec(up);
 const cliente=crypto.randomUUID(),rep=crypto.randomUUID(),pg=crypto.randomUUID(),p1=crypto.randomUUID(),p2=crypto.randomUUID();
 await db.query("insert into crm_clientes(id,codigo,razao_social,nome_fantasia,criado_por,atualizado_por) values($1,'C001','Cliente SA','Cliente Fantasia','teste','teste')",[cliente]);
 await db.query("insert into crm_representantes(id,codigo,nome,criado_por,atualizado_por) values($1,'R001','Representante 1','teste','teste')",[rep]);
 await db.query("insert into pcp_programacoes(id,data_programacao,cliente,filtro) values($1,'2026-10-10','Cliente do arquivo','F')",[pg]);
 await db.query("insert into pcp_produtos(id,programacao_id,pedido,descricao,produto,quantidade) values($1,$3,'0001','Produto 1','P1',10),($2,$3,'P2','Produto 2','P2',20)",[p1,p2,pg]);
 await db.query("insert into pcp_controle_entregas(pedido,cliente,crm_cliente_id,crm_representante_id) values('1','Código antigo',$1,$2)",[cliente,rep]);
 const banco={query:async(q:string,args:unknown[]=[]) => (await db.query<Record<string,unknown>>(q,args)).rows};
 const rows=await enriquecerClientes(banco,[{produto_id:p1,pedido:'0001'},{produto_id:p2,pedido:'P2'}]);
 assert.equal(rows[0].clienteNome,'Cliente Fantasia');assert.equal(rows[0].clienteCodigo,'C001');assert.equal(rows[0].representanteNome,'Representante 1');assert.equal(rows[1].clienteNome,'Cliente do arquivo');
 await db.query("update pcp_controle_entregas set crm_cliente_id=null,cliente='C001' where pedido='1'");
 assert.equal((await enriquecerClientes(banco,[{produto_id:p1}]))[0].clienteNome,'Cliente Fantasia');
 const filtros=lerFiltrosPCP(new URLSearchParams({mes:'2026-10',cliente,representante:rep,pedido:'0001',filtro:'F'}));assert.deepEqual(lerFiltrosPCP(new URLSearchParams(parametrosPCP(filtros))),filtros);
 const r=recortePCP(filtros);assert.equal((await db.query(`select p.id from pcp_produtos p join pcp_programacoes g on g.id=p.programacao_id where ${r.sql}`,r.values)).rows.length,1);
 const errado=recortePCP({...filtros,clientes:[crypto.randomUUID()]});assert.equal((await db.query(`select p.id from pcp_produtos p join pcp_programacoes g on g.id=p.programacao_id where ${errado.sql}`,errado.values)).rows.length,0);
 await db.exec('drop view pcp_clientes_operacionais');assert.equal((await enriquecerClientes(banco,[{produto_id:p1}]))[0].clienteNome,'Cliente Fantasia');
 await db.exec('drop table pcp_controle_entregas cascade;drop table crm_cliente_representantes cascade;drop table crm_representantes cascade;drop table crm_clientes cascade');
 assert.equal((await enriquecerClientes(banco,[{produto_id:p1}]))[0].clienteNome,'Cliente do arquivo');
 assert.ok(consultaIdentidades(false,false).includes('Cliente não informado'));
 }finally{await db.close();}
});

test('apontador ou líder sem setor não ganha acesso irrestrito',()=>{
 assert.equal(podeOperarProcesso('APONTADOR',[],'CORTE'),false);assert.equal(podeOperarProcesso('LIDER',undefined,'CORTE'),false);assert.equal(podeOperarProcesso('APONTADOR',['CORTE'],'CORTE'),true);assert.equal(podeOperarProcesso('APONTADOR',['CORTE'],'EMBALAGEM'),false);assert.equal(podeOperarProcesso('PCP',[],'CORTE'),true);
});

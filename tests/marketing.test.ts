import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {marketingEntrada,valorEmCentavos} from '../lib/marketing';
test('marketing valida datas, centavos exatos e orçamento',()=>{
 assert.equal(valorEmCentavos('19,99'),1999);assert.equal(valorEmCentavos('0.01'),1);assert.equal(valorEmCentavos('1.001'),null);assert.equal(valorEmCentavos('-10'),null);
 const c={acao:'CRIAR',requestId:crypto.randomUUID(),nome:'Campanha',canal:'DIGITAL',inicio:'2026-10-31',fim:'2026-10-01',orcamentoCentavos:100,responsavel:'Maria'};
 assert.equal(marketingEntrada.safeParse(c).success,false);assert.equal(marketingEntrada.safeParse({...c,fim:'2026-11-01'}).success,true);
});
test('Postgres: campanhas e despesas idempotentes, atribuição exclusiva e auditoria atômica',async()=>{
 const db=new PGlite();try{
 await db.exec('create table crm_oportunidades(id uuid primary key);create table pcp_auditoria_global(ator text,acao text,entidade text,entidade_id text,antes jsonb,depois jsonb)');
 const migration=(await readFile('database/migrations/2026-10-21_07_marketing.sql','utf8')).split('-- migrate:down')[0];await db.exec(migration);await db.exec(migration);
 const action=async(acao:string,data:Record<string,unknown>)=>(await db.query<{id:string}>('select erp_marketing_acao($1,$2::jsonb,$3) id',[acao,JSON.stringify(data),'comercial'])).rows[0].id;
 const payload={requestId:crypto.randomUUID(),nome:'Campanha',canal:'DIGITAL',inicio:'2026-10-01',fim:'2026-10-31',orcamentoCentavos:10000,responsavel:'Maria'};
 const id=await action('CRIAR',payload);assert.equal(await action('CRIAR',payload),id);await assert.rejects(action('CRIAR',{...payload,nome:'Outra'}),/já utilizada/);
 const despesa={id,requestId:crypto.randomUUID(),descricao:'Anúncio',centavos:999,data:'2026-10-21'};
 await assert.rejects(action('DESPESA',despesa),/Ative/);await action('STATUS',{id,status:'ATIVA'});
 await action('DESPESA',despesa);await action('DESPESA',despesa);await assert.rejects(action('DESPESA',{...despesa,centavos:1000}),/já utilizada/);
 assert.equal((await db.query<{n:number}>('select count(*)::int n from erp_marketing_despesas')).rows[0].n,1);
 await assert.rejects(db.exec('update erp_marketing_despesas set centavos=1'),/imutável/);
 const opportunity=crypto.randomUUID();await db.query('insert into crm_oportunidades values($1)',[opportunity]);await action('VINCULAR',{id,oportunidadeId:opportunity});await action('VINCULAR',{id,oportunidadeId:opportunity});
 const second=await action('CRIAR',{...payload,requestId:crypto.randomUUID()});await action('STATUS',{id:second,status:'ATIVA'});await assert.rejects(action('VINCULAR',{id:second,oportunidadeId:opportunity}),/outra campanha/);
 await action('STATUS',{id,status:'ENCERRADA'});await assert.rejects(action('STATUS',{id,status:'ATIVA'}),/inválida/);
 assert.equal((await db.query<{n:number}>("select count(*)::int n from pcp_auditoria_global where acao='DESPESA_CAMPANHA'")).rows[0].n,1);
 }finally{await db.close();}
});

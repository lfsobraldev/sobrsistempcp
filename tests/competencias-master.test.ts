import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {validarUnidadeConsulta} from '../lib/unidades/core';
import {allowedPath} from '../lib/permissions';
import {querySchema} from '../lib/programacao-mensal';
test('unidade da URL não troca fonte operacional; telas mantêm RBAC e estado mensal é enum fechado',()=>{
 assert.throws(()=>validarUnidadeConsulta('SUL',new URLSearchParams('unidade=NORDESTE')),/SEM_PERMISSAO/);
 assert.throws(()=>validarUnidadeConsulta('SUL',new URLSearchParams('unidade=CONSOLIDADO')),/SEM_PERMISSAO/);
 assert.doesNotThrow(()=>validarUnidadeConsulta('SUL',new URLSearchParams('unidade=SUL')));
 assert.equal(allowedPath('COMERCIAL','/pcp/sul'),false);assert.equal(allowedPath('PCP','/pcp/sul'),true);
 assert.equal(querySchema.safeParse({unidade:'SUL',estado:'QUALQUER'}).success,false);
 assert.equal(querySchema.parse({unidade:'SUL'}).estado,'ATIVO');
});
test('Postgres: competência planejada fora do ativo, ativação única, encerramento e auditoria idempotentes',async()=>{
 const db=new PGlite();try{
 await db.exec(`create table pcp_usuarios(id uuid primary key,usuario text,ativo boolean);
 create table pcp_programacoes(id uuid primary key,data_programacao date,filtro text,status text,criado_em timestamptz default now());
 create table pcp_produtos(id uuid primary key,programacao_id uuid,filtro text,pedido text,item text,produto text,descricao text,of text,quantidade numeric);
 insert into pcp_programacoes values('00000000-0000-4000-8000-000000000001','2026-10-20','F0','ATIVA',now());
 insert into pcp_produtos values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','F0','P0','1','0001','Legado','OF0',50);`);
 for(const file of ['2026-10-21_fundacao_multiempresa.sql','2026-10-21_03_programacao_multimes.sql','2026-10-21_04_unidades_globais.sql'])await db.exec((await readFile('database/migrations/'+file,'utf8')).split('-- migrate:down')[0].replace('create extension if not exists pgcrypto;',''));
 await db.exec("update erp_identidade_banco set unidade='SUL',homologado_por='teste',homologado_em=now()");
 const migration=(await readFile('database/migrations/2026-10-21_08_competencias_programacao.sql','utf8')).split('-- migrate:down')[0];await db.exec(migration);await db.exec(migration);
 const sul=(await db.query<{id:string}>("select id from pcp_filiais where codigo='SUL'")).rows[0].id;
 const linha={filtro:'F1',pedido:'P1',item:'1',produto:'0001',descricao:'Porta',of:'OF1',quantidade:20,data:'2026-11-10',chave:'x'};
 await db.query("select pcp_importar_mensal($1,'2026-11-01','novembro.csv','hash','pcp','ACRESCENTAR',$2::jsonb)",[sul,JSON.stringify([linha])]);
 const total=async(status:string)=>(await db.query<{n:string}>("select coalesce(sum(b.quantidade),0) n from pcp_programacao_mensal_efetiva b join pcp_programacao_competencias c using(filial_id,competencia) where c.filial_id=$1 and c.status=$2",[sul,status])).rows[0].n;
 assert.equal(Number(await total('ATIVO')),50);assert.equal(Number(await total('PLANEJADO')),20);
 await db.query("select pcp_transicionar_competencia($1,'2026-11-01','ATIVO','pcp')",[sul]);
 assert.equal(Number(await total('ATIVO')),20);assert.equal(Number(await total('ENCERRADO')),50);
 const audits=async()=>(await db.query<{n:number}>('select count(*)::int n from pcp_auditoria_global')).rows[0].n;
 const antes=await audits();await db.query("select pcp_transicionar_competencia($1,'2026-11-01','ATIVO','pcp')",[sul]);assert.equal(await audits(),antes);
 await assert.rejects(db.query("select pcp_transicionar_competencia($1,'2026-10-01','ATIVO','pcp')",[sul]),/encerrada/);
 await assert.rejects(db.query("select pcp_importar_mensal($1,'2026-10-01','out.csv','hash2','pcp','ACRESCENTAR',$2::jsonb)",[sul,JSON.stringify([linha])]),/encerrada/);
 await assert.rejects(db.query("select pcp_transicionar_competencia($1,'2026-12-01','ATIVO','pcp')",[sul]),/Importe/);
 assert.equal((await db.query<{n:number}>("select count(*)::int n from pcp_programacao_competencias where competencia='2026-12-01'")).rows[0].n,0);
 assert.equal((await db.query<{n:number}>("select count(*)::int n from pcp_programacao_competencias where status='ATIVO'")).rows[0].n,1);
 }finally{await db.close();}
});

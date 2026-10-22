import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {consultaModulo,janelasConsolidadas} from '../lib/unidades/consolidado-modulo';
import {lerFiltrosPCP,parametrosPCP} from '../lib/pcp-filters';
test('paginação do consolidado distribui as duas fontes sem repetir nem omitir registros',()=>{
 assert.deepEqual(janelasConsolidadas([30,70],1),[{offset:0,limit:30},{offset:0,limit:20}]);
 assert.deepEqual(janelasConsolidadas([30,70],2),[{offset:30,limit:0},{offset:20,limit:50}]);
 assert.deepEqual(janelasConsolidadas([30,70],3),[{offset:30,limit:0},{offset:70,limit:0}]);
 const f=lerFiltrosPCP(new URLSearchParams('mes=2026-11&estado=PLANEJADO&filtro=A&filtro=B&pedido=P1'));
 assert.deepEqual(lerFiltrosPCP(new URLSearchParams(parametrosPCP(f))),f);
});
test('arquivamento preserva produtos e eventos, é auditado e idempotente; consolidado usa o recorte real',async()=>{
 const db=new PGlite();try{
 await db.exec(`create table pcp_usuarios(id uuid primary key,usuario text,ativo boolean);create table pcp_programacoes(id uuid primary key,status text,data_programacao date,filtro text);create table pcp_produtos(id uuid primary key,programacao_id uuid references pcp_programacoes(id) on delete cascade,pedido text,filtro text,produto text,descricao text,quantidade numeric,percentual_produto numeric);create table pcp_eventos(id int primary key,descricao text);`);
 await db.exec((await readFile('database/migrations/2026-10-21_fundacao_multiempresa.sql','utf8')).replace('create extension if not exists pgcrypto;',''));
 const up=(await readFile('database/migrations/2026-10-22_09_historico_seguro.sql','utf8')).split('-- migrate:down')[0];await db.exec(up);await db.exec(up);
 const id='00000000-0000-4000-8000-000000000001';await db.query("insert into pcp_programacoes(id,status,data_programacao,filtro) values($1,'ENCERRADA','2026-10-01','A')",[id]);
 await db.query("insert into pcp_produtos values($1,$1,'P1','A','0001','Porta',10,0)",[id]);await db.exec("insert into pcp_eventos values(1,'Original')");
 const consulta=consultaModulo('pcp',new URLSearchParams('mes=2026-10&filtro=A&pedido=P1'));
 assert.equal((await db.query(consulta.sql,consulta.values)).rows.length,1);
 await db.query("select pcp_arquivar_historico('admin')");await db.query("select pcp_arquivar_historico('admin')");
 assert.equal((await db.query(consulta.sql,consulta.values)).rows.length,0);
 assert.equal((await db.query('select * from pcp_produtos')).rows.length,1);assert.equal((await db.query('select * from pcp_eventos')).rows.length,1);
 assert.equal((await db.query('select * from pcp_auditoria_global')).rows.length,1);
 }finally{await db.close();}
});

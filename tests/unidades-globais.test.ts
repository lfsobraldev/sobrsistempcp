import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {assinarUnidade,verificarUnidade,urlDaUnidade,identificarBanco} from '../lib/unidades/core';
import {contextoUnidade,unidadeAtual,canalUnidade} from '../lib/unidades/context';
import {sql,sqlDaUnidade} from '../lib/db';
import {criarTokenRastreioUnidade,verificarTokenRastreioUnidade,criarTokenRastreioPallet,verificarTokenRastreioPallet} from '../lib/pallet-tracking';
import {PGlite} from '@electric-sql/pglite';

test('seleção de unidade é assinada, vinculada ao login e expira',()=>{
 const token=assinarUnidade('ana','SUL','segredo',1000);
 assert.equal(verificarUnidade(token,'ana','segredo',1001),'SUL');
 assert.equal(verificarUnidade(token,'outro','segredo',1001),null);
 assert.equal(verificarUnidade(token,'ana','errado',1001),null);
 assert.equal(verificarUnidade(token+'x','ana','segredo',1001),null);
 assert.equal(verificarUnidade(token,'ana','segredo',13*60*60*1000),null);
 assert.equal(verificarUnidade('SUL','ana','segredo'),null);
});
test('configuração recusa bancos repetidos e exige confirmação de unidade do legado',()=>{
 const sul='postgresql://u:p@sul.neon.tech/erp',ne='postgresql://u:p@nordeste.neon.tech/erp';
 assert.equal(urlDaUnidade('SUL',{DATABASE_URL_SUL:sul,DATABASE_URL_NORDESTE:ne}),sul);
 assert.throws(()=>urlDaUnidade('SUL',{DATABASE_URL_SUL:sul,DATABASE_URL_NORDESTE:sul}),/mesmo banco/);
 assert.throws(()=>urlDaUnidade('NORDESTE',{DATABASE_URL_SUL:sul}),/duas unidades/);
 assert.equal(identificarBanco(sul),identificarBanco('postgresql://outro:senha@sul-pooler.neon.tech/erp?sslmode=require'));
 assert.throws(()=>urlDaUnidade('SUL',{DATABASE_URL:sul,DATABASE_URL_SUL:sul,DATABASE_URL_NORDESTE:ne}),/legados/);
 assert.equal(urlDaUnidade('SUL',{DATABASE_URL:sul,DATABASE_URL_SUL:sul,DATABASE_URL_NORDESTE:ne,ERP_LEGACY_UNIT:'SUL'}),sul);
});
test('requisições simultâneas não compartilham unidade nem conexão; sem contexto falha fechado',async()=>{
 const keys=['ERP_MULTIUNIDADE','DATABASE_URL_SUL','DATABASE_URL_NORDESTE','ERP_LEGACY_UNIT','DATABASE_URL'];const saved=new Map(keys.map(k=>[k,process.env[k]]));
 try{
 process.env.ERP_MULTIUNIDADE='enabled';process.env.DATABASE_URL_SUL='postgresql://u:p@sul.neon.tech/erp';process.env.DATABASE_URL_NORDESTE='postgresql://u:p@nordeste.neon.tech/erp';delete process.env.DATABASE_URL;
 assert.throws(()=>sql(),/UNIDADE_OBRIGATORIA/);
 const results=await Promise.all((['SUL','NORDESTE'] as const).map(unidade=>contextoUnidade.run({unidade,usuario:'teste'},async()=>{
 const antes=sql();await new Promise(r=>setTimeout(r,unidade==='SUL'?10:1));
 assert.equal(sql(),antes);assert.equal(sql(),sqlDaUnidade(unidade));return unidadeAtual();
 })));
 assert.deepEqual(results,['SUL','NORDESTE']);assert.equal(unidadeAtual(),null);
 assert.notEqual(sqlDaUnidade('SUL'),sqlDaUnidade('NORDESTE'));
 assert.equal(canalUnidade('SUL'),'private-sobral-pcp-sul');assert.notEqual(canalUnidade('SUL'),canalUnidade('NORDESTE'));
 }finally{for(const [k,v] of saved){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
test('QR novo vincula unidade e rejeita troca de unidade sem invalidar QR legado',()=>{
 const id='00000000-0000-4000-8000-000000000001';const token=criarTokenRastreioUnidade(id,'NORDESTE','segredo');
 assert.deepEqual(verificarTokenRastreioUnidade(token,'segredo'),{id,unidade:'NORDESTE'});
 assert.equal(verificarTokenRastreioUnidade(token.replace('NORDESTE','SUL'),'segredo'),null);
 assert.equal(verificarTokenRastreioPallet(token,'segredo'),null);
 const antigo=criarTokenRastreioPallet(id,'segredo');assert.equal(verificarTokenRastreioPallet(antigo,'segredo'),id);
 assert.equal(verificarTokenRastreioUnidade(antigo,'segredo'),null);
});
test('todas as APIs operacionais possuem barreira de unidade e exceções são explícitas',async()=>{
 const exceptions=new Set(['me/route.ts','auth/login/route.ts','auth/logout/route.ts','unidades/route.ts','unidades/consolidado/route.ts','pallets/public-tracking/route.ts','expedicao/portal/route.ts','ia/whatsapp/route.ts','admin/migracoes/route.ts','admin/usuarios/route.ts']);
 async function files(dir:string):Promise<string[]>{const rows=await readdir(dir,{withFileTypes:true});return(await Promise.all(rows.map(r=>r.isDirectory()?files(path.join(dir,r.name)):Promise.resolve([path.join(dir,r.name)])))).flat();}
 for(const file of await files('app/api')){if(!file.endsWith('/route.ts'))continue;const relative=file.slice('app/api/'.length);if(exceptions.has(relative))continue;
 const source=await readFile(file,'utf8');assert.match(source,/unidadeHandler/,'API sem isolamento: '+relative);
 assert.doesNotMatch(source,/export async function (GET|POST|PATCH|DELETE|PUT)/,'Handler exportado sem barreira: '+relative);
 }
});
test('identidade do banco não assume unidade, impede troca após homologação e não apaga dados',async()=>{
 const db=new PGlite();try{
 await db.exec(`create table pcp_produtos(id uuid,programacao_id uuid,filtro text,pedido text,item text,produto text,descricao text,of text,quantidade numeric);
 create table pcp_programacoes(id uuid,data_programacao date,filtro text,status text,criado_em timestamptz);
 create table pcp_empresas(id uuid,codigo text);create table pcp_filiais(id uuid,empresa_id uuid,codigo text);
 create table pcp_programacao_lotes(id uuid,filial_id uuid,competencia date,status text,criado_em timestamptz,ordem bigint);
 create table pcp_programacao_mensal_itens(id uuid,lote_id uuid,filtro text,pedido text,item text,produto text,descricao text,of text,quantidade numeric,data date);`);
 const migration=(await readFile('database/migrations/2026-10-21_04_unidades_globais.sql','utf8')).split('-- migrate:down')[0];await db.exec(migration);await db.exec(migration);
 assert.equal((await db.query<{unidade:string|null}>('select unidade from erp_identidade_banco')).rows[0].unidade,null);
 await assert.rejects(db.exec("update erp_identidade_banco set unidade='SUL'"),/operador/);
 await db.exec("update erp_identidade_banco set unidade='NORDESTE',homologado_por='teste',homologado_em=now()");
 await assert.rejects(db.exec("update erp_identidade_banco set unidade='SUL'"),/não pode/);
 await assert.rejects(db.exec('delete from erp_identidade_banco'),/não pode/);
 assert.equal((await db.query<{unidade:string}>('select unidade from erp_identidade_banco')).rows[0].unidade,'NORDESTE');
 }finally{await db.close();}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {parseMigration,readMigrationSources} from '../lib/migration-files';
const clean=(s:string)=>s.replace(/create extension if not exists pgcrypto;/gi,'');
test('catálogo lê SQL legado sem marcador, distingue down conservador e protege caminho',async()=>{
 const old=parseMigration('2026-10-02_teste.sql','create table exemplo(id int);');assert.match(old.up,/create table/);assert.equal(old.reverse,false);
 const novo=parseMigration('2026-10-02_teste.sql','-- migrate:up\nselect 1;\n-- migrate:down\n-- preservar dados');assert.equal(novo.reverse,false);
 assert.throws(()=>parseMigration('../segredo.sql','select 1'),/Nome/);
 const files=await readMigrationSources();assert.equal(files.length,26);for(const f of files){assert.ok(f.up.length);for(const dep of f.dependencies)assert.ok(files.findIndex(x=>x.name===dep)<files.indexOf(f));}
});
test('pacote local: up completo, verificações, histórico, seed idempotente e baseline bloqueado',async()=>{
 const db=new PGlite();try{
 await db.exec(clean(await readFile('docs/banco/00_schema_base.sql','utf8')));await db.exec(await readFile('docs/banco/00_registro.sql','utf8'));
 const manifest=JSON.parse(await readFile('docs/banco/MANIFESTO.json','utf8')) as {migracoes:{arquivo:string;up:string;verificacao:string;baseline:string}[]};
 for(const m of manifest.migracoes){await db.exec(clean(await readFile('docs/banco/'+m.up,'utf8')));const results=await db.exec(await readFile('docs/banco/'+m.verificacao,'utf8'));for(const result of results)for(const row of result.rows as {existe?:boolean;aplicavel?:boolean}[])if('existe' in row&&row.aplicavel!==false)assert.equal(row.existe,true,m.arquivo);}
 assert.equal(Number((await db.query<{n:number}>('select count(*) n from schema_migrations')).rows[0].n),26);
 assert.equal(Number((await db.query<{n:number}>("select count(*) n from schema_migration_events where status='APLICADA'")).rows[0].n),26);
 const seed=await readFile('docs/banco/03_seed_minimo.sql','utf8');await db.exec(seed);await db.exec(seed);assert.equal(Number((await db.query<{n:number}>("select count(*) n from pcp_auditoria_global where acao='SEED_MINIMO'")).rows[0].n),1);
 await db.exec(await readFile('docs/banco/00_precheck.sql','utf8'));
 await assert.rejects(db.exec(await readFile('docs/banco/'+manifest.migracoes[0].up,'utf8')),/já registrado/);await db.exec('rollback');
 await assert.rejects(db.exec(await readFile('docs/banco/'+manifest.migracoes[0].baseline,'utf8')),/não confirmado/);await db.exec('rollback');
 }finally{await db.close();}
});

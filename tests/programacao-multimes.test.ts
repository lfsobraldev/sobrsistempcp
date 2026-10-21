import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ordenarMigracoes } from '../lib/migration-order';
import { PGlite } from '@electric-sql/pglite';
import { mesDaData,moverMes,previaMensal,csvSeguro,querySchema } from '../lib/programacao-mensal';
import { selecionarFiliais } from '../lib/programacao-mensal-service';

test('competência, datas impossíveis, virada do ano e proteção CSV',()=>{
 assert.equal(mesDaData('31/02/2026'),null);
 assert.equal(mesDaData('01/10/2026'),'2026-10-01');
 assert.equal(moverMes('2026-12',1),'2027-01');
 assert.equal(moverMes('2026-01',-1),'2025-12');
 assert.equal(querySchema.safeParse({unidade:'SUL',page:0}).success,false);
 assert.equal(csvSeguro('=HYPERLINK("x")'),'"\'=HYPERLINK(""x"")"');
 assert.throws(()=>selecionarFiliais([{id:'1',codigo:'SUL'}],'CONSOLIDADO'),/SEM_PERMISSAO/);
 assert.deepEqual(selecionarFiliais([{id:'1',codigo:'SUL'},{id:'2',codigo:'NORDESTE'}],'SUL'),['1']);
});

test('prévia reaproveita leitor CSV, preserva códigos e valida duplicações e datas',async()=>{
 const file=new File(['Filtro;Pedido;Item;Produto;Descricao;Quantidade Pecas;Data\nF01;00042;1;0007;Batente;12,5;01/10/2026\nF01;00042;1;0007;Batente;12,5;01/10/2026\nF02;0043;1;008;Porta;-2;31/02/2026'], 'programacao.csv');
 const p=await previaMensal(file,'2026-11');
 assert.equal(p.linhas[0].produto,'0007');assert.equal(p.linhas[0].pedido,'00042');
 assert.equal(p.linhas[0].quantidade,12.5);assert.equal(p.mesSugerido,'2026-10');
 assert.ok(p.erros.some(e=>e.mensagem.includes('repetida')));
 assert.ok(p.erros.some(e=>e.mensagem.includes('Data inválida')));
 assert.equal(p.avisos.length,2);
});

test('Postgres: idempotência, substituição reversível, isolamento e auditoria atômica',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create table pcp_usuarios(id uuid primary key,usuario text,ativo boolean);
 create table pcp_programacoes(id uuid primary key,data_programacao date,filtro text,status text,criado_em timestamptz default now());
 create table pcp_produtos(id uuid primary key,programacao_id uuid,filtro text,pedido text,item text,produto text,descricao text,of text,quantidade numeric);
 insert into pcp_programacoes values('00000000-0000-4000-8000-000000000001','2026-09-20','F0','ATIVA',now());
 insert into pcp_produtos values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','F0','P0','1','0001','Legado','OF0',50);`);
 const fundacao=(await readFile('database/migrations/2026-10-21_fundacao_multiempresa.sql','utf8')).replace('create extension if not exists pgcrypto;','');
 await db.exec(fundacao);
 const migration=await readFile('database/migrations/2026-10-21_03_programacao_multimes.sql','utf8');
 const [up,down]=migration.split('-- migrate:down');await db.exec(up);await db.exec(up);
 const fs=await db.query<{id:string;codigo:string}>('select id,codigo from pcp_filiais');
 const sul=fs.rows.find(f=>f.codigo==='SUL')!.id,ne=fs.rows.find(f=>f.codigo==='NORDESTE')!.id;
 const linha={filtro:'F1',pedido:'P1',item:'1',produto:'0001',descricao:'Porta',of:'OF1',quantidade:10,data:'2026-10-10',chave:'x'};
 async function importar(filial:string,mes:string,hash:string,modo='ACRESCENTAR',qtd=10){return (await db.query<{r:{id:string;repetido:boolean;linhas:number}}>('select pcp_importar_mensal($1,$2,$3,$4,$5,$6,$7::jsonb) as r',[filial,mes,'teste.csv',hash,'teste',modo,JSON.stringify([{...linha,quantidade:qtd}])])).rows[0].r;}
 const a=await importar(sul,'2026-10-01','hash1');assert.equal(a.linhas,1);
 assert.equal((await importar(sul,'2026-10-01','hash1')).repetido,true);
 assert.equal((await importar(sul,'2026-10-01','hash2')).linhas,0);
 const b=await importar(sul,'2026-10-01','hash3','SUBSTITUIR',99);
 await importar(ne,'2026-10-01','hash1');await importar(sul,'2026-11-01','hash1');
 const total=async(f:string,m:string)=>(await db.query<{n:number}>('select coalesce(sum(quantidade),0)::int as n from pcp_programacao_mensal_efetiva where filial_id=$1 and competencia=$2',[f,m])).rows[0].n;
 assert.equal(await total(sul,'2026-10-01'),99);assert.equal(await total(ne,'2026-10-01'),10);assert.equal(await total(sul,'2026-11-01'),10);assert.equal(await total(sul,'2026-09-01'),50);
 await assert.rejects(db.query('select pcp_desfazer_mensal($1,$2)',[a.id,'teste']),/mais recentes/);
 await db.query('select pcp_desfazer_mensal($1,$2)',[b.id,'teste']);assert.equal(await total(sul,'2026-10-01'),10);
 await assert.rejects(db.exec("update pcp_auditoria_global set ator='outro'"),/append-only/);
 // Uma falha na auditoria deve reverter lote e linhas na mesma transação.
 await db.exec(`create function falha_auditoria_teste() returns trigger language plpgsql as $$begin raise exception 'falha auditoria'; end$$;
 create trigger falha before insert on pcp_auditoria_global for each row execute function falha_auditoria_teste();`);
 await assert.rejects(importar(sul,'2026-12-01','falha'),/falha auditoria/);
 assert.equal((await db.query<{n:number}>("select count(*)::int as n from pcp_programacao_lotes where hash='falha'")).rows[0].n,0);
 await db.exec('drop trigger falha on pcp_auditoria_global');
 await db.exec(down);assert.equal(await total(sul,'2026-09-01'),50);
 assert.equal((await db.query<{n:number}>('select count(*)::int as n from pcp_produtos')).rows[0].n,1);
 }finally{await db.close();}
});

 test('catálogo respeita fundação antes da migração 03 e recusa ciclos',()=>{
 const files=[{name:'03'},{name:'fundacao'}];
 assert.deepEqual(ordenarMigracoes(files,new Map([['03',['fundacao']]])).map(f=>f.name),['fundacao','03']);
 assert.throws(()=>ordenarMigracoes(files,new Map([['03',['fundacao']],['fundacao',['03']]])),/circular/);
 assert.throws(()=>ordenarMigracoes(files,new Map([['03',['ausente']]])),/não encontrada/);
 });

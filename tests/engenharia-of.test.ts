import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {MRP_QUERY} from '../lib/mrp-query';
import {engenhariaEntrada,ofEntrada} from '../lib/engenharia';
test('contratos recusam componente repetido, quantidade inválida e data impossível',()=>{
 const id='00000000-0000-4000-8000-000000000001';
 assert.equal(ofEntrada.safeParse({acao:'CRIAR',origemId:id,estruturaId:id,prazo:'2026-02-31'}).success,false);
 const item={componente_id:id,quantidade:1,perda_percentual:0};
 assert.equal(engenhariaEntrada.safeParse({acao:'CRIAR_ESTRUTURA',produtoId:id,requestId:id,itens:[item,item]}).success,false);
 assert.equal(engenhariaEntrada.safeParse({acao:'CLASSIFICAR',produtoId:id,classificacao:'PORTA'}).success,false);
});
test('Postgres: BOM multinível, OF idempotente, bloqueios de apontamento, snapshot e conclusão auditada',async()=>{
 const db=new PGlite();try{
 await db.exec(`create table pcp_usuarios(id uuid primary key,usuario text,ativo boolean);
 create table pcp_programacoes(id uuid primary key,status text);
 create table pcp_produtos(id uuid primary key,programacao_id uuid references pcp_programacoes(id),produto text,pedido text,quantidade numeric);
 create table pcp_operacoes(id uuid primary key,produto_id uuid references pcp_produtos(id),status text,quantidade_planejada numeric,quantidade_produzida numeric default 0,quantidade_refugo numeric default 0);
 create table pcp_controle_entregas(pedido text primary key,medicao_obrigatoria boolean);
 create table pcp_medicao_revisoes(pedido text,versao int,status text);`);
 await db.exec((await readFile('database/migrations/2026-10-21_fundacao_multiempresa.sql','utf8')).replace('create extension if not exists pgcrypto;',''));
 const up=(await readFile('database/migrations/2026-10-21_06_engenharia_of.sql','utf8')).split('-- migrate:down')[0];await db.exec(up);await db.exec(up);
 const ins=async(code:string,category:string)=>{return (await db.query<{id:string}>("insert into est_produtos(codigo,descricao,unidade_base,classificacao) values($1,$1,'UN',$2) returning id",[code,category])).rows[0].id;};
 const final=await ins('0001','ACABADO'),semi=await ins('0002','SEMIACABADO'),insumo=await ins('0003','INSUMO');
 const criar=async(root:string,component:string,q:number,key=crypto.randomUUID())=>(await db.query<{id:string}>('select erp_criar_estrutura($1,$2::jsonb,$3,$4) id',[root,JSON.stringify([{componente_id:component,quantidade:q,perda_percentual:0}]),key,'engenheiro'])).rows[0].id;
 const eSemi=await criar(semi,insumo,3);await db.query('select erp_aprovar_estrutura($1,$2)',[eSemi,'gerente']);
 const key=crypto.randomUUID(),eFinal=await criar(final,semi,2,key);
 assert.equal(await criar(final,semi,2,key),eFinal);
 await assert.rejects(criar(final,semi,4,key),/outros dados/);
 await db.query('select erp_aprovar_estrutura($1,$2)',[eFinal,'gerente']);
 await assert.rejects(db.query('update erp_estrutura_itens set quantidade=99 where estrutura_id=$1',[eFinal]),/imutáveis/);
 const needs=(await db.query<{produto_id:string;necessidade:string;ciclo:boolean}>('select * from erp_explodir_estrutura($1,10)',[eFinal])).rows;
 assert.equal(needs.length,1);assert.equal(needs[0].produto_id,insumo);assert.equal(Number(needs[0].necessidade),60);assert.equal(needs[0].ciclo,false);
 const circular=await criar(insumo,final,1).catch(()=>null);assert.equal(circular,null); // Insumo não pode ser raiz de estrutura produtiva.
 await db.query("update est_produtos set classificacao='SEMIACABADO' where id=$1",[insumo]);
 const eCiclo=await criar(insumo,final,1);await assert.rejects(db.query('select erp_aprovar_estrutura($1,$2)',[eCiclo,'gerente']),/cíclica/);
 const pg=crypto.randomUUID(),origem=crypto.randomUUID(),op=crypto.randomUUID();
 await db.query("insert into pcp_programacoes values($1,'ATIVA')",[pg]);await db.query("insert into pcp_produtos values($1,$2,'0001','PED1',10)",[origem,pg]);await db.query("insert into pcp_operacoes values($1,$2,'LIBERADA',10,0,0)",[op,origem]);
 const of=(await db.query<{id:string}>("select erp_criar_of($1,$2,'2026-11-01','pcp') id",[origem,eFinal])).rows[0].id;
 assert.equal((await db.query<{id:string}>("select erp_criar_of($1,$2,'2026-11-01','pcp') id",[origem,eFinal])).rows[0].id,of);
 await assert.rejects(db.query("update pcp_operacoes set status='EM_ANDAMENTO' where id=$1",[op]),/Libere/);
 await db.exec("insert into pcp_controle_entregas values('PED1',true)");
 await assert.rejects(db.query("select erp_transicionar_of($1,'LIBERAR','pcp')",[of]),/Medição/);
 await db.exec("insert into pcp_medicao_revisoes values('PED1',1,'APROVADA_PARA_PRODUCAO')");
 await db.query("select erp_transicionar_of($1,'LIBERAR','pcp')",[of]);
 assert.equal(Number((await db.query<{necessidade:string}>('select necessidade from erp_of_materiais where of_id=$1',[of])).rows[0].necessidade),60);
 await assert.rejects(db.query('update erp_of_materiais set necessidade=1 where of_id=$1',[of]),/imutáveis/);
 // Consulta real considera consumo e reserva da OF sem contar novamente o material já atendido.
 const local=(await db.query<{id:string}>("insert into est_locais(codigo) values('ALM') returning id")).rows[0].id;
 await db.query('insert into est_saldos(produto_id,local_id,fisico,reservado) values($1,$2,50,20)',[insumo,local]);
 const numero=(await db.query<{numero:number}>('select numero from erp_ordens_fabricacao where id=$1',[of])).rows[0].numero;
 const mov=async(tipo:string,q:number,baixa=false)=>db.query("insert into est_movimentos(tipo,produto_id,local_origem_id,quantidade_base,quantidade_informada,unidade_informada,of,usuario,baixa_reserva) values($1,$2,$3,$4,$4,'UN',$5,'almox', $6)",[tipo,insumo,local,q,'OF-'+numero,baixa]);
 await mov('RESERVA',20);
 let mrp=(await db.query<{quantidade:string;disponivel:string;necessidade_liquida:string}>(MRP_QUERY,[0])).rows[0];
 assert.equal(Number(mrp.quantidade),60);assert.equal(Number(mrp.disponivel),50);assert.equal(Number(mrp.necessidade_liquida),10);
 await mov('SAIDA',10,true);await db.query('update est_saldos set fisico=40,reservado=10 where produto_id=$1',[insumo]);
 mrp=(await db.query<{quantidade:string;disponivel:string;necessidade_liquida:string}>(MRP_QUERY,[0])).rows[0];
 assert.equal(Number(mrp.quantidade),50);assert.equal(Number(mrp.disponivel),40);assert.equal(Number(mrp.necessidade_liquida),10);

 // Nova revisão do semiacabado não reescreve a necessidade já congelada na OF.
 const nova=await criar(semi,insumo,9);await db.query('select erp_aprovar_estrutura($1,$2)',[nova,'gerente']);
 assert.equal(Number((await db.query<{necessidade:string}>('select necessidade from erp_of_materiais where of_id=$1',[of])).rows[0].necessidade),60);
 await assert.rejects(db.query("select erp_transicionar_of($1,'CONCLUIR','pcp')",[of]),/pendentes/);
 await db.query("update pcp_operacoes set status='CONCLUIDA',quantidade_produzida=10 where id=$1",[op]);
 await db.query("select erp_transicionar_of($1,'CONCLUIR','pcp')",[of]);
 await assert.rejects(db.query('update pcp_operacoes set quantidade_produzida=9 where id=$1',[op]),/Libere/);
 assert.equal((await db.query<{status:string}>('select status from erp_ordens_fabricacao where id=$1',[of])).rows[0].status,'CONCLUIDA');
 assert.equal(Number((await db.query<{quantidade:string}>('select quantidade from pcp_produtos where id=$1',[origem])).rows[0].quantidade),10);
 assert.equal((await db.query<{n:number}>("select count(*)::int n from pcp_auditoria_global where entidade='ORDEM_FABRICACAO'")).rows[0].n,3);
 }finally{await db.close();}
});

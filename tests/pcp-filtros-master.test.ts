import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {lerFiltrosPCP,parametrosPCP,recortePCP} from '../lib/pcp-filters';
import {hojeISO} from '../lib/carteira';
import {validarAcao} from '../lib/apontamento';
import {addDiasUteis} from '../lib/pcp-planejamento';
test('datas industriais não viram mês à meia-noite UTC; virada de ano/semana preserva dias úteis',()=>{
 assert.equal(hojeISO(new Date('2026-11-01T01:30:00Z')),'2026-10-31');assert.equal(hojeISO(new Date('2026-11-01T03:00:00Z')),'2026-11-01');
 assert.equal(addDiasUteis('2026-12-31',2),'2027-01-04');
 const op={status:'LIBERADA',quantidadePlanejada:10,quantidadeProduzida:0.1,quantidadeRefugo:0};
 assert.equal(validarAcao(op,'SOMAR',0.2).ok,true);assert.equal(validarAcao(op,'SOMAR',0.0001).ok,false);assert.equal(validarAcao(op,'SOMAR',-0.101).ok,false);
});
test('contrato de filtro valida UUID e mês, preserva múltiplos valores na URL',()=>{
 assert.throws(()=>lerFiltrosPCP(new URLSearchParams('mes=2026-13')));assert.throws(()=>lerFiltrosPCP(new URLSearchParams('programacaoId=invalido')));
 const f=lerFiltrosPCP(new URLSearchParams('mes=TODOS&filtro=B&filtro=A&filtro=A&pedido=123'));
 assert.deepEqual(lerFiltrosPCP(new URLSearchParams(parametrosPCP(f))),f);assert.deepEqual(f.filtros,['A','B']);
});
test('Postgres: recorte de mês/filtros/pedidos alcança datas, cartões e operações, sem prender no último filtro',async()=>{
 const db=new PGlite();try{
 await db.exec(`create table pcp_programacoes(id uuid primary key,filtro text,status text,data_programacao date);
 create table pcp_produtos(id uuid primary key,programacao_id uuid,filtro text,pedido text,quantidade numeric);
 create table pcp_operacoes(produto_id uuid,quantidade_planejada numeric);
 insert into pcp_programacoes values('00000000-0000-4000-8000-000000000001','A','ATIVA','2026-10-01'),('00000000-0000-4000-8000-000000000002','B','ENCERRADA','2026-10-20'),('00000000-0000-4000-8000-000000000003','A','ENCERRADA','2026-09-30');
 insert into pcp_produtos values('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','A','P1',10),('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','B','P2',20),('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000003','A','P1',30);
 insert into pcp_operacoes select id,quantidade from pcp_produtos;`);
 const read=async(search:string)=>{const r=recortePCP(lerFiltrosPCP(new URLSearchParams(search)));return (await db.query<{datas:number;quantidade:string;operacoes:string}>(`select count(distinct g.data_programacao)::int datas,sum(p.quantidade) quantidade,sum(o.quantidade_planejada) operacoes from pcp_produtos p join pcp_programacoes g on g.id=p.programacao_id join pcp_operacoes o on o.produto_id=p.id where ${r.sql}`,r.values)).rows[0];};
 const outubro=await read('mes=2026-10');assert.equal(outubro.datas,2);assert.equal(Number(outubro.quantidade),30);assert.equal(Number(outubro.operacoes),30);
 assert.equal(Number((await read('mes=2026-10&filtro=B&pedido=P2')).quantidade),20);
 assert.equal(Number((await read('mes=2026-10&filtro=A&filtro=B')).quantidade),30);
 assert.equal(Number((await read('mes=TODOS&pedido=P1')).quantidade),40);
 assert.equal(Number((await read('mes=ATIVO')).quantidade),10);
 assert.equal(Number((await read('programacaoId=00000000-0000-4000-8000-000000000002')).quantidade),20);
 assert.equal((await read('mes=2026-10&filtro=B&pedido=P1')).datas,0);
 }finally{await db.close();}
});

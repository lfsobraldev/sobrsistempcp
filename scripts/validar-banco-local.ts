import {PGlite} from '@electric-sql/pglite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {readMigrationSources} from '../lib/migration-files';
// Intencionalmente sem import de db, migration-service, dotenv, Neon ou configuração de conexão.
const localSql=(s:string)=>s.replace(/create extension if not exists pgcrypto;/gi,'');
async function main(){
 const sources=await readMigrationSources(),base=localSql(await readFile('database/schema.sql','utf8'));
 const resultados=[];
 for(const legado of [false,true]){
  const db=new PGlite();const passos:{arquivo:string;ok:boolean;erro?:string}[]=[];
  try{
   await db.exec(base);passos.push({arquivo:'database/schema.sql (baseline obrigatório)',ok:true});
   if(legado){await db.exec(`insert into pcp_usuarios(usuario,nome,senha_hash,perfil) values('LOCAL_TESTE','Local descartável','NAO_E_CREDENCIAL','PCP');
insert into pcp_programacoes(id,pedido,cliente,filtro,data_programacao,status) values('10000000-0000-4000-8000-000000000001','P-LEGADO','Cliente legado','F1','2026-09-30','ENCERRADA');
insert into pcp_produtos(id,programacao_id,pedido,produto,descricao,quantidade) values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','P-LEGADO','LEGADO','Item legado',12.345);
insert into pcp_operacoes(produto_id,processo,sequencia,quantidade_planejada) values('20000000-0000-4000-8000-000000000001','CORTE',1,12.345);`);}
   for(const m of sources){try{await db.exec(localSql(m.up));passos.push({arquivo:m.name,ok:true});}catch(e){passos.push({arquivo:m.name,ok:false,erro:e instanceof Error?e.message:String(e)});throw e;}}
   const preservado=!legado||(await db.query<{quantidade:string;cliente:string}>(`select p.quantidade,g.cliente from pcp_produtos p join pcp_programacoes g on g.id=p.programacao_id where p.pedido='P-LEGADO'`)).rows.some(r=>Number(r.quantidade)===12.345&&r.cliente==='Cliente legado');
   if(!preservado)throw new Error('Dados legados não preservados.');
   // Reaplicação mede idempotência da sequência completa, sem apagar dados.
   for(const m of sources)await db.exec(localSql(m.up));
   resultados.push({cenario:legado?'legado_sintetico':'vazio_com_baseline',ok:true,preservado,passos,reaplicacao:true});
  }catch(e){resultados.push({cenario:legado?'legado_sintetico':'vazio_com_baseline',ok:false,passos,erro:e instanceof Error?e.message:String(e)});}finally{await db.close();}
 }
 await mkdir('docs/banco',{recursive:true});
 await writeFile('docs/banco/VALIDACAO_LOCAL.json',JSON.stringify({data:'2026-10-22',motor:'PGlite PostgreSQL local em memória; destruído com close()',bancoRemotoAcessado:false,limites:['pgcrypto omitida apenas no teste; gen_random_uuid nativo','baseline schema.sql obrigatório; migrações incrementais não substituem instalação inicial','legado sintético não é cópia do banco real','teste não comprova concorrência multi-conexão, câmera, RLS/provedor ou performance Neon'],resultados},null,2)+'\n');
 console.log(JSON.stringify(resultados.map(({cenario,ok,erro,...r})=>({cenario,ok,erro,passos:r.passos.length})),null,2));
 if(resultados.some(r=>!r.ok))process.exitCode=1;
}
void main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});

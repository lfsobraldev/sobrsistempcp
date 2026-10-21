import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {salvarUsuarioSchema,hashSenha} from '../lib/unidades/users';
import {scryptSync} from 'node:crypto';
const entrada={usuario:'lider.teste',nome:'Líder Teste',perfil:'LIDER_ENTREGAS' as const,ativo:true,senha:'senha-teste-123456',acessos:[{unidade:'SUL',turno:'A',etapas:['PREPARACAO']}]};
test('cadastro central valida senha, setores, unidade e edição concorrente',()=>{
 assert.equal(salvarUsuarioSchema.safeParse(entrada).success,true);
 assert.equal(salvarUsuarioSchema.safeParse({...entrada,senha:undefined}).success,false);
 assert.equal(salvarUsuarioSchema.safeParse({...entrada,acessos:[{...entrada.acessos[0],etapas:[]}]}).success,false);
 assert.equal(salvarUsuarioSchema.safeParse({...entrada,acessos:[entrada.acessos[0],entrada.acessos[0]]}).success,false);
 assert.equal(salvarUsuarioSchema.safeParse({...entrada,acessos:[{...entrada.acessos[0],etapas:['PREPARACAO','PREPARACAO']}]}).success,false);
 const [tipo,salt,hash]=hashSenha(entrada.senha).split('$');assert.equal(tipo,'scrypt');assert.equal(scryptSync(entrada.senha,salt,64).toString('hex'),hash);
});
test('Postgres: conta, grants e auditoria são atômicos; revogação remove acesso e não registra senha',async()=>{
 const db=new PGlite();try{
 await db.exec(`create table pcp_usuarios(id uuid primary key default gen_random_uuid(),usuario varchar(80) not null unique,nome text not null,senha_hash text not null,perfil text not null,ativo boolean default true,criado_por text,criado_em timestamptz default now(),atualizado_em timestamptz default now());`);
 await db.exec((await readFile('database/migrations/2026-10-21_fundacao_multiempresa.sql','utf8')).replace('create extension if not exists pgcrypto;',''));
 await db.exec("insert into pcp_empresas(codigo,razao_social) values('EMPRESA','Empresa');insert into pcp_filiais(empresa_id,codigo,nome) select id,'SUL','Sul' from pcp_empresas;insert into pcp_filiais(empresa_id,codigo,nome) select id,'NORDESTE','Nordeste' from pcp_empresas;");
 const up=(await readFile('database/migrations/2026-10-21_05_acessos_centrais.sql','utf8')).split('-- migrate:down')[0];await db.exec(up);await db.exec(up);
 const dados=salvarUsuarioSchema.parse(entrada);const {senha,...payload}=dados;
 const [r]=(await db.query<{id:string}>("select erp_salvar_usuario(null,$1::jsonb,$2,'admin',null) id",[JSON.stringify(payload),hashSenha(senha!)])).rows;
 assert.ok(r.id);
 const grants=await db.query<{codigo:string}>('select f.codigo from pcp_usuario_filiais uf join pcp_filiais f on f.id=uf.filial_id');assert.deepEqual(grants.rows.map(r=>r.codigo),['SUL']);
 assert.equal((await db.query<{n:number}>('select count(*)::int n from pcp_lider_unidade_etapas')).rows[0].n,1);
 const versao=(await db.query<{v:string}>(`select to_char(atualizado_em at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') v from pcp_usuarios where id=$1`,[r.id])).rows[0].v;
 await assert.rejects(db.query("select erp_salvar_usuario($1,$2::jsonb,null,'admin','2000-01-01')",[r.id,JSON.stringify(payload)]),/Versão/);
 assert.equal((await db.query<{n:number}>('select count(*)::int n from pcp_usuario_filiais')).rows[0].n,1);
 await db.query("select erp_salvar_usuario($1,$2::jsonb,null,'admin',$3::timestamptz)",[r.id,JSON.stringify({...payload,acessos:[],ativo:false}),versao]);
 assert.equal((await db.query<{n:number}>('select count(*)::int n from pcp_usuario_filiais')).rows[0].n,0);
 assert.equal((await db.query<{n:number}>('select count(*)::int n from pcp_lider_unidade_etapas')).rows[0].n,0);
 assert.equal((await db.query<{ativo:boolean}>('select ativo from pcp_usuarios')).rows[0].ativo,false);
 const audit=JSON.stringify((await db.query('select antes,depois from pcp_auditoria_global')).rows);assert.ok(!audit.includes('scrypt$'));assert.ok(!audit.includes(entrada.senha));
 // Grants inválidos devem reverter também a criação da conta.
 await db.exec("update pcp_filiais set ativo=false where codigo='NORDESTE'");
 await assert.rejects(db.query("select erp_salvar_usuario(null,$1::jsonb,'hash','admin',null)",[JSON.stringify({...payload,usuario:'outro',acessos:[{unidade:'NORDESTE',etapas:['PREPARACAO'],turno:'A'}]})]),/filial ativa/);
 assert.equal((await db.query<{n:number}>("select count(*)::int n from pcp_usuarios where usuario='outro'")).rows[0].n,0);
 }finally{await db.close();}
});

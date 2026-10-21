import { multiAtiva } from "@/lib/unidades/core";
import { unidadeHandler } from "@/lib/unidades/handler";
import {NextResponse} from "next/server";
import crypto from "node:crypto";
import {sql} from "@/lib/db";
import {requireRoles} from "@/lib/auth";
export const runtime="nodejs";
const ETAPAS=["PREPARACAO","COLAGEM_PORTAS","ESQUADRIAS_BORDAS","RECOBRIDORA_PERFIL","USINAGEM_2","LUSTRACAO","CNC","USINAGEM","PLASTIFICADORA","PLASTIFICADORA_PORTAS","EMBALAGEM","EXPEDICAO"];
async function setup(){
 if(multiAtiva())throw new Error("Gerencie contas e setores em Usuários e Unidades, no menu de administração. Nenhum login foi alterado nesta tela.");
 const db=sql();
 await db`create table if not exists pcp_lider_etapa_acessos(usuario varchar(100) not null,etapa varchar(50) not null,primary key(usuario,etapa))`;
 await db`alter table pcp_lider_etapa_acessos add column if not exists turno varchar(1) not null default 'A'`;
 await db`alter table pcp_usuarios drop constraint if exists ck_pcp_usuarios_perfil`;
 await db`alter table pcp_usuarios add constraint ck_pcp_usuarios_perfil check(perfil in ('PCP','GERENTE','ENCARREGADO','LIDER','APONTADOR','QUALIDADE','COMERCIAL','LOGISTICA','LIDER_ENTREGAS'))`;
 return db;
}
function parse(body:any,creating:boolean){
 const usuario=String(body.usuario||"").trim().toLowerCase();
 const nome=String(body.nome||"").trim();
 const senha=String(body.senha||"");
 const turno=String(body.turno||"A").toUpperCase();
 const setores=Array.isArray(body.setores)?body.setores.map(String).map((x:string)=>x.toUpperCase()):body.etapa?[String(body.etapa).toUpperCase()]:[];
 const validos=[...new Set(setores)] as string[];
 if(!/^[a-z0-9._-]{3,80}$/.test(usuario)||!nome||nome.length>150||!["A","B"].includes(turno)||!validos.length||validos.some(s=>!ETAPAS.includes(s))||senha&&(senha.length<12)||creating&&senha.length<12)throw Error("Informe usuário, nome, turno, setores e senha com no mínimo 12 caracteres.");
 return {usuario,nome,senha,turno,setores:validos};
}
function hash(senha:string){const salt=crypto.randomBytes(16).toString("hex");return "scrypt$"+salt+"$"+crypto.scryptSync(senha,salt,64).toString("hex")}
async function unidadeGET(){
 try{await requireRoles(["PCP"]);const db=await setup();
 const rows=await db`select u.usuario,u.nome,u.ativo,a.etapa,a.turno from pcp_usuarios u left join pcp_lider_etapa_acessos a on a.usuario=u.usuario where u.perfil='LIDER_ENTREGAS' order by u.nome,a.etapa`;
 const mapa=new Map<string,{usuario:string;nome:string;ativo:boolean;turno:string;setores:string[]}>();
 for(const row of rows){const usuario=String(row.usuario);if(!mapa.has(usuario))mapa.set(usuario,{usuario,nome:String(row.nome),ativo:Boolean(row.ativo),turno:String(row.turno||"A"),setores:[]});if(row.etapa)mapa.get(usuario)!.setores.push(String(row.etapa))}
 return NextResponse.json({usuarios:[...mapa.values()],setores:ETAPAS},{headers:{"Cache-Control":"no-store"}});
 }catch(e:any){return NextResponse.json({error:e?.message||"Falha ao carregar líderes"},{status:403})}
}
async function unidadePOST(req:Request){
 try{const admin=await requireRoles(["PCP"]);const b=await req.json();const dados=parse(b,true);const db=await setup();
 const existe=await db`select usuario from pcp_usuarios where lower(usuario)=lower(${dados.usuario}) limit 1`;
 if(existe.length)return NextResponse.json({error:"Usuário já cadastrado. Abra a conta para editar."},{status:409});
 await db`insert into pcp_usuarios(usuario,nome,senha_hash,perfil,ativo,criado_por) values(${dados.usuario},${dados.nome},${hash(dados.senha)},'LIDER_ENTREGAS',true,${admin.usuario})`;
 for(const etapa of dados.setores)await db`insert into pcp_lider_etapa_acessos(usuario,etapa,turno) values(${dados.usuario},${etapa},${dados.turno})`;
 return NextResponse.json({ok:true,criados:1});
 }catch(e:any){return NextResponse.json({error:e?.message||"Falha ao cadastrar"},{status:400})}
}
async function unidadePUT(req:Request){
 try{await requireRoles(["PCP"]);const b=await req.json(),dados=parse(b,false),ativo=b.ativo!==false,db=await setup();
 const atual=await db`select usuario from pcp_usuarios where lower(usuario)=lower(${dados.usuario}) and perfil='LIDER_ENTREGAS' limit 1`;
 if(!atual.length)return NextResponse.json({error:"Conta de líder não encontrada."},{status:404});
 if(dados.senha)await db`update pcp_usuarios set nome=${dados.nome},ativo=${ativo},senha_hash=${hash(dados.senha)} where usuario=${dados.usuario} and perfil='LIDER_ENTREGAS'`;
 else await db`update pcp_usuarios set nome=${dados.nome},ativo=${ativo} where usuario=${dados.usuario} and perfil='LIDER_ENTREGAS'`;
 await db`delete from pcp_lider_etapa_acessos where usuario=${dados.usuario}`;
 for(const etapa of dados.setores)await db`insert into pcp_lider_etapa_acessos(usuario,etapa,turno) values(${dados.usuario},${etapa},${dados.turno})`;
 return NextResponse.json({ok:true});
 }catch(e:any){return NextResponse.json({error:e?.message||"Falha ao atualizar"},{status:400})}
}

export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
export const PUT = unidadeHandler(unidadePUT);

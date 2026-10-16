import {NextResponse} from "next/server";
import crypto from "node:crypto";
import {sql} from "@/lib/db";
import {requireRoles} from "@/lib/auth";
export const runtime="nodejs";
const ETAPAS=["PREPARACAO","COLAGEM_PORTAS","ESQUADRIAS_BORDAS","RECOBRIDORA_PERFIL","USINAGEM_2","LUSTRACAO","CNC","USINAGEM","PLASTIFICADORA","EMBALAGEM","EXPEDICAO"];
async function setup(){
 const db=sql();
 await db`create table if not exists pcp_lider_etapa_acessos(usuario varchar(100) not null,etapa varchar(50) not null,primary key(usuario,etapa))`;
 // Respeitar tabelas existentes e ampliar perfil validado no banco para o novo papel.
 await db`alter table pcp_usuarios drop constraint if exists ck_pcp_usuarios_perfil`;
 await db`alter table pcp_usuarios add constraint ck_pcp_usuarios_perfil check(perfil in ('PCP','GERENTE','ENCARREGADO','LIDER','APONTADOR','QUALIDADE','COMERCIAL','LOGISTICA','LIDER_ENTREGAS'))`;
 return db;
}
export async function GET(){
 try{await requireRoles(["PCP"]);const db=await setup();
 const usuarios=await db`select u.usuario,u.nome,u.ativo,a.etapa from pcp_usuarios u left join pcp_lider_etapa_acessos a on a.usuario=u.usuario where u.perfil='LIDER_ENTREGAS' order by u.usuario,a.etapa`;
 return NextResponse.json({usuarios},{headers:{"Cache-Control":"no-store"}});
 }catch(e:any){return NextResponse.json({error:e?.message||"Falha ao carregar líderes"},{status:403})}
}
export async function POST(req:Request){
 try{const admin=await requireRoles(["PCP"]);const b=await req.json();
 const itens=Array.isArray(b.usuarios)?b.usuarios:[b];
 if(!itens.length||itens.length>11)return NextResponse.json({error:"Cadastre de 1 a 11 líderes por solicitação."},{status:400});
 const parsed=itens.map((p:any)=>{
 const usuario=String(p.usuario||"").trim().toLowerCase(),nome=String(p.nome||"").trim(),senha=String(p.senha||""),etapa=String(p.etapa||"").toUpperCase();
 if(!/^[a-z0-9._-]{3,80}$/.test(usuario)||!nome||nome.length>150||senha.length<12||!ETAPAS.includes(etapa))throw Error("Informe usuário, nome, senha de 12+ caracteres e setor válido.");
 return {usuario,nome,senha,etapa};
 });
 if(new Set(parsed.map(x=>x.usuario)).size!==parsed.length)return NextResponse.json({error:"Usuários repetidos."},{status:400});
 const db=await setup();
 const ja=await db`select usuario from pcp_usuarios where usuario=any(${parsed.map(x=>x.usuario)})`;
 if(ja.length)return NextResponse.json({error:"Um ou mais usuários já existem. Nenhum cadastro efetuado."},{status:409});
 for(const p of parsed){
  const salt=crypto.randomBytes(16).toString("hex");
  const hash="scrypt$"+salt+"$"+crypto.scryptSync(p.senha,salt,64).toString("hex");
  await db`insert into pcp_usuarios(usuario,nome,senha_hash,perfil,ativo,criado_por) values(${p.usuario},${p.nome},${hash},'LIDER_ENTREGAS',true,${admin.usuario})`;
  await db`insert into pcp_lider_etapa_acessos(usuario,etapa) values(${p.usuario},${p.etapa})`;
 }
 return NextResponse.json({ok:true,criados:parsed.length});
 }catch(e:any){return NextResponse.json({error:e?.message||"Falha ao cadastrar"},{status:400})}
}

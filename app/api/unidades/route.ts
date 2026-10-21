import { NextResponse } from 'next/server';
import { z } from 'zod';
import { estadoUnidades,verificarBanco } from '@/lib/unidades/access';
import { unidadeSchema,assinarUnidade } from '@/lib/unidades/core';
import { identitySql } from '@/lib/db';
export const runtime='nodejs';
export async function GET(){try{const {sessao,...estado}=await estadoUnidades();return NextResponse.json(estado,{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'Não foi possível carregar as unidades autorizadas.'},{status:503});}}
export async function POST(req:Request){try{
 const body=z.object({unidade:unidadeSchema}).strict().parse(await req.json());
 const e=await estadoUnidades();if(!e.ativo||!e.permitidas.includes(body.unidade))return NextResponse.json({error:'Unidade não autorizada.'},{status:403});
 await verificarBanco(body.unidade);
 const db=identitySql();
 await db`insert into pcp_auditoria_global(ator,acao,entidade,entidade_id,antes,depois) values(${e.sessao.usuario},'SELECIONAR_UNIDADE','SESSAO',${e.sessao.usuario},${JSON.stringify({unidade:e.selecionada})}::jsonb,${JSON.stringify({unidade:body.unidade})}::jsonb)`;
 const r=NextResponse.json({ok:true,unidade:body.unidade});
 r.cookies.set('erp_unidade',assinarUnidade(e.sessao.usuario,body.unidade,process.env.AUTH_SECRET||''),{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:12*60*60});return r;
}catch(e){return NextResponse.json({error:e instanceof z.ZodError?'Unidade inválida.':'Não foi possível selecionar a unidade.'},{status:e instanceof z.ZodError?400:503});}}

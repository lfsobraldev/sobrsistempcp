import { neon,type NeonQueryFunction } from '@neondatabase/serverless';
import { multiAtiva,urlDaUnidade,type Unidade } from './unidades/core';
import { contextoUnidade } from './unidades/context';
export type Db=NeonQueryFunction<false,false>;
const clientes=new Map<string,Db>();
function cliente(url:string){let db=clientes.get(url);if(!db){db=neon(url);clientes.set(url,db);}return db;}
/** Banco de identidade/controle. Não usar para dados operacionais quando multiunidade está ativa. */
export function identitySql(){const url=process.env.DATABASE_URL;if(!url)throw new Error('DATABASE_URL não configurada.');return cliente(url);}
/** Uso interno: o chamador já validou login/grant, token público assinado ou webhook. */
export function sqlDaUnidade(unidade:Unidade){return cliente(urlDaUnidade(unidade));}
/** Toda query operacional usa o contexto imutável do handler; nunca lê unidade do corpo de uma gravação. */
export function sql(){
 if(!multiAtiva())return identitySql();
 const contexto=contextoUnidade.getStore();if(!contexto)throw new Error('UNIDADE_OBRIGATORIA');
 return sqlDaUnidade(contexto.unidade);
}

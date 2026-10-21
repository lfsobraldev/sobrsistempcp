import { NextResponse } from 'next/server';
import { multiAtiva } from './core';
import { contextoUnidade } from './context';
import { estadoUnidades,verificarBanco } from './access';
export function unidadeHandler<A extends unknown[]>(handler:(req:Request,...args:A)=>Promise<Response>){
 return async(req:Request,...args:A):Promise<Response>=>{
  if(!multiAtiva())return handler(req,...args);
  try{
   const estado=await estadoUnidades();
   if(!estado.selecionada)return NextResponse.json({error:'Selecione uma unidade autorizada para continuar.',codigo:'UNIDADE_OBRIGATORIA'},{status:409});
   await verificarBanco(estado.selecionada);
   return await contextoUnidade.run({unidade:estado.selecionada,usuario:estado.sessao.usuario},()=>handler(req,...args));
  }catch(e){
   const message=e instanceof Error?e.message:'Falha na seleção da unidade.';
   const status=message==='NAO_AUTENTICADO'?401:message==='SEM_PERMISSAO'?403:503;
   console.error('[UNIDADE]',{status,codigo:'UNIDADE_INDISPONIVEL'});
   return NextResponse.json({error:status===401?'Entre no sistema.':status===403?'Unidade não autorizada.':'Configuração das unidades pendente de homologação.',codigo:'UNIDADE_INDISPONIVEL'},{status,headers:{'Cache-Control':'no-store'}});
  }
 };
}

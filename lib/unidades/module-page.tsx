import Link from 'next/link';
import {notFound} from 'next/navigation';
import {estadoUnidades} from './access';
import {allowedPath} from '../permissions';
import {unidadeSchema} from './core';
import ModuleUnitEntry from '@/components/module-unit-entry';
import Consolidado from '@/app/(erp)/consolidado/page';
export default async function ModuleUnitPage({unidade,target,children}:{unidade:string;target:string;children:React.ReactNode}){
 const e=await estadoUnidades();if(!allowedPath(e.sessao.perfil,target))notFound();
 if(!e.ativo)return <p role="status">Módulo aguardando configuração das unidades.</p>;
 const modulo=target==='/pcp-painel'?'pcp':target==='/apontamento-operacoes'?'apontamento':target==='/planejamento-mensal'?'programacao':'estoque';
 const nav=<nav aria-label="Navegação por unidade"><Link href={target}>Módulo</Link> · {e.permitidas.map(u=><Link key={u} style={{marginRight:12}} href={'/'+modulo+'/'+u.toLowerCase()}>{u==='SUL'?'Sul':'Nordeste'}</Link>)}{e.consolidado&&<Link href={'/'+modulo+'/consolidado'}>Consolidado</Link>}</nav>;
 if(unidade==='consolidado'){if(!e.consolidado)notFound();return <>{nav}<p>Resumo de gestão das duas unidades. O detalhamento específico deste módulo será ampliado em outro incremento.</p><Consolidado/></>;}
 const parsed=unidadeSchema.safeParse(unidade.toUpperCase());if(!parsed.success||!e.permitidas.includes(parsed.data))notFound();
 return <ModuleUnitEntry unidade={parsed.data} selecionada={e.selecionada}>{nav}{children}</ModuleUnitEntry>;
}

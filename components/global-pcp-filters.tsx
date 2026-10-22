'use client';
import {usePathname} from 'next/navigation';
import {useOps} from './operational-provider';
import {usePCPFilters} from '@/hooks/use-pcp-filters';
import PCPFilterBar from './pcp-filter-bar';
export default function GlobalPCPFilters(){
 const path=usePathname();const o=useOps();const f=usePCPFilters(o.selectedProgramacaoId);
 if(['/acessos','/configuracoes','/engenharia','/marketing','/comercial','/programacao','/planejamento-mensal','/consolidado'].includes(path)||path.endsWith('/consolidado')||path.startsWith('/programacao/'))return null;
 return <><PCPFilterBar filtros={f.filtros} opcoes={o.recorteOpcoes} onChange={f.setFiltros} onClear={f.limpar}/>{o.recorteLoading&&<p role="status">Atualizando recorte…</p>}{o.recorteErro&&<p role="alert">{o.recorteErro}</p>}</>;
}

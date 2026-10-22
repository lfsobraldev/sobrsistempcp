import ModuleUnitPage from '@/lib/unidades/module-page';
import Apontamento from '@/app/(erp)/apontamento-operacoes/page';
export default async function Page({params}:{params:Promise<{unidade:string}>}){
 const {unidade}=await params;
 return <ModuleUnitPage unidade={unidade} target="/apontamento-operacoes"><Apontamento/></ModuleUnitPage>;
}

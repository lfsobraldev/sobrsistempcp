import ModuleUnitPage from '@/lib/unidades/module-page';
import Painel from '@/app/(erp)/pcp-painel/page';
export default async function Page({params}:{params:Promise<{unidade:string}>}){
 const {unidade}=await params;
 return <ModuleUnitPage unidade={unidade} target="/pcp-painel"><Painel/></ModuleUnitPage>;
}

import ModuleUnitPage from '@/lib/unidades/module-page';
import Estoque from '@/app/(erp)/estoque/page';
export default async function Page({params}:{params:Promise<{unidade:string}>}){
 const {unidade}=await params;
 return <ModuleUnitPage unidade={unidade} target="/estoque"><Estoque/></ModuleUnitPage>;
}

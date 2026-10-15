import {familiaIndustrial,tipoPeca} from "@/lib/domain/industrial";
type PecaKit={quantidade:number;categoria?:string;descricao?:string;descricaoModelo?:string;outrasCaracteristicas?:string;produto?:string;tipo?:string;canal?:string;medida?:string};
export function contagemKitsPedido(itens:PecaKit[]) {
  let portas=0,pernasBatente=0,travessasBatente=0,pernasAlizar=0,travessasAlizar=0,kitsCorrer=0;
  for(const p of itens){
    const q=Number(p.quantidade);
    if(!Number.isFinite(q)||q<=0)continue;
    const familia=familiaIndustrial(p);
    if(familia==="PORTAS")portas+=q;
    else if(familia==="BATENTES"){if(tipoPeca(p)==="PERNA")pernasBatente+=q;else travessasBatente+=q;}
    else if(familia==="ALIZARES"){if(tipoPeca(p)==="PERNA")pernasAlizar+=q;else travessasAlizar+=q;}
    else if(familia==="KIT CORRER")kitsCorrer+=q;
  }
  const avulsos=portas>0?0:Math.max(Math.ceil(pernasBatente/2),travessasBatente,Math.ceil(pernasAlizar/4),Math.ceil(travessasAlizar/2),kitsCorrer);
  return {kits:portas+avulsos,portas,avulsos,estimado:portas===0&&avulsos>0};
}

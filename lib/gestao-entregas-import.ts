import type ExcelJS from "exceljs";
export type DadosEntregaImportacao={
 pedido:string;cliente:string;representante:string;tipo_pedido:string;colecao:string;status_ferragens:string;uf:string;cidade:string;tipo_frete:string;origem_unidade:string;destino_unidade:string;pedido_sul:string;local_montagem:string;transportadora:string;volume_m3:number|null;peso_kg:number|null;
};
const vazio=(pedido:string):DadosEntregaImportacao=>({pedido,cliente:"",representante:"",tipo_pedido:"",colecao:"",status_ferragens:"",uf:"",cidade:"",tipo_frete:"",origem_unidade:"",destino_unidade:"",pedido_sul:"",local_montagem:"",transportadora:"",volume_m3:null,peso_kg:null});
const raw=(cell:ExcelJS.Cell|undefined):unknown=>{const v=cell?.value;if(v&&typeof v==="object"&&"result" in v)return (v as {result:unknown}).result;if(v&&typeof v==="object"&&"text" in v)return (v as {text:string}).text;return v};
const str=(v:unknown,max=240)=>String(v??"").replace(/[\r\n\t]+/g," ").trim().slice(0,max);
const ident=(v:unknown)=>{const t=str(v,30).replace(/\.0+$/,"");return /^\d{4,10}$/.test(t)?t:""};
const num=(v:unknown)=>{if(v===null||v===undefined||String(v).trim()==="")return null;const n=typeof v==="number"?v:Number(str(v).replace(/\./g,"").replace(",","."));return Number.isFinite(n)&&n>=0&&n<=999999999?n:null};
const cap=(s:unknown,max=120)=>str(s,max).toUpperCase();
export async function lerControleEntregas(arquivo:Buffer){
 const mod=await import("exceljs");const xl=(mod as unknown as {default?:typeof mod}).default??mod;
 const wb=new xl.Workbook();await wb.xlsx.load(arquivo as any);
 const porPedido=new Map<string,DadosEntregaImportacao>();
 const linhasPorAba:Record<string,number>={};
 const aplicar=(pedido:string,campos:Partial<DadosEntregaImportacao>)=>{if(!pedido)return;const anterior=porPedido.get(pedido)||vazio(pedido);for(const [k,v] of Object.entries(campos)){if(v!==""&&v!==null&&v!==undefined)(anterior as any)[k]=v}porPedido.set(pedido,anterior)};
 const processar=(nome:string,reader:(row:ExcelJS.Row)=>void)=>{
  const ws=wb.getWorksheet(nome);if(!ws)return;let count=0;
  ws.eachRow({includeEmpty:false},(row,n)=>{if(n===1||n>20000)return;const value=(i:number)=>raw(row.getCell(i));if(!ident(value(1))&&nome!=="Produção Sul")return;reader(row);count++});
  linhasPorAba[nome]=count;
 };
 processar("Comercial",row=>{const v=(i:number)=>raw(row.getCell(i));aplicar(ident(v(1)),{cliente:str(v(2)),representante:str(v(5)),tipo_pedido:str(v(7)),colecao:str(v(9)),status_ferragens:str(v(10))})});
 processar("PCP",row=>{const v=(i:number)=>raw(row.getCell(i));const frete=cap(v(11),12);aplicar(ident(v(1)),{cliente:str(v(2)),volume_m3:num(v(7)),peso_kg:num(v(8)),uf:cap(v(9),2),cidade:str(v(10),150),tipo_frete:["CIF","FOB"].includes(frete)?frete:""})});
 processar("Montagem e Redespacho",row=>{const v=(i:number)=>raw(row.getCell(i));aplicar(ident(v(1)),{cliente:str(v(2)),local_montagem:str(v(3),100)})});
 processar("Logística",row=>{const v=(i:number)=>raw(row.getCell(i));const frete=cap(v(3),12);aplicar(ident(v(1)),{cliente:str(v(2)),tipo_frete:["CIF","FOB"].includes(frete)?frete:"",volume_m3:num(v(4)),peso_kg:num(v(5)),uf:cap(v(6),2),cidade:str(v(7),150),transportadora:str(v(10),160)})});
 const sul=wb.getWorksheet("Produção Sul");
 if(sul){let count=0;sul.eachRow({includeEmpty:false},(row,n)=>{if(n===1||n>20000)return;const nordeste=ident(raw(row.getCell(2))),pedidoSul=ident(raw(row.getCell(1)));if(nordeste&&pedidoSul){aplicar(nordeste,{pedido_sul:pedidoSul,origem_unidade:"SUL",destino_unidade:"NORDESTE"});count++}});linhasPorAba["Produção Sul"]=count;}
 return {itens:[...porPedido.values()],linhasPorAba};
}

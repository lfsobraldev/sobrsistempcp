import type ExcelJS from "exceljs";

export type DadosEntregaImportacao = {
 pedido:string;cliente:string;representante:string;tipo_pedido:string;colecao:string;status_ferragens:string;uf:string;cidade:string;tipo_frete:string;origem_unidade:string;destino_unidade:string;pedido_sul:string;local_montagem:string;transportadora:string;volume_m3:number|null;peso_kg:number|null;
};
export type DataEtapaImportacao = {pedido:string;area:string;etapa:string;dataInicio:string|null;dataConclusao:string|null};
const vazio=(pedido:string):DadosEntregaImportacao=>({pedido,cliente:"",representante:"",tipo_pedido:"",colecao:"",status_ferragens:"",uf:"",cidade:"",tipo_frete:"",origem_unidade:"",destino_unidade:"",pedido_sul:"",local_montagem:"",transportadora:"",volume_m3:null,peso_kg:null});
const raw=(cell:ExcelJS.Cell|undefined):unknown=>{const v=cell?.value;if(v&&typeof v==="object"&&"result" in v)return (v as {result:unknown}).result;if(v&&typeof v==="object"&&"text" in v)return (v as {text:string}).text;return v};
const str=(v:unknown,max=240)=>String(v??"").replace(/[\r\n\t]+/g," ").trim().slice(0,max);
const ident=(v:unknown)=>{const t=str(v,30).replace(/\.0+$/,"");return /^\d{4,10}$/.test(t)?t:""};
const num=(v:unknown)=>{if(v===null||v===undefined||String(v).trim()==="")return null;const n=typeof v==="number"?v:Number(str(v).replace(/\./g,"").replace(",","."));return Number.isFinite(n)&&n>=0&&n<=999999999?n:null};
const cap=(s:unknown,max=120)=>str(s,max).toUpperCase();
const norm=(v:unknown)=>str(v,160).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g," ").trim();
function dateValue(v:unknown):string|null{
 if(v instanceof Date&&!Number.isNaN(v.getTime()))return v.toISOString().slice(0,10);
 if(typeof v==="number"&&v>20000&&v<80000){const d=new Date(Date.UTC(1899,11,30)+Math.round(v)*86400000);return d.toISOString().slice(0,10);}
function dateValue(v:unknown,allowSerial=false):string|null{
 if(v instanceof Date&&!Number.isNaN(v.getTime()))return v.toISOString().slice(0,10);
 if(allowSerial&&typeof v==="number"&&v>20000&&v<80000){const d=new Date(Date.UTC(1899,11,30)+Math.round(v)*86400000);return d.toISOString().slice(0,10);}
 const s=str(v,50);if(!s)return null;
 let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(m)return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
 m=s.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})$/);if(m){const y=m[3].length===2?`20${m[3]}`:m[3];return `${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;}
 return null;
}
const ETAPAS:{area:string;etapa:string;aliases:string[]}[]=[
 {area:"PRODUCAO",etapa:"PREPARACAO",aliases:["PREPARACAO","PREPARO"]},
 {area:"PRODUCAO",etapa:"COLAGEM_PORTAS",aliases:["COLAGEM DE PORTAS","COLAGEM PORTAS"]},
 {area:"PRODUCAO",etapa:"ESQUADRIAS_BORDAS",aliases:["ESQUADRIAS DE BORDAS","ESQUADRIAS BORDAS","BORDAS"]},
 {area:"PRODUCAO",etapa:"RECOBRIDORA_PERFIL",aliases:["RECOBRIDORA DE PERFIL","RECOBRIDORA PERFIL"]},
 {area:"PRODUCAO",etapa:"USINAGEM_2",aliases:["USINAGEM 2","USINAGEM II"]},
 {area:"PRODUCAO",etapa:"LUSTRACAO",aliases:["LUSTRAÇÃO","LUSTRACAO"]},
 {area:"PRODUCAO",etapa:"CNC",aliases:["CNC"]},
 {area:"PRODUCAO",etapa:"USINAGEM",aliases:["USINAGEM"]},
 {area:"PRODUCAO",etapa:"PLASTIFICADORA_PORTAS",aliases:["PLASTIFICADORA PORTAS","PLASTIFICADORA DE PORTAS"]},
 {area:"PRODUCAO",etapa:"PLASTIFICADORA",aliases:["PLASTIFICADORA DE PERFIL","PLASTIFICADORA PERFIL"]},
 {area:"PRODUCAO",etapa:"EMBALAGEM",aliases:["EMBALAGEM"]},
 {area:"PRODUCAO",etapa:"EXPEDICAO",aliases:["EXPEDICAO"]},
 {area:"MONTAGEM",etapa:"FINALIZACAO",aliases:["FINALIZACAO DA PRODUCAO","FINALIZACAO PRODUCAO"]},
 {area:"MONTAGEM",etapa:"TRANSPORTE_REDESPACHO",aliases:["TRANSPORTE REDESPACHO","REDESPACHO"]},
 {area:"MONTAGEM",etapa:"INICIO_MONTAGEM",aliases:["INICIO DA MONTAGEM","INICIO MONTAGEM"]},
 {area:"MONTAGEM",etapa:"FIM_MONTAGEM",aliases:["CONCLUSAO DA MONTAGEM","FIM DA MONTAGEM","FIM MONTAGEM"]},
 {area:"LOGISTICA",etapa:"DISPONIVEL_EXPEDICAO",aliases:["DISPONIVEL NA EXPEDICAO","DISPONIVEL EXPEDICAO"]},
 {area:"LOGISTICA",etapa:"FATURAMENTO",aliases:["FATURAMENTO","FATURADO"]},
 {area:"LOGISTICA",etapa:"CARREGAMENTO",aliases:["CARREGAMENTO"]},
 {area:"LOGISTICA",etapa:"SAIDA_EXPEDICAO",aliases:["SAIDA DA EXPEDICAO","SAIDA EXPEDICAO"]},
 {area:"LOGISTICA",etapa:"ENTREGA_CLIENTE",aliases:["ENTREGA AO CLIENTE","ENTREGA CLIENTE","DATA ENTREGA"]},
 {area:"PRODUCAO_SUL",etapa:"LIBERACAO",aliases:["LIBERACAO SUL","LIBERACAO"]},
 {area:"PRODUCAO_SUL",etapa:"APONTAMENTO_SUL",aliases:["APONTAMENTO SUL","PRODUCAO SUL"]},
 {area:"PRODUCAO_SUL",etapa:"DISPONIVEL_EXPEDICAO",aliases:["DISPONIVEL NA EXPEDICAO SUL","DISPONIVEL EXPEDICAO SUL"]},
 {area:"PRODUCAO_SUL",etapa:"CARREGAMENTO_SUL",aliases:["CARREGAMENTO SUL"]},
 {area:"PRODUCAO_SUL",etapa:"SAIDA_SUL",aliases:["SAIDA DO SUL","SAIDA SUL"]},
 {area:"PRODUCAO_SUL",etapa:"CHEGADA_NORDESTE",aliases:["CHEGADA AO NORDESTE","CHEGADA NORDESTE"]}
];
export async function lerControleEntregas(arquivo:Buffer){
 const mod=await import("exceljs");const xl=(mod as unknown as {default?:typeof mod}).default??mod;
 const wb=new xl.Workbook();await wb.xlsx.load(arquivo as any);
 const porPedido=new Map<string,DadosEntregaImportacao>();
 const datas=new Map<string,DataEtapaImportacao>();
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
 // Ler datas por cabeçalho em todas as abas, sem depender de uma ordem fixa de colunas.
 for(const ws of wb.worksheets){
  if(!ws||ws.rowCount<2)continue;
  const headers=ws.getRow(1),last=Math.min(ws.columnCount,120),cols:{idx:number;stage:typeof ETAPAS[number];kind:"inicio"|"fim"}[]=[];
  const headers=ws.getRow(1),last=Math.min(ws.columnCount,120),cols:{idx:number;stage:typeof ETAPAS[number];kind:"inicio"|"fim";allowSerial:boolean}[]=[];
  for(let c=1;c<=last;c++){
   const h=norm(raw(headers.getCell(c)));if(!h)continue;
   const etapa=ETAPAS.find(x=>x.aliases.some(a=>{const na=norm(a);return h.includes(na)&&!(x.etapa==="USINAGEM"&&h.includes("USINAGEM 2"))&&!(x.etapa==="PLASTIFICADORA"&&h.includes("PORTAS"));}));
   if(!etapa)continue;
   const mentionsDate=/DATA|INICIO|INICI|CONCLUSAO|CONCLUID|FIM|FINAL|SAIDA|CHEGADA|ENTREGA|LIBERACAO|CARREGAMENTO|APONTAMENTO/.test(h)||etapa.aliases.some(a=>h===norm(a));
   if(!mentionsDate)continue;
   const kind=/INICIO|INICI|ENTRADA/.test(h)?"inicio":"fim";
   cols.push({idx:c,stage:etapa,kind});
   const headerDate=/DATA|INICIO|INICI|CONCLUSAO|CONCLUID|FIM|FINAL|SAIDA|CHEGADA|ENTREGA|LIBERACAO|CARREGAMENTO|APONTAMENTO/.test(h);
   const mentionsDate=headerDate||etapa.aliases.some(a=>h===norm(a));
   if(!mentionsDate)continue;
   const kind=/INICIO|INICI|ENTRADA/.test(h)?"inicio":"fim";
   cols.push({idx:c,stage:etapa,kind,allowSerial:headerDate});
  }
  if(!cols.length)continue;
  let count=0;
  ws.eachRow({includeEmpty:false},(row,n)=>{
   if(n===1||n>20000)return;
   const headerNames=Array.from({length:last},(_,i)=>norm(raw(headers.getCell(i+1))));
   let pedidoCol=headerNames.findIndex(h=>/^(PEDIDO|N PEDIDO|NUMERO PEDIDO|PEDIDO NE|PEDIDO NORDESTE|PEDIDO CLIENTE)$/.test(h))+1;
   if(!pedidoCol)pedidoCol=headerNames.findIndex(h=>h.includes("PEDIDO"))+1;
   if(!pedidoCol)pedidoCol=1;
   const pedido=ident(raw(row.getCell(pedidoCol)));if(!pedido)return;
   for(const col of cols){
    const d=dateValue(raw(row.getCell(col.idx)));if(!d)continue;
    const d=dateValue(raw(row.getCell(col.idx)),col.allowSerial);if(!d)continue;
    const key=[pedido,col.stage.area,col.stage.etapa].join("|");
    const prev=datas.get(key)||{pedido,area:col.stage.area,etapa:col.stage.etapa,dataInicio:null,dataConclusao:null};
    if(col.kind==="inicio")prev.dataInicio=prev.dataInicio||d;else prev.dataConclusao=prev.dataConclusao||d;
    datas.set(key,prev);count++;
   }
  });
  // Também aceita tabelas normalizadas: Pedido | Etapa/Setor | Data início | Data conclusão.
  const headersNorm=Array.from({length:last},(_,i)=>norm(raw(headers.getCell(i+1))));
  const stageCol=headersNorm.findIndex(h=>/^(ETAPA|SETOR|PROCESSO|OPERACAO|AREA PRODUTIVA)$/.test(h))+1;
  const startCol=headersNorm.findIndex(h=>/DATA.*(INICIO|INICI)|^(INICIO|INICI)$/.test(h))+1;
  const endCol=headersNorm.findIndex(h=>/DATA.*(CONCLUSAO|FIM|FINAL)|^(CONCLUSAO|FIM|FINAL|DATA CONCLUSAO)$/.test(h))+1;
  if(stageCol&&(startCol||endCol)){
   let rowDates=0;
   ws.eachRow({includeEmpty:false},(row,n)=>{
    if(n===1||n>20000)return;
    const pedidoCol=headersNorm.findIndex(h=>h.includes("PEDIDO"))+1||1;
    const pedido=ident(raw(row.getCell(pedidoCol))),stageText=norm(raw(row.getCell(stageCol)));
    if(!pedido||!stageText)return;
    const stage=ETAPAS.find(x=>x.aliases.some(a=>stageText.includes(norm(a))));
    if(!stage)return;
    const inicio=startCol?dateValue(raw(row.getCell(startCol))):null;
    const fim=endCol?dateValue(raw(row.getCell(endCol))):null;
    const inicio=startCol?dateValue(raw(row.getCell(startCol)),true):null;
    const fim=endCol?dateValue(raw(row.getCell(endCol)),true):null;
    if(!inicio&&!fim)return;
    const key=[pedido,stage.area,stage.etapa].join("|");
    const prev=datas.get(key)||{pedido,area:stage.area,etapa:stage.etapa,dataInicio:null,dataConclusao:null};
    prev.dataInicio=prev.dataInicio||inicio;prev.dataConclusao=prev.dataConclusao||fim;datas.set(key,prev);rowDates++;
   });
   if(rowDates)linhasPorAba[ws.name+" · datas por etapa"] = rowDates;
  }
  if(count)linhasPorAba[ws.name+" · datas"]=count;
 }
 return {itens:[...porPedido.values()],datasEtapas:[...datas.values()],linhasPorAba};
}

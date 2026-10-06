import { getDocument } from "pdfjs-serverless";
import * as XLSX from "xlsx";
import type { ImportResult, Operacao, Produto } from "@/types/pcp";
import { PROCESSOS } from "@/lib/filter-parser";

const clean=(v:unknown)=>String(v??"").replace(/\s+/g," ").trim();
const up=(v:unknown)=>clean(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();

function measure(t:string){
  const d=up(t).replace(/\s*[X×]\s*/g,"X");
  const m=d.match(/(\d{3,4})X(\d{2,4})X(\d{1,3})/);
  return m?`${m[1]}x${m[2]}x${m[3]}`:"";
}
function category(t:string){
  const d=up(t),dim=Number(measure(t).split("x")[0]||0);
  if(/^PE AL\b|^PER ALI\b|^P A\b/.test(d))return "ALIZAR • PERNA";
  if(/^TR AL\b|^T A\b/.test(d))return "ALIZAR • TRAVESSA";
  if(/^FO POR\b|^FP\b/.test(d)||d.includes("FOLHA DE PORTA"))return "PORTA";
  if(/^M P\b/.test(d))return "BATENTE • PERNA";
  if(/^M T\b/.test(d))return "BATENTE • TRAVESSA";
  if((d.includes("MARCO")||d.includes("BATENTE"))&&dim)return dim>=1800?"BATENTE • PERNA":"BATENTE • TRAVESSA";
  if(d.includes("KIT")&&d.includes("CORRER"))return "KIT CORRER";
  if(d.includes("BAG"))return "BAGUETE";
  return "OUTROS";
}
function route(cat:string){
  if(cat==="PORTA")return ["EMBALAGEM"];
  if(cat.startsWith("BATENTE"))return ["PREPARACAO","RECOBRIDORA","USINAGEM-2"];
  if(cat.startsWith("ALIZAR"))return ["USINAGEM-1","LIXAR","RECOBRIDORA"];
  if(cat==="BAGUETE")return ["PREPARACAO"];
  if(cat==="KIT CORRER")return ["EMBALAGEM"];
  return [];
}

type Raw={item:string;codigo:string;descricao:string;quantidade:number};

async function parsePdf(file:File){
  const document=await getDocument({data:new Uint8Array(await file.arrayBuffer()),useSystemFonts:true}).promise;
  const raws:Raw[]=[];
  const texts:string[]=[];

  for(let n=1;n<=document.numPages;n++){
    const page=await document.getPage(n);
    const content=await page.getTextContent();
    const items=(content.items as any[]).map(i=>({
      text:clean(i.str),x:Number(i.transform?.[4]||0),y:Number(i.transform?.[5]||0)
    })).filter(i=>i.text);
    texts.push(items.map(i=>i.text).join(" "));

    const rows:any[]=[];
    for(const i of items){
      let row=rows.find(r=>Math.abs(r.y-i.y)<=1.8);
      if(!row){row={y:i.y,parts:[]};rows.push(row)}
      row.parts.push(i);
    }
    rows.sort((a,b)=>b.y-a.y);rows.forEach(r=>r.parts.sort((a:any,b:any)=>a.x-b.x));

    const header=rows.find(r=>{
      const t=up(r.parts.map((p:any)=>p.text).join(" "));
      return t.includes("ITEM")&&t.includes("CODIGO")&&t.includes("DESCRICAO")&&t.includes("QUANTIDADE");
    });
    if(!header)continue;
    const find=(s:string,fb:number)=>header.parts.find((p:any)=>up(p.text)===s)?.x??fb;
    const descX=find("DESCRICAO",125),unitX=find("UN",344),qtyX=find("QUANTIDADE",365);

    const anchors:any[]=[];
    for(const r of rows){
      const left=clean(r.parts.filter((p:any)=>p.x<descX-4).map((p:any)=>p.text).join(" "));
      const id=left.match(/^(\d+(?:\.\d+)?)\s+(\d{5,})\b/);
      if(!id)continue;
      const un=r.parts.filter((p:any)=>p.x>=unitX-12&&p.x<qtyX-2).map((p:any)=>up(p.text)).find((v:string)=>/^(CJ|UN|PC|PCS|JG)$/.test(v));
      const q=r.parts.filter((p:any)=>p.x>=qtyX-7&&p.x<qtyX+72).map((p:any)=>p.text).find((v:string)=>/^\d{1,9}(?:[.,]\d{3})?$/.test(v));
      if(un&&q)anchors.push({r,item:id[1],codigo:id[2],q:Number(q.replace(/\./g,"").replace(",","."))});
    }
    for(let i=0;i<anchors.length;i++){
      const a=anchors[i],prev=anchors[i-1]?.r.y,next=anchors[i+1]?.r.y;
      const maxY=prev!==undefined?(prev+a.r.y)/2:a.r.y+48,minY=next!==undefined?(a.r.y+next)/2:a.r.y-48;
      const desc=clean(rows.filter(r=>r.y<=maxY&&r.y>minY).flatMap(r=>r.parts.filter((p:any)=>p.x>=descX-6&&p.x<unitX-4).map((p:any)=>p.text)).join(" "));
      if(desc)raws.push({item:a.item,codigo:a.codigo,descricao:desc,quantidade:a.q});
    }
  }

  const all=texts.join("\n");
  const pedido=clean(all.match(/Pedido:\s*(\d+)/i)?.[1]||"");
  const parents=new Set(raws.filter(r=>raws.some(x=>x.item.startsWith(r.item+"."))).map(r=>r.item));
  return {pedido,raws:raws.filter(r=>!parents.has(r.item))};
}

function readUsinagem(file:File){
  return file.arrayBuffer().then(buf=>{
    const wb=XLSX.read(buf,{type:"array"});
    const rows:any[]=[];
    for(const sn of wb.SheetNames){
      const matrix=XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sn],{header:1,defval:""});
      let h=-1;
      for(let i=0;i<Math.min(matrix.length,50);i++){
        const line=matrix[i].map((v:any)=>up(v).replace(/[^A-Z0-9]/g,""));
        if(line.some((x:string)=>["OF","ORDEMFABRICACAO","ORDEM"].includes(x))){h=i;break}
      }
      if(h<0)continue;
      const head=matrix[h].map((v:any)=>up(v).replace(/[^A-Z0-9]/g,""));
      const idx=(a:string[])=>head.findIndex((x:string)=>a.includes(x));
      const io=idx(["OF","ORDEMFABRICACAO","ORDEM"]),id=idx(["DESCRICAO","PRODUTO","DESCRICAOPRODUTO"]);
      for(const r of matrix.slice(h+1)){
        const of=io>=0?clean(r[io]):"";
        if(of)rows.push({of,descricao:id>=0?clean(r[id]):""});
      }
    }
    return rows;
  });
}

export async function parsePedidoUsinagem(pedidoFile:File,usinagemFile:File):Promise<ImportResult>{
  const [{pedido,raws},usinagem]=await Promise.all([parsePdf(pedidoFile),readUsinagem(usinagemFile)]);
  const produtos:Produto[]=raws.map(r=>{
    const id=crypto.randomUUID(),cat=category(r.descricao),routeNames=route(cat);
    const matched=usinagem.find((u:any)=>measure(u.descricao)&&measure(u.descricao)===measure(r.descricao));
    const ops:Operacao[]=routeNames.map((processo,i)=>({
      id:crypto.randomUUID(),produtoId:id,processo,sequencia:(PROCESSOS as readonly string[]).indexOf(processo)+1,
      percentual:0,status:i===0?"LIBERADA":"PENDENTE",ordemFila:i+1,
      quantidadePlanejada:r.quantidade,quantidadeProduzida:0,quantidadeRefugo:0,fixada:false
    }));
    return {
      id,filtro:"PEDIDO",pedido,item:r.item,produto:r.codigo,descricao:r.descricao,tipo:"",canal:"",
      rebaixo:"",acabamento:"",cor:"",quantidade:r.quantidade,pedidoCliente:"",statusEngenharia:"",
      of:matched?.of||"",percentualProduto:0,codigoModelo:"",descricaoModelo:"",outrasCaracteristicas:"",
      categoria:cat,material:"",medida:measure(r.descricao),prioridade:"NORMAL",operacoes:ops
    };
  });

  return {
    filtro:"PEDIDO",
    pedidos:new Set(produtos.map(p=>p.pedido)).size,
    ofs:new Set(produtos.map(p=>p.of).filter(Boolean)).size,
    linhas:produtos.length,
    pecas:produtos.reduce((s,p)=>s+p.quantidade,0),
    operacoes:produtos.reduce((s,p)=>s+p.operacoes.length,0),
    semRota:produtos.filter(p=>!p.operacoes.length).length,
    inconsistenciasRota:0,
    processos:Object.fromEntries((PROCESSOS as readonly string[]).map(proc=>[proc,produtos.reduce((sum,p)=>sum+p.operacoes.filter(o=>o.processo===proc).length,0)])),
    regressao:{aplicavel:false,ok:true,erros:[]},
    produtos
  };
}

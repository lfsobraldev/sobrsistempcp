import * as XLSX from "xlsx";
import type { MountType, PackageData, PackageRow, ProcessingResult } from "./types";
import { DEFAULT_LOGISTICS_CONFIG } from "./settings";
import { packageVolume } from "./logistics";
import { classifyProduct, clean, norm, toNumber } from "./domain";

function inferMount(text:string):MountType{const t=norm(text);if(t.includes("TIMADEL"))return"MONTADO_TIMADEL";if(t.includes("REVENDA"))return"REVENDA";if(t.includes("ESTANCIA"))return"MONTADO_ESTANCIA";return"MONTADO_HS"}
function parseSourceItems(obs:string){const m=clean(obs).match(/Itens?\s+(.+)/i);if(!m)return undefined;const ids=[...m[1].matchAll(/\b\d+\.\d+\b/g)].map(x=>x[0]);return ids.length?[...new Set(ids)]:undefined}

export function readReadyRomaneio(buffer:Buffer,fileName="Romaneio.xlsx"):ProcessingResult{
  const wb=XLSX.read(buffer,{type:"buffer",cellDates:true,cellFormula:true});const ws=wb.Sheets[wb.SheetNames[0]];if(!ws)throw new Error("A planilha não possui uma aba válida.");const ref=ws["!ref"]||"A1:K250";const range=XLSX.utils.decode_range(ref);
  const raw=(r:number,c:number)=>c<0?"":ws[XLSX.utils.encode_cell({r,c})]?.v??"";
  const mergeTop=new Map<string,unknown>(),mergeContinuation=new Set<string>();for(const m of ws["!merges"]||[]){const top=raw(m.s.r,m.s.c);for(let r=m.s.r;r<=m.e.r;r++)for(let c=m.s.c;c<=m.e.c;c++){mergeTop.set(`${r}:${c}`,top);if(r!==m.s.r||c!==m.s.c)mergeContinuation.add(`${r}:${c}`)}}
  const inherited=(r:number,c:number)=>{const v=raw(r,c);return v===""||v===null||v===undefined?(mergeTop.get(`${r}:${c}`)??""):v};
  let header=-1;for(let r=range.s.r;r<=Math.min(range.e.r,45);r++){let line="";for(let c=range.s.c;c<=range.e.c;c++)line+=` ${clean(raw(r,c))}`;const n=norm(line);if(n.includes("PACOTE")&&n.includes("PRODUTO")){header=r;break}}if(header<0)throw new Error("Não encontrei o cabeçalho do romaneio. Use o modelo da Famossul ou um romaneio preenchido.");
  const headers:Array<string>=[];for(let c=range.s.c;c<=range.e.c;c++)headers.push(norm(raw(header,c)));const idx=(terms:string[])=>headers.findIndex(h=>terms.some(t=>h.includes(t)));const cPackage=idx(["PACOTE"]),cOrder=idx(["PEDIDO"]),cGames=idx(["JOGOS","JGS"]),cQty=idx(["QTDE","QTD"]),cLen=idx(["COMPR"]),cWid=idx(["LARG"]),cThk=idx(["ESPESS","ESP."]),cProduct=idx(["PRODUTO"]),cObs=idx(["OBS"]);const m3Cols=headers.map((h,i)=>({h,i})).filter(x=>x.h.includes("M3")||x.h.includes("M³"));const cM3Pallet=m3Cols.find(x=>x.h.includes("PALLET"))?.i??-1;const cM3=m3Cols.find(x=>!x.h.includes("PALLET"))?.i??-1;if([cPackage,cOrder,cQty,cProduct].some(x=>x<0))throw new Error("O romaneio não possui as colunas mínimas Pacote, Pedido, Qtde e Produto.");
  const packagesMap=new Map<number,PackageData>();let currentPackage=0;for(let r=header+1;r<=Math.min(range.e.r,header+220);r++){const label=norm(inherited(r,cPackage));if(label.includes("FILTRO")||label==="OBS:"||label.startsWith("TOTAL"))break;const p=toNumber(inherited(r,cPackage));if(p&&p>0)currentPackage=Math.round(p);if(!currentPackage)continue;
    const qty=toNumber(raw(r,cQty)),games=toNumber(raw(r,cGames)),len=toNumber(raw(r,cLen)),wid=toNumber(raw(r,cWid)),thk=toNumber(raw(r,cThk)),m3=toNumber(raw(r,cM3));const product=clean(raw(r,cProduct)),obs=clean(raw(r,cObs));if(product===""&&qty===undefined&&games===undefined&&obs==="")continue;
    let pkg=packagesMap.get(currentPackage);if(!pkg){pkg={number:currentPackage,rows:[],totalVolume:0,status:"VALIDO",warnings:[],ruleApplied:"Romaneio pronto importado; sem repaletização automática"};packagesMap.set(currentPackage,pkg)}const sourceItems=parseSourceItems(obs);const cat=classifyProduct(product||pkg.rows.at(-1)?.product||"");const row:PackageRow={id:`READY-${currentPackage}-${pkg.rows.length+1}`,games:games?Math.round(games):undefined,quantity:Math.round(qty||0),lengthMm:len,widthMm:wid,thicknessMm:thk,volume:m3,product,observation:obs||undefined,itemText:/\bItens?\b/i.test(obs)?obs:undefined,sourceItems,category:cat,groupType:cat,groupId:`READY-${currentPackage}-${pkg.rows.length+1}`,matchConfidence:100};pkg.rows.push(row);const pv=toNumber(inherited(r,cM3Pallet));if(pv&&pv>0)pkg.totalVolume=pv}
  const packages=[...packagesMap.values()].sort((a,b)=>a.number-b.number);if(!packages.length)throw new Error("Não encontrei produtos no romaneio enviado.");for(const p of packages)if(!p.totalVolume)p.totalVolume=packageVolume(p.rows);
  const cell=(addr:string)=>clean(ws[addr]?.v);
  const findLabeledValue=(labels:string[])=>{
    for(let r=range.s.r;r<=range.e.r;r++){
      for(let c=range.s.c;c<=range.e.c;c++){
        const value=norm(raw(r,c));
        if(!labels.some(label=>value.startsWith(norm(label))))continue;
        const inline=clean(raw(r,c)).replace(/^[^:]+:\s*/i,"");
        if(inline && !labels.some(label=>norm(inline)===norm(label)))return inline;
        for(let next=c+1;next<=Math.min(range.e.c,c+3);next++){
          const candidate=clean(raw(r,next));if(candidate)return candidate;
        }
      }
    }
    return "";
  };
  const orderNumber=cell("B10")||clean(inherited(header+1,cOrder))||"NÃO IDENTIFICADO",client=cell("B8")||"Cliente não identificado",destination=cell("B9")||"",delivery=cell("B11")||undefined;let footer="";for(let r=Math.max(header,range.e.r-18);r<=range.e.r;r++)for(let c=range.s.c;c<=range.e.c;c++)footer+=` ${clean(raw(r,c))}`;const mountType=inferMount(footer);
  const complementoObra = norm(footer).includes("COMPLEMENTO");
  const orderOptions={mountType,complementoObra,motorista:cell("I7"),transportadora:cell("I8"),placa:cell("I9"),notaFiscal:cell("K11"),filtro:findLabeledValue(["Filtro"]),pagina:findLabeledValue(["Pag.","Página","Pagina"])};
  return{orderNumber,client,destination,delivery,hasMachining:false,mountType,mixedOrder:false,complementoObra,packages,warnings:["Romaneio pronto importado. A estrutura de pallets foi preservada."],config:DEFAULT_LOGISTICS_CONFIG,orderOptions,sourceMode:"ROMANEIO_PRONTO",sourceFileName:fileName,sourceItemCount:packages.reduce((s,p)=>s+p.rows.length,0),reconciliation:{found:packages.reduce((s,p)=>s+p.rows.length,0),mapped:packages.reduce((s,p)=>s+p.rows.length,0),unmapped:0,parentItemsIgnored:0},romaneioStyle:DEFAULT_LOGISTICS_CONFIG.romaneioStyle,labelStyle:DEFAULT_LOGISTICS_CONFIG.labelStyle};
}

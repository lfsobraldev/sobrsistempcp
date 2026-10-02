import { parse } from "csv-parse/sync";
import type { ImportResult, Operacao, Produto, StatusOperacao } from "@/types/pcp";

export const PROCESSOS = ["PREPARACAO","USINAGEM-1","LIXAR","RECOBRIDORA","USINAGEM-2","LUSTRACAO","TERCEIROS","EMBALAGEM","EXPEDICAO"] as const;
const REQUIRED=["Filtro","Pedido","Descrição","Quantidade Pecas","OF's",...PROCESSOS];
const clean=(v:unknown)=>String(v??"").replace(/\s+/g," ").trim();
const up=(v:unknown)=>clean(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
function num(v:unknown){let s=clean(v);if(!s)return 0;if(s.includes(",")&&s.includes("."))s=s.replace(/\./g,"").replace(",",".");else if(s.includes(","))s=s.replace(",",".");const n=Number(s);return Number.isFinite(n)?n:0}
function isRouteValue(v:unknown){const s=up(v);return !!s&&!new Set(["N/A","NA","N.A.","-","—","N/D","ND"]).has(s)}
function medida(t:string){const d=up(t).replace(/\s*[X×]\s*/g,"X");const m=d.match(/(\d{3,4})X(\d{2,4})X(\d{1,3})/);return m?`${m[1]}x${m[2]}x${m[3]}`:""}
function firstDim(t:string){return Number(medida(t).split("x")[0]||0)}
function material(r:any){const tipo=up(r["Tipo"]),d=up(r["Descrição"]);if(tipo.includes("PINUS"))return"PINUS";if(tipo.includes("ULTRA"))return"MDF ULTRA";if(tipo.includes("STD"))return"MDF STD";if(tipo&&tipo!=="N/A")return clean(r["Tipo"]);if(d.includes("ULTRA"))return"MDF ULTRA";if(d.includes("PINUS"))return"PINUS";if(d.includes("MDF"))return"MDF";if(d.includes("HDF"))return"HDF";return""}
function categoria(r:any){const d=up(r["Descrição"]),m=up(r["Descrição Modelo"]),dim=firstDim(d);
 if(/^PE AL\b|^PER ALI\b|^P A\b|^P\.A\./.test(d))return"ALIZAR • PERNA";
 if(/^TR AL\b|^TR ALI\b|^T A\b/.test(d))return"ALIZAR • TRAVESSA";
 if(/^A (STD|ULTRA)\b/.test(d))return dim>=1800?"ALIZAR • PERNA":"ALIZAR • TRAVESSA";
 if(/^M P\b/.test(d))return"BATENTE • PERNA";if(/^M T\b/.test(d))return"BATENTE • TRAVESSA";
 if(/^M (STD|ULTRA)\b/.test(d))return dim>=1800?"BATENTE • PERNA":"BATENTE • TRAVESSA";
 if(/^FO POR\b|^FO P\b|^FP\b/.test(d)||m.includes("PORTA"))return"PORTA";
 if(/^KIT DE\b|^AL KIT\b/.test(d)||(m.includes("KIT")&&m.includes("CORRER")))return"KIT CORRER";
 if(/^BAG\b/.test(d)||m.includes("BAGUETE"))return"BAGUETE";
 if(/^BAND\b/.test(d)||m.includes("BANDEIRA"))return"BANDEIRA";
 if(m.includes("PERNA")&&m.includes("ALIZAR"))return"ALIZAR • PERNA";if(m.includes("TRAV")&&m.includes("ALIZAR"))return"ALIZAR • TRAVESSA";
 if(m.includes("PERNA")&&(m.includes("BAT")||m.includes("MARCO")))return"BATENTE • PERNA";if(m.includes("TRAV")&&(m.includes("BAT")||m.includes("MARCO")))return"BATENTE • TRAVESSA";
 if(/^\d{3,4}X\d{2,4}X30\b/.test(d))return dim>=1800?"BATENTE • PERNA":"BATENTE • TRAVESSA";return m||"OUTROS"}
function fallbackAcab(r:any){const d=up(r["Descrição"]);if(d.includes("PET"))return"PET";if(d.includes("PVC"))return"PVC";if(d.includes("ESMALTE"))return"ESMALTE";return""}
function status(pct:number,current:boolean):StatusOperacao{if(pct>=100)return"CONCLUIDA";if(!current)return"PENDENTE";return pct>0?"EM_ANDAMENTO":"LIBERADA"}
function setupKey(p:Produto){return[(p.prioridade==="URGENTE"?"0":p.prioridade==="ALTA"?"1":"2"),up(p.acabamento),up(p.cor),up(p.material),up(p.rebaixo),up(p.medida),up(p.categoria),p.pedido,p.of].join("|")}
function sequence(produtos:Produto[]){for(const processo of PROCESSOS){const arr=produtos.flatMap(p=>p.operacoes.filter(o=>o.processo===processo).map(o=>({p,o})));arr.sort((a,b)=>setupKey(a.p).localeCompare(setupKey(b.p),"pt-BR",{numeric:true}));arr.forEach((x,i)=>x.o.ordemFila=i+1)}}
const EXPECTED={linhas:837,pedidos:21,ofs:831,pecas:42796,operacoes:2442,processos:{PREPARACAO:49,"USINAGEM-1":579,LIXAR:449,RECOBRIDORA:682,"USINAGEM-2":430,LUSTRACAO:96,TERCEIROS:11,EMBALAGEM:146,EXPEDICAO:0}};
function regression(filtro:string,r:any){if(filtro!=="51")return{aplicavel:false,ok:true,erros:[]};const e:string[]=[];for(const k of ["linhas","pedidos","ofs","pecas","operacoes"] as const)if(Number(r[k])!==Number(EXPECTED[k]))e.push(`${k}: esperado ${EXPECTED[k]}, encontrado ${r[k]}`);for(const [k,v] of Object.entries(EXPECTED.processos))if(Number(r.processos[k]||0)!==v)e.push(`${k}: esperado ${v}, encontrado ${r.processos[k]||0}`);return{aplicavel:true,ok:!e.length,erros:e}}

export async function parseFiltro(file:File):Promise<ImportResult>{
 const text=new TextDecoder("windows-1252").decode(new Uint8Array(await file.arrayBuffer()));
 const rows=parse(text,{delimiter:";",columns:true,skip_empty_lines:true,relax_column_count:true,bom:true}) as Record<string,string>[];
 if(!rows.length)throw new Error("O CSV está vazio.");const headers=Object.keys(rows[0]||{});const missing=REQUIRED.filter(x=>!headers.includes(x));if(missing.length)throw new Error(`Colunas obrigatórias ausentes: ${missing.join(", ")}`);
 const valid=rows.filter(r=>clean(r["Filtro"])&&clean(r["Pedido"])&&clean(r["Descrição"]));if(!valid.length)throw new Error("Nenhuma linha válida encontrada.");let inconsistenciasRota=0;const produtos:Produto[]=[];
 for(const r of valid){const route=PROCESSOS.map((processo,index)=>({processo,index,raw:clean(r[processo]),percentual:num(r[processo])})).filter(x=>isRouteValue(x.raw));const currentIndex=route.findIndex(x=>x.percentual<100);if(currentIndex>=0)for(let i=currentIndex+1;i<route.length;i++)if(route[i].percentual>0&&route[i].percentual<100)inconsistenciasRota++;
  const id=crypto.randomUUID();const ops:Operacao[]=route.map((x,i)=>({id:crypto.randomUUID(),produtoId:id,processo:x.processo,sequencia:x.index+1,percentual:Math.max(0,Math.min(100,x.percentual)),status:status(Math.max(0,Math.min(100,x.percentual)),i===currentIndex),ordemFila:0,quantidadePlanejada:num(r["Quantidade Pecas"]),quantidadeProduzida:x.percentual>=100?num(r["Quantidade Pecas"]):0,quantidadeRefugo:0,fixada:false}));
  produtos.push({id,filtro:clean(r["Filtro"]),pedido:clean(r["Pedido"]),item:clean(r["Item"]),produto:clean(r["Produto"]),descricao:clean(r["Descrição"]),tipo:clean(r["Tipo"]),canal:clean(r["Canal"]),rebaixo:clean(r["Rebaixo"]),acabamento:clean(r["Acabamento"])||fallbackAcab(r),cor:clean(r["Cor"]),quantidade:num(r["Quantidade Pecas"]),pedidoCliente:clean(r["Pedido Cliente"]),statusEngenharia:clean(r["Status Engenharia"]),of:clean(r["OF's"]),percentualProduto:num(r["% Concluído Produto"]),codigoModelo:clean(r["Código Modelo"]),descricaoModelo:clean(r["Descrição Modelo"]),outrasCaracteristicas:clean(r["Outras Características"]),categoria:categoria(r),material:material(r),medida:medida(clean(r["Descrição"])),prioridade:"NORMAL",operacoes:ops});}
 sequence(produtos);const filtro=[...new Set(produtos.map(p=>p.filtro))].join(", ");const processos=Object.fromEntries(PROCESSOS.map(p=>[p,produtos.reduce((s,x)=>s+x.operacoes.filter(o=>o.processo===p).length,0)]));const base={filtro,pedidos:new Set(produtos.map(p=>p.pedido)).size,ofs:new Set(produtos.map(p=>p.of).filter(Boolean)).size,linhas:produtos.length,pecas:produtos.reduce((s,p)=>s+p.quantidade,0),operacoes:produtos.reduce((s,p)=>s+p.operacoes.length,0),semRota:produtos.filter(p=>!p.operacoes.length).length,inconsistenciasRota,processos,produtos};return{...base,regressao:regression(filtro,base)};
}

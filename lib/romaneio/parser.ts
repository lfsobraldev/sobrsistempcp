import * as XLSX from "xlsx";
import type { LogisticsConfig, MountType, OrderOptions, PackageData, PackageRow, ProcessingResult, ProductCategory } from "./types";
import { applyLogistics, rowVolume } from "./logistics";
import { DEFAULT_LOGISTICS_CONFIG } from "./settings";
import { buildSourceCatalog, classifyProduct, clean, compactItemIds, dimensionsFromText, itemsText, norm, packagingFromText, sourceParent, toNumber } from "./domain";
import { parseOrderHeader, parseOrderItems, physicalOrderItems, type OrderPdfItem } from "./order-parser";

type PdfItem = OrderPdfItem;

type MachiningEntry = {
  quantity: number;
  unit?: string;
  description: string;
  lengthMm?: number;
  widthMm?: number;
  thicknessMm?: number;
  totalVolume?: number;
  notes: string[];
  hardware?: boolean;
};

type HandInfo = { right: number; left: number; application?: string };

function parseHand(text: string): HandInfo {
  const t = clean(text);
  const right = Number(t.match(/(\d+)\s*Direita(?:s)?\b/i)?.[1] || 0);
  const left = Number(t.match(/(\d+)\s*Esquerda(?:s)?\b/i)?.[1] || 0);
  const application = t.match(/(?:Direita(?:s)?|Esquerda(?:s)?)[^\-–—]*[\-–—]\s*(.+)$/i)?.[1];
  return { right, left, application: application ? clean(application) : undefined };
}

function parseMachining(buffer?: Buffer): MachiningEntry[] {
  if (!buffer?.length) return [];
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const entries: MachiningEntry[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as unknown[][];
    let current: MachiningEntry | undefined;
    let hardwareSection = false;
    for (const rawRow of rows) {
      const cells = rawRow.map(v => clean(v));
      const desc = cells[2] || cells.find((v, i) => i > 0 && /[A-Za-zÀ-ÿ]/.test(v)) || "";
      if (!desc && !cells.some(Boolean)) { current = undefined; continue; }
      if (/FERRAGENS\s+PARA\s+USINAGEM/i.test(desc)) { hardwareSection = true; current = undefined; continue; }
      const qty = toNumber(cells[0]);
      if (qty !== undefined && desc) {
        current = {
          quantity: Math.max(0, Math.round(qty)),
          unit: cells[1] || undefined,
          description: desc,
          lengthMm: toNumber(cells[7]),
          widthMm: toNumber(cells[8]),
          thicknessMm: toNumber(cells[9]),
          totalVolume: toNumber(cells[10]),
          notes: [],
          hardware: hardwareSection,
        };
        entries.push(current);
        continue;
      }
      if (hardwareSection && desc) {
        entries.push({ quantity: 0, description: desc, unit: cells[1] || undefined, notes: [], hardware: true });
        current = undefined;
        continue;
      }
      if (current && desc) current.notes.push(desc);
    }
  }
  return entries;
}

function normalizeTitle(text:string){
  return clean(text)
    .replace(/\bHDF\s*\d*\b/gi,"")
    .replace(/\bC\/USINAGEM\s+COMPLETA\b/gi,"")
    .replace(/\bC\/PLASTICO\b/gi,"")
    .replace(/\bS\/USINAGEM\b/gi,"")
    .replace(/\s+/g," ")
    .replace(/^FOLHA DE PORTA/i,"Folha de Porta")
    .replace(/\bSOLIDA\b/gi,"Sólida")
    .replace(/\bIMPRESSO\b/gi,"Impresso")
    .trim();
}
function withPackaging(text:string, packaging:PackageRow["packaging"]){
  const base=clean(text).replace(/\s*\(C\/Plast\.\)\s*$/i,"").replace(/\s*\(C\/Papelão\)\s*$/i,"");
  if(packaging==="PAPELAO") return `${base} (C/Papelão)`;
  if(packaging==="PLASTICO") return `${base} (C/Plast.)`;
  return base;
}
function applicationName(app?:string){const t=norm(app);if(!t)return"";if(t.includes("ELETR"))return"Eletrônica";if(t.includes("EXTERNA"))return"Externa";if(t.includes("WC")||t.includes("BANHEIRO"))return"WC";if(t.includes("INTERNA"))return"Interna";return clean(app)}
function normalizeFinish(value:string){
  return clean(value)
    .replace(/\bBCO\b/gi,"Branco")
    .replace(/\bBCA\b/gi,"Branca")
    .replace(/\bBRANCO\s+BRANCO\b/gi,"Branco")
    .replace(/\bPET\b$/i,"")
    .replace(/[+;,.-]+$/g,"")
    .trim();
}

/**
 * Extrai o acabamento/cor sem depender de uma lista fechada de nomes.
 * Os pedidos reais usam variações como:
 *   REC PET BRANCO CARRARA
 *   RC PET BCO CARRARA
 *   RECOBERTO PET FREIJO NOGARA
 * e podem trazer qualquer outro padrão comercial depois de PET.
 *
 * A leitura termina ao encontrar o início da composição física do marco
 * (pernas/travessas/medidas/rebaixo/borracha/usinação/embalagem).
 */
function finishFromText(text:string){
  const s=clean(text);
  const stop=/\s+(?=(?:C\/\s*(?:USINAGEM|\d|PLAST|PAPEL)|COM\s+USINAGEM|S\/\s*USINAGEM|SEM\s+USINAGEM|\d+\s*(?:PCS?|PÇS?|PÇ|PEÇAS?|PECAS?|PERNAS?|TRAV(?:ESSAS?)?\.?|UN(?:IDADES?)?)|\d{3,5}\s*[Xx]|RB\b|REB\b|REBAIXO\b|REG\b|REGULAGEM\b|BORR(?:ACHA)?\b|APLIC(?:ADA|ADO)?\b|2L\b|2\s*LADOS?\b|E\s+\d+\s+(?:TRAV|TRAVESSA)|TRAVESSA(?:S)?\b|\+))/i;

  const after=(marker:RegExp)=>{
    const m=marker.exec(s);
    if(!m)return "";
    const tail=s.slice(m.index+m[0].length).trim();
    const idx=tail.search(stop);
    const value=idx>=0?tail.slice(0,idx):tail;
    return normalizeFinish(value);
  };

  // Primeiro tenta revestimentos de marco/alizar. Alguns cadastros trazem
  // "REC PET", outros somente "REC", "RC" ou "RECOBERTO" antes da cor.
  const coated=after(/\b(?:RC|REC\.?|RECOBERTO|REVESTIDO)\s+(?:PET\s+)?/i);
  if(coated)return coated;
  const pet=after(/\bPET\s+/i);
  if(pet)return pet;

  // Portas e alguns cadastros usam acabamento por esmalte/impresso/laca.
  const painted=after(/(?:ESMALTE|IMPRESSO|LACA|PINTURA|LAMINADO)\s+/i);
  if(painted)return painted;

  return "";
}
function profileFromText(text:string){const t=clean(text);const m=t.match(/(?:RB|REB)\s*(\d{2,3}X\d{1,3})/i);return m?.[1]||"42x10"}
function headLengthFromText(text:string){
  const t=clean(text);
  const patterns=[
    /(?:1\s*(?:PC|PÇ|PEÇA)\s*)(\d{3,4})(?!\s*[Xx])/i,
    /(?:TRAVESSA(?:S)?|TRAV\.?|CAB(?:ECEIRA)?)\s*(?:DE\s*)?(\d{3,4})/i,
  ];
  for(const pattern of patterns){const match=t.match(pattern);if(match)return Number(match[1]);}
  const total=t.match(/\b(4\d{3}|5\d{3})\s*[Xx]\s*(\d{2,3})\s*[Xx]\s*(\d{1,3})\b/);
  if(total){const head=Number(total[1])-4220;if(head>300&&head<1800)return head;}
  return undefined;
}
function frameComposition(text:string){
  const t=clean(text);
  const explicit=t.match(/(?:2\s*(?:PCS?|PÇS?|PEÇAS?|PERNAS?)\s*(?:DE\s*)?)(\d{3,4})\s*[Xx]\s*(\d{2,4})\s*[Xx]\s*(\d{1,3})/i)
    || t.match(/(?:C\/\s*)?2\s+PERNAS?\s*(?:DE\s*)?(\d{3,4})\s*[Xx]\s*(\d{2,4})\s*[Xx]\s*(\d{1,3})/i);
  if(explicit){
    return {leg:Number(explicit[1]),width:Number(explicit[2]),thick:Number(explicit[3]),head:headLengthFromText(t)};
  }
  const d=dimensionsFromText(t);
  if(!d)return {};
  if(d[0]>4000){const head=d[0]-4220;return {leg:2110,width:d[1],thick:d[2],head:head>300&&head<1800?head:undefined};}
  return {leg:d[0],width:d[1],thick:d[2],head:headLengthFromText(t)};
}
function headLengthFromMachining(e:MachiningEntry){const n=e.notes.join(" ");const m=n.match(/(?:cab|travessa)\s*(?:de)?\s*(\d{3,4})/i);if(m)return Number(m[1]);if(e.lengthMm){const v=e.lengthMm-4220;if(v>300&&v<1800)return v}return undefined}
function sourceText(items:PdfItem[]){return itemsText(items.map(x=>x.item))}
function sourceMeta(items:PdfItem[]){return {sourceItems:items.map(x=>x.item),sourceCodes:items.map(x=>x.code),sourceCode:items.length===1?items[0].code:undefined,itemText:sourceText(items)}}

function matchDoorSources(items:PdfItem[], e:MachiningEntry){
  return items.filter(i=>classifyProduct(i.description)==="PORTA").filter(i=>{const d=dimensionsFromText(i.description);return d&&d[0]===e.lengthMm&&d[1]===e.widthMm&&d[2]===e.thicknessMm});
}
function matchFrameSources(items:PdfItem[], e:MachiningEntry){
  const head=headLengthFromMachining(e);
  const machiningFinish=norm(finishFromText(e.description));
  const candidates=items
    .filter(i=>classifyProduct(i.description)==="MARCO")
    .map(i=>({item:i,composition:frameComposition(i.description)}))
    .filter(({composition})=>{
      if(e.widthMm && composition.width && composition.width!==e.widthMm)return false;
      if(e.thicknessMm && composition.thick && composition.thick!==e.thicknessMm)return false;
      return true;
    })
    .map(({item,composition})=>{
      let score=0;
      if(e.widthMm && composition.width===e.widthMm)score+=8;
      if(e.thicknessMm && composition.thick===e.thicknessMm)score+=4;
      if(head && composition.head===head)score+=6;
      if(item.quantity===e.quantity)score+=3;
      const itemFinish=norm(finishFromText(item.description));
      if(itemFinish)score+=1;
      // Se a planilha de usinagem também informa acabamento, ele tem prioridade.
      // Isso impede que dois marcos de mesma largura, mas cores diferentes, sejam
      // unidos usando a cor do primeiro item encontrado no pedido.
      if(machiningFinish&&itemFinish)score+=machiningFinish===itemFinish?12:-8;
      return {item,score};
    })
    .sort((a,b)=>b.score-a.score);

  if(!candidates.length)return [];
  const best=candidates[0].score;
  // Retorna somente fontes equivalentes ao melhor casamento. Isso evita usar a cor
  // do primeiro marco de mesma largura quando o pedido possui acabamentos diferentes.
  return candidates.filter(x=>x.score===best).map(x=>x.item);
}
function aggregateRows(rows:PackageRow[]){
  const out=new Map<string,PackageRow>();
  for(const row of rows){
    const key=[row.role,row.lengthMm,row.widthMm,row.thicknessMm,norm(row.product),norm(row.application)].join("|");
    const prev=out.get(key);
    if(!prev){out.set(key,{...row,sourceItems:[...(row.sourceItems||[])],sourceCodes:[...(row.sourceCodes||[])]});continue}
    prev.quantity+=row.quantity; prev.volume=undefined;
    if(prev.games!==undefined || row.games!==undefined) prev.games=(prev.games||0)+(row.games||0);
    prev.sourceItems=[...new Set([...(prev.sourceItems||[]),...(row.sourceItems||[])])];
    prev.sourceCodes=[...new Set([...(prev.sourceCodes||[]),...(row.sourceCodes||[])])];
    prev.itemText=itemsText(prev.sourceItems); if(!prev.observation&&row.observation)prev.observation=row.observation;
  }
  return [...out.values()];
}

function buildMachinedDoors(machining:MachiningEntry[],items:PdfItem[]):PackageRow[]{
  const rows:PackageRow[]=[];
  for(const e of machining.filter(x=>/PORTA/i.test(x.description))){
    const hand=parseHand(e.notes.join(" ")); if(!hand.right&&!hand.left)continue;
    const sources=matchDoorSources(items,e); const src=sources[0]; const packaging=packagingFromText(src?.description||e.description);
    const base=normalizeTitle(src?.description||e.description).replace(/\b\d{3,4}\s*[Xx]\s*\d{2,4}\s*[Xx]\s*\d{1,3}\b/g,"").trim();
    const app=applicationName(hand.application); const meta=sourceMeta(sources); const gid=`PORTA-${e.lengthMm||0}-${e.widthMm||0}-${e.thicknessMm||0}`;
    const make=(qty:number,side:"Direita"|"Esquerda")=>{if(!qty)return;rows.push({...meta,quantity:qty,lengthMm:e.lengthMm,widthMm:e.widthMm,thicknessMm:e.thicknessMm,product:withPackaging(`${base} ${side}${app?` ${app}`:""}`,packaging),observation:sourceText(sources),category:"PORTA",groupType:"PORTA",groupId:gid,role:"PORTA",application:app||undefined,hand:side==="Direita"?"DIREITA":"ESQUERDA",packaging,originalDescription:src?.description||e.description,matchConfidence:sources.length?100:65})};
    make(hand.right,"Direita");make(hand.left,"Esquerda");
  }
  return aggregateRows(rows);
}

function buildMachinedFrames(machining:MachiningEntry[],items:PdfItem[]):PackageRow[]{
  const rows:PackageRow[]=[];
  const frameEntries=machining.filter(x=>/BATENTE|MARCO/i.test(x.description));
  // Nos romaneios reais os itens dos batentes usinados são tratados como um bloco operacional.
  // Mantemos o vínculo local para escolher descrição/medidas, mas usamos a união dos itens
  // efetivamente relacionados à usinagem para permitir uma única célula de Itens no romaneio.
  const matchedFrameSources=[...new Map(frameEntries.flatMap(e=>matchFrameSources(items,e)).map(i=>[`${i.item}|${i.code}`,i])).values()];
  const operationalMeta=sourceMeta(matchedFrameSources);
  for(const e of frameEntries){
    const hand=parseHand(e.notes.join(" ")); if(!hand.right&&!hand.left)continue;
    const localSources=matchFrameSources(items,e); const src=localSources[0]; const packaging=packagingFromText(src?.description||e.description);
    const finish=finishFromText(src?.description||e.description)||""; const profile=profileFromText(src?.description||e.description); const app=applicationName(hand.application); const extra=app?` ${app}`:"";
    const sourceComposition=frameComposition(src?.description||""); const width=e.widthMm || sourceComposition.width; const thick=e.thicknessMm || sourceComposition.thick || 30; const leg=sourceComposition.leg || 2110; const head=headLengthFromMachining(e)||sourceComposition.head;
    const nameBase=`Perna de Marco${finish?` Pet ${finish}`:""} 2L Borr. Aplic. "I" ${profile}`; const travBase=`Travessa de Marco${finish?` Pet ${finish}`:""} 2L Borr. Aplic. "I" ${profile}`;
    const source=matchedFrameSources.length?operationalMeta:sourceMeta(localSources);
    const meta={...source,category:"MARCO" as const,groupType:"MARCO" as const,originalDescription:src?.description||e.description,application:app||undefined,packaging,finish:finish||undefined,matchConfidence:localSources.length?100:70,mergeObservation:true};
    if(hand.right){rows.push({...meta,role:"MARCO_DOBRADICA_DIREITA",groupId:"MARCO-DD",quantity:hand.right,lengthMm:leg,widthMm:width,thicknessMm:thick,product:withPackaging(`${nameBase} Dobradiça Direita${extra}`,packaging),observation:sourceText(matchedFrameSources.length?matchedFrameSources:localSources),hand:"DIREITA"});rows.push({...meta,role:"MARCO_CONTRATESTA_DIREITA",groupId:"MARCO-CD",quantity:hand.right,lengthMm:leg,widthMm:width,thicknessMm:thick,product:withPackaging(`${nameBase} Contratesta Direita${extra}`,packaging),hand:"DIREITA"})}
    if(hand.left){rows.push({...meta,role:"MARCO_DOBRADICA_ESQUERDA",groupId:"MARCO-DE",quantity:hand.left,lengthMm:leg,widthMm:width,thicknessMm:thick,product:withPackaging(`${nameBase} Dobradiça Esquerda${extra}`,packaging),observation:sourceText(matchedFrameSources.length?matchedFrameSources:localSources),hand:"ESQUERDA"});rows.push({...meta,role:"MARCO_CONTRATESTA_ESQUERDA",groupId:"MARCO-CE",quantity:hand.left,lengthMm:leg,widthMm:width,thicknessMm:thick,product:withPackaging(`${nameBase} Contratesta Esquerda${extra}`,packaging),hand:"ESQUERDA"})}
    if(head) rows.push({...meta,role:"MARCO_TRAVESSA",groupId:"MARCO-TRAVESSA",quantity:e.quantity,lengthMm:head,widthMm:width,thicknessMm:thick,product:withPackaging(travBase,packaging),hand:"SEM_MAO"});
  }
  return aggregateRows(rows);
}

function buildSimpleDoor(i:PdfItem):PackageRow{
  const d=dimensionsFromText(i.description);const packaging=packagingFromText(i.description);return {...sourceMeta([i]),quantity:i.quantity,lengthMm:d?.[0],widthMm:d?.[1],thicknessMm:d?.[2],volume:i.volume,product:withPackaging(normalizeTitle(i.description),packaging),observation:sourceText([i]),category:"PORTA",groupType:"PORTA",groupId:`PORTA-${i.item}`,role:"PORTA",packaging,originalDescription:i.description,matchConfidence:100};
}
function buildSimpleFrame(i:PdfItem):PackageRow[]{
  const composition=frameComposition(i.description);
  const packaging=packagingFromText(i.description);
  const finish=finishFromText(i.description);
  const profile=profileFromText(i.description);
  const gid=`MARCO-${i.item}`;
  const meta={...sourceMeta([i]),category:"MARCO" as const,groupType:"MARCO" as const,groupId:gid,packaging,originalDescription:i.description,matchConfidence:100,mergeObservation:true};
  const finishText=finish?` Pet ${finish}`:"";
  const detail=/S\/REB|S\/REBAIXO/i.test(i.description)?" S/Rebaixo":` 2L Borr. Aplic. \"I\" ${profile}`;
  const legProduct=withPackaging(`Perna de Marco${finishText}${detail}`,packaging);
  const travProduct=withPackaging(`Travessa de Marco${finishText}${detail}`,packaging);
  const rows:PackageRow[]=[];
  // Conjunto padrão: duas pernas por jogo. Para peças avulsas sem composição explícita,
  // mantém a quantidade física do pedido em vez de multiplicar indevidamente.
  const isSet=/2\s*(?:PCS?|PÇS?|PEÇAS?|PERNAS?)|\bCONJ|\bCJM\b/i.test(i.description) || Boolean(composition.head);
  rows.push({...meta,role:"MARCO_PERNA_SEM_MAO",games:isSet?i.quantity:undefined,quantity:isSet?i.quantity*2:i.quantity,lengthMm:composition.leg,widthMm:composition.width,thicknessMm:composition.thick,product:legProduct,observation:sourceText([i]),finish:finish||undefined});
  if(composition.head){
    rows.push({...meta,role:"MARCO_TRAVESSA",quantity:i.quantity,lengthMm:composition.head,widthMm:composition.width,thicknessMm:composition.thick,product:travProduct,finish:finish||undefined});
  }
  return rows;
}

type TrimGroup={games:number;len1:number;len2:number;width:number;thick:number;reg:number;finish:string;packaging:PackageRow["packaging"];items:PdfItem[]};
function parseTrimComposition(i:PdfItem){
  const d=clean(i.description);
  // Pedidos reais usam várias formas: "4 PCS 2250X100X15",
  // "C/ 4 PERNAS DE 2200X60X9" e "C/4 PERNAS 2200X50X9".
  const p=
    d.match(/(?:C\/\s*)?4\s*(?:PCS?|PÇS?|PÇ|PEÇAS?|PECAS?|PERNAS?)\s*(?:DE\s*)?(\d{3,4})\s*[Xx]\s*(\d{2,4})\s*[Xx]\s*(\d{1,3})/i)
    ||d.match(/(\d{3,4})\s*[Xx]\s*(\d{2,4})\s*[Xx]\s*(\d{1,3}).*?(?:4\s*(?:PCS?|PÇS?|PÇ|PEÇAS?|PECAS?|PERNAS?))/i);
  const h=
    d.match(/2\s*(?:PCS?|PÇS?|PÇ|PEÇAS?|PECAS?|TRAV(?:ESSAS?)?\.?)\s*(?:DE\s*)?(\d{3,4})/i)
    ||d.match(/(?:TRAV(?:ESSA|ESSAS)?\.?|CAB(?:ECEIRA)?)\s*(?:DE\s*)?(\d{3,4})/i);
  const reg=Number(d.match(/MAIOR\s*(\d{2,3})\s*MM/i)?.[1]||(/MAIOR\s*55/i.test(d)?55:35));
  if(!p||!h)return undefined;
  return{len1:Number(p[1]),width:Number(p[2]),thick:Number(p[3]),len2:Number(h[1]),reg};
}
function buildTrimRows(items:PdfItem[]):PackageRow[]{
  const groups=new Map<string,TrimGroup>();const fallback:PackageRow[]=[];
  for(const i of items){const c=parseTrimComposition(i);const packaging=packagingFromText(i.description);if(!c){const d=dimensionsFromText(i.description);fallback.push({...sourceMeta([i]),games:i.quantity,quantity:i.quantity,lengthMm:d?.[0],widthMm:d?.[1],thicknessMm:d?.[2],volume:i.volume,product:withPackaging(normalizeTitle(i.description),packaging),observation:sourceText([i]),category:"ALIZAR",groupType:"ALIZAR",groupId:`ALIZAR-${i.item}`,role:"ALIZAR_MAIOR_PERNA",packaging,originalDescription:i.description,matchConfidence:60});continue}
    const finish=finishFromText(i.description);const key=[c.reg,c.len1,c.len2,c.width,c.thick,finish,packaging].join("|");const g=groups.get(key)||{...c,games:0,finish,packaging,items:[]};g.games+=i.quantity;g.items.push(i);groups.set(key,g)}
  const rows:PackageRow[]=[];
  for(const g of groups.values()){
    const gid=`ALIZAR-${g.reg}-${g.len1}-${g.len2}-${g.width}-${g.thick}-${norm(g.finish)}`;const meta={...sourceMeta(g.items),category:"ALIZAR" as const,groupType:"ALIZAR" as const,groupId:gid,packaging:g.packaging,finish:g.finish||undefined,mergeObservation:true,originalDescription:g.items.map(x=>x.description).join(" | "),matchConfidence:100};const finish=g.finish?` ${g.finish}`:"";const obs=sourceText(g.items);
    rows.push({...meta,productGroupId:`${gid}-MAIOR`,role:"ALIZAR_MAIOR_PERNA",games:g.games,quantity:g.games*2,lengthMm:g.len1,widthMm:g.width,thicknessMm:g.thick,product:withPackaging(`Conj. L Maior ${g.reg}mm MDF Ultra Pet${finish} 2L R.1`,g.packaging),observation:obs,mergeProduct:true});
    rows.push({...meta,productGroupId:`${gid}-MAIOR`,role:"ALIZAR_MAIOR_TRAVESSA",quantity:g.games,lengthMm:g.len2,widthMm:g.width,thicknessMm:g.thick,product:"",mergeProduct:true});
    rows.push({...meta,productGroupId:`${gid}-MENOR`,role:"ALIZAR_MENOR_PERNA",quantity:g.games*2,lengthMm:g.len1,widthMm:g.width,thicknessMm:g.thick,product:withPackaging(`Conj. L Menor MDF Ultra Pet${finish} 2L R.1`,g.packaging),mergeProduct:true});
    rows.push({...meta,productGroupId:`${gid}-MENOR`,role:"ALIZAR_MENOR_TRAVESSA",quantity:g.games,lengthMm:g.len2,widthMm:g.width,thicknessMm:g.thick,product:"",mergeProduct:true});
  }
  return [...rows,...aggregateRows(fallback)];
}

function buildKitRows(items:PdfItem[]):PackageRow[]{const rows:PackageRow[]=[];for(const i of items){const t=clean(i.description),packaging=packagingFromText(t),finish=finishFromText(t),q=i.quantity,gid=`KIT-${i.item}`,meta={...sourceMeta([i]),category:"KIT" as const,groupType:"KIT" as const,groupId:gid,productGroupId:gid,role:"KIT" as const,packaging,originalDescription:t,matchConfidence:100,mergeProduct:true,mergeObservation:true};const l1=Number(t.match(/2\s+PERNAS\s+DE\s+(\d{3,4})X/i)?.[1]||2200),d1=t.match(/2\s+PERNAS\s+DE\s+\d{3,4}X(\d{2,3})X(\d{1,3})/i);if(/KIT DE CORRER/i.test(t)){rows.push({...meta,games:q,quantity:q*2,lengthMm:l1,widthMm:Number(d1?.[1]||55),thicknessMm:Number(d1?.[2]||45),product:withPackaging(`Conj. Kit de Correr \"Modelo B\"${finish?` Pet ${finish}`:""} + Ferragens`,packaging),observation:sourceText([i])});rows.push({...meta,quantity:q,lengthMm:2200,widthMm:55,thicknessMm:45,product:""});rows.push({...meta,quantity:q,lengthMm:2200,widthMm:100,thicknessMm:9,product:""});rows.push({...meta,quantity:q*3,lengthMm:2200,widthMm:50,thicknessMm:9,product:""})}else{const d=dimensionsFromText(t);rows.push({...meta,games:q,quantity:q,lengthMm:d?.[0],widthMm:d?.[1],thicknessMm:d?.[2],volume:i.volume,product:withPackaging(normalizeTitle(t),packaging),observation:sourceText([i])})}}return rows}

function hardwareName(text:string){
  const t=clean(text).replace(/\bC\/PLASTICO\b/gi,"");
  if(/DOBR\s+AÇO\s+INOX\s+304\s+FAMOSSUL/i.test(t))return "Dobradiça Aço Inox 304 Famossul 3x2,5 R16 ESC";
  if(/DOBRADIÇA\s+PIVOTANTE/i.test(t))return "Dobradiça Pivotante C/Esfera 150KG Cromada (Pino)";
  return t;
}
function buildHardwareRows(items:PdfItem[]):PackageRow[]{
  const grouped=new Map<string,{items:PdfItem[];quantity:number;desc:string}>();
  for(const i of items){const name=hardwareName(i.description);const key=`${i.code}|${norm(name)}`;const g=grouped.get(key)||{items:[],quantity:0,desc:name};g.items.push(i);g.quantity+=i.quantity;grouped.set(key,g)}
  return [...grouped.values()].map((g,idx)=>({...sourceMeta(g.items),quantity:g.quantity,product:g.desc,observation:sourceText(g.items),category:"FERRAGEM",groupType:"FERRAGEM",groupId:`FERRAGEM-${idx}`,role:"FERRAGEM",originalDescription:g.items.map(x=>x.description).join(" | "),matchConfidence:100}));
}
function buildFallback(i:PdfItem):PackageRow{const d=dimensionsFromText(i.description),cat=classifyProduct(i.description),packaging=packagingFromText(i.description);return{...sourceMeta([i]),quantity:i.quantity,lengthMm:d?.[0],widthMm:d?.[1],thicknessMm:d?.[2],volume:i.volume,product:withPackaging(normalizeTitle(i.description),packaging),observation:sourceText([i]),category:cat,groupType:cat,groupId:`FALLBACK-${i.item}`,role:cat==="PORTA"?"PORTA":cat==="FERRAGEM"?"FERRAGEM":"OUTRO",packaging,originalDescription:i.description,matchConfidence:50}}

function specialInstructions(pdfText:string){const t=norm(pdfText),out:string[]=[];if(t.includes("ALIZARES NO PADRAO REVENDA"))out.push("EMBALAR ALIZARES PADRÃO REVENDA");if(t.includes("ETIQUETAR OS ITENS AVULSOS"))out.push("ETIQUETAR OS ITENS AVULSOS CONFORME DESCRIÇÃO DA PLANILHA");return out}

function countSourceCategories(items:PdfItem[]){
  const counts:Partial<Record<ProductCategory,number>>={};
  for(const item of items){const category=classifyProduct(item.description);counts[category]=(counts[category]||0)+1}
  return counts;
}
function countGeneratedCategories(rows:PackageRow[]){
  const counts:Partial<Record<ProductCategory,number>>={};
  for(const row of rows){const category=row.category||classifyProduct(row.product);counts[category]=(counts[category]||0)+1}
  return counts;
}
function countMappedSourceCategories(items:PdfItem[],rows:PackageRow[]){
  const used=new Set(rows.flatMap(row=>row.sourceItems||[]));
  const counts:Partial<Record<ProductCategory,number>>={};
  for(const item of items){if(!used.has(item.item))continue;const category=classifyProduct(item.description);counts[category]=(counts[category]||0)+1}
  return counts;
}

export function buildProcessing(pdfText:string,machiningBuffer?:Buffer,options?:{mountType?:MountType;config?:LogisticsConfig;mixedOrder?:boolean;orderOptions?:OrderOptions}):ProcessingResult{
  const header=parseOrderHeader(pdfText);
  const {orderNumber,client,destination,delivery}=header;

  const allItems=parseOrderItems(pdfText);
  const items=physicalOrderItems(allItems);
  const machining=parseMachining(machiningBuffer);
  const warnings:string[]=[];
  const rows:PackageRow[]=[];

  rows.push(...buildMachinedDoors(machining,items));
  rows.push(...buildMachinedFrames(machining,items));
  const already=()=>new Set(rows.flatMap(r=>r.sourceItems||[]));

  // Nunca descarte produto físico só porque a usinagem não trouxe um vínculo.
  // Portas e marcos remanescentes entram no romaneio de forma conservadora e rastreável.
  for(const i of items.filter(x=>classifyProduct(x.description)==="PORTA"&&!already().has(x.item))) rows.push(buildSimpleDoor(i));
  const unmatchedFrames=items.filter(x=>classifyProduct(x.description)==="MARCO"&&!already().has(x.item));
  for(const i of unmatchedFrames) rows.push(...buildSimpleFrame(i));

  const trims=items.filter(x=>classifyProduct(x.description)==="ALIZAR"&&!already().has(x.item));
  rows.push(...buildTrimRows(trims));
  const kits=items.filter(x=>classifyProduct(x.description)==="KIT"&&!already().has(x.item));
  rows.push(...buildKitRows(kits));
  const hardware=items.filter(x=>classifyProduct(x.description)==="FERRAGEM"&&!already().has(x.item));
  rows.push(...buildHardwareRows(hardware));

  // Última rede de segurança: qualquer item físico ainda não utilizado continua visível.
  const after=already();
  for(const i of items) if(!after.has(i.item)) rows.push(buildFallback(i));

  if(!items.length) warnings.push("Nenhum item físico foi identificado no pedido. O documento precisa de revisão manual.");
  if(machiningBuffer&&!machining.length) warnings.push("A planilha de usinagem foi recebida, mas nenhuma linha utilizável foi identificada.");
  if(!machiningBuffer && unmatchedFrames.some(i=>/USINAGEM|C\/USINAGEM/i.test(i.description))){
    warnings.push("Existem batentes/marcos com indicação de usinagem, mas nenhuma planilha de usinagem foi enviada. Eles foram mantidos como conjuntos genéricos; confira mão, aplicação e medidas antes de emitir.");
  }

  const instructions=specialInstructions(pdfText);
  const trimAsResale=instructions.some(x=>/ALIZARES.*REVENDA/i.test(x));
  if(trimAsResale) warnings.push("O pedido determina alizares no padrão revenda; o limite de alizar de revenda será respeitado.");

  const configuredAdditions=(options?.config?.additionalItems||[]).filter(item=>item.enabled&&item.mode==="LINHA"&&(item.target==="ROMANEIO"||item.target==="AMBOS"));
  for(const [index,item] of configuredAdditions.entries()){
    const quantity=Math.max(0,Math.round(item.quantity||0));
    if(!quantity && !item.product?.trim()) continue;
    rows.push({
      id:`ADDITIONAL-${item.id}-${index}`,
      games:item.games||undefined,
      quantity:quantity||1,
      lengthMm:item.lengthMm||undefined,
      widthMm:item.widthMm||undefined,
      thicknessMm:item.thicknessMm||undefined,
      product:clean(item.product||item.label||item.text),
      observation:clean(item.observation||item.text),
      category:"OUTRO",groupType:"OUTRO",groupId:`ADDITIONAL-${item.id}`,role:"OUTRO",manual:true,matchConfidence:100,
    });
  }

  const usedBy=new Map<string,string[]>();
  for(const row of rows){
    for(const item of row.sourceItems||[]){
      const arr=usedBy.get(item)||[];
      arr.push(row.groupId||row.role||row.product);
      usedBy.set(item,arr);
    }
  }
  const catalogRaw=items.map(i=>{
    const d=dimensionsFromText(i.description);
    return{item:i.item,code:i.code,description:i.description,unit:i.unit,quantity:i.quantity,volume:i.volume,category:classifyProduct(i.description),lengthMm:d?.[0],widthMm:d?.[1],thicknessMm:d?.[2],packaging:packagingFromText(i.description),finish:finishFromText(i.description)};
  });
  const sourceCatalog=buildSourceCatalog(catalogRaw,usedBy);
  const unmappedItems=sourceCatalog.filter(i=>!i.used&&!i.isParent);
  if(unmappedItems.length) warnings.push(`${unmappedItems.length} item(ns) físico(s) ainda não foram associados a uma linha do romaneio.`);

  const sourceCategories=countSourceCategories(items);
  const mappedCategories=countMappedSourceCategories(items,rows);
  const generatedCategories=countGeneratedCategories(rows);
  const criticalCategories:ProductCategory[]=["PORTA","MARCO","ALIZAR","FERRAGEM","KIT"];
  const diagnosticNotes:string[]=[];
  for(const category of criticalCategories){
    const source=sourceCategories[category]||0;
    const mapped=mappedCategories[category]||0;
    if(source>0&&mapped===0) diagnosticNotes.push(`${category}: ${source} item(ns) no pedido e nenhum item representado no romaneio.`);
    else if(source>mapped) diagnosticNotes.push(`${category}: ${source-mapped} de ${source} item(ns) ainda sem vínculo.`);
  }
  const sourceCategoryCount=criticalCategories.filter(category=>(sourceCategories[category]||0)>0).length;

  const handEntries=machining.map(x=>parseHand(x.notes.join(" "))).filter(x=>x.right||x.left);
  const handSplit=handEntries.length?{right:handEntries.reduce((s,x)=>s+x.right,0),left:handEntries.reduce((s,x)=>s+x.left,0)}:undefined;
  const mountType=options?.mountType||"MONTADO_HS";
  const base:ProcessingResult={
    orderNumber,client,destination,delivery,hasMachining:Boolean(machiningBuffer?.length),handSplit,mountType,mixedOrder:Boolean(options?.mixedOrder),
    packages:[{number:1,rows,totalVolume:rows.reduce((s,r)=>s+rowVolume(r),0)}],warnings,config:options?.config||DEFAULT_LOGISTICS_CONFIG,
    orderOptions:options?.orderOptions||{mountType},complementoObra:Boolean(options?.orderOptions?.complementoObra),
    sourceItemCount:items.length,sourceItems:items.map(i=>i.item),sourceCatalog,unmappedItems,
    reconciliation:{found:sourceCatalog.length,mapped:sourceCatalog.filter(i=>i.used).length,unmapped:unmappedItems.length,parentItemsIgnored:allItems.length-items.length},
    parserDiagnostics:{
      allItems:allItems.length,physicalItems:items.length,machiningEntries:machining.length,generatedRows:rows.length,
      sourceCategories,mappedCategories,generatedCategories,suspicious:false,notes:diagnosticNotes,
    },
    sourceMode:"PEDIDO",specialInstructions:instructions,trimAsResale,
    romaneioStyle:(options?.config||DEFAULT_LOGISTICS_CONFIG).romaneioStyle,
    labelStyle:(options?.config||DEFAULT_LOGISTICS_CONFIG).labelStyle
  };
  const result=applyLogistics(base,mountType,base.config);
  const suspicious=items.length>=20&&sourceCategoryCount>=3&&result.packages.length<=1;
  if(result.parserDiagnostics){
    result.parserDiagnostics.suspicious=suspicious||diagnosticNotes.some(note=>/nenhum item representado/i.test(note));
    if(suspicious) result.parserDiagnostics.notes.unshift(`Pedido com ${items.length} itens físicos e ${sourceCategoryCount} categorias gerou apenas ${result.packages.length} pallet. Resultado bloqueado para conferência.`);
  }
  if(suspicious) result.warnings.unshift("Leitura suspeita: o pedido possui muitos itens/categorias, mas a palletização gerou somente um pallet. Confira a leitura antes de emitir documentos.");
  return result;
}


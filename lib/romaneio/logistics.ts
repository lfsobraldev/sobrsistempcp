import type { LogisticsConfig, MountType, PackageData, PackageRow, ProcessingResult, ProductCategory } from "./types";
import { classifyProduct, norm, rowRole } from "./domain";
import { DEFAULT_LOGISTICS_CONFIG, MOUNT_LABELS, sanitizeConfig } from "./settings";

export function rowVolume(row: PackageRow): number {
  if (row.lengthMm && row.widthMm && row.thicknessMm && row.quantity) {
    return row.quantity * row.lengthMm * row.widthMm * row.thicknessMm / 1_000_000_000;
  }
  return typeof row.volume === "number" && Number.isFinite(row.volume) ? row.volume : 0;
}
export function packageVolume(rows: PackageRow[]): number { return rows.reduce((s,r)=>s+rowVolume(r),0); }

function category(row:PackageRow):ProductCategory{
  const inferred=classifyProduct(row.product);
  /*
   * Se o próprio texto identifica claramente a família, ele tem prioridade.
   * Isso impede uma porta que chegou com categoria antiga/incorreta de cair
   * no meio de batentes/alizares.
   */
  return inferred!=="OUTRO" ? inferred : (row.category||"OUTRO");
}
function isDoor(r:PackageRow){return category(r)==="PORTA"}
function isFrame(r:PackageRow){return category(r)==="MARCO"}
function isTrim(r:PackageRow){return category(r)==="ALIZAR"}
function isKit(r:PackageRow){return category(r)==="KIT"}
function isHardware(r:PackageRow){return category(r)==="FERRAGEM"}
function isCardboard(r:PackageRow){return r.packaging==="PAPELAO"||/PAPEL[AÃ]O|CANTONEIRA/i.test(`${r.product} ${r.observation||""}`)}
function cloneRow(r:PackageRow):PackageRow{return {...r,sourceItems:r.sourceItems?[...r.sourceItems]:undefined,sourceCodes:r.sourceCodes?[...r.sourceCodes]:undefined,rowStyle:r.rowStyle?{...r.rowStyle}:undefined}}

function handRank(r:PackageRow){return r.hand==="DIREITA"?0:r.hand==="ESQUERDA"?1:2}
function appRank(v?:string){const t=norm(v);if(t.includes("WC"))return 0;if(t.includes("EXTERNA"))return 1;if(t.includes("ELETR"))return 2;if(t.includes("INTERNA"))return 3;return 4}
function doorSort(a:PackageRow,b:PackageRow){return Number(b.lengthMm||0)-Number(a.lengthMm||0)||Number(b.widthMm||0)-Number(a.widthMm||0)||Number(b.thicknessMm||0)-Number(a.thicknessMm||0)||handRank(a)-handRank(b)||appRank(a.application)-appRank(b.application)||norm(a.product).localeCompare(norm(b.product))}
function frameRank(r:PackageRow){switch(rowRole(r)){case"MARCO_DOBRADICA_DIREITA":return 0;case"MARCO_CONTRATESTA_DIREITA":return 1;case"MARCO_DOBRADICA_ESQUERDA":return 2;case"MARCO_CONTRATESTA_ESQUERDA":return 3;case"MARCO_PERNA_SEM_MAO":return 4;case"MARCO_TRAVESSA":return 5;default:return 6}}
function electronicRank(r:PackageRow){return /ELETR/i.test(`${r.product} ${r.application||""}`)?1:0}
function frameLegSort(a:PackageRow,b:PackageRow){return frameRank(a)-frameRank(b)||Number(b.widthMm||0)-Number(a.widthMm||0)||electronicRank(a)-electronicRank(b)||Number(b.lengthMm||0)-Number(a.lengthMm||0)}
function frameTravSort(a:PackageRow,b:PackageRow){return Number(b.lengthMm||0)-Number(a.lengthMm||0)||Number(b.widthMm||0)-Number(a.widthMm||0)}
function trimSort(a:PackageRow,b:PackageRow){const ar=/L MAIOR\s*(\d+)/i.exec(a.product)?.[1],br=/L MAIOR\s*(\d+)/i.exec(b.product)?.[1];return Number(br||0)-Number(ar||0)||Number(a.lengthMm||0)-Number(b.lengthMm||0)}

function industrialRank(row:PackageRow){
  const c=category(row);
  if(c==="PORTA")return 10;
  if(c==="MARCO"){
    return rowRole(row)==="MARCO_TRAVESSA"?30:20;
  }
  if(c==="ALIZAR")return 40;
  if(c==="KIT")return 50;
  if(c==="OUTRO")return 60;
  if(c==="FERRAGEM")return 90;
  return 70;
}

function finalRowSort(a:PackageRow,b:PackageRow){
  const rank=industrialRank(a)-industrialRank(b);
  if(rank)return rank;

  if(category(a)==="PORTA"&&category(b)==="PORTA")return doorSort(a,b);
  if(category(a)==="MARCO"&&category(b)==="MARCO"){
    const ar=rowRole(a), br=rowRole(b);
    if(ar==="MARCO_TRAVESSA"||br==="MARCO_TRAVESSA")return frameRank(a)-frameRank(b);
    return frameLegSort(a,b);
  }
  if(category(a)==="ALIZAR"&&category(b)==="ALIZAR")return trimSort(a,b);

  return norm(a.product).localeCompare(norm(b.product));
}

function packageIndustrialRank(pkg:PackageData){
  if(!pkg.rows.length)return 999;
  return Math.min(...pkg.rows.map(industrialRank));
}

function doorLimit(row:PackageRow,mount:MountType,cfg:LogisticsConfig){let cap=cfg[mount].maxDoors;if(mount==="REVENDA"){if(isCardboard(row))cap=Math.min(cap,cfg.REVENDA.maxDoorsCardboard);if(row.thicknessMm===41)cap=Math.min(cap,cfg.REVENDA.maxDoorsThickness41)}return Math.max(1,cap)}
function maxM3For(mount:MountType,cfg:LogisticsConfig,mixed:boolean){return mixed?Math.min(cfg[mount].maxM3,cfg.mixedMaxM3):cfg[mount].maxM3}

function splitByUnitCapacity(row:PackageRow,maxQty:number,maxM3:number):PackageRow[]{
  const total=Math.max(0,Math.round(row.quantity||0));if(!total)return [cloneRow(row)];
  const unit=rowVolume({...row,quantity:1,volume:undefined});const byVol=unit>0?Math.max(1,Math.floor((maxM3+1e-9)/unit)):maxQty;const cap=Math.max(1,Math.min(maxQty,byVol));const out:PackageRow[]=[];let remaining=total;
  while(remaining>0){const take=Math.min(remaining,cap);out.push({...cloneRow(row),quantity:take,volume:row.lengthMm&&row.widthMm&&row.thicknessMm?undefined:row.volume!==undefined?row.volume*(take/total):undefined});remaining-=take}return out;
}

function packDoors(rows:PackageRow[],mount:MountType,cfg:LogisticsConfig,mixed:boolean):PackageData[]{
  const maxM3=maxM3For(mount,cfg,mixed);const out:PackageData[]=[];let current:PackageRow[]=[];let qty=0,vol=0,qtyLimit=Number.POSITIVE_INFINITY;let special600=false,cardboard=false,thick41=false;
  const smallerWidth=rows.some(r=>Number(r.widthMm||0)<800);
  const flush=()=>{if(!current.length)return;const limit=Number.isFinite(qtyLimit)?qtyLimit:cfg[mount].maxDoors;const reasons=[`${MOUNT_LABELS[mount]}: máximo ${limit} portas`,`máximo ${maxM3.toFixed(3).replace(".",",")} m³`];if(cardboard)reasons.push("embalagem em papelão");if(thick41)reasons.push("espessura 41 mm");if(special600)reasons.push("porta 800/820 em pallet base 600 mm");out.push({number:0,rows:current,totalVolume:vol,limitM3:maxM3,limitQuantity:limit,status:qty<=limit&&vol<=maxM3+.0005?"VALIDO":"INVALIDO",packageType:"PORTA",ruleApplied:reasons.join(" | "),notes:special600?"Pallet base 600 mm":undefined,warnings:special600?["Regra operacional de pallet base 600 mm aplicada."]:[]});current=[];qty=0;vol=0;qtyLimit=Number.POSITIVE_INFINITY;special600=false;cardboard=false;thick41=false};
  for(const original of [...rows].sort(doorSort)){
    let remaining=Math.max(0,Math.round(original.quantity||0));const limit=doorLimit(original,mount,cfg);const unit=rowVolume({...original,quantity:1,volume:undefined});
    while(remaining>0){const nextLimit=Math.min(qtyLimit,limit);if(current.length&&qty>nextLimit){flush();continue}qtyLimit=nextLimit;const qRoom=Math.max(0,qtyLimit-qty),vRoom=Math.max(0,maxM3-vol),vQty=unit>0?Math.max(0,Math.floor((vRoom+1e-9)/unit)):qRoom;const take=Math.min(remaining,qRoom,vQty);if(take<=0){flush();continue}const part={...cloneRow(original),quantity:take,volume:original.lengthMm&&original.widthMm&&original.thicknessMm?undefined:original.volume!==undefined?original.volume*(take/original.quantity):undefined};current.push(part);qty+=take;vol+=rowVolume(part);remaining-=take;cardboard||=isCardboard(part);thick41||=part.thicknessMm===41;special600||=smallerWidth&&(part.widthMm===800||part.widthMm===820);if(qty>=qtyLimit||vol>=maxM3-.0005)flush()}
  }flush();return out;
}

function packRowsByM3(rows:PackageRow[],maxM3:number,rule:string,type:PackageData["packageType"]):PackageData[]{
  const out:PackageData[]=[];let current:PackageRow[]=[],vol=0;
  const flush=()=>{if(!current.length)return;out.push({number:0,rows:current,totalVolume:vol,limitM3:maxM3,status:vol<=maxM3+.0005?"VALIDO":"INVALIDO",ruleApplied:rule,packageType:type});current=[];vol=0};
  for(const original of rows){let remaining=Math.max(0,Math.round(original.quantity||0));if(!remaining){current.push(cloneRow(original));continue}const unit=rowVolume({...original,quantity:1,volume:undefined});if(unit<=0){current.push(cloneRow(original));continue}while(remaining>0){const room=maxM3-vol;let fit=Math.floor((room+1e-9)/unit);if(fit<=0){flush();continue}const take=Math.min(remaining,fit);const part={...cloneRow(original),quantity:take,volume:undefined};current.push(part);vol+=rowVolume(part);remaining-=take;if(vol>=maxM3-.0005)flush()}}
  flush();return out;
}

function appendTravessas(framePkgs:PackageData[],travessas:PackageRow[],maxM3:number):PackageRow[]{
  const remaining=travessas.map(cloneRow);
  // A travessa só pode aproveitar o ÚLTIMO pallet de pernas. Assim nenhuma travessa aparece antes
  // de pallets posteriores que ainda contenham pernas de batente.
  const pkg=framePkgs.at(-1);if(!pkg)return remaining;
  let room=Math.max(0,maxM3-packageVolume(pkg.rows));
  for(let i=0;i<remaining.length&&room>0.000001;){
    const r=remaining[i];const unit=rowVolume({...r,quantity:1,volume:undefined});if(unit<=0){i++;continue}
    const fit=Math.min(r.quantity,Math.max(0,Math.floor((room+1e-9)/unit)));if(fit<=0){i++;continue}
    const part={...cloneRow(r),quantity:fit,volume:undefined};pkg.rows.push(part);pkg.totalVolume=packageVolume(pkg.rows);room=maxM3-(pkg.totalVolume||0);
    pkg.notes=[pkg.notes,"Travessas aproveitam a cubagem disponível do último pallet de pernas"].filter(Boolean).join(" | ");
    if(fit>=r.quantity)remaining.splice(i,1);else remaining[i]={...r,quantity:r.quantity-fit,volume:undefined};
  }
  return remaining;
}

type LogicalGroup={id:string;rows:PackageRow[];games:number;volumePerGame:number};
function logicalGroups(rows:PackageRow[]):LogicalGroup[]{const map=new Map<string,PackageRow[]>();for(const r of rows){const id=r.groupId||`ROW-${map.size}`;const arr=map.get(id)||[];arr.push(r);map.set(id,arr)}return [...map.entries()].map(([id,group])=>{const games=group.find(x=>x.games)?.games||Math.max(1,Math.round(group[0]?.quantity||1));return{id,rows:group,games,volumePerGame:games?packageVolume(group)/games:0}})}
function splitLogicalGroup(g:LogicalGroup,take:number):PackageRow[]{const ratio=g.games?take/g.games:1;return g.rows.map((r,idx)=>({...cloneRow(r),games:idx===0&&r.games!==undefined?take:undefined,quantity:Math.max(0,Math.round(r.quantity*ratio)),volume:r.lengthMm&&r.widthMm&&r.thicknessMm?undefined:r.volume!==undefined?r.volume*ratio:undefined}))}
function packGameGroups(rows:PackageRow[],maxGames:number,maxM3:number,label:string,type:PackageData["packageType"]):PackageData[]{
  const out:PackageData[]=[];let current:PackageRow[]=[],gamesUsed=0,vol=0;
  const flush=()=>{if(!current.length)return;out.push({number:0,rows:current,totalVolume:vol,games:gamesUsed,limitM3:maxM3,limitQuantity:maxGames,status:gamesUsed<=maxGames&&vol<=maxM3+.0005?"VALIDO":"INVALIDO",ruleApplied:`${label}: até ${maxGames} jogos e ${maxM3.toFixed(3).replace(".",",")} m³`,packageType:type});current=[];gamesUsed=0;vol=0};
  for(const g of logicalGroups(rows)){
    let remaining=g.games;
    if(!remaining){for(const r of g.rows){const rv=rowVolume(r);if(current.length&&vol+rv>maxM3+.0005)flush();current.push(cloneRow(r));vol+=rv}continue}
    while(remaining>0){const gamesRoom=Math.max(0,maxGames-gamesUsed),m3Room=Math.max(0,maxM3-vol),byM3=g.volumePerGame>0?Math.floor((m3Room+1e-9)/g.volumePerGame):gamesRoom;const take=Math.min(remaining,gamesRoom,Math.max(0,byM3));if(take<=0){flush();continue}const part=splitLogicalGroup(g,take);current.push(...part);gamesUsed+=take;vol+=packageVolume(part);remaining-=take;if(gamesUsed>=maxGames||vol>=maxM3-.0005)flush()}
  }flush();return out;
}

function normalizeRows(input:PackageRow[]){return input.map(r=>{const c=r.category||classifyProduct(r.product);return{...cloneRow(r),category:c,groupType:r.groupType||c,role:rowRole({...r,category:c})}})}

export function applyLogistics(input:ProcessingResult,mountType:MountType,rawConfig?:LogisticsConfig):ProcessingResult{
  const cfg=sanitizeConfig(rawConfig||DEFAULT_LOGISTICS_CONFIG);const all=normalizeRows(input.packages.flatMap(p=>p.rows));const mixed=Boolean(input.mixedOrder||all.some(r=>/\bMISTO\b/i.test(`${r.product} ${r.observation||""}`)));const maxM3=maxM3For(mountType,cfg,mixed);
  const doors=all.filter(isDoor);const frameLegs=all.filter(r=>isFrame(r)&&rowRole(r)!=="MARCO_TRAVESSA").sort(frameLegSort);const trav=all.filter(r=>isFrame(r)&&rowRole(r)==="MARCO_TRAVESSA").sort(frameTravSort);const trims=all.filter(isTrim).sort(trimSort);const kits=all.filter(isKit);const hardware=all.filter(isHardware);const selected=new Set([...doors,...frameLegs,...trav,...trims,...kits,...hardware]);const others=all.filter(r=>!selected.has(r));
  const out:PackageData[]=[];out.push(...packDoors(doors,mountType,cfg,mixed));
  // Batentes precisam respeitar simultaneamente cubagem e limite de jogos. Na V12 as pernas
  // eram limitadas apenas por m³, o que podia criar pallets acima do limite operacional.
  const frameLimit=Math.max(1,cfg[mountType].maxFrameGames);
  const frameHasExplicitGames=frameLegs.some(row=>Number(row.games||0)>0);
  const framePkgs=frameLegs.length
    ? (frameHasExplicitGames
      ? packGameGroups(frameLegs,frameLimit,maxM3,`${MOUNT_LABELS[mountType]} | pernas de batente na sequência DD, CD, DE, CE`,"MARCO")
      : packRowsByM3(frameLegs,maxM3,`${MOUNT_LABELS[mountType]} | pernas de batente na sequência DD, CD, DE, CE`,"MARCO"))
    : [];
  const leftTrav=appendTravessas(framePkgs,trav,maxM3);
  out.push(...framePkgs);
  if(leftTrav.length)out.push(...packRowsByM3(leftTrav,maxM3,`${MOUNT_LABELS[mountType]} | travessas de batente`,"MARCO"));
  const trimLimit=input.trimAsResale?Math.min(cfg[mountType].maxTrimGames,cfg.REVENDA.maxTrimGames):cfg[mountType].maxTrimGames;if(trims.length)out.push(...packGameGroups(trims,trimLimit,maxM3,input.trimAsResale?"Alizar padrão revenda":"Alizar","ALIZAR"));
  if(kits.length)out.push(...packGameGroups(kits,cfg[mountType].maxFrameGames,maxM3,"Kits","KIT"));
  if(others.length)out.push(...packRowsByM3(others,maxM3,`${MOUNT_LABELS[mountType]} | itens complementares`,"OUTRO"));
  if(hardware.length){out.push({number:0,rows:hardware,totalVolume:packageVolume(hardware),status:"VALIDO",ruleApplied:"Ferragens em pallet exclusivo e por último",packageType:"FERRAGEM",warnings:["Ferragens separadas dos demais produtos."]})}

  /*
   * REGRA FINAL OBRIGATÓRIA DO ROMANEIO:
   * 1. PORTAS
   * 2. PERNAS DE BATENTE
   * 3. TRAVESSAS DE BATENTE
   * 4. ALIZARES
   * 5. KITS / OUTROS
   * 6. FERRAGENS
   *
   * Essa ordenação é aplicada no fim, depois de toda palletização.
   * Portanto nenhuma porta pode aparecer no meio ou depois de batentes.
   */
  out.sort((a,b)=>packageIndustrialRank(a)-packageIndustrialRank(b));
  for(const pkg of out){
    pkg.rows.sort(finalRowSort);
  }

  out.forEach((p,i)=>{p.number=i+1;p.totalVolume=packageVolume(p.rows);p.rows=p.rows.map((r,ri)=>({...r,id:r.id||`P${i+1}-R${ri+1}`}))});
  const warnings=[...input.warnings];if(mixed)warnings.unshift(`Pedido misto: limite máximo de ${cfg.mixedMaxM3.toFixed(3).replace(".",",")} m³ por pallet.`);const invalid=out.filter(p=>p.status==="INVALIDO").length;if(invalid)warnings.unshift(`${invalid} pallet(s) excedem as regras logísticas.`);
  return{...input,mountType,mixedOrder:mixed,packages:out,warnings,config:cfg,orderOptions:{...(input.orderOptions||{mountType}),mountType}};
}

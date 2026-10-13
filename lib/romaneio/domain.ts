import type { PackageRow, ProductCategory, RowRole, SourceCatalogItem } from "./types";

export const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
export const norm = (value: unknown) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
export const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = clean(value); if (!s) return undefined;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized); return Number.isFinite(n) ? n : undefined;
};

export function dimensionsFromText(text: string): [number, number, number] | undefined {
  const m = clean(text).match(/(\d{3,4})\s*[Xx]\s*(\d{2,4})\s*[Xx]\s*(\d{1,3})/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
}

export function packagingFromText(text:string): PackageRow["packaging"] {
  const t=norm(text);
  if(t.includes("PAPELAO") || t.includes("CANTONEIRA")) return "PAPELAO";
  if(t.includes("PLAST")) return "PLASTICO";
  return "OUTRO";
}

export function classifyProduct(text:string): ProductCategory {
  const t=norm(text);
  // A ordem importa. Kits podem conter a palavra FERRAGENS e não podem virar ferragem solta.
  if(/KIT\s+DE\s+CORRER|CONJ(?:UNTO)?\.?\s+KIT/.test(t)) return "KIT";
  // Baguete de porta pivotante é acabamento e, no romaneio operacional, acompanha os alizares.
  if(/BAGUETE\s+P\/?\s*PORTA\s+PIVOTANTE|\bALIZAR\b|CONJ(?:UNTO)?\.?\s+L\s*(MAIOR|MENOR)/.test(t)) return "ALIZAR";
  if(/\bMARCO\b|\bBATENTE\b|PERNA(?:S)?\s+DE\s+MARCO|TRAVESSA(?:S)?\s+DE\s+(MARCO|BATENTE)/.test(t)) return "MARCO";
  if(/FOLHA\s+DE\s+PORTA|\bPORTA\s+(SOLIDA|SEMISSOLIDA|COLMEIA|DE\s+CORRER|PIVOTANTE)/.test(t)) return "PORTA";
  // Muitos pedidos usam a abreviação "DOBR AÇO...", por isso não basta procurar DOBRADIÇA.
  if(/\bDOBR(?:\b|ADI)|FECHADURA|FERRAGEN|PUXADOR|TRINCO|ROLETE|GUIA\s+(?:DE\s+)?PORTA|PARAFUS|CONCHA\s+PADO|TRAVA\s+IX|PIVOTANTE\s+C\/ESFERA/.test(t)) return "FERRAGEM";
  return "OUTRO";
}

export function rowRole(row:Pick<PackageRow,"product"|"category"|"role">):RowRole{
  if(row.role) return row.role;
  const t=norm(row.product);
  if(row.category==="PORTA") return "PORTA";
  if(row.category==="MARCO"){
    if(t.includes("TRAVESSA")) return "MARCO_TRAVESSA";
    if(t.includes("DOBRAD")&&t.includes("DIREITA")) return "MARCO_DOBRADICA_DIREITA";
    if(t.includes("CONTRATESTA")&&t.includes("DIREITA")) return "MARCO_CONTRATESTA_DIREITA";
    if(t.includes("DOBRAD")&&t.includes("ESQUERDA")) return "MARCO_DOBRADICA_ESQUERDA";
    if(t.includes("CONTRATESTA")&&t.includes("ESQUERDA")) return "MARCO_CONTRATESTA_ESQUERDA";
    return "MARCO_PERNA_SEM_MAO";
  }
  if(row.category==="ALIZAR"){
    if(t.includes("L MAIOR") && t.includes("TRAV")) return "ALIZAR_MAIOR_TRAVESSA";
    if(t.includes("L MAIOR")) return "ALIZAR_MAIOR_PERNA";
    if(t.includes("L MENOR") && t.includes("TRAV")) return "ALIZAR_MENOR_TRAVESSA";
    return "ALIZAR_MENOR_PERNA";
  }
  if(row.category==="KIT") return "KIT";
  if(row.category==="FERRAGEM") return "FERRAGEM";
  return "OUTRO";
}

export function compactItemIds(ids:string[]):string{
  const unique=[...new Set(ids.map(clean).filter(Boolean))];
  const parsed=unique.map(id=>({id,m:id.match(/^(\d+)\.(\d+)$/)}));
  const loose=parsed.filter(x=>!x.m).map(x=>x.id);
  const bySuffix=new Map<string,number[]>();
  for(const x of parsed){if(!x.m)continue;const arr=bySuffix.get(x.m[2])||[];arr.push(Number(x.m[1]));bySuffix.set(x.m[2],arr)}
  const parts:string[]=[];
  for(const [suffix,nums0] of [...bySuffix.entries()].sort((a,b)=>Number(a[0])-Number(b[0]))){
    const nums=[...new Set(nums0)].sort((a,b)=>a-b); if(!nums.length)continue;
    let start=nums[0],prev=nums[0];
    const push=()=>parts.push(start===prev?`${start}.${suffix}`:`${start}.${suffix} ao ${prev}.${suffix}`);
    for(let i=1;i<nums.length;i++){if(nums[i]===prev+1){prev=nums[i];continue}push();start=prev=nums[i]} push();
  }
  parts.push(...loose); return parts.join(" / ");
}
export function itemsText(ids:string[]):string|undefined{const c=compactItemIds(ids);return c?(ids.length===1?`Item ${c}`:`Itens ${c}`):undefined}

export function sourceParent(item:string){return item.includes(".")?item.split(".")[0]:undefined}
export function buildSourceCatalog(raw:Array<Omit<SourceCatalogItem,"used">>, usedBy:Map<string,string[]>):SourceCatalogItem[]{
  const childMap=new Map<string,string[]>();
  for(const i of raw){const p=sourceParent(i.item);if(p){const arr=childMap.get(p)||[];arr.push(i.item);childMap.set(p,arr)}}
  return raw.map(i=>({
    ...i,
    parentItem:sourceParent(i.item),
    isParent:!i.item.includes(".") && childMap.has(i.item),
    children:childMap.get(i.item)||[],
    used:(usedBy.get(i.item)||[]).length>0 || (!i.item.includes(".") && childMap.has(i.item)),
    usedBy:usedBy.get(i.item)||[],
  }));
}

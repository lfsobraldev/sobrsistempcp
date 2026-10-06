import type { Produto } from "@/types/pcp";
import { compareProduction, parseMeasure } from "@/lib/domain/industrial";

export const DIM_PRINCIPAL: 0 | 1 = 1;
const norm=(v:unknown)=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim();
export function dims(medida:string):[number,number,number]{return parseMeasure(medida)}
export const FAMILIAS=["BATENTES","ALIZARES","KIT CORRER","BAGUETE","PORTAS","BANDEIRA","OUTROS"] as const;
export type Familia=(typeof FAMILIAS)[number];
export function familiaDe(categoria:string):Familia{const c=norm(categoria);if(c.startsWith("BATENTE"))return"BATENTES";if(c.startsWith("ALIZAR"))return"ALIZARES";if(c.startsWith("KIT"))return"KIT CORRER";if(c.startsWith("BAGUETE"))return"BAGUETE";if(c.startsWith("PORTA"))return"PORTAS";if(c.startsWith("BANDEIRA"))return"BANDEIRA";return"OUTROS"}
type Chave=Pick<Produto,"categoria"|"material"|"acabamento"|"cor"|"medida"|"rebaixo">;
export function compareChave(a:Chave,b:Chave){return compareProduction({...a},{...b})}
export function compareProduto(a:Produto,b:Produto){return compareProduction(a,b)}

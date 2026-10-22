import { z } from "zod";
import { createHash } from "node:crypto";
import { loadRobustTable, normalizeImportHeader, parseImportNumber } from "./import-reader";

export const unidadeSchema = z.enum(["SUL", "NORDESTE"]);
export const mesSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine(v => Number(v.slice(0,4)) >= 1900 && Number(v.slice(0,4)) <= 2200, "Ano inválido");
export const querySchema = z.object({
  unidade: z.enum(["SUL", "NORDESTE", "CONSOLIDADO"]),
  mes: z.union([mesSchema, z.literal("")]).default(""),
  estado: z.enum(['ATIVO','PLANEJADO','ENCERRADO','TODOS']).default('ATIVO'),
  pedidos: z.string().max(4000).default(''),
  busca: z.string().max(160).default(""),
  filtros: z.string().max(2000).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  sort: z.enum(["filtro", "quantidade", "data", "pedido"]).default("filtro"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  formato: z.enum(["csv", "xlsx"]).optional(),
});
export function mesDaData(value: string): string | null {
  let iso = value.trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(iso);
  if (br) iso = `${br[3]}-${br[2]}-${br[1]}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === iso && mesSchema.safeParse(iso.slice(0,7)).success ? iso : null;
}
export function moverMes(mes: string, delta: number) {
  const [y,m] = mesSchema.parse(mes).split("-").map(Number);
  return new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7);
}
export const aliases = {
  filtro: ["Filtro", "Codigo Filtro", "Numero Filtro"],
  descricao: ["Descricao", "Descricao Produto", "Descricao Filtro"],
  produto: ["Produto", "Codigo Produto", "Codigo"],
  quantidade: ["Quantidade Pecas", "Quantidade", "Qtde", "Qtd"],
  pedido: ["Pedido", "Numero Pedido"], item: ["Item", "Item Pedido", "Nº Item", "Numero Item"],
  of: ["OF", "OF's", "Ordem Fabricacao"], data: ["Data Programacao", "Data", "Data Entrega"],
};
export type LinhaMensal = { filtro: string; descricao: string; produto: string; quantidade: number; pedido: string; item: string; of: string; data: string | null; chave: string };
export function chaveNatural(l: Omit<LinhaMensal, "chave">) {
  return createHash("sha256").update(JSON.stringify([l.filtro,l.pedido,l.item,l.produto,l.of,l.data,l.descricao])).digest("hex");
}
export async function previaMensal(file: File, mes: string) {
  mesSchema.parse(mes);
  if (file.size > 4 * 1024 * 1024) throw new Error("Envie arquivos de até 4 MB.");
  const tabela = await loadRobustTable(file, aliases);
  if (tabela.rows.length > 10000) throw new Error("Máximo de 10.000 linhas por lote.");
  const erros: {linha:number; mensagem:string}[] = [], avisos: {linha:number; mensagem:string}[] = [];
  const chaves = new Set<string>();
  const meses = new Map<string,number>();
  const linhas = tabela.rows.map((r, i): LinhaMensal => {
    const get = (k: keyof typeof aliases) => { const wanted = aliases[k].map(normalizeImportHeader); const key = Object.keys(r).find(h => wanted.includes(normalizeImportHeader(h))); return key ? r[key].trim() : ""; };
    const dataBruta = get("data");
    const data = dataBruta ? mesDaData(dataBruta) : null;
    const linha = { filtro:get("filtro"), descricao:get("descricao"), produto:get("produto"), quantidade:parseImportNumber(get("quantidade")) ?? NaN, pedido:get("pedido"), item:get("item"), of:get("of"), data };
    if (!linha.filtro || (!linha.produto && !linha.descricao) || !Number.isFinite(linha.quantidade) || linha.quantidade <= 0) erros.push({linha:i+1,mensagem:"Informe filtro, produto/descrição e quantidade positiva."});
    if (Object.values(linha).some(v=>typeof v === "string" && v.length > 1000)) erros.push({linha:i+1,mensagem:"Campo excede 1.000 caracteres."});
    if (dataBruta && !data) erros.push({linha:i+1,mensagem:"Data inválida; use DD/MM/AAAA ou AAAA-MM-DD."});
    if (data) { const m = data.slice(0,7); meses.set(m,(meses.get(m) || 0)+1); if (m !== mes) avisos.push({linha:i+1,mensagem:`Data pertence a ${m}; competência selecionada será ${mes}.`}); }
    else if (!dataBruta) avisos.push({linha:i+1,mensagem:"Sem data; não será calculado atraso."});
    const chave = chaveNatural(linha);
    if (chaves.has(chave)) erros.push({linha:i+1,mensagem:"Chave repetida no arquivo. Consolide a quantidade antes de importar."});
    chaves.add(chave);
    return {...linha,chave};
  });
  if (!linhas.length) erros.push({linha:0,mensagem:"Arquivo sem linhas válidas."});
  const hash = createHash("sha256").update(new Uint8Array(await file.arrayBuffer())).digest("hex");
  return {linhas,erros,avisos,avisosArquivo:tabela.warnings,hash,mesSugerido:[...meses].sort((a,b)=>b[1]-a[1])[0]?.[0] ?? null,total:linhas.length};
}
export function csvSeguro(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g,'""')}"`;
}

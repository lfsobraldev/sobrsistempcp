/** Conferência fiscal da NF-e de entrada: NCM/CFOP do XML × cadastro fiscal do produto. */
export type ItemFiscalXml = { nItem: number; codigo: string; ncm: string; cfop: string };
const tag = (xml: string, t: string) => new RegExp(`<${t}>([^<]*)</${t}>`).exec(xml)?.[1]?.trim() ?? "";

export function extrairFiscalNfe(xml: string): ItemFiscalXml[] {
  if (xml.length > 5_000_000) throw new Error("XML grande demais.");
  const dets = [...xml.matchAll(/<det\b[^>]*nItem="(\d+)"[^>]*>([\s\S]*?)<\/det>/g)];
  return dets.map((m) => ({ nItem: Number(m[1]), codigo: tag(m[2], "cProd"), ncm: tag(m[2], "NCM"), cfop: tag(m[2], "CFOP") }));
}
export type DivergenciaFiscal = { nItem: number; codigo: string; tipo: "SEM_CADASTRO_FISCAL" | "NCM_DIVERGE" | "CFOP_ENTRADA_INVALIDO"; xml?: string; cadastro?: string };
/** cadastro: código do produto → NCM. cfopsEntrada: CFOPs de entrada aceitos (cadastro fis_cfop). */
export function conferirFiscalEntrada(itens: ItemFiscalXml[], cadastro: Map<string, string>, cfopsEntrada: Set<string>): DivergenciaFiscal[] {
  const out: DivergenciaFiscal[] = [];
  for (const i of itens) {
    const ncm = cadastro.get(i.codigo);
    if (ncm == null) out.push({ nItem: i.nItem, codigo: i.codigo, tipo: "SEM_CADASTRO_FISCAL", xml: i.ncm });
    else if (ncm !== i.ncm) out.push({ nItem: i.nItem, codigo: i.codigo, tipo: "NCM_DIVERGE", xml: i.ncm, cadastro: ncm });
    if (cfopsEntrada.size && !cfopsEntrada.has(i.cfop)) out.push({ nItem: i.nItem, codigo: i.codigo, tipo: "CFOP_ENTRADA_INVALIDO", xml: i.cfop });
  }
  return out;
}

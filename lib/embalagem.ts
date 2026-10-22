type Row = Record<string, any>;

/** Converte os pallets do romaneio preparado no formato do plano de embalagem. */
export function paletesDoRomaneio(resultado: Row): Row[] {
  const pacotes: Row[] = Array.isArray(resultado?.packages) ? resultado.packages : [];
  return pacotes.map((p) => ({
    tipo: String(p.packageType || "PORTA").slice(0, 30),
    limiteM3: p.limitM3 ?? null,
    volumeM3: p.totalVolume ?? 0,
    limiteQtd: p.limitQuantity ?? null,
    status: p.status || "VALIDO",
    regra: String(p.ruleApplied || ""),
    itens: (Array.isArray(p.rows) ? p.rows : []).map((r: Row) => ({
      descricao: String(r.product || r.description || "Item"),
      medida: r.lengthMm && r.widthMm ? `${r.lengthMm}x${r.widthMm}${r.thicknessMm ? "x" + r.thicknessMm : ""}` : "",
      quantidade: Number(r.quantity || 0),
    })),
  }));
}


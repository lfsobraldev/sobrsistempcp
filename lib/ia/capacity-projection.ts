/** Projeção aproximada por capacidade finita agregada do processo.
 * Não representa APS por máquina nem considera setups ou paradas não apontadas.
 */
export function projetarFilaPorCapacidade<T extends {saldo:number}>(
  itens: readonly T[],
  capacidadePorTurno: number | null | undefined
): Array<T & {turnoRelativoInicio:number|null;turnoRelativoFim:number|null}> {
  const capacidade=Number(capacidadePorTurno || 0);
  const valida=Number.isFinite(capacidade)&&capacidade>0;
  let cargaAcumulada=0;
  return itens.map(item=>{
    const saldo=Math.max(0,Number.isFinite(item.saldo)?item.saldo:0);
    const inicio=valida?Math.floor(cargaAcumulada/capacidade)+1:null;
    const fim=valida?Math.max(inicio!,Math.ceil((cargaAcumulada+saldo)/capacidade)):null;
    cargaAcumulada+=saldo;
    return {...item,turnoRelativoInicio:inicio,turnoRelativoFim:fim};
  });
}

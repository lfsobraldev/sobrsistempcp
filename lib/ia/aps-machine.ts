export type MaquinaAPS = {
  processo: string; maquina: string; pecas_hora: number | null;
  minutos_disponiveis: number | null; eficiencia: number | null;
  setup_medio: number | null; compatibilidades?: unknown;
};

export type TarefaAPS = {
  id: string; processo: string; pedido: string; of: string;
  produto: string; categoria?: string | null; material?: string | null;
  descricao?: string | null; cor?: string | null; quantidade: number;
  prioridade?: string; ordem_fila?: number; fixada?: boolean;
  data_entrega?: string | null;
};

const txt=(s:unknown)=>String(s??"").trim().toUpperCase();

function suporta(maquina:MaquinaAPS, tarefa:TarefaAPS) {
  if (txt(maquina.processo)!==txt(tarefa.processo))return false;
  const declaradas=maquina.compatibilidades;
  if(declaradas!=null && !Array.isArray(declaradas))return false;
  const compat=Array.isArray(declaradas)
    ? declaradas.filter((v):v is string=>typeof v==="string"&&Boolean(v.trim()))
    : [];
  if(Array.isArray(declaradas) && declaradas.length && compat.length!==declaradas.length)return false;
  if(!compat.length)return true;
  const atributos=[tarefa.produto,tarefa.categoria,tarefa.material,tarefa.cor].map(txt);
  return compat.some(c=>atributos.includes(txt(c)));
}

function prioridadeValor(s:unknown) {
  return txt(s)==="URGENTE"?3:txt(s)==="ALTA"?2:1;
}

/** Simula alocação sem escrever no banco: carga finita e setups por máquina.
 * NÃO considera dependência entre processos, calendário, manutenção ou quebra.
 * Tempos dependem exclusivamente das capacidades preenchidas pelo PCP.
 */
export function simularCapacidadeMaquinas(tarefas:TarefaAPS[], maquinas:MaquinaAPS[]) {
  const estados=maquinas.map(m=>({
    ...m, ocupacaoMinutos:0,grupoAnterior:"",
    tarefasAlocadas:0, pecasAlocadas:0,
    minutosTurno:Number(m.minutos_disponiveis||0),
    velocidadeEfetiva:Number(m.pecas_hora||0)*Number(m.eficiencia??100)/100
  })).filter(m=>m.minutosTurno>0&&m.velocidadeEfetiva>0&&Number.isFinite(m.velocidadeEfetiva));
  const ordenadas=[...tarefas].sort((a,b)=>{
    if(Boolean(a.fixada)!==Boolean(b.fixada))return a.fixada?-1:1;
    if(a.fixada&&b.fixada)return Number(a.ordem_fila||0)-Number(b.ordem_fila||0);
    const pr=prioridadeValor(b.prioridade)-prioridadeValor(a.prioridade);
    if(pr)return pr;
    const da=String(a.data_entrega||"9999-12-31"), db=String(b.data_entrega||"9999-12-31");
    return da.localeCompare(db)||Number(a.ordem_fila||0)-Number(b.ordem_fila||0);
  });
  const alocacoes: Array<{
    id:string;pedido:string;of:string;processo:string;maquina:string;quantidade:number;
    minutosProducao:number;minutosSetup:number;
    turnoRelativoInicio:number;turnoRelativoFim:number;minutosAcumulados:number;
  }>=[];
  const pendentes: Array<{id:string;pedido:string;of:string;processo:string;quantidade:number;motivo:string}>=[];
  for(const tarefa of ordenadas) {
    const quantidade=Number(tarefa.quantidade);
    if(!Number.isFinite(quantidade)||quantidade<=0)continue;
    const compativeis=estados.filter(m=>suporta(m,tarefa));
    if(!compativeis.length){
      pendentes.push({id:tarefa.id,pedido:tarefa.pedido,of:tarefa.of,processo:tarefa.processo,quantidade,
        motivo:"Sem máquina com capacidade válida e compatibilidade cadastrada neste processo"});
      continue;
    }
    const grupo=[txt(tarefa.material),txt(tarefa.cor),txt(tarefa.categoria)].join("|");
    const avaliacoes=compativeis.map(m=>{
      const tempo=quantidade/m.velocidadeEfetiva*60;
      const setup=m.tarefasAlocadas>0&&m.grupoAnterior!==grupo?Math.max(0,Number(m.setup_medio||0)):0;
      return {m,tempo,setup,fim:m.ocupacaoMinutos+tempo+setup};
    });
    avaliacoes.sort((a,b)=>a.fim-b.fim||a.m.maquina.localeCompare(b.m.maquina));
    const escolhido=avaliacoes[0],m=escolhido.m;
    const inicio=m.ocupacaoMinutos;
    const turnoInicio=Math.floor(inicio/m.minutosTurno)+1;
    m.ocupacaoMinutos=escolhido.fim;
    m.grupoAnterior=grupo;
    m.tarefasAlocadas++;
    m.pecasAlocadas+=quantidade;
    alocacoes.push({
      id:tarefa.id,pedido:tarefa.pedido,of:tarefa.of,processo:tarefa.processo,maquina:m.maquina,quantidade,
      minutosProducao:Math.round(escolhido.tempo*10)/10,
      minutosSetup:Math.round(escolhido.setup*10)/10,
      turnoRelativoInicio:turnoInicio,
      turnoRelativoFim:Math.max(turnoInicio,Math.ceil(m.ocupacaoMinutos/m.minutosTurno)),
      minutosAcumulados:Math.round(m.ocupacaoMinutos*10)/10
    });
  }
  return {
    alocacoes,pendentes,
    porMaquina:estados.map(m=>({
      processo:m.processo,maquina:m.maquina,tarefas:m.tarefasAlocadas,pecas:m.pecasAlocadas,
      ocupacaoMinutos:Math.round(m.ocupacaoMinutos*10)/10,
      minutosDisponiveisPorTurno:m.minutosTurno,
      turnosEstimados:Math.ceil(m.ocupacaoMinutos/m.minutosTurno),
    })),
    avisos:[
      "Projeção condicional: utiliza capacidade e setup cadastrados; não representa conclusão em data/hora reais.",
      "Não inclui dependências entre setores, feriados, manutenção, falta de material ou paradas não registradas.",
      "Compatibilidades são obrigatórias quando cadastradas; tarefas sem máquina adequada ficam pendentes.",
    ]
  };
}

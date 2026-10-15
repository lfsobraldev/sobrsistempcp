import { sql } from "@/lib/db";
import { simularCapacidadeMaquinas, type MaquinaAPS, type TarefaAPS } from "@/lib/ia/aps-machine";

export async function consultarAPS() {
  const db=sql();
  const [pg]=await db`select id,filtro,turno,data_programacao from pcp_programacoes
    where status='ATIVA' order by criado_em desc limit 1`;
  if(!pg) return {erro:"Não há programação ativa para simular."};
  const [maquinas,linhas]=await Promise.all([
    db`select processo,maquina,turno,pecas_hora,minutos_disponiveis,eficiencia,setup_medio,compatibilidades
       from pcp_capacidades_maquina where turno=${pg.turno}`,
    db`select o.id::text id,o.processo,p.pedido,p.of,p.produto,p.categoria,p.material,p.descricao,p.cor,
            greatest(o.quantidade_planejada-o.quantidade_produzida,0)::float quantidade,
            p.prioridade,o.ordem_fila,o.fixada,pc.data_entrega::text
       from pcp_operacoes o
       join pcp_produtos p on p.id=o.produto_id
       left join pcp_pedido_controle pc on pc.programacao_id=p.programacao_id and pc.pedido=p.pedido
       where p.programacao_id=${pg.id}
         and o.status<>'CONCLUIDA'
         and greatest(o.quantidade_planejada-o.quantidade_produzida,0)>0
       order by o.processo,o.ordem_fila limit 10001`
  ]);
  const incompleto=linhas.length>10000;
  const resultado=simularCapacidadeMaquinas(
    (incompleto?linhas.slice(0,10000):linhas).map((r:any)=>({
      id:String(r.id),processo:String(r.processo),pedido:String(r.pedido),of:String(r.of||""),
      produto:String(r.produto||""),categoria:r.categoria,material:r.material,descricao:r.descricao,cor:r.cor,
      quantidade:Number(r.quantidade),prioridade:r.prioridade,ordem_fila:Number(r.ordem_fila||0),
      fixada:Boolean(r.fixada),data_entrega:r.data_entrega
    })) as TarefaAPS[],
    maquinas.map((m:any)=>({
      processo:m.processo,maquina:m.maquina,pecas_hora:Number(m.pecas_hora||0),
      minutos_disponiveis:Number(m.minutos_disponiveis||0),eficiencia:Number(m.eficiencia??100),
      setup_medio:Number(m.setup_medio||0),compatibilidades:m.compatibilidades
    })) as MaquinaAPS[]
  );
  return {
    ok:true,fonte:"Capacidades cadastradas e operações da programação ativa",
    programacao:{filtro:pg.filtro,turno:pg.turno},
    totalOperacoesConsultadas:linhas.length,incompleto,...resultado,
    confianca:incompleto?"INCOMPLETO":"CONDICIONAL",
  };
}

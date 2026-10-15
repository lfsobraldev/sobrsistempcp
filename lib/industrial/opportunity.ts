import type {Produto} from "@/types/pcp";

export type DiagnosticoSetor={
 processo:string; operacoes:number; planejado:number; produzidoRegistrado:number;
 saldo:number; bloqueado:number; divergencia:number; refugo:number;
 taxaRegistro:number|null; prioridades:number; recomendacao:string;
};
const n=(v:unknown)=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;

/** Sinais de carga e riscos; nunca representá-los como telemetria, OEE ou lucro real. */
export function diagnosticarSetores(produtos:Produto[]):DiagnosticoSetor[]{
 const grupos=new Map<string,DiagnosticoSetor>();
 for(const p of produtos)for(const o of p.operacoes){
   const processo=o.processo||"SEM_SETOR";
   const row=grupos.get(processo)||{processo,operacoes:0,planejado:0,produzidoRegistrado:0,saldo:0,bloqueado:0,divergencia:0,refugo:0,taxaRegistro:null,prioridades:0,recomendacao:""};
   const planned=n(o.quantidadePlanejada),done=n(o.quantidadeProduzida);
   row.operacoes++;row.planejado+=planned;row.produzidoRegistrado+=done;
   row.saldo+=Math.max(0,planned-done);row.refugo+=n(o.quantidadeRefugo);
   if(o.status==="BLOQUEADA")row.bloqueado+=Math.max(0,planned-done);
   if(o.status==="DIVERGENCIA")row.divergencia+=Math.max(0,planned-done);
   if(p.prioridade==="URGENTE"&&planned>done)row.prioridades++;
   grupos.set(processo,row);
 }
 return [...grupos.values()].map(x=>{
   x.taxaRegistro=x.planejado>0?Math.min(100,Math.round(10000*x.produzidoRegistrado/x.planejado)/100):null;
   x.recomendacao=x.bloqueado||x.divergencia
     ?"Investigar bloqueios e divergências antes de liberar nova carga"
     :x.prioridades?"Revisar pedidos urgentes e sequência deste setor"
     :x.saldo?"Conferir saldo e capacidade disponível antes de reprogramar"
     :"Sem saldo pendente no filtro consultado";
   return x;
 }).sort((a,b)=>(b.bloqueado+b.divergencia)-(a.bloqueado+a.divergencia)||b.saldo-a.saldo);
}
export function resumoIndustrial(setores:DiagnosticoSetor[]){
 const saldo=setores.reduce((v,x)=>v+x.saldo,0);
 const bloqueado=setores.reduce((v,x)=>v+x.bloqueado+x.divergencia,0);
 const refugo=setores.reduce((v,x)=>v+x.refugo,0);
 return {saldoOperacoes:saldo,pecasBloqueadasOuDivergentes:bloqueado,refugoOperacoes:refugo,
  setoresComPendencias:setores.filter(x=>x.saldo>0).length,
  ressalva:"Quantidades por operação/processo, não peças físicas únicas. Sem dados de custo e vendas não é possível estimar lucro. Sem integração de apontamentos não é possível confirmar OEE, produção diária ou metas atingidas."};
}

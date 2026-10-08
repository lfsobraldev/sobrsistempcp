export type Perfil = "PCP" | "GERENTE" | "ENCARREGADO" | "LIDER" | "APONTADOR" | "QUALIDADE";
export type Prioridade = "NORMAL" | "ALTA" | "URGENTE";
export type StatusOperacao = "PENDENTE" | "LIBERADA" | "EM_ANDAMENTO" | "CONCLUIDA" | "BLOQUEADA" | "DIVERGENCIA";

export type Operacao = {
  id: string; produtoId: string; processo: string; sequencia: number; percentual: number;
  status: StatusOperacao; ordemFila: number; quantidadePlanejada: number; quantidadeProduzida: number;
  quantidadeRefugo: number; fixada?: boolean; iniciadoEm?: string|null; finalizadoEm?: string|null;
};
export type Produto = {
  id:string; filtro:string; pedido:string; item:string; produto:string; descricao:string; tipo:string; canal:string;
  rebaixo:string; acabamento:string; cor:string; quantidade:number; pedidoCliente:string; statusEngenharia:string;
  of:string; percentualProduto:number; codigoModelo:string; descricaoModelo:string; outrasCaracteristicas:string;
  categoria:string; material:string; medida:string; prioridade:Prioridade; operacoes:Operacao[];
};
export type DiagnosticoImportacao = {
  linhas:number; pedidos:number; ofs:number; pecas:number; operacoes:number; semRota:number; inconsistenciasRota:number;
  processos:Record<string,number>; regressao?: { aplicavel:boolean; ok:boolean; erros:string[] };
};
export type Programacao = {
  id:string; filtro:string; data:string; turno:string; status:string; origem:string; criadoEm?:string;
  diagnostico?:DiagnosticoImportacao; produtos:Produto[];
};
export type ImportResult = DiagnosticoImportacao & { filtro:string; produtos:Produto[] };
export type Sessao = { usuario:string; perfil:Perfil; processos:string[] };
export type Andon = { id:string; operacao_id:string; processo:string; motivo:string; observacao:string; status:string;
  usuario_abertura:string; criado_em:string; pedido?:string; of?:string; categoria?:string; prioridade?:string; responsavel?:string;
  assumido_por?:string; assumido_em?:string; tratamento_em?:string; resolvido_por?:string; resolvido_em?:string; observacao_final?:string };

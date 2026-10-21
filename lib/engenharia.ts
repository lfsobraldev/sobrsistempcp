import {z} from 'zod';
export const classificacaoSchema=z.enum(['INSUMO','SEMIACABADO','ACABADO','NAO_CLASSIFICADO']);
export const engenhariaEntrada=z.discriminatedUnion('acao',[
 z.object({acao:z.literal('CLASSIFICAR'),produtoId:z.string().uuid(),classificacao:classificacaoSchema}),
 z.object({acao:z.literal('CRIAR_ESTRUTURA'),produtoId:z.string().uuid(),requestId:z.string().uuid(),itens:z.array(z.object({componente_id:z.string().uuid(),quantidade:z.number().finite().positive().max(1000000),perda_percentual:z.number().finite().min(0).max(100)}).strict()).min(1).max(200).refine(a=>new Set(a.map(x=>x.componente_id)).size===a.length,'Componente repetido.')}),
 z.object({acao:z.literal('APROVAR_ESTRUTURA'),id:z.string().uuid()}),
]);
export const ofEntrada=z.discriminatedUnion('acao',[
 z.object({acao:z.literal('CRIAR'),origemId:z.string().uuid(),estruturaId:z.string().uuid(),prazo:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;},'Data inválida.')}),
 z.object({acao:z.enum(['LIBERAR','CONCLUIR','CANCELAR','REABRIR']),id:z.string().uuid()}),
]);

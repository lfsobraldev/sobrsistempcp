import {z} from 'zod';
const data=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;},'Data inválida.');
export const marketingEntrada=z.discriminatedUnion('acao',[
 z.object({acao:z.literal('CRIAR'),requestId:z.string().uuid(),nome:z.string().trim().min(3).max(160),canal:z.enum(['DIGITAL','EVENTO','INDICACAO','REPRESENTANTES','OUTRO']),inicio:data,fim:data,orcamentoCentavos:z.number().int().min(0).max(1000000000000),responsavel:z.string().trim().min(2).max(120)}),
 z.object({acao:z.literal('STATUS'),id:z.string().uuid(),status:z.enum(['ATIVA','PAUSADA','ENCERRADA','CANCELADA'])}),
 z.object({acao:z.literal('DESPESA'),id:z.string().uuid(),requestId:z.string().uuid(),descricao:z.string().trim().min(3).max(240),centavos:z.number().int().positive().max(1000000000000),data}),
 z.object({acao:z.literal('VINCULAR'),id:z.string().uuid(),oportunidadeId:z.string().uuid()}),
]).superRefine((v,ctx)=>{if(v.acao==='CRIAR'&&v.fim<v.inicio)ctx.addIssue({code:'custom',message:'A data final deve ser igual ou posterior à inicial.'});});
export function valorEmCentavos(value:string):number|null{const normal=value.trim().replace(',','.');if(!/^\d+(?:\.\d{1,2})?$/.test(normal))return null;const [inteiro,decimal='']=normal.split('.');const n=Number(inteiro)*100+Number(decimal.padEnd(2,'0'));return Number.isSafeInteger(n)&&n<=1000000000000?n:null;}

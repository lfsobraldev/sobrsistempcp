import { z } from 'zod';
import { scryptSync,randomBytes } from 'node:crypto';
import { requireRoles } from '../auth';
export const PERFIS=['PCP','GERENTE','ENCARREGADO','LIDER','APONTADOR','QUALIDADE','COMERCIAL','LOGISTICA','LIDER_ENTREGAS','SAC'] as const;
export const ETAPAS=['PREPARACAO','COLAGEM_PORTAS','ESQUADRIAS_BORDAS','RECOBRIDORA_PERFIL','USINAGEM_2','LUSTRACAO','CNC','USINAGEM','PLASTIFICADORA','PLASTIFICADORA_PORTAS','EMBALAGEM','EXPEDICAO'] as const;
export const salvarUsuarioSchema=z.object({
 id:z.string().uuid().nullable().default(null),versao:z.string().datetime().nullable().default(null),
 usuario:z.string().regex(/^[a-z0-9._-]{3,80}$/),nome:z.string().trim().min(2).max(150),
 perfil:z.enum(PERFIS),ativo:z.boolean(),senha:z.string().min(12).max(128).optional(),
 acessos:z.array(z.object({unidade:z.enum(['SUL','NORDESTE']),etapas:z.array(z.enum(ETAPAS)).max(ETAPAS.length).refine(a=>new Set(a).size===a.length,"Setor repetido."),turno:z.enum(['A','B'])}).strict()).max(2),
}).strict().superRefine((v,ctx)=>{
 if(!v.id&&!v.senha)ctx.addIssue({code:'custom',message:'Defina uma senha de pelo menos 12 caracteres.'});
 if(v.id&&!v.versao)ctx.addIssue({code:'custom',message:'Atualize a listagem antes de editar.'});
 if(new Set(v.acessos.map(a=>a.unidade)).size!==v.acessos.length)ctx.addIssue({code:'custom',message:'Unidade repetida.'});
 if(v.perfil==='LIDER_ENTREGAS'&&v.acessos.some(a=>!a.etapas.length))ctx.addIssue({code:'custom',message:'Selecione os setores do líder em cada unidade.'});
});
export function hashSenha(senha:string){const salt=randomBytes(16).toString('hex');return 'scrypt$'+salt+'$'+scryptSync(senha,salt,64).toString('hex');}
export async function administradorCentral(){const s=await requireRoles(['PCP']);if(![process.env.ADMIN_USER,process.env.PCP_USER].filter(Boolean).includes(s.usuario))throw new Error('SEM_PERMISSAO');return s;}

import { NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { unidadeHandler } from '@/lib/unidades/handler';
import { unidadeAtual,canalUnidade } from '@/lib/unidades/context';
export const runtime='nodejs';
export const POST=unidadeHandler(async(req:Request)=>{
 const b=z.object({socket_id:z.string().regex(/^\d+\.\d+$/),channel_name:z.string().max(100)}).safeParse(await req.json());
 const unidade=unidadeAtual();if(!b.success||!unidade||b.data.channel_name!==canalUnidade(unidade))return NextResponse.json({error:'Canal não autorizado.'},{status:403});
 const key=process.env.PUSHER_KEY,secret=process.env.PUSHER_SECRET;if(!key||!secret)return NextResponse.json({error:'Tempo real indisponível.'},{status:503});
 const signature=createHmac('sha256',secret).update(b.data.socket_id+':'+b.data.channel_name).digest('hex');
 return NextResponse.json({auth:`${key}:${signature}`},{headers:{'Cache-Control':'no-store'}});
});

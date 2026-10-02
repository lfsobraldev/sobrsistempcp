import { NextResponse } from "next/server";
import { createToken,users } from "@/lib/auth";

export async function POST(req:Request){
  const b=await req.json();
  const found=users().find(x=>x.user===String(b.usuario||"")&&x.pass===String(b.senha||""));
  if(!found)return NextResponse.json({error:"Usuário ou senha inválidos."},{status:401});

  const r=NextResponse.json({ok:true,perfil:found.role});
  r.cookies.set("pcp_session",createToken(found.user!,found.role),{
    httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:43200
  });
  return r;
}

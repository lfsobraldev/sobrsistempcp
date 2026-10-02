import { NextResponse } from "next/server";
import { session } from "@/lib/auth";
export async function GET(){
  const s=await session();
  if(!s)return NextResponse.json({error:"Não autenticado."},{status:401});
  return NextResponse.json(s,{headers:{"Cache-Control":"no-store"}});
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req:NextRequest){
  const p=req.nextUrl.pathname;
  if(p.startsWith("/login")||p.startsWith("/api/auth")||p.startsWith("/_next"))return NextResponse.next();
  if(!req.cookies.get("pcp_session")){
    const u=req.nextUrl.clone();
    u.pathname="/login";
    return NextResponse.redirect(u);
  }
  return NextResponse.next();
}
export const config={matcher:["/((?!favicon.ico).*)"]};

"use client";
export function TableScroll({children,className=""}:{children:React.ReactNode;className?:string}){
  return <div className={`tableScroll ${className}`}><div className="tableWrap">{children}</div></div>;
}
export function FamiliaTabs({value,onChange,familias}:{value:string;onChange:(v:string)=>void;familias:readonly string[]}){
  return <div className="familyTabs">{["TODAS",...familias].map(f=><button type="button" key={f} className={value===f?"active":""} onClick={()=>onChange(f)}>{f}</button>)}</div>;
}

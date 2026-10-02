"use client";import { X } from "lucide-react";
export function Panel({title,subtitle,actions,children,className=""}:any){return <section className={`panel ${className}`}><header><div><h3>{title}</h3>{subtitle&&<p>{subtitle}</p>}</div>{actions}</header>{children}</section>}
export function Kpi({label,value,sub,tone=""}:any){return <div className={`kpi ${tone}`}><span>{label}</span><b>{value}</b>{sub&&<small>{sub}</small>}</div>}
export function Empty({title,sub}:any){return <div className="empty"><b>{title}</b>{sub&&<span>{sub}</span>}</div>}
export function Modal({open,title,children,onClose,footer}:any){if(!open)return null;return <div className="overlay" onMouseDown={e=>{if(e.currentTarget===e.target)onClose()}}><div className="modal"><header><h3>{title}</h3><button onClick={onClose}><X/></button></header><div className="modalBody">{children}</div>{footer&&<footer>{footer}</footer>}</div></div>}
export function Drawer({open,title,children,onClose}:any){return <div className={`drawerWrap ${open?"open":""}`}><div className="drawerShade" onClick={onClose}/><aside className="drawer"><header><h3>{title}</h3><button onClick={onClose}><X/></button></header><div>{children}</div></aside></div>}
export function Status({value}:any){return <span className={`status s-${String(value).toLowerCase()}`}>{String(value).replaceAll("_"," ")}</span>}

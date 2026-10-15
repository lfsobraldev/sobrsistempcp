"use client";
import {useEffect,useMemo,useState} from "react";
import {Card,Field,PageHeader} from "@/components/ui";
import {useOps} from "@/components/operational-provider";
import {LABELS} from "@/lib/metrics";
import {PROCESSOS} from "@/lib/processos";

type Row={data:string;processo:string;maquina:string;turno:string;produzido:number};
type Meta={data:string;processo:string;maquina:string;turno:string;meta:number};
type Cap={processo:string;maquina:string;turno:string;pecas_hora:number|null};
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
const key=(x:{data:string;processo:string;maquina:string;turno:string})=>[x.data,x.processo,x.maquina,x.turno].join("|");
const fmt=(n:number)=>n.toLocaleString("pt-BR",{maximumFractionDigits:0});
export default function Config(){
  const {toast}=useOps();
  const [tab,setTab]=useState<"DIARIO"|"HISTORICO">("DIARIO");
  const [registros,setRegistros]=useState<Row[]>([]);
  const [metas,setMetas]=useState<Meta[]>([]);
  const [capacidades,setCapacidades]=useState<Cap[]>([]);
  const [loading,setLoading]=useState(false);
  const [data,setData]=useState(today());
  const [setor,setSetor]=useState<string>(PROCESSOS[0]||"RECOBRIDORA");
  const [turno,setTurno]=useState("A");
  const [meta,setMeta]=useState("");
  const [produzido,setProduzido]=useState("");
  const [historicoFiltro,setHistoricoFiltro]=useState("TODOS");
  async function load(){
    const end=today();const start=new Date();start.setDate(start.getDate()-6);
    const begin=[start.getFullYear(),String(start.getMonth()+1).padStart(2,"0"),String(start.getDate()).padStart(2,"0")].join("-");
    const r=await fetch("/api/producao-diaria?inicio="+begin+"&fim="+end,{cache:"no-store"});
    const j=await r.json();
    if(r.ok){setRegistros(j.registros||[]);setMetas(j.metas||[]);setCapacidades(j.capacidades||[]);}
    else toast("error",j.error||"Falha ao consultar dados");
  }
  useEffect(()=>{void load();},[]);
  const mapaMetas=useMemo(()=>new Map(metas.map(m=>[key(m),Number(m.meta)])),[metas]);
  const metaSelecionada=metas.find(x=>x.data.slice(0,10)===data&&x.processo===setor&&x.turno===turno&&x.maquina===setor);
  const producaoSelecionada=registros.find(x=>x.data.slice(0,10)===data&&x.processo===setor&&x.turno===turno&&x.maquina===setor);
  function selecionarSetor(processo:string){setSetor(processo);setMeta("");setProduzido("");}
  function selecionarRegistro(x:Row){
    setData(x.data.slice(0,10));setSetor(x.processo);setTurno(x.turno);
    setProduzido(String(x.produzido));setMeta(String(mapaMetas.get(key(x))??""));setTab("DIARIO");
  }
  async function salvar(){
    if(!produzido.trim()&&!meta.trim())return toast("error","Informe a meta ou a produção do dia.");
    setLoading(true);
    try {
      const r=await fetch("/api/producao-diaria",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({data,processo:setor,maquina:setor,turno,produzido,meta})});
      const j=await r.json();
      if(!r.ok)throw Error(j.error||"Falha ao salvar");
      toast("success","Dados salvos para o setor, turno e data.");
      await load();
    }catch(e:any){toast("error",e.message);}finally{setLoading(false);}
  }
  const semana=useMemo(()=>{
    const d=new Date();const out=[] as {data:string;meta:number;produzido:number}[];
    for(let i=6;i>=0;i--){const x=new Date(d);x.setDate(d.getDate()-i);const dia=[x.getFullYear(),String(x.getMonth()+1).padStart(2,"0"),String(x.getDate()).padStart(2,"0")].join("-");
      const rs=registros.filter(y=>y.data.slice(0,10)===dia&&(historicoFiltro==="TODOS"||y.processo===historicoFiltro));
      const ms=metas.filter(y=>y.data.slice(0,10)===dia&&(historicoFiltro==="TODOS"||y.processo===historicoFiltro));
      out.push({data:dia,produzido:rs.reduce((a,b)=>a+Number(b.produzido),0),meta:ms.reduce((a,b)=>a+Number(b.meta),0)});
    }return out;
  },[registros,metas,historicoFiltro]);
  const total=semana.reduce((a,b)=>a+b.produzido,0),metaSemana=semana.reduce((a,b)=>a+b.meta,0);
  const max=Math.max(1,...semana.flatMap(x=>[x.meta,x.produzido]));
  return <><PageHeader eyebrow="Gestão industrial" title="Metas e produção por setor" description="Cadastre metas, registre peças produzidas por dia e acompanhe a semana por setor e turno. Os lançamentos são manuais e não duplicam apontamentos de OF."/>
    <div className="row" style={{gap:8,flexWrap:"wrap",marginBottom:16}}>
      <button className={tab==="DIARIO"?"primary":"secondary"} onClick={()=>setTab("DIARIO")}>Lançamento diário</button>
      <button className={tab==="HISTORICO"?"primary":"secondary"} onClick={()=>setTab("HISTORICO")}>Gráficos e histórico</button>
    </div>
    {tab==="DIARIO"&&<Card title="Meta e produção do dia" subtitle="Cada registro corresponde a um setor, turno e data; salvar novamente atualiza o valor anterior.">
      <div className="form-grid">
        <Field label="Data"><input type="date" value={data} onChange={e=>setData(e.target.value)}/></Field>
        <Field label="Setor / processo"><select value={setor} onChange={e=>selecionarSetor(e.target.value)}>{PROCESSOS.map(x=><option key={x} value={x}>{LABELS[x]||x}</option>)}</select></Field>
        <Field label="Turno"><select value={turno} onChange={e=>setTurno(e.target.value)}><option>A</option><option>B</option><option>C</option></select></Field>
        <Field label="Meta do dia (peças)"><input type="number" min="0" step="1" value={meta} onChange={e=>setMeta(e.target.value)} placeholder="Opcional"/></Field>
        <Field label="Produção realizada (peças)"><input type="number" min="0" step="1" value={produzido} onChange={e=>setProduzido(e.target.value)} placeholder="Quantidade real"/></Field>
      </div><p className="muted">Meta cadastrada: {metaSelecionada ? fmt(Number(metaSelecionada.meta))+" peças" : "não cadastrada"} · Produção lançada: {producaoSelecionada ? fmt(Number(producaoSelecionada.produzido))+" peças" : "não lançada"}. Você pode salvar apenas a meta e registrar a produção depois.</p><div className="row" style={{justifyContent:"flex-end",marginTop:16}}><button className="primary" disabled={loading} onClick={()=>void salvar()}>{loading?"Salvando...":"Salvar lançamento"}</button></div>
      <h3 className="sectionTitle">Configuração das metas por setor</h3>
      <p className="muted">Selecione um setor para definir sua meta diária. Cada setor e turno é configurado individualmente.</p>
      <div style={{overflowX:"auto"}}><table style={{width:"100%"}}><thead><tr><th>Setor</th><th>Meta cadastrada na data</th><th>Produzido</th><th>Ação</th></tr></thead><tbody>
        {PROCESSOS.map(x=>{const m=metas.find(y=>y.data.slice(0,10)===data&&y.processo===x&&y.turno===turno&&y.maquina===x);const real=registros.find(y=>y.data.slice(0,10)===data&&y.processo===x&&y.turno===turno&&y.maquina===x);return <tr key={x}><td>{LABELS[x]||x}</td><td>{m?fmt(Number(m.meta))+" peças":"Não definida"}</td><td>{real?fmt(Number(real.produzido))+" peças":"—"}</td><td><button className="secondary" onClick={()=>{selecionarSetor(x);setMeta(m?String(m.meta):"");setProduzido(real?String(real.produzido):"");}}>Configurar</button></td></tr>})}
      </tbody></table></div>
      <h3 className="sectionTitle">Lançamentos recentes</h3>
      <div style={{overflowX:"auto"}}><table style={{width:"100%"}}><thead><tr><th>Data</th><th>Setor</th><th>Turno</th><th>Meta</th><th>Produzido</th><th>Atingimento</th><th></th></tr></thead><tbody>
        {registros.map(x=>{const m=mapaMetas.get(key(x));return <tr key={key(x)}><td>{x.data.slice(0,10).split("-").reverse().join("/")}</td><td>{LABELS[x.processo]||x.processo}</td><td>{x.turno}</td><td>{m===undefined?"—":fmt(m)}</td><td>{fmt(Number(x.produzido))}</td><td>{m?Math.round(Number(x.produzido)/m*100)+"%":"—"}</td><td><button className="secondary" onClick={()=>selecionarRegistro(x)}>Editar</button></td></tr>})}
        {!registros.length&&<tr><td colSpan={7}>Nenhuma produção diária registrada nos últimos 7 dias.</td></tr>}
      </tbody></table></div>
    </Card>}
    {tab==="HISTORICO"&&<Card title="Evolução dos últimos 7 dias" subtitle="Compara lançamentos manuais e metas cadastradas, sem incluir apontamentos automáticos.">
      <div className="row" style={{alignItems:"center",gap:12,flexWrap:"wrap"}}><label>Filtrar setor</label><select value={historicoFiltro} onChange={e=>setHistoricoFiltro(e.target.value)}><option value="TODOS">Todos os setores</option>{PROCESSOS.map(p=><option value={p} key={p}>{LABELS[p]||p}</option>)}</select></div>
      <div className="row" style={{gap:32,margin:"16px 0",flexWrap:"wrap"}}><div><small>Produzido na semana</small><h2>{fmt(total)} peças</h2></div><div><small>Meta da semana</small><h2>{fmt(metaSemana)} peças</h2></div><div><small>Atingimento</small><h2>{metaSemana?Math.round(total/metaSemana*100)+"%":"—"}</h2></div></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(65px,1fr))",gap:12,overflowX:"auto",padding:"8px 0"}}>
        {semana.map(d=><div key={d.data} style={{minWidth:65}}><div style={{height:170,display:"flex",gap:5,alignItems:"flex-end",justifyContent:"center",borderBottom:"1px solid #a5b1bb"}}>
          <div title={"Meta: "+fmt(d.meta)} style={{width:"38%",height:Math.max(2,d.meta/max*160),background:"#9ba9b8",borderRadius:"4px 4px 0 0"}}/>
          <div title={"Produzido: "+fmt(d.produzido)} style={{width:"38%",height:Math.max(2,d.produzido/max*160),background:"#278f60",borderRadius:"4px 4px 0 0"}}/>
        </div><div style={{textAlign:"center",fontSize:12,marginTop:6}}>{d.data.slice(5).split("-").reverse().join("/")}</div><div style={{textAlign:"center",fontSize:11}}>{fmt(d.produzido)} / {fmt(d.meta)}</div></div>)}
      </div><p className="muted">Cinza: meta · Verde: produzido. Período móvel dos últimos sete dias.</p>
      <h3 className="sectionTitle">Produção por máquina na semana</h3>
      <div style={{overflowX:"auto"}}><table style={{width:"100%"}}><thead><tr><th>Setor</th><th>Turno</th><th>Produzido</th><th>Meta</th><th>%</th></tr></thead><tbody>
      {[...new Set([...registros.map(x=>[x.processo,x.maquina,x.turno].join("|")),...metas.map(x=>[x.processo,x.maquina,x.turno].join("|"))])].filter(x=>historicoFiltro==="TODOS"||x.startsWith(historicoFiltro+"|")).sort().map(id=>{const [p,m,t]=id.split("|");const real=registros.filter(x=>x.processo===p&&x.maquina===m&&x.turno===t).reduce((a,b)=>a+Number(b.produzido),0);const meta=metas.filter(x=>x.processo===p&&x.maquina===m&&x.turno===t).reduce((a,b)=>a+Number(b.meta),0);return <tr key={id}><td>{LABELS[p]||p}</td><td>{t}</td><td>{fmt(real)}</td><td>{fmt(meta)}</td><td>{meta?Math.round(real/meta*100)+"%":"—"}</td></tr>})}
      </tbody></table></div>
    </Card>}
  </>;
}

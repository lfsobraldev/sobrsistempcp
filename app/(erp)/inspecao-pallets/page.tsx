"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { criarUrlRastreioPallet } from "@/lib/pallet-tracking-url";
import {
  Camera, CheckCircle2, ClipboardCheck, FileSpreadsheet, ImagePlus, LockKeyhole, PackageCheck, Plus,
  Printer, RefreshCw, Search, ShieldCheck, Truck, UnlockKeyhole, XCircle
} from "lucide-react";
import { Badge, Card, Drawer, Empty, Field, Modal, PageHeader, StatCard, type Tone } from "@/components/ui";
import { useOps } from "@/components/operational-provider";

type Foto = { id:string; dataUrl?:string|null; url?:string; legenda:string; area:string; usuario:string; criadoEm:string; tipo?:string; ncId?:string|null };
type Pallet = {
  id:string; codigo:string; pedido:string; cliente:string; filtro:string; pallet:string; tipo_produto:string;
  quantidade:number; jogos:number; turno:string; destino:string; montador:string; conferente:string; observacao:string;
  status:string; qualidade_status:string; msac_status:string; qualidade_usuario:string; qualidade_em:string|null;
  qualidade_observacao:string; msac_usuario:string; msac_em:string|null; msac_observacao:string;
  bloqueio_motivo:string; criado_em:string; atualizado_em:string; fotos_count:number; fotos?:Foto[];
  inspecoes?:{id:string;area:string;resultado:string;checklist:Record<string,boolean>;observacao:string;usuario:string;criadoEm:string}[];
  naoConformidades?:any[];
  medicoes?:any[];
  eventos?:{id:number;tipo:string;descricao:string;usuario:string;criadoEm:string}[];
};

type Resumo = { total?:number; liberados?:number; bloqueados?:number; em_liberacao?:number; aguardando?:number };

const CHECKS = [
  ["alinhamento","Alinhamento do pallet"],
  ["amarracao","Amarrações e cintas"],
  ["calcos","Calços e proteção"],
  ["avarias","Sem avarias aparentes"],
  ["quantidade","Quantidade conferida"],
  ["identificacao","Identificação / etiqueta"],
] as const;

function fmt(v:number){return Number(v||0).toLocaleString("pt-BR",{maximumFractionDigits:3});}
function date(v?:string|null){return v?new Date(v).toLocaleString("pt-BR"):"-";}
function statusLabel(v:string){return v.replaceAll("_"," ");}

async function compressImage(file:File){
  const data = await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error("Falha ao ler foto."));r.readAsDataURL(file)});
  const img = await new Promise<HTMLImageElement>((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error("Imagem inválida."));i.src=data});
  const max=1280, scale=Math.min(1,max/Math.max(img.width,img.height));
  const canvas=document.createElement("canvas");canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
  canvas.getContext("2d")?.drawImage(img,0,0,canvas.width,canvas.height);
  return canvas.toDataURL("image/jpeg",.76);
}

export default function InspecaoPallets(){
  const { toast, me } = useOps();
  const isQuality = me?.perfil === "QUALIDADE";
  const [itens,setItens]=useState<Pallet[]>([]),[resumo,setResumo]=useState<Resumo>({}),[busy,setBusy]=useState(false);
  const [q,setQ]=useState(""),[status,setStatus]=useState(""),[selected,setSelected]=useState<Pallet|null>(null);
  const [createOpen,setCreateOpen]=useState(false),[inspectionOpen,setInspectionOpen]=useState(false),[decisionOpen,setDecisionOpen]=useState(false);
  const [decision,setDecision]=useState<{action:string;title:string}|null>(null),[motivo,setMotivo]=useState(""),[obs,setObs]=useState("");
  const [area,setArea]=useState<"QUALIDADE"|"MSAC">("QUALIDADE"),[checklist,setChecklist]=useState<Record<string,boolean>>({}),[inspectionObs,setInspectionObs]=useState("");
  const [labelQr,setLabelQr]=useState(""),[printPending,setPrintPending]=useState(false);
  const [form,setForm]=useState({pedido:"",cliente:"",filtro:"",pallet:"",tipoProduto:"",quantidade:"",jogos:"",turno:"A",destino:"",montador:"",conferente:"",observacao:""});
  const photoRef=useRef<HTMLInputElement|null>(null);

  async function openPallet(id:string){try{const r=await fetch(`/api/pallets?id=${encodeURIComponent(id)}`,{cache:"no-store"}),j=await r.json();if(!r.ok)throw new Error(j.error);setSelected(j.item)}catch(e:any){toast("error",e.message)}}
  async function load(){setBusy(true);try{const p=new URLSearchParams();if(q.trim())p.set("q",q.trim());if(status)p.set("status",status);const r=await fetch(`/api/pallets?${p}`,{cache:"no-store"}),j=await r.json();if(!r.ok)throw new Error(j.error);setItens(j.itens||[]);setResumo(j.resumo||{})}catch(e:any){toast("error",e.message)}finally{setBusy(false)}}
  useEffect(()=>{const t=setTimeout(load,150);return()=>clearTimeout(t)},[q,status]);

  const cards=useMemo(()=>[
    ["Pallets (30 dias)",resumo.total||0,""],
    ["Aguardando",resumo.aguardando||0,"warn"],
    ["Em liberação",resumo.em_liberacao||0,"info"],
    ["Bloqueados",resumo.bloqueados||0,"danger"],
    ["Liberados",resumo.liberados||0,"success"],
  ],[resumo]);

  async function create(){setBusy(true);try{const r=await fetch("/api/pallets",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(form)}),j=await r.json();if(!r.ok)throw new Error(j.error);toast("success","Pallet cadastrado.");setCreateOpen(false);setForm({pedido:"",cliente:"",filtro:"",pallet:"",tipoProduto:"",quantidade:"",jogos:"",turno:"A",destino:"",montador:"",conferente:"",observacao:""});await load()}catch(e:any){toast("error",e.message)}finally{setBusy(false)}}

  async function patch(body:any){setBusy(true);try{const r=await fetch("/api/pallets",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),j=await r.json();if(!r.ok)throw new Error(j.error);toast("success","Registro atualizado.");await load();if(selected)await openPallet(selected.id);return true}catch(e:any){toast("error",e.message);return false}finally{setBusy(false)}}

  async function saveInspection(){if(!selected)return;const ok=await patch({id:selected.id,action:"INSPECIONAR",area,resultado:Object.values(checklist).every(Boolean)?"CONFORME":"PENDENCIA",checklist,observacao:inspectionObs});if(ok){setInspectionOpen(false);setChecklist({});setInspectionObs("")}}
  async function executeDecision(){if(!selected||!decision)return;const ok=await patch({id:selected.id,action:decision.action,motivo,observacao:obs});if(ok){setDecisionOpen(false);setDecision(null);setMotivo("");setObs("")}}
  function openDecision(action:string,title:string){setDecision({action,title});setDecisionOpen(true);setMotivo("");setObs("")}

  async function addPhoto(file?:File){if(!selected||!file)return;setBusy(true);try{const dataUrl=await compressImage(file);const r=await fetch("/api/pallets/fotos",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({palletId:selected.id,dataUrl,area,legenda:`Inspeção ${area}`})}),j=await r.json();if(!r.ok)throw new Error(j.error);toast("success","Foto adicionada.");await load();await openPallet(selected.id)}catch(e:any){toast("error",e.message)}finally{setBusy(false);if(photoRef.current)photoRef.current.value=""}}

  async function printLabel(p:Pallet){
    setBusy(true);
    try{
      let qr="";
      if(p.status==="LIBERADO"){
        const response=await fetch("/api/pallets/public-link",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:p.id})});
        const result=await response.json();
        if(!response.ok)throw new Error(result.error||"Não foi possível criar o link de rastreio.");
        const url=criarUrlRastreioPallet(window.location.origin,result.token);
        qr=await QRCode.toDataURL(url,{errorCorrectionLevel:"M",margin:1,width:240});
      }
      setLabelQr(qr);setSelected(p);setPrintPending(true);
    }catch(e:any){toast("error",e?.message||"Falha ao preparar a etiqueta.")}
    finally{setBusy(false)}
  }

  useEffect(()=>{
    if(!printPending||!selected)return;
    const timer=window.setTimeout(()=>{
      document.body.classList.add("print-pallet-label");
      window.print();
      document.body.classList.remove("print-pallet-label");
      setPrintPending(false);
    },80);
    return()=>window.clearTimeout(timer);
  },[printPending,selected,labelQr]);

  async function exportarRelatorioExcel(){
    if(!itens.length){
      toast("error","Nenhum pallet para exportar.");
      return;
    }

    setBusy(true);

    try{
      /*
       * Busca os detalhes completos de cada pallet porque a listagem
       * resumida não carrega fotos, inspeções, NCs, medições e eventos.
       *
       * Fazemos em pequenos lotes para não disparar dezenas de consultas
       * ao Neon ao mesmo tempo.
       */
      const completos:Pallet[]=[];

      for(let i=0;i<itens.length;i+=4){
        const lote=itens.slice(i,i+4);

        const dados=await Promise.all(
          lote.map(async(p)=>{
            const r=await fetch(
              `/api/pallets?id=${encodeURIComponent(p.id)}`,
              {cache:"no-store"}
            );

            const j=await r.json();

            if(!r.ok){
              throw new Error(
                j.error||
                `Falha ao carregar o pallet ${p.pallet}.`
              );
            }

            return j.item as Pallet;
          })
        );

        completos.push(...dados);
      }

      const {baixarRelatorioPalletsExcel}=
        await import("@/lib/pallet-excel");

      await baixarRelatorioPalletsExcel(
        completos,
        "Relatorio_Inspecao_Pallets"
      );

      toast(
        "success",
        `Relatório gerado com ${completos.length} pallet(s).`
      );
    }catch(e:any){
      toast(
        "error",
        e?.message||
        "Falha ao gerar relatório Excel."
      );
    }finally{
      setBusy(false);
    }
  }

  async function exportarPalletCompleto(pallet:Pallet){
    setBusy(true);

    try{
      const r=await fetch(
        `/api/pallets?id=${encodeURIComponent(pallet.id)}&includeFotos=1`,
        {cache:"no-store"}
      );

      const j=await r.json();

      if(!r.ok){
        throw new Error(
          j.error||
          "Falha ao carregar o relatório do pallet."
        );
      }

      const completo=j.item as Pallet;

      const {baixarRelatorioPalletsExcel}=
        await import("@/lib/pallet-excel");

      const nomeSeguro=String(completo.pallet||completo.codigo||"Pallet")
        .replace(/[\\/:*?"<>|]+/g,"-")
        .replace(/\s+/g,"_");

      await baixarRelatorioPalletsExcel(
        [completo as any],
        `Relatorio_Pallet_${nomeSeguro}`
      );

      toast(
        "success",
        `Relatório completo do pallet ${completo.pallet} gerado.`
      );
    }catch(e:any){
      toast(
        "error",
        e?.message||
        "Falha ao gerar relatório do pallet."
      );
    }finally{
      setBusy(false);
    }
  }

  const tomStatus = (v: string): Tone => (v === "LIBERADO" ? "success" : v === "BLOQUEADO" ? "danger" : v === "EM_LIBERACAO" ? "info" : "warning");
  const tomCard: Record<string, Tone> = { warn: "warning", info: "info", danger: "danger", success: "success", "": "neutral" };
  const fluxo = (st: string) => (st === "LIBERADO" ? "done" : st === "BLOQUEADO" ? "blocked" : "");

  return <>
    <PageHeader
      eyebrow="Qualidade / MSAC"
      title="Inspeção e Liberação de Pallets"
      description="Inspeção com fotos, bloqueio, dupla liberação e etiqueta rastreável."
      actions={<>
        <button disabled={busy || !itens.length} onClick={exportarRelatorioExcel}><FileSpreadsheet /> Exportar relatório Excel</button>
        <button onClick={load}><RefreshCw className={busy ? "spin" : ""} /> Atualizar</button>
        {!isQuality && <button className="primary" onClick={() => setCreateOpen(true)}><Plus /> Novo pallet</button>}
      </>}
    />

    <div className="stats">
      {cards.map(([a, b, t]) => <StatCard key={String(a)} label={a as string} value={b as number} tone={tomCard[String(t)] || "neutral"} />)}
    </div>

    <Card subtitle="Qualidade libera primeiro; MSAC confirma a liberação final" title="Controle de pallets" className="mb"
      actions={
        <div className="row">
          <div className="search" style={{ width: 280 }}><Search /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pedido, pallet, filtro ou cliente..." /></div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 200 }}>
            <option value="">Todos os status</option>
            <option value="AGUARDANDO_INSPECAO">Aguardando inspeção</option>
            <option value="EM_LIBERACAO">Em liberação</option>
            <option value="BLOQUEADO">Bloqueado</option>
            <option value="LIBERADO">Liberado</option>
          </select>
        </div>
      }>
      <div className="tableScroll"><div className="tableWrap">
        <table>
          <thead><tr><th>Pallet</th><th>Pedido</th><th>Cliente</th><th>Filtro</th><th>Tipo</th><th className="num">Qtd</th><th className="num">Jogos</th><th>Qualidade</th><th>MSAC</th><th>Status</th><th>Fotos</th><th>Atualizado</th><th>Ações</th></tr></thead>
          <tbody>
            {itens.map((p) => (
              <tr key={p.id} className={`clickRow ${p.status === "BLOQUEADO" ? "critRow" : ""}`} onClick={() => openPallet(p.id)}>
                <td><b>{p.pallet}</b><small className="palletCode" style={{ display: "block" }}>{p.codigo}</small></td>
                <td>{p.pedido}</td><td>{p.cliente || "-"}</td><td>{p.filtro || "-"}</td><td>{p.tipo_produto || "-"}</td>
                <td className="num">{fmt(p.quantidade)}</td><td className="num">{fmt(p.jogos)}</td>
                <td><Badge tone={tomStatus(p.qualidade_status)}>{statusLabel(p.qualidade_status)}</Badge></td>
                <td><Badge tone={tomStatus(p.msac_status)}>{statusLabel(p.msac_status)}</Badge></td>
                <td><Badge tone={tomStatus(p.status)}>{statusLabel(p.status)}</Badge></td>
                <td>{p.fotos_count || 0}</td><td>{date(p.atualizado_em)}</td>
                <td><div className="rowActions" onClick={(e) => e.stopPropagation()}>
                  <button title="Abrir" onClick={() => openPallet(p.id)}><ClipboardCheck /></button>
                  <button title="Relatório completo" onClick={() => exportarPalletCompleto(p)}><FileSpreadsheet /></button>
                  <button title="Etiqueta" onClick={() => printLabel(p)}><Printer /></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!itens.length && !busy && <Empty title="Nenhum pallet encontrado." sub="Cadastre o primeiro pallet ou altere os filtros." />}
      </div></div>
    </Card>

    <Drawer open={!!selected} title={selected ? `Pallet ${selected.pallet} · Pedido ${selected.pedido}` : "Pallet"} onClose={() => setSelected(null)}>
      {selected && (
        <div className="pallet-detail">
          <p className="muted">{selected.codigo} · {selected.cliente || "Cliente não informado"}{selected.destino ? ` · ${selected.destino}` : ""}</p>

          <div className="release-flow">
            <div className={fluxo(selected.qualidade_status)}><ShieldCheck /><span>Qualidade</span><b>{statusLabel(selected.qualidade_status)}</b><small>{selected.qualidade_usuario || "Aguardando"}</small></div>
            <i>→</i>
            <div className={fluxo(selected.msac_status)}><Truck /><span>MSAC</span><b>{statusLabel(selected.msac_status)}</b><small>{selected.msac_usuario || "Aguardando"}</small></div>
            <i>→</i>
            <div className={fluxo(selected.status)}><PackageCheck /><span>Pallet</span><b>{statusLabel(selected.status)}</b><small>{selected.status === "LIBERADO" ? "Pronto para seguir" : "Controle ativo"}</small></div>
          </div>

          {selected.status === "BLOQUEADO" && (
            <div className="messageStrip error"><LockKeyhole /><div><b>Pallet bloqueado</b><br />{selected.bloqueio_motivo || "Motivo não informado"}</div></div>
          )}

          <dl className="kv kv-3">
            {[["Quantidade", fmt(selected.quantidade)], ["Jogos", fmt(selected.jogos)], ["Turno", selected.turno || "-"], ["Tipo", selected.tipo_produto || "-"], ["Montador", selected.montador || "-"], ["Conferente", selected.conferente || "-"]].map(([a, b]) => (
              <div key={a}><dt>{a}</dt><dd>{b}</dd></div>
            ))}
          </dl>

          <div className="op-actions">
            <button onClick={() => { setArea("QUALIDADE"); setInspectionOpen(true); }}><ClipboardCheck /> Inspecionar Qualidade</button>
            {!isQuality && <button onClick={() => { setArea("MSAC"); setInspectionOpen(true); }}><Truck /> Inspecionar MSAC</button>}
            <button onClick={() => photoRef.current?.click()}><ImagePlus /> Adicionar foto</button>
            <button onClick={() => exportarPalletCompleto(selected)}><FileSpreadsheet /> Relatório completo</button>
            <button onClick={() => printLabel(selected)}><Printer /> Gerar etiqueta</button>
          </div>
          <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => addPhoto(e.target.files?.[0])} />

          <div className="op-actions">
            <button className="success" onClick={() => openDecision("QUALIDADE_LIBERAR", "Liberar pela Qualidade")}><CheckCircle2 /> Liberar Qualidade</button>
            <button className="danger" onClick={() => openDecision("QUALIDADE_BLOQUEAR", "Bloquear pela Qualidade")}><LockKeyhole /> Bloquear Qualidade</button>
            {!isQuality && <>
              <button className="success" disabled={selected.qualidade_status !== "LIBERADO"} onClick={() => openDecision("MSAC_LIBERAR", "Liberar pelo MSAC")}><CheckCircle2 /> Liberar MSAC</button>
              <button className="danger" onClick={() => openDecision("MSAC_BLOQUEAR", "Bloquear pelo MSAC")}><LockKeyhole /> Bloquear MSAC</button>
            </>}
            {["PCP", "GERENTE", "ENCARREGADO"].includes(String(me?.perfil)) && <button className="reopen" onClick={() => openDecision("REABRIR", "Reabrir pallet")}><UnlockKeyhole /> Reabrir</button>}
          </div>

          <h3 className="sectionTitle"><Camera size={16} /> Evidências fotográficas <small>({selected.fotos?.length || 0})</small></h3>
          {selected.fotos?.length ? (
            <div className="photo-grid">
              {selected.fotos.map((f) => (
                <figure key={f.id}>
                  <img src={f.url || f.dataUrl || ""} loading="lazy" decoding="async" alt={f.legenda || "Foto do pallet"} />
                  <figcaption><b>{f.area}</b><small>{f.usuario} · {date(f.criadoEm)}</small></figcaption>
                </figure>
              ))}
            </div>
          ) : <Empty title="Nenhuma foto adicionada." sub="Use “Adicionar foto” para registrar a condição do pallet." />}

          <h3 className="sectionTitle"><ClipboardCheck size={16} /> Inspeções <small>({selected.inspecoes?.length || 0})</small></h3>
          {selected.inspecoes?.length ? selected.inspecoes.slice(0, 8).map((i) => (
            <div className="list-item" key={i.id}><div><b>{i.area} · {i.resultado}</b><small>{i.usuario} · {date(i.criadoEm)}</small>{i.observacao && <span>{i.observacao}</span>}</div></div>
          )) : <span className="muted">Sem inspeções registradas.</span>}

          <h3 className="sectionTitle"><RefreshCw size={16} /> Rastreabilidade <small>({selected.eventos?.length || 0})</small></h3>
          {selected.eventos?.length ? selected.eventos.slice(0, 10).map((e) => (
            <div className="list-item" key={e.id}><div><b>{e.descricao}</b><small>{e.usuario} · {date(e.criadoEm)}</small></div></div>
          )) : <span className="muted">Sem eventos registrados.</span>}
        </div>
      )}
    </Drawer>

    <Modal open={createOpen} title="Cadastrar pallet" onClose={() => setCreateOpen(false)} footer={<><button onClick={() => setCreateOpen(false)}>Cancelar</button><button className="primary" disabled={busy} onClick={create}>Cadastrar pallet</button></>}>
      <div className="form-grid">
        {[["Pedido", "pedido"], ["Cliente", "cliente"], ["Filtro", "filtro"], ["Pallet", "pallet"], ["Tipo de produto", "tipoProduto"], ["Quantidade", "quantidade"], ["Jogos", "jogos"], ["Turno", "turno"], ["Destino", "destino"], ["Montador", "montador"], ["Conferente", "conferente"]].map(([label, key]) => (
          <Field key={key} label={label}><input value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></Field>
        ))}
        <Field label="Observação" className="span-all"><textarea value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} /></Field>
      </div>
    </Modal>

    <Modal open={inspectionOpen} title={`Inspeção · ${area}`} onClose={() => setInspectionOpen(false)} footer={<><button onClick={() => setInspectionOpen(false)}>Cancelar</button><button className="primary" disabled={busy} onClick={saveInspection}>Salvar inspeção</button></>}>
      <div className="checks">
        {CHECKS.map(([key, label]) => (
          <label key={key} className={checklist[key] ? "on" : ""}>
            <input type="checkbox" checked={!!checklist[key]} onChange={(e) => setChecklist({ ...checklist, [key]: e.target.checked })} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <Field label="Observação"><textarea value={inspectionObs} onChange={(e) => setInspectionObs(e.target.value)} placeholder="Descreva avarias, correções, reinspeção ou qualquer condição relevante." /></Field>
    </Modal>

    <Modal open={decisionOpen} title={decision?.title || "Decisão"} onClose={() => setDecisionOpen(false)} footer={<><button onClick={() => setDecisionOpen(false)}>Cancelar</button><button className={decision?.action.endsWith("BLOQUEAR") ? "danger" : "primary"} disabled={busy} onClick={executeDecision}>Confirmar</button></>}>
      {decision?.action.endsWith("BLOQUEAR") && (
        <Field label="Motivo do bloqueio"><textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: pallet desalinhado, amarração incorreta, avaria, quantidade divergente..." /></Field>
      )}
      <Field label="Observação"><textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observação da decisão" /></Field>
    </Modal>

    {selected && <section id="pallet-label-print" className="palletLabelPrint"><header><b>FAMOSSUL • CONTROLE DE PALLET</b><span>{selected.codigo}</span></header><main><div className="labelBig"><small>PALLET</small><b>{selected.pallet}</b></div><div className="labelBig"><small>PEDIDO</small><b>{selected.pedido}</b></div><dl><div><dt>Cliente</dt><dd>{selected.cliente || "-"}</dd></div><div><dt>Filtro</dt><dd>{selected.filtro || "-"}</dd></div><div><dt>Tipo</dt><dd>{selected.tipo_produto || "-"}</dd></div><div><dt>Quantidade</dt><dd>{fmt(selected.quantidade)}</dd></div><div><dt>Jogos</dt><dd>{fmt(selected.jogos)}</dd></div><div><dt>Destino</dt><dd>{selected.destino || "-"}</dd></div></dl><div className={`labelStatus ${selected.status.toLowerCase()}`}>{statusLabel(selected.status)}</div><div className="labelQr">{labelQr?<><img src={labelQr} alt="QR Code para rastreio deste pallet"/><span>Escaneie para consultar o status do pallet</span></>:<span>Rastreio digital disponível após a liberação</span>}</div><div className="labelSign"><span>QUALIDADE: {statusLabel(selected.qualidade_status)} • {selected.qualidade_usuario || "-"}</span><span>MSAC: {statusLabel(selected.msac_status)} • {selected.msac_usuario || "-"}</span></div></main><footer>Gerado em {new Date().toLocaleString("pt-BR")}</footer></section>}
  </>;
}

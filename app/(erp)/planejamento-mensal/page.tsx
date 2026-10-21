'use client';
import { useEffect,useState } from 'react';
import ProgramacaoMensal from '@/components/programacao-mensal';
export default function Page(){const [unidade,setUnidade]=useState<'SUL'|'NORDESTE'|null>(null);const [erro,setErro]=useState('');useEffect(()=>{fetch('/api/unidades',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('Falha no acesso às unidades.');return r.json();}).then(b=>{if(b.selecionada)setUnidade(b.selecionada);else setErro('Selecione uma unidade no cabeçalho do ERP.');}).catch(e=>setErro(e.message));},[]);return unidade?<ProgramacaoMensal unidade={unidade}/>:<p role="status">{erro||'Carregando a unidade…'}</p>;}

import type {MetadataRoute} from 'next';
export default function manifest():MetadataRoute.Manifest{return {name:'Sobral • Chão de fábrica',short_name:'Sobral PCP',lang:'pt-BR',start_url:'/apontamento-operacoes',display:'standalone',background_color:'#f6f8fb',theme_color:'#152d4c',icons:[{src:'/sobral-s.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]};}

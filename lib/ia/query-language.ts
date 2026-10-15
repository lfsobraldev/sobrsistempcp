/** Busca textual tolerante a linguagem natural, sem gerar SQL a partir da pergunta. */
export const PALAVRAS_VAZIAS = new Set([
  "A","AS","O","OS","DE","DA","DO","DAS","DOS","EM","NO","NA","NOS","NAS",
  "COM","E","OU","UM","UMA","UMAS","UNS","QUE","QUAIS","QUAL","QUANTO",
  "QUANTOS","QUANTAS","TEM","TEMOS","EXISTE","EXISTEM","ESTAO","ESTA",
  "ESTOQUE","PECA","PECAS","PRODUCAO","PROGRAMACAO","ME","MOSTRE","QUERO",
  "SABER","PRECISO","SOBRE","POR","PARA","TOTAL","TODOS","TODAS"
]);
export function normalizarTermo(v:unknown) {
  return String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase()
    .replace(/\bTRAVESSAS\b/g,"TRAVESSA").replace(/\bBATENTES\b/g,"BATENTE")
    .replace(/\bALIZARES\b/g,"ALIZAR").replace(/\bPORTAS\b/g,"PORTA")
    .replace(/\bPERNAS\b/g,"PERNA").replace(/\bBAGUETES\b/g,"BAGUETE")
    .replace(/\bRECOBRIDORAS\b/g,"RECOBRIDORA")
    .replace(/\s+/g," ").trim();
}
export function termosDaConsulta(pergunta:unknown):string[] {
  const texto=normalizarTermo(pergunta);
  return [...new Set(texto.split(/[\s,;?!]+/).filter(x=>x.length>=2&&!PALAVRAS_VAZIAS.has(x)))].slice(0,15);
}
export function correspondeConsulta(conteudo:unknown,pergunta:unknown):boolean {
  const termos=termosDaConsulta(pergunta);
  const texto=normalizarTermo(conteudo);
  return termos.every(termo=>texto.includes(termo));
}
/** Aceita o nome oficial ou os apelidos das máquinas usados na fábrica. */
export function processoConhecido(valor:unknown):string {
  const n=normalizarTermo(valor).replace(/[_ ]+/g,"-");
  const aliases:Record<string,string>={
    "RECOBRIDORA-1":"RECOBRIDORA",
    "RECOBRIDORA-I":"RECOBRIDORA",
    "RECOBRIDORA-2":"RECOBRIDORA-2",
    "RECOBRIDORA-II":"RECOBRIDORA-2",
    "LIXADEIRA":"LIXAR",
    "LIXAMENTO":"LIXAR",
    "TUPIA":"USINAGEM-TUPIA",
    "DOBRADICAS":"USINAGEM-DOBRADICAS",
    "CONTRATESTA":"USINAGEM-CONTRATESTA",
    "EXPEDICAO":"EXPEDICAO",
    "EMBALAGEM":"EMBALAGEM-PORTAS"
  };
  return aliases[n]||n;
}

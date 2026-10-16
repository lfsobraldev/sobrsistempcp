/**
 * Consistem → CSV local (primeira execução assistida, depois agendada).
 * Instalar no computador autorizado: npm install --no-save playwright
 * Configurar CONSISTEM_URL e, se necessário, CONSISTEM_MONTH / CONSISTEM_FILTER.
 * Nunca armazena usuário ou senha no repositório.
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(process.cwd(), ".consistem-local");
const PROFILE = path.join(ROOT, "perfil");
const OUT = path.join(ROOT, "csv");
const URL = process.env.CONSISTEM_URL;
const MONTH = process.env.CONSISTEM_MONTH || new Date().toLocaleDateString("pt-BR",{month:"2-digit",year:"numeric"}).replace("/","/");
const FILTER = process.env.CONSISTEM_FILTER || "54";
const INTERACTIVE = process.argv.includes("--configurar");

function log(...a){ console.log(new Date().toISOString(),...a); }
async function fillLabel(page,label,value){
  const element=page.getByText(label,{exact:true}).first();
  if(await element.count()===0)throw new Error("Campo não localizado: "+label);
  // Telas do Consistem podem usar widgets não convencionais; uma associação
  // incorreta nunca deverá submeter parâmetros diferentes silenciosamente.
  const field=element.locator("xpath=following::input[1]");
  await field.fill(value);
}
async function run(){
  if(!URL)throw new Error("Defina CONSISTEM_URL com o endereço autorizado do Consistem.");
  fs.mkdirSync(OUT,{recursive:true});
  const browser=await chromium.launchPersistentContext(PROFILE,{headless:!INTERACTIVE,acceptDownloads:true});
  try{
    const page=browser.pages()[0]||await browser.newPage();
    await page.goto(URL,{waitUntil:"domcontentloaded",timeout:60000});
    if(INTERACTIVE){
      log("Entre no Consistem, abra Programação de Produção - Resumida e configure o filtro.");
      log("Após abrir a tela Detalhada e conferir os parâmetros, pressione Enter aqui.");
      process.stdin.resume();
      await new Promise(resolve=>process.stdin.once("data",resolve));
    }else{
      // Por segurança, não presume seletores de campos com base apenas em capturas.
      // Sem calibração, esse modo NÃO exporta nem envia dados incorretos.
      throw new Error("Rotina automática ainda não calibrada. Execute --configurar para validar os controles do Consistem.");
    }
    const downloadPromise=page.waitForEvent("download",{timeout:120000});
    log("Na tela Detalhada, clique em Exportar → Exportar em CSV.");
    const download=await downloadPromise;
    const name="consistem-"+new Date().toISOString().replace(/[:.]/g,"-")+".csv";
    const target=path.join(OUT,name);
    await download.saveAs(target);
    if(fs.statSync(target).size<100)throw new Error("CSV vazio ou incompleto.");
    log("Arquivo salvo:",target,"bytes:",fs.statSync(target).size);
    log("Envio automático indisponível até validar a correspondência das OFs no Sobral PCP.");
  } finally { await browser.close(); }
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});

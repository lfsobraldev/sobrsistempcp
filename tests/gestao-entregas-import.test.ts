import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {lerControleEntregas} from "../lib/gestao-entregas-import";

test("importação gerencial lê Comercial, PCP, Montagem, Logística e vínculo do Sul",async()=>{
 const wb=new ExcelJS.Workbook();
 const comercial=wb.addWorksheet("Comercial");
 comercial.addRow(["Nº Pedido","Cliente","Prioridade","Valor","Representante","Tipo venda","Tipo pedido","Liberação","Linha","Ferragens"]);
 comercial.addRow([26690,"Cliente de teste","",0,"Comercial A","Venda","Engenharia",null,"Linha Premium","Definido"]);
 const pcp=wb.addWorksheet("PCP");
 pcp.addRow(["Nº Pedido","Cliente","Filtro","Data OF","Kits","Montagem","Volume m³","Peso (Kg)","UF","Cidade","Frete"]);
 pcp.addRow([26690,"Cliente de teste",54,null,100,"MONTADO",2.5,340,"SE","ESTANCIA","CIF"]);
 const montagem=wb.addWorksheet("Montagem e Redespacho");
 montagem.addRow(["Pedido","Cliente","Local"]);montagem.addRow([26690,"Cliente de teste","HS"]);
 const logistica=wb.addWorksheet("Logística");
 logistica.addRow(["Pedido","Cliente","Frete","m³","Peso","UF","Cidade","Disponível","Saída","Transportador"]);
 logistica.addRow([26690,"Cliente de teste","CIF",2.5,340,"SE","ESTANCIA",null,null,"Transportadora A"]);
 const sul=wb.addWorksheet("Produção Sul");
 sul.addRow(["Pedido Sul","Pedido Nordeste"]);sul.addRow([70690,26690]);
 const bytes=Buffer.from(await wb.xlsx.writeBuffer());
 const {itens,linhasPorAba}=await lerControleEntregas(bytes);
 assert.equal(itens.length,1);
 assert.equal(itens[0].pedido,"26690");
 assert.equal(itens[0].cliente,"Cliente de teste");
 assert.equal(itens[0].representante,"Comercial A");
 assert.equal(itens[0].tipo_pedido,"Engenharia");
 assert.equal(itens[0].colecao,"Linha Premium");
 assert.equal(itens[0].status_ferragens,"Definido");
 assert.equal(itens[0].volume_m3,2.5);
 assert.equal(itens[0].peso_kg,340);
 assert.equal(itens[0].local_montagem,"HS");
 assert.equal(itens[0].transportadora,"Transportadora A");
 assert.equal(itens[0].pedido_sul,"70690");
 assert.equal(itens[0].origem_unidade,"SUL");
 assert.equal(itens[0].destino_unidade,"NORDESTE");
 assert.equal(linhasPorAba["Comercial"],1);
 assert.equal(linhasPorAba["Produção Sul"],1);
});

test("pedidos vazios e linhas sem número não viram pedidos inventados",async()=>{
 const wb=new ExcelJS.Workbook();
 const comercial=wb.addWorksheet("Comercial");
 comercial.addRow(["Pedido","Cliente"]);comercial.addRow(["","Sem Pedido"]);comercial.addRow(["ABC","Inválido"]);comercial.addRow([26234,"Empresa X"]);
 const bytes=Buffer.from(await wb.xlsx.writeBuffer());
 const {itens}=await lerControleEntregas(bytes);
 assert.deepEqual(itens.map(x=>x.pedido),["26234"]);
});

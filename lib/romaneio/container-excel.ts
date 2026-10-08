import ExcelJS from "exceljs";
import type { ProcessingResult } from "./types";
import { rowVolume } from "./logistics";
import { compactItemIds } from "./domain";
import { containerTotalGames } from "./container";

export async function createContainerWorkbook(data: ProcessingResult) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Famossul | Container";
  const ws = wb.addWorksheet("Container", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });

  ws.mergeCells("A1:K1");
  ws.getCell("A1").value = "FAMOSSUL · CONTROLE DE PALLETS DE CONTAINER";
  ws.getCell("A1").font = { name: "Arial", size: 15, bold: true, color: { argb: "FFFFFFFF" } };
  ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF174F31" } };
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 26;

  const containerCode = data.orderOptions?.containerCode || "";
  const filter = data.orderOptions?.filtro || "";
  ws.mergeCells("A2:C2"); ws.getCell("A2").value = `Pedido: ${data.orderNumber}`;
  ws.mergeCells("D2:G2"); ws.getCell("D2").value = `Cliente: ${data.client}`;
  ws.mergeCells("H2:K2"); ws.getCell("H2").value = `Destino: ${data.destination || "-"}`;
  ws.mergeCells("A3:C3"); ws.getCell("A3").value = `Container: ${containerCode || "-"}`;
  ws.mergeCells("D3:F3"); ws.getCell("D3").value = `Filtro: ${filter || "-"}`;
  ws.mergeCells("G3:H3"); ws.getCell("G3").value = `Entrega: ${data.delivery || "-"}`;
  ws.mergeCells("I3:K3"); ws.getCell("I3").value = `Pallets: ${data.packages.length}`;
  for (const row of [2,3]) {
    for (let col=1; col<=11; col++) {
      const cell=ws.getCell(row,col); cell.font={name:"Arial",size:9,bold:true}; cell.alignment={vertical:"middle",wrapText:true};
    }
    ws.getRow(row).height=22;
  }

  const headers=["Pallet","Pedido","Item","Código","Jogos","Qtde","Compr.","Largura","Espessura","Produto","Observação"];
  headers.forEach((h,i)=>{const c=ws.getCell(5,i+1);c.value=h;c.font={name:"Arial",size:9,bold:true,color:{argb:"FFFFFFFF"}};c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF2F3A32"}};c.alignment={horizontal:"center",vertical:"middle",wrapText:true};c.border={top:{style:"thin"},left:{style:"thin"},bottom:{style:"thin"},right:{style:"thin"}}});
  ws.getRow(5).height=22;

  let r=6;
  for(const pkg of data.packages){
    const pkgStart=r;
    for(const row of pkg.rows){
      const itemText=row.sourceItems?.length?compactItemIds(row.sourceItems):"";
      const values=[pkg.number,data.orderNumber,itemText,row.sourceCode||row.sourceCodes?.join(" / ")||"",row.games||"",row.quantity||"",row.lengthMm||"",row.widthMm||"",row.thicknessMm||"",row.product||"",row.observation||row.itemText||""];
      values.forEach((value,i)=>{const c=ws.getCell(r,i+1);c.value=value as any;c.font={name:"Arial",size:8.5};c.alignment={horizontal:i>=9?"left":"center",vertical:"middle",wrapText:true};c.border={top:{style:"thin",color:{argb:"FFD0D5D1"}},left:{style:"thin",color:{argb:"FFD0D5D1"}},bottom:{style:"thin",color:{argb:"FFD0D5D1"}},right:{style:"thin",color:{argb:"FFD0D5D1"}}};});
      ws.getRow(r).height=Math.max(20,(row.product||"").length>80?34:20);r++;
    }
    const pkgEnd=r-1;
    if(pkgEnd>pkgStart){ws.mergeCells(`A${pkgStart}:A${pkgEnd}`);ws.getCell(`A${pkgStart}`).alignment={horizontal:"center",vertical:"middle"};}
    ws.getCell(`E${pkgStart}`).note=`Total de jogos do pallet: ${containerTotalGames(pkg)}${pkg.limitQuantity?` · limite ${pkg.limitQuantity}`:""}`;
  }

  const footer=r+1;
  ws.mergeCells(`A${footer}:H${footer}`);
  ws.getCell(`A${footer}`).value=`Observações: ${[data.orderOptions?.romaneioExtraText,...(data.specialInstructions||[])].filter(Boolean).join(" | ")}`;
  ws.getCell(`A${footer}`).alignment={wrapText:true,vertical:"middle"};
  ws.mergeCells(`I${footer}:K${footer}`);
  const totalM3=data.packages.reduce((sum,p)=>sum+p.rows.reduce((s,row)=>s+rowVolume(row),0),0);
  ws.getCell(`I${footer}`).value=`Total m³: ${totalM3.toFixed(3).replace(".",",")}`;
  ws.getCell(`I${footer}`).font={bold:true};ws.getCell(`I${footer}`).alignment={horizontal:"center",vertical:"middle"};

  const widths=[9,10,18,14,9,9,10,9,9,42,34];
  widths.forEach((w,i)=>ws.getColumn(i+1).width=w);
  ws.views=[{state:"frozen",ySplit:5}];
  ws.autoFilter={from:{row:5,column:1},to:{row:5,column:11}};
  ws.pageSetup.printArea=`A1:K${footer}`;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

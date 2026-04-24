// Renders any DOM node as a multi-page A4 PDF using html2canvas + jspdf.
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export async function exportNodeToPdf(node: HTMLElement, fileName: string) {
  // High-res capture for crisp text in the PDF
  const canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    windowWidth: node.scrollWidth,
  });

  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();   // 210
  const pageHeight = pdf.internal.pageSize.getHeight(); // 297

  // Convert px canvas to mm at our chosen scale
  const pxPerMm = canvas.width / pageWidth;
  const pageHeightPx = pageHeight * pxPerMm;

  let renderedPx = 0;
  let pageIndex = 0;

  while (renderedPx < canvas.height) {
    const sliceHeight = Math.min(pageHeightPx, canvas.height - renderedPx);

    // Draw a slice of the source canvas onto a per-page canvas
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeight;
    const ctx = pageCanvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(canvas, 0, -renderedPx);

    const imgData = pageCanvas.toDataURL("image/jpeg", 0.95);
    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, 0, pageWidth, sliceHeight / pxPerMm);

    renderedPx += sliceHeight;
    pageIndex += 1;
  }

  pdf.save(fileName);
}

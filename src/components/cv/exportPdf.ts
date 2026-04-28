// Renders any DOM node as a multi-page A4 PDF using html2canvas + jspdf.
// Smart page breaks: snaps slice boundaries to natural break points
// (between sections / items) and never splits a heading from its content.
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

type BreakPoint = {
  y: number;        // canvas-pixel Y coordinate (preferred slice boundary)
  priority: number; // higher = better break (between sections > between items)
};

type ForbiddenZone = { from: number; to: number }; // do not break inside this Y-range

function collectBreakHints(node: HTMLElement, canvasHeight: number) {
  const nodeRect = node.getBoundingClientRect();
  const ratio = canvasHeight / node.offsetHeight;
  const toCanvasY = (clientY: number) => (clientY - nodeRect.top) * ratio;

  const breakPoints: BreakPoint[] = [];
  const forbidden: ForbiddenZone[] = [];

  // Sections — break BEFORE a section is ideal (priority 3)
  node.querySelectorAll<HTMLElement>('[data-break="section"]').forEach((el) => {
    const r = el.getBoundingClientRect();
    breakPoints.push({ y: toCanvasY(r.top) - 2, priority: 3 });
  });

  // Items — break AFTER an item is good (priority 2)
  node.querySelectorAll<HTMLElement>('[data-break="item"]').forEach((el) => {
    const r = el.getBoundingClientRect();
    breakPoints.push({ y: toCanvasY(r.bottom) + 2, priority: 2 });
  });

  // Headers — never break between header and the next ~80px of content,
  // and never break inside the header itself.
  node.querySelectorAll<HTMLElement>('[data-break="header"]').forEach((el) => {
    const r = el.getBoundingClientRect();
    const top = toCanvasY(r.top);
    // Reserve ~80px (in canvas units) below the header for its first content line.
    const reserveBottom = toCanvasY(r.bottom) + 80 * ratio;
    forbidden.push({ from: top - 2, to: reserveBottom });
  });

  // Keep-together blocks — never break inside.
  node.querySelectorAll<HTMLElement>('[data-keep-together="true"]').forEach((el) => {
    const r = el.getBoundingClientRect();
    forbidden.push({ from: toCanvasY(r.top), to: toCanvasY(r.bottom) });
  });

  breakPoints.sort((a, b) => a.y - b.y);
  return { breakPoints, forbidden };
}

function isInsideForbidden(y: number, zones: ForbiddenZone[]) {
  for (const z of zones) if (y > z.from && y < z.to) return z;
  return null;
}

function pickBreakY(
  currentY: number,
  maxY: number,
  minY: number,
  breakPoints: BreakPoint[],
  forbidden: ForbiddenZone[],
): number {
  // Candidates strictly between (currentY, maxY], not inside forbidden zones.
  const candidates = breakPoints.filter(
    (b) => b.y > currentY + 1 && b.y <= maxY && !isInsideForbidden(b.y, forbidden),
  );

  if (candidates.length) {
    // Prefer candidates above the minimum-fill threshold; among those pick the
    // highest-priority, then the lowest (closest to maxY) to fill the page.
    const goodFill = candidates.filter((b) => b.y >= minY);
    const pool = goodFill.length ? goodFill : candidates;
    const maxPrio = Math.max(...pool.map((b) => b.priority));
    const top = pool.filter((b) => b.priority === maxPrio);
    return top[top.length - 1].y;
  }

  // No candidate fits — fall back to maxY, but try to slide above any
  // forbidden zone we'd land inside (so headers/keep-together blocks move
  // to the next page entirely).
  const zone = isInsideForbidden(maxY, forbidden);
  if (zone && zone.from > currentY + 1) return zone.from;
  return maxY;
}

export async function exportNodeToPdf(node: HTMLElement, fileName: string) {
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

  const pxPerMm = canvas.width / pageWidth;
  const pageHeightPx = pageHeight * pxPerMm;
  const minFillPx = pageHeightPx * 0.55; // avoid almost-empty pages

  const { breakPoints, forbidden } = collectBreakHints(node, canvas.height);

  let currentY = 0;
  let pageIndex = 0;

  while (currentY < canvas.height - 1) {
    const remaining = canvas.height - currentY;
    let sliceEnd: number;

    if (remaining <= pageHeightPx) {
      // Last page — render the rest as-is.
      sliceEnd = canvas.height;
    } else {
      const maxY = currentY + pageHeightPx;
      const minY = currentY + minFillPx;
      sliceEnd = pickBreakY(currentY, maxY, minY, breakPoints, forbidden);

      // Safety: if snap somehow returned <= currentY, force a hard cut so we
      // don't loop forever on a single oversized element.
      if (sliceEnd <= currentY + 10) sliceEnd = maxY;
    }

    const sliceHeight = sliceEnd - currentY;

    // Per-page canvas: full A4 height, white background, content drawn at top.
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = Math.ceil(Math.min(pageHeightPx, remaining));
    const ctx = pageCanvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(canvas, 0, -currentY);
    // Mask anything below the chosen break so we don't show partial next-page content.
    if (sliceHeight < pageCanvas.height) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, sliceHeight, pageCanvas.width, pageCanvas.height - sliceHeight);
    }

    const imgData = pageCanvas.toDataURL("image/jpeg", 0.95);
    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, 0, pageWidth, pageCanvas.height / pxPerMm);

    currentY = sliceEnd;
    pageIndex += 1;
  }

  pdf.save(fileName);
}

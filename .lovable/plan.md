# Smart sidebryting i CV-nedlasting

## Problem
Når CVen lastes ned som PDF, kuttes siden midt i et avsnitt eller rett under en seksjonstittel (f.eks. "FERDIGHETER" øverst på side 2 mens innholdet havner på side 1, eller en jobbeskrivelse splittes midt i en setning).

Årsak: `exportPdf.ts` slicer hele canvas i faste 297mm-blokker uten å ta hensyn til innholdsstrukturen.

## Løsning
Kombiner to grep:

### 1. Markér naturlige bruddpunkter i DOM-en
I `src/components/cv/CvDocument.tsx`:
- Legg `data-break="avoid"` på hver `<Section>`-rot (slik at vi vet hvor en seksjon starter — for å unngå å bryte rett etter en h2)
- Legg `data-break="item"` på hver gjenta-blokk (én jobb, én utdanning, ett prosjekt, ett sertifikat) — disse er trygge bruddpunkter mellom
- Legg `data-break="header"` på hver `<h2>` — disse skal aldri etterlates alene nederst på en side
- Legg `data-keep-together` på "tittel + første linje"-grupper (jobb-tittel + selskap + datolinje) så de ikke splittes

### 2. Snap-til-brudd i exporteren
Omskriv `src/components/cv/exportPdf.ts`:

```text
1. Render hele CV-noden med html2canvas (uendret)
2. FØR rendering: les ut bounding-rects for alle `[data-break]`-elementer
3. Konverter rect.top + rect.bottom til canvas-pixel-koordinater
   (ratio = canvas.height / node.offsetHeight)
4. Bygg sortert liste over kandidat-brudd-Y:
   - Mellom hver "item" (item.bottom)
   - Mellom hver "section" (section.top - litt margin)
   - Aldri rett etter en "header" (header.bottom + neste items første linje må holdes sammen)
5. Loop over sider:
   maxY = currentY + pageHeightPx
   velg største kandidat-Y som er ≤ maxY og > currentY + minPageFill (60% av siden)
   hvis ingen finnes → fall tilbake til maxY (sikkerhetsnett for ekstremt lange enkelt-blokker)
   slice fra currentY til valgt Y, fyll resten av siden med hvit bakgrunn
6. Tegn slice som før i jsPDF
```

### Detaljer
- **Header-orphan-vern**: hvis valgt brudd-Y faller mellom en `data-break="header"` og dens første barn, flytt brudd-Y til over headeren i stedet (headeren går til neste side).
- **Min sidefyll**: ~60% for å unngå nesten-tomme sider når en stor blokk ikke får plass.
- **Maks bryting**: hvis ett enkelt element er høyere enn én side (sjelden), godta hardt kutt i det elementet — ellers blir filen uendelig.
- **Hvit fyll**: når en side ikke fylles helt (fordi vi snappet oppover), tegn en hvit bakgrunn under sliсen så PDF-siden ser ren ut.

## Filer som endres
- `src/components/cv/CvDocument.tsx` — legg til `data-break` / `data-keep-together`-attributter på Section, Experience-items, Education-items, Project-items, Certification-rader og h2-overskrifter (gjelder alle 5 layouts via felles helpers).
- `src/components/cv/exportPdf.ts` — ny snap-til-brudd-logikk før canvas-slicing.

## Verifisering
Etter implementering: be brukeren laste ned en CV med flere lange seksjoner og bekrefte at sider kuttes mellom seksjoner/jobb-blokker, ikke midt i tekst eller under tittler.

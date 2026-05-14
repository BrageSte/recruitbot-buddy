# Søkly — Produkt- og posisjoneringsstrategi

> Strategisk avklaring etter markedsanalyse mai 2026.
> Skal leses sammen med [PROJECT_MEANING.md](./PROJECT_MEANING.md), [PRODUCT_PRINCIPLES.md](./PRODUCT_PRINCIPLES.md) og [MARKET_ANALYSIS.md](./MARKET_ANALYSIS.md).

---

## Beste anbefaling først

Posisjoner Søkly som **et norsk jobbsøker-operativsystem** — ikke "enda en AI-søknadsskriver".

Bygg først kjernen: **CV-import → transparent match → norsk tailoring → jobflow/tracker → anbefalinger → privacy som produktlag**. La automasjon (auto-apply, Chrome-extension) komme etter at kjerneflyten viser aktivering og retention.

---

## Hvorfor denne posisjonen

Markedet har endret seg:

- AI-skriving er mainstream (FINN Jobbindeks 2025: 1 av 3 jobbsøkere bruker AI; 86 % av rekrutterere merker det). "AI skriver søknaden" er ikke lenger en posisjon — det er bordet.
- Norske aktører (Søknadsbasen, Lønna/Jobbe.ai, EnkelCV, Cvenn, Autosøk) eier hver sin smale skive. Ingen eier helheten.
- Internasjonale (Teal, Huntr, Simplify, Jobscan) eier ATS, autofill, tracker — men tilpasser ikke til norsk språk, offentlig sektor, eller norsk personvernfølelse.
- Hullet i markedet er ikke "skrive søknad", men **å binde sammen discovery, match, tailoring, tracking og trust i én norsk-preget arbeidsflyt**.

Dette samsvarer med vårt eksisterende prinsippsett: dashboardet er arbeidsbenken, én sannhetskilde, AI hjelper og brukeren bestemmer.

---

## Fem strategiske bets

| # | Bet | Hvorfor det er forsvarbart |
|---|---|---|
| 1 | **Transparent match som signatur** | Få norske verktøy viser krav-for-krav med evidens fra CV. Det er teknisk overkommelig og kommunikativt sterkt — "vi viser hvorfor". |
| 2 | **Norsk-modus for CV/søknad (privat / offentlig / "uten søknadsbrev")** | Norsk søkepraksis er ikke amerikansk. Offentlig sektor (Webcruiter/Jobbnorge) er en egen verden. Lokal kvalitetsregelmotor slår generisk LLM-output. |
| 3 | **Jobflow OS, ikke bare tracker** | Frister, oppfølging, neste handling, kilder — bundlet inn i én ritualstyrt flyt. Konkurrentene har board, vi bygger driv. |
| 4 | **Privacy som produktlag** | Eksplisitt datakontroll, "ikke til modelltrening"-løfte, EU/Norge-hosting, audit log. Tillit blir det som rettferdiggjør Pro. |
| 5 | **Anbefalingsmotor som løkke mellom match, tracking og discovery** | Arbeidsplassen/NAV + utvalgte arbeidsgiversider. Starter enkelt, men gjør produktet til portal og ikke editor. |

---

## Hva vi bevisst ikke gjør (først)

- **Full auto-apply** — krever credits, e-postkontoer, tredjepartsregistreringer; tillits- og compliance-overhead. La Autosøk bære den risikoen.
- **Bred Chrome-extension med autofill** — OwlApply/Simplify har forsprang. Vi gjør dette i fase 2 når kjernen er låst.
- **Avansert intervjusimulator** — nice-to-have, men trekker fokus fra match/tailoring.
- **B2B-adminpanel/cohort-analytics** — kan komme via partnerpilot etter v1.
- **Generiske statistikk-paneler uten handling** — brudd på prinsipp 1.

---

## Målsegmenter (prioritert)

1. **Aktive jobbsøkere i privat sektor i Norge** — primær. Søker mellom 5–30 jobber, vil ha kontroll og kvalitet, ikke spam.
2. **Karrierebyttere og oppsagte** — høy emosjonell belastning; verdsetter ritualer og momentum.
3. **Studenter og nyutdannede** — prisbevisste; treffes via karrieresentre.
4. **Offentlig sektor-søkere** — egen modus i fase 2; differensieringsmulighet ingen andre tar.
5. **Partnerkanaler (B2B2C)** — karrieresentre, bootcamps, fagforeninger, omskoleringsprogrammer. Fase 3.

---

## Differensiering vs. nærmeste konkurrenter

| Mot | Vinn på | Tap på (ikke bekjemp i v1) |
|---|---|---|
| **Søknadsbasen** | Match-forklaring, anbefalinger, offentlig sektor | Nøkkelferdig "all-in-one"-modenhet |
| **Lønna/Jobbe.ai** | Privacy, prisklarhet, norsk skrivekvalitet, mindre vendor-lock | Lønnsdata-database |
| **EnkelCV** | Discovery, tracker-dybde, offentlig sektor | Pris (de er ekstremt billige) |
| **Cvenn** | AI-søknad, anbefalinger, jobflow | ATS-CV-arven |
| **Autosøk** | Skrivekvalitet, transparens, tillit | Auto-innsending |
| **Teal/Huntr** | Norsk språk, lokal tillit, pris i NOK | Extension + autofill-modenhet |

---

## Navnvurdering — Søkly og alternativer

### Status

"Søkly" er et **arbeidsnavn**. Det skal ikke låses før domene, foretaksnavn og varemerke er sjekket samlet (se [MARKET_ANALYSIS.md](./MARKET_ANALYSIS.md) — domener/varemerke).

### Søkly — pros/cons

**Pro**
- Norsk, kort, mykt; "søk" + "-ly" suffix er moderne og lett å si.
- Få bokstaver, lett å huske, fungerer som verb ("søkly det").
- Skalerer fra "søknad" til hele jobbsøk-domenet.

**Kontra**
- Æ/Ø/Å gir IDN-domene (`xn--skly-jla.no`) — friksjon i lenker, e-post og internasjonal deling.
- Stavevariant-risiko (Sokly, Soekly, Søkely).
- "Søk" alene kan oppleves smalt (bare søknadsfokus).

**Anbefaling:** Hold Søkly som arbeidsnavn. Sikre **både `søkly.no` og `sokly.no`** + sosiale handles. Bytt navn bare hvis varemerke/foretaksnavn blokkerer eller bruker-tester viser klar friksjon.

### Tre alternativer hvis du vil teste mer

| Navn | Idé | Pro | Kontra |
|---|---|---|---|
| **Sokly** | ASCII-variant av Søkly | Ingen IDN-friksjon; samme klang | Mister nordisk preg; svakere som varemerke |
| **Jobblos** | "Los" = pilot/loser; produktet loser deg gjennom jobbsøket | Sterk norsk metafor; uvanlig nok til å huskes; matcher "navigation" | "Los" har maritimt preg som kan skygge for tech |
| **Spor** | Track/trail — minimalistisk, single-syllable | Meget Apple/Rams-aktig; matcher pipeline-metafor; lett internasjonalisering | For abstrakt; vanskelig å SEO-eie; mange treff |

Vurder også: **Karrierebenken**, **Jobbverk**, **Anker**, **Heim**, **Klar**. Alle har trade-offs — Søkly slår fortsatt de fleste på balansen mellom mening, klang og .no-tilgjengelighet.

### Beslutningsregel

> Bytt navn bare hvis (a) `søkly.no` eller `sokly.no` ikke kan sikres, (b) Patentstyret/Brønnøysund blokkerer, eller (c) ≥3 av 5 brukertester sier de ikke skjønner navnet.

---

## Risiko og motargumenter

| Risiko | Hva som kan gå galt | Mitigering |
|---|---|---|
| **For bredt scope** | "Operativsystem" frister til feature-creep. | Beslutningsfilter: "Klarere, raskere eller roligere i morgen?" Hvis nei → kutt. |
| **Match-løftet undergraves** | Hvis match-forklaringen er svak, mister vi signaturen. | Bygg JD-parser + krav-taxonomi tidlig. KPI: brukernes opplevde nytte av forklaringen, ikke bare scoren. |
| **Privacy som markedsføring uten substans** | Konkurrenter har også GDPR-side. | Vis i UI: slett/eksporter, "modellbruk"-toggle, audit log. Dokumenter tekstlig hva vi *ikke* gjør. |
| **Offentlig sektor er nisje** | Krever skjema-støtte og søkerlistelogikk. | Fase 2. Ikke MVP. |
| **Pris-press fra EnkelCV (39 kr)** | Vi havner i prismatch-spiral. | Vinn på opplevd verdi (jobflow + privacy + match). Pro-pris i NOK, ikke credits. |

---

## Oversetting til vårt eksisterende sett

| Eksisterende prinsipp | Hvordan markedsanalysen bekrefter/forsterker |
|---|---|
| Dashboard = arbeidsbenk | Ja — "jobflow OS" er nettopp dette. |
| Én sannhetskilde | Ja — match krever det; tailoring krever det. |
| AI hjelper, brukeren bestemmer | Ja — vinn på transparens, ikke automasjon. |
| Honest tailoring | Ja — norsk-modus + kvalitetssjekk er differensieringen. |
| Norsk first, intl. later | Ja — norsk er moaten. Ikke vann den ut. |
| Sources skal være transparente | Forsterkes — kildeinnsikt blir del av jobflow. |

Ingen prinsipper må endres. Strategien gir oss en **prioriteringslinjal** for hva som skal bygges først.

---

## Beslutninger som kreves (åpne)

1. Rebrand i kodebasen er landet som Søkly visuelt og `sokly` teknisk slug. Endelig markedsbruk låses etter domene-/foretak-/varemerkesjekk.
2. Skal vi ta initiativ til varemerke-søknad nå eller etter v1-launch? *(Foreslått: etter v1, men sikre domener nå.)*
3. Skal Pro-pris settes til 79 kr/mnd (Søknadsbasen-paritet) eller 99 kr/mnd (verdiprising)? *(Foreslått: 99 kr/mnd, men 49 kr/mnd intro-kampanje første 3 mnd.)*
4. Skal offentlig sektor-modus inn i v1 eller fase 2? *(Foreslått: fase 2 — ikke spre fokus.)*

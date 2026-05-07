# Rydde opp i Landing.tsx

## Hva er problemet i dag

Forsiden har syv seksjoner som overlapper mye:

- Hero, Problem, Solution, HowItWorks, Features, DemoBanner, Faq
- "Tilpasset CV", "AI-rekrutterer" og "Søknadsbrev" nevnes i både Solution, HowItWorks og Features – tre ganger.
- To CTA-blokker (Hero + DemoBanner) sier nesten det samme: "Prøv med din CV".
- Footer gjentar lenker som allerede er i header.
- Det er ikke tydelig nok i hero hva produktet faktisk *er* før man scroller.

## Ny struktur (5 seksjoner i stedet for 7)

```text
1. Hero            – Hva det er + én CTA + ett mock-bilde
2. Problem→Løsning – Side-ved-side "Før / Etter", erstatter dagens to seksjoner
3. Slik fungerer det – 3 steg med mocks (uendret form, kortere tekst)
4. FAQ             – Kort, 4 spørsmål
5. Footer-CTA      – Én tydelig avslutning (erstatter DemoBanner + Footer-lenker)
```

Features-grid fjernes – innholdet flettes inn som korte stikkord under hvert "Slik fungerer det"-steg, så vi ikke lister samme funksjoner to ganger.

## Konkrete endringer i `src/pages/Landing.tsx`

**Hero**
- Tydeligere H1: "Jobbhjelpen samler CV, jobbannonser og søknader på ett sted."
- Underrubrikk forklarer mekanikken i én setning: "Last opp CV-en din én gang. Vi henter relevante jobber fra Finn, NAV og Arbeidsplassen, scorer dem mot deg, og skriver tilpasset CV og søknad per jobb."
- Behold én primær CTA ("Prøv med din CV") + én sekundær ("Logg inn"). Fjern "Kom i gang" her – den hører hjemme i bunn.
- Behold MockMatches til høyre.

**Problem + Solution → ett "Før / Etter"-grid**
- Venstre kolonne: 3 punkter "I dag" (CV på fem steder, annonser overalt, søknader fra bunn).
- Høyre kolonne: 3 punkter "Med Jobbhjelpen" (én CV som tilpasses, én innboks for jobber med score, søknader på minutter).
- Halverer antall ord, fjerner overlapp med Features.

**HowItWorks (beholdes, strammes inn)**
- 3 steg med mocks, men:
  - Korte tekster (maks 2 setninger).
  - Under hvert steg: 2-3 stikkord-chips med konkrete funksjoner (f.eks. under steg 2: "FINN RSS", "NAV/Arbeidsplassen", "AI-score med forklaring"). Dette erstatter Features-seksjonen.

**Features-seksjon**: fjernes helt.

**DemoBanner → slått sammen med footer-CTA**
- Én avsluttende blokk med overskrift, kort tekst, én primær CTA ("Prøv demoen") og en lenke ("Eller logg inn").

**FAQ**: beholdes som er, men kuttes til 4 spørsmål (allerede 4 – ok).

**Footer**: forenkles til kun copyright + 2 lenker (Logg inn, Demo). "Kom i gang" fjernes (duplikat).

## Ikke endret

- Mock-komponenter (`MockMatches`, `MockCv`, `MockPipeline`) – brukes som de er.
- Routing, auth-flyt, demo-side.
- Designtokens / farger.

## Resultat

Fra ~290 linjer til ~180. Brukeren forstår innen første skjermbilde hva Jobbhjelpen er, og hver påstand sies kun én gang.

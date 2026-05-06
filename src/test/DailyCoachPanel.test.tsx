import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { describe, expect, it } from "vitest";
import { DailyCoachPanel } from "@/components/DailyCoachPanel";
import type { DailyCoachAction, DailyCoachResult } from "@/lib/dailyCoach";

const action = (patch: Partial<DailyCoachAction> = {}): DailyCoachAction => ({
  id: "steady",
  priority: 100,
  kind: "steady",
  title: "Ta en kort jobbsøkt",
  description: "Bruk 20 minutter på å rydde i jobbsøkingen.",
  ctaLabel: "Åpne jobber",
  href: "/jobs",
  completedBy: "Når én ting er vurdert",
  ...patch,
});

const coach = (primaryAction: DailyCoachAction, secondaryActions: DailyCoachAction[] = []): DailyCoachResult => ({
  statusText: "I dag er det rom for en rolig, fokusert jobbsøkt.",
  primaryAction,
  secondaryActions,
  actions: [primaryAction, ...secondaryActions],
});

const renderPanel = (result: DailyCoachResult) =>
  renderToStaticMarkup(
    <StaticRouter location="/">
      <DailyCoachPanel coach={result} />
    </StaticRouter>,
  );

describe("DailyCoachPanel", () => {
  it("shows a clear empty next-step state", () => {
    const html = renderPanel(coach(action()));

    expect(html).toContain("Dagens coach");
    expect(html).toContain("Ta en kort jobbsøkt");
    expect(html).toContain("Ingen ekstra steg akkurat nå");
  });

  it("renders an active primary action with CTA", () => {
    const html = renderPanel(coach(action({
      id: "high-match-1",
      kind: "high_match",
      title: "Vurder toppmatch: Produktleder",
      description: "88 i match hos Acme.",
      ctaLabel: "Åpne jobb",
      href: "/jobs/job-1",
    })));

    expect(html).toContain("Vurder toppmatch: Produktleder");
    expect(html).toContain("Åpne jobb");
    expect(html).toContain('href="/jobs/job-1"');
  });

  it("renders a busy next-step list without hiding the primary action", () => {
    const html = renderPanel(coach(
      action({
        id: "interview-1",
        kind: "interview",
        title: "Forbered intervju i morgen",
        ctaLabel: "Åpne søknad",
        href: "/applications/app-1",
      }),
      [
        action({ id: "deadline-1", kind: "deadline", title: "Sjekk fristen: Konsulent", ctaLabel: "Åpne jobb" }),
        action({ id: "follow-up-1", kind: "follow_up", title: "Følg opp søknaden", ctaLabel: "Åpne søknad" }),
        action({ id: "queue", kind: "job_queue", title: "Rydd i 4 jobber", ctaLabel: "Sveip jobber" }),
      ],
    ));

    expect(html).toContain("Forbered intervju i morgen");
    expect(html).toContain("4 forslag");
    expect(html).toContain("Sjekk fristen: Konsulent");
    expect(html).toContain("Følg opp søknaden");
    expect(html).toContain("Rydd i 4 jobber");
  });
});

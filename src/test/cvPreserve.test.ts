import { buildPreservedCvSnapshot } from "../../supabase/functions/_shared/cv-preserve.ts";

const originalCv = {
  full_name: "Kari Nordmann",
  email: "kari@example.com",
  phone: "+47 99 88 77 66",
  intro: "Original intro",
  section_order: ["experiences", "skills", "education", "projects", "languages", "certifications"],
  experiences: [
    {
      title: "Prosjektleder",
      company: "Nord AS",
      start: "2022",
      bullets: ["Ledet leveranser", "Koordinerte interessenter"],
    },
    {
      title: "Rådgiver",
      company: "Sør AS",
      start: "2020",
      bullets: ["Skrev beslutningsgrunnlag"],
    },
  ],
  skills: [
    { category: "Prosjekt", items: ["Prioritering", "Workshops"] },
    { category: "Verktøy", items: ["Jira", "Miro"] },
  ],
  education: [
    { degree: "Master", institution: "UiO", start: "2018", end: "2020" },
  ],
  languages: [{ name: "Norsk", level: "Morsmål" }],
  projects: [{ name: "Digital flyt", description: "Forbedret saksflyt." }],
  certifications: [{ name: "PRINCE2", issuer: "PeopleCert", date: "2021" }],
};

describe("buildPreservedCvSnapshot", () => {
  it("keeps original CV items when AI returns a shorter tailored snapshot", () => {
    const aiCv = {
      intro: "Tilpasset intro",
      experiences: [
        {
          title: "Prosjektleder",
          company: "Nord AS",
          start: "2022",
          bullets: ["Ledet relevante leveranser for målgruppen"],
        },
      ],
      skills: [{ category: "Prosjekt", items: ["Prioritering"] }],
      education: [],
      languages: [],
      projects: [],
      certifications: [],
    };

    const next = buildPreservedCvSnapshot(aiCv, originalCv);

    expect(next.intro).toBe("Tilpasset intro");
    expect(next.experiences).toHaveLength(2);
    expect(next.experiences[0].bullets).toEqual(["Ledet relevante leveranser for målgruppen"]);
    expect(next.experiences[1].company).toBe("Sør AS");
    expect(next.skills).toEqual([
      { category: "Prosjekt", items: ["Prioritering", "Workshops"] },
      { category: "Verktøy", items: ["Jira", "Miro"] },
    ]);
    expect(next.education).toHaveLength(1);
    expect(next.languages).toHaveLength(1);
    expect(next.projects).toHaveLength(1);
    expect(next.certifications).toHaveLength(1);
  });

  it("keeps contact fields from the original CV even when AI returns changed values", () => {
    const next = buildPreservedCvSnapshot(
      { full_name: "Feil Navn", email: "wrong@example.com", intro: "Ny intro" },
      originalCv,
    );

    expect(next.full_name).toBe("Kari Nordmann");
    expect(next.email).toBe("kari@example.com");
    expect(next.phone).toBe("+47 99 88 77 66");
  });
});

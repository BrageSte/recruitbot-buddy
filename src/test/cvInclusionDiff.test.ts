import { getOmittedOriginalCvItems } from "@/components/cv/cvInclusionDiff";
import { CvData } from "@/components/cv/types";

const originalCv: CvData = {
  experiences: [
    {
      title: "Prosjektleder",
      company: "Nord AS",
      start: "2022",
      bullets: ["Ledet leveranser"],
    },
    {
      title: "Rådgiver",
      company: "Sør AS",
      start: "2020",
      bullets: ["Skrev beslutningsgrunnlag"],
    },
  ],
  education: [{ degree: "Master", institution: "UiO", start: "2018", end: "2020" }],
  skills: [
    { category: "Prosjekt", items: ["Prioritering", "Workshops"] },
    { category: "Verktøy", items: ["Jira", "Miro"] },
  ],
  languages: [{ name: "Norsk", level: "Morsmål" }],
  projects: [{ name: "Digital flyt", description: "Forbedret saksflyt." }],
  certifications: [{ name: "PRINCE2", issuer: "PeopleCert", date: "2021" }],
};

describe("getOmittedOriginalCvItems", () => {
  it("treats rewritten experience as included when title, company and start match", () => {
    const tailoredCv: CvData = {
      experiences: [
        {
          title: "Prosjektleder",
          company: "Nord AS",
          start: "2022",
          bullets: ["Ledet relevante leveranser for målgruppen"],
        },
      ],
    };

    const groups = getOmittedOriginalCvItems(originalCv, tailoredCv);
    const omittedExperienceLabels = groups
      .find((group) => group.section === "experiences")
      ?.items.map((item) => item.label);

    expect(omittedExperienceLabels).toEqual(["Rådgiver"]);
  });

  it("shows original experiences that are not present in the tailored CV", () => {
    const groups = getOmittedOriginalCvItems(originalCv, { experiences: [] });
    const experienceGroup = groups.find((group) => group.section === "experiences");

    expect(experienceGroup?.items.map((item) => item.label)).toEqual(["Prosjektleder", "Rådgiver"]);
  });

  it("shows omitted skills per skill item", () => {
    const groups = getOmittedOriginalCvItems(originalCv, {
      skills: [{ category: "Prosjekt", items: ["Prioritering"] }],
    });
    const skills = groups.find((group) => group.section === "skills")?.items;

    expect(skills?.map((item) => `${item.detail}:${item.label}`)).toEqual([
      "Prosjekt:Workshops",
      "Verktøy:Jira",
      "Verktøy:Miro",
    ]);
  });

  it("handles missing and empty sections without crashing", () => {
    expect(getOmittedOriginalCvItems(null, {})).toEqual([]);
    expect(getOmittedOriginalCvItems({}, {})).toEqual([]);
  });
});

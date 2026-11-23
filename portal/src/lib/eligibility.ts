import type { CriteriaContent, Criterion, EligibilityResult, Education, Experience } from "@/lib/db/schema";
import { degreeLabel, documentKindLabel } from "@/lib/constants";

type ProfileLike = {
  dateOfBirth: string;
  education: Education[];
  experience: Experience[];
};

function years(from: string, to: string) {
  const a = new Date(from);
  const b = to ? new Date(to) : new Date();
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.max(0, (b.getTime() - a.getTime()) / (365.25 * 86_400_000));
}

/** Reads a CGPA ("3.4/4", "3.4") or a percentage ("72%") as a 4-point CGPA. */
function toCgpa(grade: string) {
  const g = grade.trim();
  const pct = g.match(/([\d.]+)\s*%/);
  if (pct) return (Number(pct[1]) / 100) * 4;
  const frac = g.match(/([\d.]+)\s*\/\s*([\d.]+)/);
  if (frac) return (Number(frac[1]) / Number(frac[2])) * 4;
  const n = Number.parseFloat(g);
  if (!Number.isNaN(n)) return n <= 4 ? n : n <= 5 ? (n / 5) * 4 : (n / 100) * 4;
  if (/first/i.test(g)) return 3;
  if (/second/i.test(g)) return 2.5;
  return null;
}

function check(c: Criterion, p: ProfileLike, docKinds: string[]): { met: boolean; note: string } {
  switch (c.type) {
    case "qualification": {
      const min = Number(c.value);
      const fields = (c.field ?? "").split(",").map((f) => f.trim().toLowerCase()).filter(Boolean);
      const match = p.education.find(
        (e) => Number(e.level) >= min && (!fields.length || fields.some((f) => `${e.field} ${e.degree}`.toLowerCase().includes(f))),
      );
      if (match) return { met: true, note: `${match.degree}, ${match.institution}` };
      const top = [...p.education].sort((a, b) => Number(b.level) - Number(a.level))[0];
      return { met: false, note: top ? `Highest: ${degreeLabel(top.level)} in ${top.field || "unspecified field"}` : "No qualifications entered" };
    }
    case "experience": {
      const total = p.experience.reduce((s, e) => s + years(e.from, e.current ? "" : e.to), 0);
      const need = Number(c.value);
      return { met: total + 0.01 >= need, note: `${total.toFixed(1)} years entered, ${need} needed` };
    }
    case "cgpa": {
      const best = p.education
        .map((e) => toCgpa(e.grade))
        .filter((n): n is number => n !== null)
        .sort((a, b) => b - a)[0];
      const need = Number(c.value);
      if (best === undefined) return { met: false, note: "No CGPA or division entered" };
      return { met: best + 0.001 >= need, note: `Best ${best.toFixed(2)} on a 4-point scale, ${need} needed` };
    }
    case "age": {
      if (!p.dateOfBirth) return { met: false, note: "Date of birth missing" };
      const age = years(p.dateOfBirth, c.cutoffDate || new Date().toISOString());
      const max = Number(c.value);
      return { met: age <= max, note: `Age ${Math.floor(age)} on ${c.cutoffDate || "today"}, limit ${max}` };
    }
    case "document": {
      const has = docKinds.includes(c.value);
      return { met: has, note: has ? "Uploaded" : `${documentKindLabel(c.value)} not uploaded` };
    }
    case "custom":
    default:
      return { met: true, note: "Checked by HR during screening" };
  }
}

/** C6 / D2: checks a profile against the post's criteria. Only mandatory criteria decide `passed`. */
export function checkEligibility(criteria: CriteriaContent | null | undefined, profile: ProfileLike, docKinds: string[]): EligibilityResult {
  const items = (criteria?.items ?? []).map((c) => {
    const r = check(c, profile, docKinds);
    return { key: c.key, label: c.label, mandatory: c.mandatory, met: r.met, note: r.note };
  });
  return { passed: items.every((i) => i.met || !i.mandatory), items, checkedAt: new Date().toISOString() };
}

/** The effective result after any HR override. */
export function isEligible(app: { eligibility: EligibilityResult | null; eligibilityOverride: "met" | "not_met" | null }) {
  if (app.eligibilityOverride) return app.eligibilityOverride === "met";
  return app.eligibility?.passed ?? true;
}

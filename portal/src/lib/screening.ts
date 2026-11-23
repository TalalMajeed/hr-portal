import type { Education, Experience } from "@/lib/db/schema";

/** Total years of experience, counting a current job up to today. */
export function experienceYears(exp: Experience[]) {
  return exp.reduce((sum, e) => {
    const a = new Date(e.from);
    const b = e.current || !e.to ? new Date() : new Date(e.to);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return sum;
    return sum + Math.max(0, (b.getTime() - a.getTime()) / (365.25 * 86_400_000));
  }, 0);
}

/** The highest degree level (see DEGREE_LEVELS), or 0 when none is entered. */
export function highestLevel(edu: Education[]) {
  return edu.reduce((m, e) => Math.max(m, Number(e.level) || 0), 0);
}

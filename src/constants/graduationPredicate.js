/**
 * Graduation predicate thresholds. One place, to be matched against the Universitas Andalas
 * academic regulation. `computeGraduationPredicate` in helpers/graduation-predicate.helper.js
 * applies them.
 */
export const GRADUATION_PREDICATE = Object.freeze({
  WITH_PRAISE: "Dengan Pujian",
  VERY_SATISFACTORY: "Sangat Memuaskan",
  SATISFACTORY: "Memuaskan",
});

export const GRADUATION_PREDICATE_RULES = Object.freeze({
  /** "Dengan Pujian": GPA above this … */
  withPraiseMinGpaExclusive: 3.5,
  /** … and a study length of at most this many semesters (4 years). */
  withPraiseMaxSemesters: 8,
  /** "Sangat Memuaskan": GPA from this (inclusive) up to `withPraiseMinGpaExclusive`. */
  verySatisfactoryMinGpa: 3.01,
  /** "Memuaskan": GPA from this (inclusive) up to `verySatisfactoryMinGpa`. Below it: no predicate. */
  satisfactoryMinGpa: 2.76,
});

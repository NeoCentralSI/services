export function mapScoreToGrade(score) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return '-';
  const s = Number(score);
  if (s >= 80) return "A";
  if (s >= 76) return "A-";
  if (s >= 70) return "B+";
  if (s >= 65) return "B";
  if (s >= 55) return "C+";
  if (s >= 50) return "C";
  if (s >= 45) return "D";
  return "E";
}

/**
 * Seeders: a sample PDF standing in for an uploaded document, and score sheets that give the
 * chosen seminar or defence result under the rubric and the minimum score.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/** A small one-page PDF that stands in for an uploaded document. */
export async function buildSamplePdf(title, lines = []) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawText(String(title).slice(0, 80), { x: 56, y: 770, size: 16, font: bold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText("Dokumen contoh untuk uji coba (seed NeoCentral)", { x: 56, y: 745, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  lines.slice(0, 20).forEach((line, index) => {
    page.drawText(String(line).slice(0, 90), { x: 56, y: 710 - index * 18, size: 11, font });
  });
  return Buffer.from(await doc.save());
}

const sumMax = (criteria) => criteria.reduce((sum, c) => sum + (c.maxScore || 0), 0);

function scoreSheet(criteria, ratio) {
  const scores = criteria.map((c) => ({
    assessmentCriteriaId: c.id,
    score: Math.max(0, Math.min(c.maxScore || 0, Math.round((c.maxScore || 0) * ratio))),
  }));
  return { scores, total: scores.reduce((sum, s) => sum + s.score, 0) };
}

/** Final score as the modules compute it: seminar = examiner average; defence = average + supervisor. */
function finalOf(kind, examinerTotals, supervisorTotal) {
  const average = examinerTotals.reduce((s, v) => s + v, 0) / examinerTotals.length;
  return kind === "seminar" ? average : average + (supervisorTotal ?? 0);
}

/**
 * Score sheets whose final score gives `target` under `config.minimum`: a pass lands around 82%
 * of the maximum, a fail fifteen points under the minimum.
 * `config`: { minimum, examinerCriteria: [{ id, maxScore }], supervisorCriteria: [...] }.
 */
export function generateScores(kind, config, examinerCount, target) {
  const maxTotal = sumMax(config.examinerCriteria) + sumMax(config.supervisorCriteria);
  const passes = target !== "failed";
  let ratio = passes ? Math.max(0.82, Math.min(1, (config.minimum + 5) / maxTotal)) : Math.max(0, (config.minimum - 15) / maxTotal);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const examiners = Array.from({ length: examinerCount }, (_, index) => scoreSheet(config.examinerCriteria, Math.min(1, ratio + (index === 0 ? 0.02 : 0))));
    const supervisor = kind === "defence" ? scoreSheet(config.supervisorCriteria, ratio) : null;
    const final = finalOf(kind, examiners.map((e) => e.total), supervisor?.total);
    if (passes ? final >= config.minimum : final < config.minimum) return { examiners, supervisor, final };
    ratio = passes ? Math.min(1, ratio + 0.03) : Math.max(0, ratio - 0.05);
  }
  throw new Error(`Rubrik tidak bisa menghasilkan ${target} dengan nilai minimum ${config.minimum}.`);
}

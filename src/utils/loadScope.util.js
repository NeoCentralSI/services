import { formatAcademicYearLabel } from "../helpers/academicYear.helper.js";

/** Kuota SIMPTA: Aktif + Booking pada periode yang dipilih (fase proposal). */
export const QUOTA_LOAD_DEFINITION_LABEL =
  "Beban kuota SIMPTA (fase proposal): Aktif + Booking pada periode yang dipilih. Bukan beban pasca-proposal di Monitoring Tugas Akhir.";

/** Monitoring TA: hanya thesis isProposal=false. */
export const SUPERVISOR_LOAD_DEFINITION_LABEL =
  "Beban bimbingan pasca-proposal (modul TA penuh). Thesis yang masih di fase proposal tidak dihitung.";

export const MONITORING_SUMMARY_DEFINITION_LABEL =
  "Ringkasan mencakup thesis aktif semua fase, termasuk proposal. Angka pasca-proposal pada kartu ini sama dengan kartu beban bimbingan.";

export const ALL_PERIODS_LABEL = "Semua periode";

export const KBK_OUTLIER_METHOD_LABEL =
  "Penanda ketimpangan: beban dosen (Aktif+Booking) lebih dari rata-rata + 1 simpangan baku, atau kurang dari rata-rata − 1 simpangan baku. Dihitung dari daftar dosen yang sama dengan tabel kuota, tanpa query tambahan.";

/**
 * @param {object|null|undefined} academicYear
 * @returns {string}
 */
export function periodLabelFromAcademicYear(academicYear) {
  if (!academicYear) return ALL_PERIODS_LABEL;
  return formatAcademicYearLabel(academicYear);
}

/**
 * @param {Array<{ students?: Array<{ thesisId?: string|null }> }>} lecturers
 * @returns {number}
 */
export function uniqueThesisCountFromLoads(lecturers) {
  const ids = new Set();
  for (const lecturer of lecturers ?? []) {
    for (const student of lecturer.students ?? []) {
      if (student.thesisId) ids.add(student.thesisId);
    }
  }
  return ids.size;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function quotaStatusBucket(row) {
  if (row?.isFull === true || row?.trafficLight === "red") return "full";
  if (row?.isNearLimit === true || row?.trafficLight === "yellow") return "near";
  return "available";
}

/**
 * Aggregate quota load per KBK from already-serialized lecturer rows.
 * Load = `currentCount` (Aktif + Booking). Outliers use population SD.
 *
 * @param {Array<{
 *   lecturerId: string,
 *   fullName?: string,
 *   scienceGroup?: string|null,
 *   scienceGroupId?: string|null,
 *   currentCount?: number,
 *   activeCount?: number,
 *   bookingCount?: number,
 *   isFull?: boolean,
 *   isNearLimit?: boolean,
 *   trafficLight?: string,
 * }>} lecturers
 */
export function aggregateKbkLoads(lecturers = []) {
  const rows = Array.isArray(lecturers) ? lecturers : [];
  const loads = rows.map((row) => Number(row.currentCount) || 0);
  const lecturerCount = rows.length;
  const totalLoad = loads.reduce((sum, value) => sum + value, 0);
  const mean = lecturerCount > 0 ? totalLoad / lecturerCount : 0;
  const variance =
    lecturerCount > 0
      ? loads.reduce((sum, value) => sum + (value - mean) ** 2, 0) / lecturerCount
      : 0;
  const stdDev = Math.sqrt(variance);
  const highThreshold = mean + stdDev;
  const lowThreshold = mean - stdDev;
  const canFlag = stdDev > 0;

  let availableCount = 0;
  let nearLimitCount = 0;
  let fullCount = 0;
  const groups = new Map();
  for (const row of rows) {
    const activeCount = Number(row.activeCount) || 0;
    const bookingCount = Number(row.bookingCount) || 0;
    const load = Number(row.currentCount) || activeCount + bookingCount;
    const scienceGroupId = row.scienceGroupId ?? null;
    const scienceGroupName = row.scienceGroup || "Belum terpetakan";
    const key = scienceGroupId || `name:${scienceGroupName}`;
    if (!groups.has(key)) {
      groups.set(key, {
        scienceGroupId,
        scienceGroupName,
        lecturerCount: 0,
        totalLoad: 0,
        activeCount: 0,
        bookingCount: 0,
        lecturers: [],
      });
    }
    const group = groups.get(key);
    group.lecturerCount += 1;
    group.totalLoad += load;
    group.activeCount += activeCount;
    group.bookingCount += bookingCount;
    group.lecturers.push({
      lecturerId: row.lecturerId,
      fullName: row.fullName ?? "-",
      load,
    });

    const bucket = quotaStatusBucket(row);
    if (bucket === "full") fullCount += 1;
    else if (bucket === "near") nearLimitCount += 1;
    else availableCount += 1;
  }

  const grouped = [...groups.values()]
    .map((group) => {
      const aboveAverage = canFlag
        ? group.lecturers.filter((lecturer) => lecturer.load > highThreshold)
        : [];
      const belowAverage = canFlag
        ? group.lecturers.filter((lecturer) => lecturer.load < lowThreshold)
        : [];
      return {
        scienceGroupId: group.scienceGroupId,
        scienceGroupName: group.scienceGroupName,
        lecturerCount: group.lecturerCount,
        totalLoad: group.totalLoad,
        activeCount: group.activeCount,
        bookingCount: group.bookingCount,
        averageLoad: round1(group.lecturerCount > 0 ? group.totalLoad / group.lecturerCount : 0),
        aboveAverage,
        belowAverage,
      };
    })
    .sort((a, b) => {
      if (b.totalLoad !== a.totalLoad) return b.totalLoad - a.totalLoad;
      return a.scienceGroupName.localeCompare(b.scienceGroupName);
    });

  return {
    methodLabel: KBK_OUTLIER_METHOD_LABEL,
    overall: {
      lecturerCount,
      totalLoad,
      averageLoad: round1(mean),
      stdDev: round1(stdDev),
      availableCount,
      nearLimitCount,
      fullCount,
    },
    groups: grouped,
  };
}

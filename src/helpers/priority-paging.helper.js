/**
 * A table sorted by "what needs attention" on the server. The rows of a list are
 * split into groups in priority order (e.g. waiting for the viewer, running, closed); each
 * group keeps its own order (newest first) and the page is the window [skip, skip + take)
 * over the groups laid end to end. Each group is one database query, so no row limit applies.
 */

/** Ascending groups of a priority map: { status: priority } → [[status, ...], ...]. */
export function priorityGroups(priorityMap, onlyStatus = null) {
  const statuses = Object.keys(priorityMap).filter((status) => !onlyStatus || status === onlyStatus);
  const byPriority = new Map();
  for (const status of statuses) {
    const priority = priorityMap[status];
    if (!byPriority.has(priority)) byPriority.set(priority, []);
    byPriority.get(priority).push(status);
  }
  return [...byPriority.entries()].sort((a, b) => a[0] - b[0]).map(([, members]) => members);
}

/**
 * @param {{ key: string, where: object, orderBy: object[] }[]} groups in priority order
 * @param {{ skip: number, take: number }} window
 * @param {{ count: (where) => Promise<number>, find: (where, orderBy, window) => Promise<object[]> }} source
 * @returns {Promise<{ rows: { group: string, row: object }[], total: number, totals: Record<string, number> }>}
 */
export async function pageAcrossGroups(groups, { skip, take }, { count, find }) {
  const counts = await Promise.all(groups.map((group) => count(group.where)));
  const rows = [];
  let offset = skip;
  let remaining = take;
  for (const [index, group] of groups.entries()) {
    if (remaining <= 0) break;
    const groupTotal = counts[index];
    if (offset >= groupTotal) {
      offset -= groupTotal;
      continue;
    }
    const part = await find(group.where, group.orderBy, { skip: offset, take: Math.min(remaining, groupTotal - offset) });
    rows.push(...part.map((row) => ({ group: group.key, row })));
    remaining -= part.length;
    offset = 0;
  }
  return {
    rows,
    total: counts.reduce((sum, value) => sum + value, 0),
    totals: Object.fromEntries(groups.map((group, index) => [group.key, counts[index]])),
  };
}

/** Page number and size from the query; one page holds at most `max` rows. */
export function pageWindow({ page, pageSize } = {}, max = 100) {
  const size = Math.min(Math.max(Number(pageSize) || 10, 1), max);
  const number = Math.max(Number(page) || 1, 1);
  return { page: number, pageSize: size, skip: (number - 1) * size, take: size };
}

export function pageMeta({ page, pageSize }, total) {
  return { page, pageSize, total, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

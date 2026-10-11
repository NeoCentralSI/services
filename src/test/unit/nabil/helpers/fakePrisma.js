/**
 * Minimal in-memory Prisma stand-in for guidance-revival regression tests.
 *
 * Unlike "always allow" mocks, queries are evaluated against fixture rows using the
 * real `where` arguments (equality, `in`, `not`, nested relation objects, `some`), and
 * `include: { relation: { where } }` filters array relations. This lets tests prove
 * that authorization queries (e.g. ThesisSupervisors `status: "active"`) actually
 * exclude released/terminated relations. Top-level scalar `orderBy` (object or array
 * of objects, asc/desc) is applied, so "latest row" lookups are meaningful.
 */

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);
}

export function matches(row, where = {}) {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key === "OR") {
      if (!cond.some((c) => matches(row, c))) return false;
      continue;
    }
    if (key === "AND") {
      if (!cond.every((c) => matches(row, c))) return false;
      continue;
    }
    const value = row?.[key];
    if (isPlainObject(cond)) {
      if ("in" in cond) {
        if (!cond.in.includes(value)) return false;
      } else if ("notIn" in cond) {
        if (cond.notIn.includes(value)) return false;
      } else if ("not" in cond) {
        if (isPlainObject(cond.not) ? matches(value, cond.not) : value === cond.not) return false;
      } else if ("contains" in cond) {
        if (typeof value !== "string" || !value.toLowerCase().includes(String(cond.contains).toLowerCase())) return false;
      } else if ("lte" in cond || "gte" in cond) {
        const v = value instanceof Date ? value.getTime() : new Date(value).getTime();
        if ("lte" in cond && !(v <= new Date(cond.lte).getTime())) return false;
        if ("gte" in cond && !(v >= new Date(cond.gte).getTime())) return false;
      } else if ("some" in cond) {
        if (!Array.isArray(value) || !value.some((item) => matches(item, cond.some))) return false;
      } else if ("every" in cond) {
        if (!Array.isArray(value) || !value.every((item) => matches(item, cond.every))) return false;
      } else {
        if (!isPlainObject(value) || !matches(value, cond)) return false;
      }
    } else if (value !== cond) {
      return false;
    }
  }
  return true;
}

// MySQL ordering: NULL sorts first for asc and last for desc.
function compareValues(a, b, dir) {
  const av = a instanceof Date ? a.getTime() : a;
  const bv = b instanceof Date ? b.getTime() : b;
  const aNull = av === undefined || av === null;
  const bNull = bv === undefined || bv === null;
  if (aNull && bNull) return 0;
  if (aNull) return dir === "desc" ? 1 : -1;
  if (bNull) return dir === "desc" ? -1 : 1;
  if (av === bv) return 0;
  const c = av < bv ? -1 : 1;
  return dir === "desc" ? -c : c;
}

function applyOrderBy(list, orderBy) {
  if (!orderBy) return list;
  const keys = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((o) =>
    Object.entries(o).filter(([, dir]) => dir === "asc" || dir === "desc"),
  );
  if (!keys.length) return list;
  return [...list].sort((x, y) => {
    for (const [key, dir] of keys) {
      const c = compareValues(x[key], y[key], dir);
      if (c !== 0) return c;
    }
    return 0;
  });
}

function applyInclude(row, include) {
  if (!row || !isPlainObject(include)) return row;
  const out = { ...row };
  for (const [key, spec] of Object.entries(include)) {
    if (Array.isArray(out[key]) && isPlainObject(spec) && spec.where) {
      out[key] = out[key].filter((item) => matches(item, spec.where));
    }
  }
  return out;
}

function stripRelationWrites(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (isPlainObject(v) && ("create" in v || "connect" in v)) continue;
    out[k] = v;
  }
  return out;
}

function makeDelegate(state, name) {
  const rows = () => state[name] || (state[name] = []);
  const select = (args = {}) => applyOrderBy(rows().filter((r) => matches(r, args.where)), args.orderBy);
  return {
    findFirst: async (args = {}) => applyInclude(select(args)[0] ?? null, args.include),
    findUnique: async (args = {}) => applyInclude(select(args)[0] ?? null, args.include),
    findMany: async (args = {}) => select(args).map((r) => applyInclude(r, args.include)),
    count: async (args = {}) => select(args).length,
    aggregate: async (args = {}) => {
      const list = select(args);
      const out = {};
      for (const [fn, fields] of Object.entries(args)) {
        if (!["_max", "_min"].includes(fn)) continue;
        out[fn] = {};
        for (const field of Object.keys(fields)) {
          const values = list.map((r) => r[field]).filter((v) => v !== undefined && v !== null);
          out[fn][field] = values.length ? (fn === "_max" ? Math.max(...values) : Math.min(...values)) : null;
        }
      }
      return out;
    },
    create: async ({ data }) => {
      const row = { id: `${name}-${rows().length + 1}`, ...stripRelationWrites(data) };
      rows().push(row);
      return row;
    },
    createMany: async ({ data }) => {
      for (const item of data) rows().push({ id: `${name}-${rows().length + 1}`, ...stripRelationWrites(item) });
      return { count: data.length };
    },
    update: async ({ where, data, include }) => {
      const row = rows().find((r) => matches(r, where));
      if (!row) throw new Error(`fakePrisma.${name}.update: record not found`);
      Object.assign(row, stripRelationWrites(data));
      return applyInclude(row, include);
    },
    updateMany: async ({ where, data }) => {
      const hit = rows().filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, stripRelationWrites(data)));
      return { count: hit.length };
    },
    delete: async ({ where }) => {
      const idx = rows().findIndex((r) => matches(r, where));
      if (idx < 0) throw new Error(`fakePrisma.${name}.delete: record not found`);
      return rows().splice(idx, 1)[0];
    },
    deleteMany: async ({ where } = {}) => {
      const keep = rows().filter((r) => !matches(r, where));
      const count = rows().length - keep.length;
      state[name] = keep;
      return { count };
    },
  };
}

export const store = { state: {}, calls: [] };

export const prismaFake = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === "$transaction") {
        return async (arg) => (typeof arg === "function" ? arg(prismaFake) : Promise.all(arg));
      }
      if (typeof prop !== "string" || prop.startsWith("$") || prop === "then") return undefined;
      const delegate = makeDelegate(store.state, prop);
      return new Proxy(delegate, {
        get(target, method) {
          const fn = target[method];
          if (typeof fn !== "function") return fn;
          return (...args) => {
            store.calls.push({ model: prop, method, args: args[0] });
            return fn(...args);
          };
        },
      });
    },
  },
);

export function resetDb(state) {
  store.state = state;
  store.calls = [];
}

export function callsTo(model, method) {
  return store.calls.filter((c) => c.model === model && (!method || c.method === method));
}

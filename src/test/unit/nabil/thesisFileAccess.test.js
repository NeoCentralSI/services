/**
 * Guard for /uploads/thesis. The real middleware runs behind express with a
 * stand-in authGuard that sets req.user = { sub } exactly like the real JWT ({ sub, email }).
 * Prisma is replaced by a small dataset whose lookups apply the same filters the middleware
 * asks for (role name + active status, lecturerId / studentId on the thesis relations).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import http from "node:http";

const data = vi.hoisted(() => ({ roles: [], theses: [] }));

vi.mock("../../../config/prisma.js", () => {
  const pick = (rows, cond) => (rows || []).filter((r) => Object.entries(cond).every(([k, v]) => r[k] === v));
  return {
    default: {
      userHasRole: {
        findFirst: vi.fn(async ({ where }) =>
          data.roles.find(
            (r) => r.userId === where.userId && r.status === where.status && where.role.name.in.includes(r.roleName),
          ) ?? null,
        ),
      },
      thesis: {
        findUnique: vi.fn(async ({ where, select }) => {
          const t = data.theses.find((x) => x.id === where.id);
          if (!t) return null;
          const out = {
            studentId: t.studentId,
            thesisSupervisors: pick(t.supervisors, select.thesisSupervisors.where),
          };
          if (select.thesisSeminars) {
            const s = select.thesisSeminars.select;
            out.thesisSeminars = (t.seminars || []).map((sem) => ({
              examiners: pick(sem.examiners, s.examiners.where),
              audiences: pick(sem.audiences, s.audiences.where),
            }));
          }
          if (select.thesisDefences) {
            const s = select.thesisDefences.select;
            out.thesisDefences = (t.defences || []).map((d) => ({ examiners: pick(d.examiners, s.examiners.where) }));
          }
          return out;
        }),
      },
    },
  };
});

const { checkThesisFileAccess } = await import("../../../middlewares/fileAccess.middleware.js");

const app = express();
app.use(
  "/uploads/thesis",
  (req, res, next) => {
    const sub = req.headers["x-user"];
    if (!sub) return res.status(401).json({ message: "Unauthorized" });
    req.user = { sub, email: `${sub}@x` };
    next();
  },
  checkThesisFileAccess,
  (req, res) => res.status(200).send("FILE"),
);
const get = (user, path) => request(app).get(`/uploads/thesis/${path}`).set("x-user", user);

beforeEach(() => {
  data.roles = [
    { userId: "kadep", roleName: "Ketua Departemen", status: "active" },
    { userId: "sekdep", roleName: "Sekretaris Departemen", status: "active" },
    { userId: "gkm", roleName: "GKM", status: "active" },
    { userId: "admin", roleName: "Admin", status: "active" },
    { userId: "old-admin", roleName: "Admin", status: "nonActive" },
    { userId: "p1", roleName: "Pembimbing 1", status: "active" },
    { userId: "koordinator", roleName: "Koordinator Matkul Metopen", status: "active" },
  ];
  data.theses = [
    {
      id: "T1",
      studentId: "owner",
      supervisors: [
        { lecturerId: "p1", status: "active" },
        { lecturerId: "former", status: "released" },
      ],
      seminars: [{ examiners: [{ lecturerId: "examiner" }], audiences: [{ studentId: "audience" }] }],
      defences: [{ examiners: [{ lecturerId: "def-examiner" }] }],
    },
    { id: "T2", studentId: "other", supervisors: [], seminars: [], defences: [] },
  ];
});

const GUIDANCE = "T1/guidance/g1/123-laporan.pdf";
const SEMINAR = "T1/seminar/s1/draft.pdf";
const DEFENCE = "T1/defence/d1/final.pdf";

describe("guard /uploads/thesis", () => {
  it("pemilik TA bisa membuka lampiran bimbingan (200)", async () => {
    expect((await get("owner", GUIDANCE)).status).toBe(200);
  });

  it("mahasiswa lain ditolak (403), termasuk berkas di root folder TA", async () => {
    expect((await get("other", GUIDANCE)).status).toBe(403);
    expect((await get("other", "T1/laporan_v1.pdf")).status).toBe(403);
  });

  it("pembimbing aktif dan mantan pembimbing bisa membaca (200)", async () => {
    expect((await get("p1", GUIDANCE)).status).toBe(200);
    expect((await get("former", GUIDANCE)).status).toBe(200);
  });

  it("peran departemen aktif bisa membaca (200); peran nonaktif tidak", async () => {
    for (const user of ["kadep", "sekdep", "gkm", "admin"]) {
      expect((await get(user, GUIDANCE)).status).toBe(200);
    }
    expect((await get("old-admin", GUIDANCE)).status).toBe(403);
  });

  it("penguji dan audiens seminar bisa membuka berkas seminar (200), tapi bukan lampiran bimbingan", async () => {
    expect((await get("examiner", SEMINAR)).status).toBe(200);
    expect((await get("audience", SEMINAR)).status).toBe(200);
    expect((await get("examiner", GUIDANCE)).status).toBe(403);
    expect((await get("audience", GUIDANCE)).status).toBe(403);
  });

  it("mahasiswa lain ke berkas seminar orang lain ditolak (403)", async () => {
    expect((await get("other", SEMINAR)).status).toBe(403);
  });

  it("penguji sidang bisa membuka berkas sidang (perilaku lama dipertahankan)", async () => {
    expect((await get("def-examiner", DEFENCE)).status).toBe(200);
    expect((await get("def-examiner", SEMINAR)).status).toBe(403);
  });

  it("folder general tetap terbuka untuk pengguna yang login; tanpa login 401", async () => {
    expect((await get("other", "general/panduan.pdf")).status).toBe(200);
    expect((await request(app).get(`/uploads/thesis/${GUIDANCE}`)).status).toBe(401);
  });

  it("proposal final: pemilik, pembimbing aktif, koordinator Metode Penelitian, Kadep/Sekdep/Admin", async () => {
    const PROPOSAL = "T1/proposal/a1/123-proposal.pdf";
    for (const user of ["owner", "p1", "koordinator", "kadep", "sekdep", "admin"]) {
      expect((await get(user, PROPOSAL)).status, user).toBe(200);
    }
    for (const user of ["former", "gkm", "other", "examiner", "old-admin"]) {
      expect((await get(user, PROPOSAL)).status, user).toBe(403);
    }
    // the coordinator role does not open other thesis files
    expect((await get("koordinator", GUIDANCE)).status).toBe(403);
  });

  it("TA yang tidak ada ditolak (403)", async () => {
    expect((await get("other", "T9/guidance/x.pdf")).status).toBe(403);
  });

  // Raw paths are sent with node:http: supertest/WHATWG URL would normalise "./" and "../"
  // (also %2e%2e) on the client, so the guard would never see them. An attacker can send
  // them raw (e.g. curl --path-as-is) and express.static would then normalise them.
  const rawGet = (rawPath, user = "other") =>
    new Promise((resolve, reject) => {
      const server = app.listen(0, () => {
        const req = http.request(
          { host: "127.0.0.1", port: server.address().port, path: rawPath, headers: { "x-user": user } },
          (res) => {
            res.resume();
            res.on("end", () => server.close(() => resolve(res.statusCode)));
          },
        );
        req.on("error", (e) => server.close(() => reject(e)));
        req.end();
      });
    });

  it("segmen '.'/'..' ditolak sebelum jalur pintas general (403), termasuk ter-encode", async () => {
    expect(await rawGet("/uploads/thesis/general/../T1/guidance/g1/123-laporan.pdf")).toBe(403);
    expect(await rawGet("/uploads/thesis/general/%2e%2e/T1/guidance/g1/123-laporan.pdf")).toBe(403);
    expect(await rawGet("/uploads/thesis/general/%2E%2E/T1/guidance/g1/123-laporan.pdf")).toBe(403);
    expect(await rawGet("/uploads/thesis/general/./panduan.pdf")).toBe(403);
    // control: the same path without dot segments is still served for general
    expect(await rawGet("/uploads/thesis/general/panduan.pdf")).toBe(200);
  });

  it("URL rusak (encoding tidak valid) → 400", async () => {
    expect(await rawGet("/uploads/thesis/general/%E0%A4%A.pdf")).toBe(400);
  });
});

/**
 * The real authGuard with real JWTs. A file URL is no longer shared with a
 * token in it; each user sends their own token in the Authorization header, and the guard
 * decides from that identity.
 */
describe("guard /uploads/thesis dengan authGuard dan JWT asli", async () => {
  const { authGuard } = await import("../../../middlewares/auth.middleware.js");
  const { ENV } = await import("../../../config/env.js");
  const jwt = (await import("jsonwebtoken")).default;
  const tokenOf = (sub) => jwt.sign({ sub, email: `${sub}@x` }, ENV.JWT_SECRET, { expiresIn: "5m" });

  const realApp = express();
  realApp.use("/uploads/thesis", authGuard, checkThesisFileAccess, (req, res) => res.status(200).send("FILE"));
  realApp.use((err, req, res, _next) => res.status(err.statusCode || 500).json({ message: err.message }));
  const withToken = (sub) => request(realApp).get(`/uploads/thesis/${GUIDANCE}`).set("Authorization", `Bearer ${tokenOf(sub)}`);

  it("mahasiswa lain dengan token miliknya sendiri → 403; pemilik dan pembimbing → 200", async () => {
    expect((await withToken("other")).status).toBe(403);
    expect((await withToken("owner")).status).toBe(200);
    expect((await withToken("p1")).status).toBe(200);
  });

  // authGuard only reads the Authorization header.
  it("token valid di query string tanpa header Authorization → 401", async () => {
    const res = await request(realApp).get(`/uploads/thesis/${GUIDANCE}`).query({ token: tokenOf("owner") });
    expect(res.status).toBe(401);
    // the same token in the header is accepted
    expect((await withToken("owner")).status).toBe(200);
  });

  it("tanpa token → 401; token tidak sah → 401", async () => {
    expect((await request(realApp).get(`/uploads/thesis/${GUIDANCE}`)).status).toBe(401);
    expect((await request(realApp).get(`/uploads/thesis/${GUIDANCE}`).set("Authorization", "Bearer bukan.token.sah")).status).toBe(401);
  });
});


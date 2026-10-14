import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const routePath = join(
  __dirname,
  "../../routes/research-method.route.js",
);

describe("research-method route RBAC", () => {
  it("membatasi pengelolaan data master ke Sekretaris Departemen dan Koordinator Metode Penelitian", () => {
    const source = readFileSync(routePath, "utf8");

    expect(source).toContain("router.use(authGuard)");
    // P5 split the router: master data keeps its two roles per route; Presensi, Penilaian
    // Proposal, kelulusan, ekspor and monitoring carry their own guards.
    expect(source).toContain("const MANAGE = requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KOORDINATOR_METODE_PENELITIAN]);");
    for (const route of ['"/cpmks", MANAGE', '"/assessment-configuration", MANAGE', '"/criteria", MANAGE', '"/criteria/:criteriaId/rubrics", MANAGE', '"/weight-summary", MANAGE']) {
      expect(source).toContain(route);
    }
  });

  it("menyediakan endpoint CPMK, konfigurasi, kriteria, rubrik, dan ringkasan bobot", () => {
    const source = readFileSync(routePath, "utf8");

    expect(source).toContain('router.get("/cpmks"');
    expect(source).toContain('router.get("/assessment-configuration"');
    expect(source).toContain('router.post("/criteria"');
    expect(source).toContain('"/criteria/:criteriaId/rubrics"');
    expect(source).toContain('router.get("/weight-summary"');
  });
});

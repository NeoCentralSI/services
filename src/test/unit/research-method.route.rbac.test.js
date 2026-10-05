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
  it("membatasi pengelolaan ke Sekretaris Departemen dan Koordinator Metopen", () => {
    const source = readFileSync(routePath, "utf8");

    expect(source).toContain("router.use(authGuard)");
    expect(source).toContain("ROLES.SEKRETARIS_DEPARTEMEN");
    expect(source).toContain("ROLES.KOORDINATOR_METOPEN");
    expect(source).toContain("router.use(requireAnyRole(MANAGER_ROLES))");
    expect(source).not.toContain("ROLES.ADMIN");
    expect(source).not.toContain("ROLES.KETUA_DEPARTEMEN");
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

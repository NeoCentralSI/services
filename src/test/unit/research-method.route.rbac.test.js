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
  it("CPMK, kriteria, rubrik, dan nilai minimum ditulis Sekretaris Departemen saja; koordinator membaca", () => {
    const source = readFileSync(routePath, "utf8");

    expect(source).toContain("router.use(authGuard)");
    expect(source).toContain("const MANAGE = requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KOORDINATOR_METODE_PENELITIAN]);");
    expect(source).toContain("const SEKDEP_ONLY = requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN]);");
    for (const read of ['router.get("/cpmks", MANAGE', 'router.get("/assessment-configuration", MANAGE', 'router.get("/criteria/:criteriaId/rubrics", MANAGE', 'router.get("/weight-summary", MANAGE']) {
      expect(source).toContain(read);
    }
    const writes = source.split("\n").filter((line) => /router\.(post|patch|delete)\("\/(cpmks|criteria|rubrics|academic-years)/.test(line));
    expect(writes.length).toBe(14);
    for (const line of writes) expect(line).toContain("SEKDEP_ONLY");
    expect(source).toContain('router.post("/cpmks/copy-template", SEKDEP_ONLY, validate(copyCpmkTemplateSchema), copyCpmkTemplate);');
  });

  it("Template milestone proposal dikelola Sekretaris Departemen saja; daftarnya tetap terbaca", () => {
    const source = readFileSync(routePath, "utf8");
    const lines = source.split("\n").filter((line) => line.startsWith("router.") && line.includes('"/milestone-templates'));
    expect(lines.length).toBe(5);
    const writes = lines.filter((line) => /router\.(post|patch|delete)\(/.test(line));
    expect(writes.length).toBe(4);
    for (const line of writes) expect(line).toContain("SEKDEP_ONLY");
    expect(lines.find((line) => line.startsWith("router.get("))).toContain("MANAGE");
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

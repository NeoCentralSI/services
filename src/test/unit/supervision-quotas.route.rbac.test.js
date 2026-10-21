import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "../../routes/supervision-quotas.route.js"), "utf8");

describe("supervision-quotas route RBAC", () => {
  it("batas umum: Kadep dan Sekdep; batas per semester: Kadep saja", () => {
    expect(source).toContain("const MANAGERS = [ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN];");
    expect(source).toContain("const KADEP = [ROLES.KETUA_DEPARTEMEN];");
    expect(source).toContain('router.put("/general", requireAnyRole(MANAGERS)');
    expect(source).toContain('router.put("/periods/:academicYearId", requireAnyRole(KADEP)');
    expect(source).toContain('router.delete("/periods/:academicYearId", requireAnyRole(KADEP)');
  });

  it("layar beban tetap terbaca Kadep, Sekdep, Admin, dan koordinator", () => {
    expect(source).toContain("const READERS = [...MANAGERS, ROLES.ADMIN, ROLES.KOORDINATOR_METODE_PENELITIAN];");
    expect(source).toContain('router.get("/", requireAnyRole(READERS)');
  });
});

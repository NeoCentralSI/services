import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const routesDir = join(__dirname, "../../routes");

describe("thesis-cpmks route RBAC — Sekdep-only", () => {
  it("thesis-cpmks.route.js allows only SEKRETARIS_DEPARTEMEN", () => {
    const src = readFileSync(join(routesDir, "thesis-cpmks.route.js"), "utf8");
    expect(src).toMatch(/requireAnyRole\(\[\s*ROLES\.SEKRETARIS_DEPARTEMEN\s*\]\)/);
    expect(src).not.toMatch(/ROLES\.KETUA_DEPARTEMEN/);
  });
});

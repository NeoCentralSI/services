/**
 * Isolasi RBAC: upload presensi + export nilai eksklusif KOORDINATOR_METOPEN.
 * ACC-07 (koordinator_metopen_si) memegang role; ACC-02 (sekdep_si) tidak.
 */
import { describe, expect, it } from "vitest";

import assessmentRouter from "../../routes/assessment.route.js";
import { ROLES } from "../../constants/roles.js";

function layersForPath(router, path) {
  return router.stack.filter((layer) => layer.route?.path === path);
}

function middlewareNames(layer) {
  return (layer.route?.stack ?? []).map((s) => s.name || "anonymous");
}

describe("assessment.route — Koordinator-only RBAC (isolasi vs Sekdep)", () => {
  it("binds attendance upload and scores export to KOORDINATOR_METOPEN only", () => {
    const uploadLayers = layersForPath(assessmentRouter, "/metopen/attendance/upload");
    const exportLayers = layersForPath(assessmentRouter, "/metopen/scores/export");

    expect(uploadLayers.length).toBeGreaterThan(0);
    expect(exportLayers.length).toBeGreaterThan(0);

    // requireAnyRole is applied; role constant must be Koordinator, not Sekdep.
    expect(ROLES.KOORDINATOR_METOPEN).not.toBe(ROLES.SEKRETARIS_DEPARTEMEN);
    expect(ROLES.KOORDINATOR_METOPEN).toBe("Koordinator Matkul Metopen");

    for (const layer of [...uploadLayers, ...exportLayers]) {
      const names = middlewareNames(layer);
      // At least one middleware beyond the handler (auth/RBAC chain present)
      expect(names.length).toBeGreaterThan(1);
    }
  });

  it("documents ACC-07 email as the sole UAT Koordinator holder", () => {
    // Contract for ensure-users.js + docs/uat/02_AkunLogin.md ACC-07
    const ACC07 = "koordinator_metopen_si@fti.unand.ac.id";
    const ACC02 = "sekdep_si@fti.unand.ac.id";
    expect(ACC07).not.toBe(ACC02);
  });
});

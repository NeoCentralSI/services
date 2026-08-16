import { describe, expect, it } from "vitest";
import { buildRuntimeSnapshotObservationPatch } from "../studentPeriodSnapshot.service.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const capturedAt = new Date("2026-08-14T00:00:00.000Z");

describe("buildRuntimeSnapshotObservationPatch", () => {
  it("overwrites takingThesisCourse false → true so promotion can see live KRS-TA", () => {
    const patch = buildRuntimeSnapshotObservationPatch(
      {
        eligibleMetopen: true,
        takingThesisCourse: false,
        thesisCourseSource: "sia",
      },
      {
        takingThesisCourse: true,
        thesisCourseSource: "sia",
        capturedAt,
      },
    );

    expect(patch.takingThesisCourse).toBe(true);
    expect(patch.thesisCourseSource).toBe("sia");
    expect(patch.thesisCourseCapturedAt).toEqual(capturedAt);
    expect(patch.eligibleMetopen).toBeUndefined();
  });

  it("does not overwrite a frozen eligibleMetopen boolean (first-write-wins)", () => {
    const patch = buildRuntimeSnapshotObservationPatch(
      {
        eligibleMetopen: true,
        takingThesisCourse: false,
      },
      {
        eligibleMetopen: false,
        researchMethodCompleted: false,
        eligibilitySource: "sia",
        takingThesisCourse: false,
        capturedAt,
      },
    );

    expect(patch.eligibleMetopen).toBeUndefined();
    expect(patch.takingThesisCourse).toBe(false);
  });

  it("fills eligibleMetopen only while the snapshot column is still NULL", () => {
    const patch = buildRuntimeSnapshotObservationPatch(
      {
        eligibleMetopen: null,
        takingThesisCourse: null,
      },
      {
        eligibleMetopen: true,
        researchMethodCompleted: true,
        eligibilitySource: "sia",
        eligibilityCapturedAt: capturedAt,
        capturedAt,
      },
    );

    expect(patch.eligibleMetopen).toBe(true);
    expect(patch.researchMethodCompleted).toBe(true);
    expect(patch.takingThesisCourse).toBeUndefined();
  });

  it("does not wipe a known KRS-TA snapshot when the new observation is null", () => {
    const patch = buildRuntimeSnapshotObservationPatch(
      {
        eligibleMetopen: true,
        takingThesisCourse: true,
      },
      {
        takingThesisCourse: null,
        capturedAt,
      },
    );

    expect(patch.takingThesisCourse).toBeUndefined();
    expect(Object.keys(patch)).toHaveLength(0);
  });
});

describe("SIA sync wiring", () => {
  it("overwrites snapshot KRS-TA on each SIA observation (not first-write-wins)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const syncSrc = readFileSync(join(here, "../sia.sync.job.js"), "utf8");
    expect(syncSrc).toContain("buildRuntimeSnapshotObservationPatch");
    expect(syncSrc).not.toMatch(
      /existing\.takingThesisCourse == null\s+&& typeof row\.takingThesisCourse === "boolean"/,
    );
  });
});

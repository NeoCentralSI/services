import { describe, expect, it } from "vitest";

import { academicYearIdSchema } from "../../validators/common.validator.js";
import { createClassSchema } from "../../validators/metopenClass.validator.js";
import { createMetopenCpmkSchema } from "../../validators/metopenAssessmentAdmin.validator.js";
import { createThesisCpmkSchema } from "../../validators/master-data/thesis-cpmk.validator.js";
import { copyTemplateSchema, createRequirementSchema } from "../../validators/master-data/thesis-requirement.validator.js";
import { createCpmkSchema } from "../../validators/master-data/cpmk.validator.js";
import { academicYearIdParamSchema } from "../../validators/supervisionQuota.validator.js";

const ACTIVE_PERIOD_UUID = "2e74a7ed-cd51-4889-a550-6a74effeb8ba";
const LEGACY_PERIOD_SLUG = "tahun-2025-genap";

describe("academicYearIdSchema", () => {
  it("accepts a UUID id", () => {
    expect(academicYearIdSchema.safeParse(ACTIVE_PERIOD_UUID).success).toBe(true);
  });

  it("accepts a legacy tahun-YYYY-semester slug id", () => {
    expect(academicYearIdSchema.safeParse(LEGACY_PERIOD_SLUG).success).toBe(true);
    expect(academicYearIdSchema.safeParse("tahun-2024-ganjil").success).toBe(true);
  });

  it("rejects empty, malformed slug, and arbitrary strings", () => {
    for (const invalid of ["", "tahun-2025", "tahun-25-genap", "tahun-2025-antara", "not-a-period", "2e74a7ed"]) {
      expect(academicYearIdSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("reports both accepted formats in the error message", () => {
    const result = academicYearIdSchema.safeParse("not-a-period");
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toContain("tahun-YYYY-ganjil|genap");
  });
});

describe("validators sharing academicYearIdSchema", () => {
  const cases = [
    ["supervisionQuota academicYearIdParamSchema", academicYearIdParamSchema, (id) => id],
    ["metopenClass createClassSchema", createClassSchema, (id) => ({ name: "Metopen A", academicYearId: id })],
    [
      "metopenAssessmentAdmin createMetopenCpmkSchema",
      createMetopenCpmkSchema,
      (id) => ({ code: "CPMK-01", description: "Deskripsi CPMK yang memadai", academicYearId: id }),
    ],
    [
      "master-data createThesisCpmkSchema",
      createThesisCpmkSchema,
      (id) => ({ academicYearId: id, code: "CPMK-01", description: "Deskripsi" }),
    ],
    [
      "master-data createRequirementSchema",
      createRequirementSchema,
      (id) => ({ academicYearId: id, name: "Berkas proposal" }),
    ],
    [
      "master-data copyTemplateSchema",
      copyTemplateSchema,
      (id) => ({ sourceAcademicYearId: id, targetAcademicYearId: id }),
    ],
    [
      "master-data createCpmkSchema",
      createCpmkSchema,
      (id) => ({ academicYearId: id, code: "CPMK-01", description: "Deskripsi", type: "thesis" }),
    ],
  ];

  it.each(cases)("%s accepts UUID and slug but rejects garbage", (_name, schema, buildPayload) => {
    expect(schema.safeParse(buildPayload(ACTIVE_PERIOD_UUID)).success).toBe(true);
    expect(schema.safeParse(buildPayload(LEGACY_PERIOD_SLUG)).success).toBe(true);
    expect(schema.safeParse(buildPayload("not-a-period")).success).toBe(false);
  });
});

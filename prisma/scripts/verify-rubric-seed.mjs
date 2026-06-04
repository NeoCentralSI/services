/**
 * Quick verification: list AssessmentCriteria + counted rubric levels untuk SIMPTA
 * (CPMK research_method, appliesTo proposal/metopen).
 *
 * Usage:
 *   cd services
 *   node prisma/scripts/verify-rubric-seed.mjs
 */

import { PrismaClient } from "../../src/generated/prisma/index.js";

const prisma = new PrismaClient();

async function main() {
    const criteria = await prisma.assessmentCriteria.findMany({
        where: {
            appliesTo: { in: ["proposal", "metopen"] },
            isActive: true,
            isDeleted: false,
            cpmk: { type: "research_method" },
        },
        select: {
            id: true,
            name: true,
            role: true,
            appliesTo: true,
            maxScore: true,
            cpmk: { select: { code: true, description: true } },
            assessmentRubrics: {
                where: { isDeleted: false },
                select: {
                    minScore: true,
                    maxScore: true,
                    description: true,
                    displayOrder: true,
                },
                orderBy: { displayOrder: "asc" },
            },
        },
        orderBy: [{ appliesTo: "asc" }, { displayOrder: "asc" }],
    });

    console.log("=".repeat(70));
    console.log("AssessmentCriteria + AssessmentRubric — Verifikasi seed SIMPTA");
    console.log("=".repeat(70));

    for (const c of criteria) {
        const tag = `[${c.appliesTo} · ${c.role}]`;
        const formCode = c.appliesTo === "metopen" ? "TA-03B" : "TA-03A";
        console.log(
            `\n${formCode} ${tag} ${c.cpmk?.code} · ${c.name} (max ${c.maxScore})`,
        );
        if (c.assessmentRubrics.length === 0) {
            console.log("  → 0 rubric levels (scalar input / sub-breakdown UI)");
            continue;
        }
        for (const r of c.assessmentRubrics) {
            const desc =
                r.description.length > 60 ? `${r.description.slice(0, 60)}…` : r.description;
            console.log(`  · [${r.minScore}-${r.maxScore}] ${desc}`);
        }
    }

    const totalRubrics = criteria.reduce(
        (sum, c) => sum + c.assessmentRubrics.length,
        0,
    );
    console.log(
        `\n${"=".repeat(70)}\nTotal: ${criteria.length} kriteria · ${totalRubrics} rubric levels\n${"=".repeat(70)}`,
    );
}

main()
    .catch((e) => {
        console.error("FATAL:", e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());

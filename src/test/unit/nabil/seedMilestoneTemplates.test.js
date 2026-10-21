/**
 * Seeder regression tests for scripts/seed-milestone-templates.js (no database).
 * Uses the in-memory Prisma stand-in so repeated runs and the "never delete / never touch
 * real data of another phase" guarantees are checked against real query arguments.
 * Templates are written with an explicit `phase: "research"` (no column default).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { prismaFake, resetDb, store, callsTo } from "./helpers/fakePrisma.js";
import {
  TEMPLATES_PER_TOPIC,
  planMilestoneTemplateSeed,
  seedMilestoneTemplates,
} from "../../../../scripts/seed-milestone-templates.js";

const quiet = () => {};
const SPK = "Sistem Pendukung Keputusan (SPK)";
const BI = "Business Intelligence (BI)";
const PS = "Pengembangan Sistem (Enterprise Application)";
const ML = "Machine Learning";
const count = (topic) => TEMPLATES_PER_TOPIC[topic].length;
const [bi0] = TEMPLATES_PER_TOPIC[BI];

function buildState() {
  const topics = [
    { id: "t-spk", name: SPK },
    { id: "t-bi", name: "  business intelligence (bi) " }, // case/whitespace differences
    { id: "t-ps", name: PS },
    { id: "t-ml", name: ML },
    // "Enterprise System" deliberately missing
    { id: "t-other", name: "Topik Lain" },
  ];
  const thesisMilestoneTemplate = [
    // Proposal-phase template on the same topic, name not in the TA catalogue
    { id: "p-real", name: "Tugas Proposal 1", topicId: "t-bi", phase: "proposal", orderIndex: 0, description: "proposal" },
    // Proposal-phase template with a catalogue name -> kept, TA gets its own template
    { id: "p-same", name: bi0.name, topicId: "t-bi", phase: "proposal", orderIndex: 1, description: bi0.description },
    // Existing TA template matching a catalogue name, edited by the user
    { id: "th-1", name: "Studi Literatur & Analisis Sistem Existing", topicId: "t-ps", phase: "research", orderIndex: 5, description: "Diubah pengguna" },
    // Custom TA template (not in catalogue)
    { id: "th-2", name: "Template Kustom", topicId: "t-ps", phase: "research", orderIndex: 9, description: "kustom" },
  ];
  return { thesisTopic: topics, thesisMilestoneTemplate };
}

let before;
beforeEach(() => {
  resetDb(buildState());
  before = JSON.parse(JSON.stringify(store.state.thesisMilestoneTemplate));
});

const templates = () => store.state.thesisMilestoneTemplate;
const byId = (id) => templates().find((t) => t.id === id);
const original = (id) => before.find((t) => t.id === id);

describe("seed-milestone-templates", () => {
  it("dry-run writes nothing", async () => {
    const { summary } = await seedMilestoneTemplates({ prisma: prismaFake, log: quiet });
    expect(summary.mode).toBe("dry-run");
    expect(summary.plannedCreate).toBeGreaterThan(0);
    expect(summary.created).toBe(0);
    for (const method of ["create", "update", "updateMany", "delete", "deleteMany", "upsert"]) {
      expect(callsTo("thesisMilestoneTemplate", method)).toHaveLength(0);
    }
    expect(templates()).toEqual(before);
  });

  it("apply fills every catalogue topic with explicit phase 'research' templates", async () => {
    const { summary } = await seedMilestoneTemplates({ prisma: prismaFake, apply: true, log: quiet });

    expect(summary.skippedExisting).toBe(1); // th-1
    expect(summary.otherPhaseKept).toBe(1); // p-same
    expect(summary.created).toBe(count(SPK) + count(BI) + (count(PS) - 1) + count(ML));
    expect(summary.missingTopics).toEqual(["Enterprise System"]);
    expect(summary.uncataloguedTopics).toEqual(["Topik Lain"]);

    // Every catalogue name now exists exactly once as a TA template in each matched topic.
    for (const [topicId, topicName] of [["t-spk", SPK], ["t-bi", BI], ["t-ps", PS], ["t-ml", ML]]) {
      const ta = templates().filter((t) => t.topicId === topicId && t.phase === "research");
      for (const entry of TEMPLATES_PER_TOPIC[topicName]) {
        expect(ta.filter((t) => t.name === entry.name)).toHaveLength(1);
      }
    }
    expect(templates().some((t) => t.topicId === "t-other")).toBe(false);
    // The phase is written explicitly on every create.
    for (const call of callsTo("thesisMilestoneTemplate", "create")) {
      expect(call.args.data.phase).toBe("research");
      expect(call.args.data.isActive).toBe(true);
    }
  });

  it("never touches proposal-phase, custom or user-edited TA rows; never updates or deletes", async () => {
    await seedMilestoneTemplates({ prisma: prismaFake, apply: true, log: quiet });
    for (const id of ["p-real", "p-same", "th-1", "th-2"]) {
      expect(byId(id)).toEqual(original(id));
    }
    for (const method of ["update", "updateMany", "delete", "deleteMany", "upsert"]) {
      expect(callsTo("thesisMilestoneTemplate", method)).toHaveLength(0);
    }
    expect(callsTo("thesisTopic", "create")).toHaveLength(0);
  });

  it("running twice changes nothing the second time", async () => {
    await seedMilestoneTemplates({ prisma: prismaFake, apply: true, log: quiet });
    const snapshot = JSON.parse(JSON.stringify(templates()));
    const second = await seedMilestoneTemplates({ prisma: prismaFake, apply: true, log: quiet });

    expect(second.summary.created).toBe(0);
    expect(templates()).toEqual(snapshot);
  });

  it("appends after existing TA templates instead of reusing their order slots", () => {
    const plan = planMilestoneTemplateSeed({
      topics: store.state.thesisTopic,
      existingTemplates: store.state.thesisMilestoneTemplate,
    });
    const psOrders = plan.toCreate.filter((t) => t.topicId === "t-ps").map((t) => t.orderIndex);
    expect(Math.min(...psOrders)).toBe(10); // after max existing TA orderIndex 9
    const spkOrders = plan.toCreate.filter((t) => t.topicId === "t-spk").map((t) => t.orderIndex);
    expect(spkOrders).toEqual(TEMPLATES_PER_TOPIC[SPK].map((e) => e.orderIndex)); // no TA templates yet
    // Proposal-phase templates on a topic do not shift the TA catalogue order.
    const biOrders = plan.toCreate.filter((t) => t.topicId === "t-bi").map((t) => t.orderIndex);
    expect(biOrders).toEqual(TEMPLATES_PER_TOPIC[BI].map((e) => e.orderIndex));
  });

  it("skips ambiguous topics (duplicate names) instead of guessing", () => {
    const plan = planMilestoneTemplateSeed({
      topics: [
        { id: "a", name: ML },
        { id: "b", name: "machine  learning" },
      ],
      existingTemplates: [],
    });
    expect(plan.ambiguousTopics).toEqual([{ topicName: ML, topicIds: ["a", "b"] }]);
    expect(plan.toCreate.some((t) => t.topicId === "a" || t.topicId === "b")).toBe(false);
  });
});

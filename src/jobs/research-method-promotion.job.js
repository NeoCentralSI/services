import { runPromotion } from "../services/research-method/promotion.service.js";

/**
 * Naik ke Penelitian as a scheduled step of its own (K13): runs after the SIA sync has written
 * the semester flags; theses without SIA data stay deferred until a later run.
 */
export async function runResearchMethodPromotionJob(now = new Date()) {
  const result = await runPromotion({ actorUserId: null, now });
  return { promoted: result.promoted.length, deferred: result.deferred.length, failed: result.failed.length };
}

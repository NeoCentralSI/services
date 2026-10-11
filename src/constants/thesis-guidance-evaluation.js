/**
 * Values of Evaluasi Bimbingan (formulir TA-17). Labels are in `thesisLabels.js`.
 */
export const EVALUATION_TYPE = Object.freeze({ SIX_MONTH: "six_month", ONE_YEAR: "one_year" });

export const EVALUATION_RECOMMENDATION = Object.freeze({
  CONTINUE: "continue",
  EXTEND_1_MONTH: "extend_1_month",
  REVISE_PROPOSAL: "revise_proposal",
  TERMINATE_SUPERVISION: "terminate_supervision",
});

export const EVALUATION_STATUS = Object.freeze({ PENDING: "pending", APPROVED: "approved", REJECTED: "rejected" });

/**
 * What the Pembimbing 1 may fill at each stage (the stage is `evaluationDue` of the
 * supervision clock), and the choices the form offers there.
 */
export const EVALUATION_STAGES = Object.freeze({
  six_month: {
    evaluationType: EVALUATION_TYPE.SIX_MONTH,
    isFollowUp: false,
    recommendations: [EVALUATION_RECOMMENDATION.CONTINUE, EVALUATION_RECOMMENDATION.EXTEND_1_MONTH],
  },
  extension_follow_up: {
    evaluationType: EVALUATION_TYPE.SIX_MONTH,
    isFollowUp: true,
    recommendations: [EVALUATION_RECOMMENDATION.CONTINUE, EVALUATION_RECOMMENDATION.REVISE_PROPOSAL],
  },
  one_year: {
    evaluationType: EVALUATION_TYPE.ONE_YEAR,
    isFollowUp: false,
    recommendations: [EVALUATION_RECOMMENDATION.CONTINUE, EVALUATION_RECOMMENDATION.TERMINATE_SUPERVISION],
  },
});

export const OBSERVATION_KEYS = Object.freeze(["noGuidance", "noProgress", "noResponse", "noRevision"]);

/** Reason shown for locked guidance and milestone actions while a thesis repeats its proposal. */
export const REPEAT_PROPOSAL_LOCK_REASON = "Mengulang proposal berdasarkan evaluasi bimbingan.";

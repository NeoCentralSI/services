export const REQUIRED_SIMPTA_TABLES = [
  "thesis_participants",
  "thesis_advisor_request_draft",
  "thesis_proposal_versions",
];

export const REQUIRED_SIMPTA_COLUMNS = {
  students: [
    "research_method_completed",
    "eligible_metopen",
    "metopen_eligibility_source",
    "metopen_eligibility_updated_at",
    "taking_thesis_course",
    "thesis_course_enrollment_source",
    "thesis_course_enrollment_updated_at",
  ],
  thesis: ["final_proposal_version_id"],
  thesis_advisor_request: [
    "request_type",
    "problem_statement",
    "proposed_solution",
    "research_object",
    "research_permit_status",
    "lecturer_approval_note",
    "student_justification",
    "lecturer_overquota_reason",
  ],
  thesis_advisor_request_draft: [
    "student_id",
    "problem_statement",
    "proposed_solution",
    "research_object",
    "research_permit_status",
    "student_justification",
  ],
};

export const REQUIRED_SIMPTA_ENUM_VALUES = {
  students: {
    metopen_eligibility_source: ["sia", "devtools"],
    thesis_course_enrollment_source: ["sia", "devtools"],
  },
  thesis_advisor_request: {
    status: ["revision_requested"],
    request_type: ["ta_01", "ta_02"],
    research_permit_status: ["approved", "in_process", "not_approved"],
  },
  thesis_advisor_request_draft: {
    research_permit_status: ["approved", "in_process", "not_approved"],
  },
};

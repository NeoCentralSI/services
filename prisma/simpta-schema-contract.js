export const REQUIRED_SIMPTA_TABLES = [
  "thesis_supervisors",
];

export const REQUIRED_SIMPTA_COLUMNS = {
  students: [
    "research_method_completed",
  ],
};

export const REQUIRED_SIMPTA_ENUM_VALUES = {
  thesis_supervisor_requests: {
    status: ["pending", "accepted", "assigned"],
  },
};

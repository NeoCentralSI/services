// Expose milestone routes at the top-level path "/milestones"
// This wraps the thesisGuidance milestone router so clients can call /milestones/*
import milestoneRouter from "./thesisGuidance/milestones.route.js";

export default milestoneRouter;

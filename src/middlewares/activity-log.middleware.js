/**
 * Activity log for master data routes whose services do not log by themselves (CPMK, assessment
 * criteria, rubrics, minimum scores). Writes one `audit_logs` row after a successful response:
 * what was asked (`newValues`, the request body) and what it was about.
 */
import { AUDIT_ACTIONS, logAudit } from "../services/auditLog.service.js";

const OPERATION_BY_METHOD = { POST: "create", PATCH: "update", PUT: "update", DELETE: "delete" };
const LABEL_KEYS = ["name", "code", "title", "description"];

function pickLabel(...sources) {
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const key of LABEL_KEYS) {
      if (typeof source[key] === "string" && source[key].trim()) return source[key].trim().slice(0, 120);
    }
  }
  return null;
}

/**
 * @param {object} options
 * @param {string} options.entity entity type (`ENTITY_TYPES`)
 * @param {string} options.scope "proposal" (Metode Penelitian) or "thesis" (Tugas Akhir)
 * @param {string} [options.idParam] route parameter holding the object id
 * @param {string} [options.operation] overrides the operation derived from the method
 */
export function logMasterDataChange({ entity, scope, idParam = null, operation = null }) {
  return (req, res, next) => {
    let payload = null;
    const json = res.json.bind(res);
    res.json = (body) => {
      payload = body;
      return json(body);
    };
    res.on("finish", () => {
      if (res.statusCode >= 400) return;
      const data = payload?.data ?? payload;
      const entityId = (idParam && req.params?.[idParam]) || data?.id || null;
      void logAudit({
        actorUserId: req.user?.sub ?? null,
        action: AUDIT_ACTIONS.ASSESSMENT_MASTER_CHANGED,
        entityType: entity,
        entityId: entityId ? String(entityId) : null,
        newValues: req.method === "DELETE" ? null : req.body ?? null,
        metadata: {
          operation: operation ?? OPERATION_BY_METHOD[req.method] ?? "update",
          scope,
          objectLabel: pickLabel(data, req.body),
        },
      });
    });
    next();
  };
}

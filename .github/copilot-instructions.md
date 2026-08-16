# Backend Development Rules â€” NeoCentral

This file is a backend-specific projection. Business truth remains in root
`AGENTS.md`, `KONTEKS_KANONIS_SIMPTA.md` **v3.3**, and `prdpurpose.md` **v8.3**. See root `AGENTS.md`.
Technical truth remains in root `.cursor/rules/10-services-backend.mdc`.

## Mandatory preflight

1. Read `prisma/schema.prisma` before touching a model, relation, status, query,
   endpoint, or response contract.
2. Inspect the existing route, controller, service, repository, validator,
   Swagger contract, consumers, and tests before creating a new file.
3. For SIMPTA, read the canon/PRD and relevant KC entry before changing behavior.

## Architecture contract

- ESM only: `import`/`export`; never `require` or `module.exports`.
- Preserve `route -> controller -> service -> repository -> Prisma`.
- Controllers handle HTTP only; services own business logic; repositories own DB queries.
- Validate input with Zod through the project `validate()` middleware.
- Use error classes from `src/utils/errors.js`; the global handler remains in
  `src/middlewares/error.middleware.js`.
- Use `ROLES` constants and explicit RBAC/resource-access checks.
- Multi-step writes require a Prisma transaction.
- Endpoint changes require Swagger and frontend-consumer impact review.

## SIMPTA invariants that commonly regress

- Path C is lecturer-first: student submits `pending` with
  `studentJustification`; lecturer adds `lecturerOverquotaReason` and forwards
  `pending_kadep`; KaDep decides using both values.
- TA-04 early does not promote active workload. Promotion/release occurs only
  after TA-03 final and SIA lifecycle sync of `takingThesisCourse`.
- TA-04 gates recorded proposal activity; P1/P2 can only read informal logs.
- Attendance BR-28 must be enforced at every score mutation point.

Run `pnpm test` and `pnpm exec prisma validate` before handoff.

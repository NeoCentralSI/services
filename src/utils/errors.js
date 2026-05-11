/**
 * Centralized HTTP Error Classes
 *
 * Use these across services, controllers, and middleware for consistent
 * error responses.  The global `errorHandler` middleware will read
 * `err.statusCode` and produce the standard JSON envelope.
 */

export class AppError extends Error {
  /** @param {string} message @param {number} statusCode */
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
  }
}

/** 400 — invalid input / business-rule violation */
export class BadRequestError extends AppError {
  constructor(message = "Bad request") {
    super(message, 400);
  }
}

/** 401 — missing or invalid credentials */
export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401);
  }
}

/** 403 — authenticated but not allowed */
export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403);
  }
}

/**
 * 404 — resource not found  (also used when user is not entitled to know
 *        the resource exists — prevents ID enumeration)
 */
export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404);
  }
}

/** 409 — conflict (duplicate, concurrent edit) */
export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(message, 409);
  }
}

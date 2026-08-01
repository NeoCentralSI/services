import { ZodError } from "zod";

export function validate(schema) {
	return (req, res, next) => {
		try {
			const data = schema.parse(req.body ?? {});
			req.validated = data;
			next();
		} catch (err) {
			if (err instanceof ZodError) {
				const issues = err.issues?.map((i) => ({ path: i.path.join("."), message: i.message }));
				const firstMessage = issues?.[0]?.message;
				const e = new Error(firstMessage || "Data formulir belum valid.");
				e.statusCode = 400;
				e.details = issues;
				return next(e);
			}
			next(err);
		}
	};
}

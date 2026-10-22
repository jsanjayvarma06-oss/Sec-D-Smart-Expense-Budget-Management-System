import { HttpError } from '../utils/httpError.js';

// The Application Controller's validation step: routes pass a schema with a
// zod-style safeParse() and this replaces req.body with the parsed values, or
// rejects the request with one message per invalid field so the form can mark
// exactly what is wrong. The schemas themselves belong to each feature.
export function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (result.success) {
      req.body = result.data;
      return next();
    }
    const fields = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] ?? 'form';
      fields[key] ??= issue.message;
    }
    next(new HttpError(400, 'Please correct the highlighted fields', { code: 'VALIDATION', fields }));
  };
}

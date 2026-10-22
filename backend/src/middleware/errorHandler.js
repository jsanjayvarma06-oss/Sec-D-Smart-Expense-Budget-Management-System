import { HttpError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';

export function notFound(_req, _res, next) {
  next(new HttpError(404, 'Not found'));
}

// Users only ever see messages written for them. Internal errors are logged with
// the method and path but never the request body, and the response carries no
// stack trace or database detail (SR10). Express needs all four arguments to
// recognise this as an error handler.
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: err.message,
      ...(err.code && { code: err.code }),
      ...(err.fields && { fields: err.fields }),
    });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request is too large' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }

  logger.error('Unhandled error', {
    method: req.method,
    path: req.originalUrl,
    error: err.message,
    stack: err.stack,
  });
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

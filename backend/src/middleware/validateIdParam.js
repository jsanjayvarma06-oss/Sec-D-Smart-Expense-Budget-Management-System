import { HttpError } from '../utils/httpError.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rejects record IDs in the URL that are not UUIDs before they reach a query.
// Use on every route with an :id, e.g. router.get('/:id', validateIdParam(), ...).
//
// A malformed ID gets the same 404 as another user's record, so changing the ID
// in the URL never reveals whether a record exists (SR04).
export function validateIdParam(name = 'id') {
  return (req, _res, next) => {
    if (UUID.test(req.params[name] ?? '')) return next();
    next(new HttpError(404, 'Not found'));
  };
}

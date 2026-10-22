// An error whose message is safe to show the user. Anything else that reaches the
// error handler is treated as internal and replaced with a generic message.
export class HttpError extends Error {
  constructor(status, message, { code, fields } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

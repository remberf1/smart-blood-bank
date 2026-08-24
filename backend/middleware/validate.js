// Body-validation middleware factory. Pass a zod schema; on success the
// parsed (and coerced) value replaces req.body, on failure returns 400 with
// per-field messages.
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.') || '(body)',
      message: i.message,
    }));
    return res.status(400).json({ error: 'Validation failed', details });
  }
  req.body = result.data;
  next();
};

module.exports = { validate };

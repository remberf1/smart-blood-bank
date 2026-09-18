const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');

/**
 * Record an audit event. Fire-and-forget and never throws — auditing must never
 * break the action it is recording.
 * @param {object} actor  req.user (or {userId,email,role,hospitalId})
 * @param {string} action dotted action key, e.g. 'user.delete'
 * @param {object} [details] { entity, entityId, hospitalId, summary, meta }
 */
function logAudit(actor = {}, action, details = {}) {
  if (mongoose.connection.readyState !== 1) return;

  AuditLog.create({
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action,
    entity: details.entity,
    entityId: details.entityId != null ? String(details.entityId) : undefined,
    hospitalId: details.hospitalId || actor.hospitalId,
    summary: details.summary,
    meta: details.meta,
  }).catch((err) => console.error('audit log failed:', err.message));
}

module.exports = { logAudit };

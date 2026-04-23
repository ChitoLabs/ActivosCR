const db = require('../database');

function logAudit(action, entityType, entityId, details, req) {
  try {
    const userId = req.user ? req.user.id : null;
    const username = req.user ? req.user.username : 'system';
    const ipAddress = req.ip || (req.connection && req.connection.remoteAddress) || req.get('X-Forwarded-For') || 'unknown';

    db.prepare(`
      INSERT INTO audit_log (user_id, username, action, entity_type, entity_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, username, action, entityType, entityId, String(details || ''), ipAddress);
  } catch (error) {
    console.error('[AUDIT] Failed to log audit:', error.message);
  }
}

function auditMiddleware() {
  return (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    res.json = function(data) {
      // Log after response is sent
      if (req.auditAction) {
        const entityType = req.auditEntityType || null;
        const entityId = req.auditEntityId || null;
        const details = req.auditDetails || JSON.stringify(data);

        logAudit(req.auditAction, entityType, entityId, details, req);
      }
      return originalJson(data);
    };
    next();
  };
}

// Helper to set audit data from routes
function setAuditData(req, action, entityType, entityId, details) {
  req.auditAction = action;
  req.auditEntityType = entityType;
  req.auditEntityId = entityId;
  req.auditDetails = details;
}

module.exports = { logAudit, auditMiddleware, setAuditData };
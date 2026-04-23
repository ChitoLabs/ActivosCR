const express = require('express');
const db = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Get audit logs with filters and pagination
router.get('/', authenticateToken, (req, res) => {
  const { user_id, action, entity_type, start_date, end_date, page, page_size } = req.query;

  const pageNum = parseInt(page) || 1;
  const pageSize = parseInt(page_size) || 25;
  const offset = (pageNum - 1) * pageSize;

  // Build WHERE clause
  let whereClause = ' WHERE 1=1';
  const params = [];

  if (user_id) {
    whereClause += ' AND user_id = ?';
    params.push(user_id);
  }

  if (action) {
    whereClause += ' AND action = ?';
    params.push(action);
  }

  if (entity_type) {
    whereClause += ' AND entity_type = ?';
    params.push(entity_type);
  }

  if (start_date) {
    whereClause += ' AND date(created_at) >= date(?)';
    params.push(start_date);
  }

  if (end_date) {
    whereClause += ' AND date(created_at) <= date(?)';
    params.push(end_date);
  }

  // Get total count
  const totalCount = db.prepare(`SELECT COUNT(*) as count FROM audit_log${whereClause}`).get(...params).count;

  // Get paginated logs
  const query = `SELECT * FROM audit_log${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  const logs = db.prepare(query).all(...params, pageSize, offset);

  // Format for readability
  const formattedLogs = logs.map(log => ({
    ...log,
    details_parsed: formatAuditDetails(log)
  }));

  res.json({
    logs: formattedLogs,
    pagination: {
      page: pageNum,
      page_size: pageSize,
      total: totalCount,
      total_pages: Math.ceil(totalCount / pageSize)
    }
  });
});

// Get audit log actions summary
router.get('/actions', authenticateToken, (req, res) => {
  const actions = db.prepare(`
    SELECT action, COUNT(*) as count
    FROM audit_log
    GROUP BY action
    ORDER BY count DESC
  `).all();

  res.json({ actions });
});

// Get unique entity types
router.get('/entity-types', authenticateToken, (req, res) => {
  const types = db.prepare(`
    SELECT entity_type, COUNT(*) as count
    FROM audit_log
    WHERE entity_type IS NOT NULL
    GROUP BY entity_type
    ORDER BY entity_type
  `).all();

  res.json({ entity_types: types });
});

// Helper function to format audit details
function formatAuditDetails(log) {
  try {
    // Try to parse if it's JSON
    const details = JSON.parse(log.details);
    return details;
  } catch {
    // Return as-is if not JSON
    return log.details;
  }
}

module.exports = router;
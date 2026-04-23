const jwt = require('jsonwebtoken');
const db = require('../database');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticación requerido' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o expirado' });
    }

    // Verify user still exists and is active
    const dbUser = db.prepare('SELECT id, username, role, is_active FROM users WHERE id = ?').get(user.id);
    if (!dbUser || !dbUser.is_active) {
      return res.status(403).json({ error: 'Usuario inactivo o eliminado' });
    }

    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Se requiere rol de administrador' });
  }
  next();
}

module.exports = { authenticateToken, requireAdmin };
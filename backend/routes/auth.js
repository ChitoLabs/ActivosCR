const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = express.Router();

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user || !user.is_active) {
    logAudit('LOGIN_FAILED', 'auth', username, `Intento de login fallido para usuario: ${username}`, req);
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const validPassword = bcrypt.compareSync(password, user.password_hash);

  if (!validPassword) {
    logAudit('LOGIN_FAILED', 'auth', username, `Intento de login fallido para usuario: ${username}`, req);
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  // Generate JWT
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  logAudit('LOGIN', 'auth', user.id, `Usuario ${user.username} inició sesión`, req);

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      must_change_password: user.must_change_password
    }
  });
});

// Change password
router.post('/change-password', authenticateToken, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Contraseñas requeridas' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const validPassword = bcrypt.compareSync(currentPassword, user.password_hash);

  if (!validPassword) {
    logAudit('CHANGE_PASSWORD_FAILED', 'auth', userId, 'Contraseña actual incorrecta', req);
    return res.status(401).json({ error: 'Contraseña actual incorrecta' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  const now = new Date().toISOString();
  // Parameter order: password_hash (first ?), updated_at (second ?), WHERE id (third ?)
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?')
    .run(newHash, now, userId);

  logAudit('CHANGE_PASSWORD', 'auth', userId, 'Contraseña actualizada correctamente', req);

  res.json({ message: 'Contraseña actualizada correctamente' });
});

// Logout (client-side token removal, but we log it)
router.post('/logout', authenticateToken, (req, res) => {
  logAudit('LOGOUT', 'auth', req.user.id, `Usuario ${req.user.username} cerró sesión`, req);
  res.json({ message: 'Logout exitoso' });
});

// Get current user
router.get('/me', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, username, full_name, email, role, must_change_password FROM users WHERE id = ?')
    .get(req.user.id);

  res.json({ user });
});

module.exports = router;
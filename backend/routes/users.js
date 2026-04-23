const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = express.Router();

// Get all users
router.get('/', authenticateToken, (req, res) => {
  const users = db.prepare(`
    SELECT id, username, full_name, email, role, is_active, must_change_password, created_at, updated_at
    FROM users ORDER BY username
  `).all();

  res.json({ users });
});

// Get single user
router.get('/:id', authenticateToken, (req, res) => {
  const user = db.prepare(`
    SELECT id, username, full_name, email, role, is_active, must_change_password, created_at, updated_at
    FROM users WHERE id = ?
  `).get(req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  res.json({ user });
});

// Create user (admin only)
router.post('/', authenticateToken, requireAdmin, (req, res) => {
  const { username, password, full_name, email, role } = req.body;

  if (!username || !password || !full_name) {
    return res.status(400).json({ error: 'Usuario, contraseña y nombre completos requeridos' });
  }

  // Check if username exists
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ error: 'El nombre de usuario ya existe' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (username, password_hash, full_name, email, role, is_active, must_change_password)
    VALUES (?, ?, ?, ?, ?, 1, 1)
  `).run(username, passwordHash, full_name, email || null, role || 'operator');

  logAudit('CREATE', 'user', result.lastInsertRowid, `Creó usuario: ${username}`, req);

  res.status(201).json({
    message: 'Usuario creado correctamente',
    user_id: result.lastInsertRowid
  });
});

// Update user
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id);
  const { full_name, email, role, is_active } = req.body;

  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!existing) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  // Prevent disabling yourself
  if (userId === req.user.id && is_active === 0) {
    return res.status(400).json({ error: 'No puedes desactivarte a ti mismo' });
  }

  db.prepare(`
    UPDATE users SET
      full_name = COALESCE(?, full_name),
      email = COALESCE(?, email),
      role = COALESCE(?, role),
      is_active = COALESCE(?, is_active),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(full_name, email, role, is_active, userId);

  logAudit('UPDATE', 'user', userId, `Actualizó usuario: ${existing.username}`, req);

  res.json({ message: 'Usuario actualizado correctamente' });
});

// Reset password (admin only)
router.post('/:id/reset-password', authenticateToken, requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id);
  const { newPassword } = req.body;

  const existing = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
  if (!existing) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  db.prepare(`
    UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = datetime('now')
    WHERE id = ?
  `).run(passwordHash, userId);

  logAudit('RESET_PASSWORD', 'user', userId, `Reinició contraseña de: ${existing.username}`, req);

  res.json({ message: 'Contraseña reiniciada correctamente. El usuario deberá cambiarla en su próximo inicio de sesión.' });
});

// Delete (deactivate) user - admin only
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id);

  const existing = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
  if (!existing) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  // Prevent deleting yourself
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?').run(now, userId);

  logAudit('DELETE', 'user', userId, `Desactivó usuario: ${existing.username}`, req);

  res.json({ message: 'Usuario desactivado correctamente' });
});

module.exports = router;
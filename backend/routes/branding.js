const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadDir = '/app/data/branding';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const prefix = file.fieldname === 'logo' ? 'logo' : 'login-bg';
    cb(null, prefix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: function(req, file, cb) {
    const allowed = /jpeg|jpg|png|svg|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes: jpg, png, svg, webp'));
    }
  }
});

// Get current branding
router.get('/', (req, res) => {
  const branding = db.prepare('SELECT * FROM branding WHERE id = 1').get();

  // Remove internal fields
  const { updated_by, ...publicBranding } = branding;

  res.json({ branding: publicBranding });
});

// Update branding settings only (not files)
router.put('/', authenticateToken, requireAdmin, (req, res) => {
  const {
    app_name,
    login_title,
    login_subtitle,
    primary_color,
    secondary_color,
    // Retirement header fields
    retirement_header_line1,
    retirement_header_line2,
    retirement_header_line3,
    retirement_header_line4,
    retirement_header_title,
    retirement_header_note
  } = req.body;

  db.prepare(`
    UPDATE branding SET
      app_name = COALESCE(?, app_name),
      login_title = COALESCE(?, login_title),
      login_subtitle = COALESCE(?, login_subtitle),
      primary_color = COALESCE(?, primary_color),
      secondary_color = COALESCE(?, secondary_color),
      retirement_header_line1 = COALESCE(?, retirement_header_line1),
      retirement_header_line2 = COALESCE(?, retirement_header_line2),
      retirement_header_line3 = COALESCE(?, retirement_header_line3),
      retirement_header_line4 = COALESCE(?, retirement_header_line4),
      retirement_header_title = COALESCE(?, retirement_header_title),
      retirement_header_note = COALESCE(?, retirement_header_note),
      updated_by = ?,
      updated_at = datetime('now')
    WHERE id = 1
  `).run(
    app_name, login_title, login_subtitle, primary_color, secondary_color,
    retirement_header_line1, retirement_header_line2, retirement_header_line3, retirement_header_line4,
    retirement_header_title, retirement_header_note,
    req.user.id
  );

  logAudit('UPDATE', 'branding', 1, `Actualizó configuración de branding`, req);

  res.json({ message: 'Branding actualizado correctamente' });
});

// Upload logo
router.post('/logo', authenticateToken, requireAdmin, upload.single('logo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió archivo' });
  }

  // Delete old logo if exists
  const branding = db.prepare('SELECT logo_path FROM branding WHERE id = 1').get();
  if (branding.logo_path) {
    const oldPath = path.join('/app/data/branding', path.basename(branding.logo_path));
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
    }
  }

  const logoPath = `/data/branding/${req.file.filename}`;
  db.prepare("UPDATE branding SET logo_path = ?, updated_by = ?, updated_at = datetime('now') WHERE id = 1")
    .run(logoPath, req.user.id);

  logAudit('UPDATE', 'branding', 1, `Actualizó logo del sistema`, req);

  res.json({ message: 'Logo actualizado correctamente', path: logoPath });
});

// Upload login background
router.post('/login-background', authenticateToken, requireAdmin, upload.single('background'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió archivo' });
  }

  // Delete old background if exists
  const branding = db.prepare('SELECT login_background_path FROM branding WHERE id = 1').get();
  if (branding.login_background_path) {
    const oldPath = path.join('/app/data/branding', path.basename(branding.login_background_path));
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
    }
  }

  const bgPath = `/data/branding/${req.file.filename}`;
  db.prepare("UPDATE branding SET login_background_path = ?, updated_by = ?, updated_at = datetime('now') WHERE id = 1")
    .run(bgPath, req.user.id);

  logAudit('UPDATE', 'branding', 1, `Actualizó fondo de login`, req);

  res.json({ message: 'Fondo de login actualizado correctamente', path: bgPath });
});

// Delete logo (reset to default)
router.delete('/logo', authenticateToken, requireAdmin, (req, res) => {
  const branding = db.prepare('SELECT logo_path FROM branding WHERE id = 1').get();
  if (branding.logo_path) {
    const oldPath = path.join('/app/data/branding', path.basename(branding.logo_path));
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
    }
  }

  db.prepare("UPDATE branding SET logo_path = NULL, updated_by = ?, updated_at = datetime('now') WHERE id = 1")
    .run(req.user.id);

  logAudit('UPDATE', 'branding', 1, `Restableció logo por defecto`, req);

  res.json({ message: 'Logo restablecido' });
});

// Delete login background (reset to default)
router.delete('/login-background', authenticateToken, requireAdmin, (req, res) => {
  const branding = db.prepare('SELECT login_background_path FROM branding WHERE id = 1').get();
  if (branding.login_background_path) {
    const oldPath = path.join('/app/data/branding', path.basename(branding.login_background_path));
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
    }
  }

  db.prepare("UPDATE branding SET login_background_path = NULL, updated_by = ?, updated_at = datetime('now') WHERE id = 1")
    .run(req.user.id);

  logAudit('UPDATE', 'branding', 1, `Restableció fondo de login por defecto`, req);

  res.json({ message: 'Fondo de login restablecido' });
});

module.exports = router;
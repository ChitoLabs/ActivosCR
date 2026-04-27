const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { generateAssetNumber, parseDate } = require('../utils/helpers');
const { createTemplate, exportAssets, importAssets, parseExcelFile } = require('../utils/excel');
const XLSX = require('xlsx');

const router = express.Router();

// ====================
// SPECIFIC ROUTES (must come before parameterized routes)
// ====================

// Get stats for dashboard
router.get('/stats/summary', authenticateToken, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM assets').get().count;
  const active = db.prepare("SELECT COUNT(*) as count FROM assets WHERE status = 'Activo'").get().count;
  const inRepair = db.prepare("SELECT COUNT(*) as count FROM assets WHERE status = 'Dado de baja'").get().count;
  const inactive = db.prepare("SELECT COUNT(*) as count FROM assets WHERE status = 'Inactivo'").get().count;

  const categories = db.prepare(`
    SELECT category, COUNT(*) as count FROM assets
    WHERE category IS NOT NULL AND category != ''
    GROUP BY category
  `).all();

  const locations = db.prepare(`
    SELECT location, COUNT(*) as count FROM assets
    WHERE location IS NOT NULL AND location != ''
    GROUP BY location
  `).all();

  const recent = db.prepare(`
    SELECT asset_number, description, status, created_at
    FROM assets ORDER BY created_at DESC LIMIT 5
  `).all();

  res.json({
    stats: { total, active, inRepair, inactive, categories, locations, recent }
  });
});

// Get unique categories and statuses for autocomplete
router.get('/catalogs', authenticateToken, (req, res) => {
  // Get unique categories from existing assets
  const categories = db.prepare(`
    SELECT DISTINCT category FROM assets
    WHERE category IS NOT NULL AND category != ''
    ORDER BY category
  `).all().map(r => r.category);

  // Get unique statuses from existing assets
  const statuses = db.prepare(`
    SELECT DISTINCT status FROM assets
    WHERE status IS NOT NULL AND status != ''
    ORDER BY status
  `).all().map(r => r.status);

  // Get unique locations from existing assets
  const locations = db.prepare(`
    SELECT DISTINCT location FROM assets
    WHERE location IS NOT NULL AND location != ''
    ORDER BY location
  `).all().map(r => r.location);

  res.json({
    categories: ['Computación', 'Mobiliario', 'Vehículos', 'Herramientas', 'Otro'],
    statuses: ['Activo', 'Inactivo', 'Dado de baja'],
    locations
  });
});

// Download template
router.get('/template', authenticateToken, (req, res) => {
  const wb = createTemplate();
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=plantilla_activos.xlsx');
  res.send(buffer);
});

// Export assets to Excel (with filters)
router.get('/export', authenticateToken, (req, res) => {
  const { search, status, category, location, responsible } = req.query;

  let query = 'SELECT * FROM assets WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (description LIKE ? OR asset_number LIKE ? OR responsible LIKE ? OR brand LIKE ? OR model LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }

  if (location) {
    query += ' AND location = ?';
    params.push(location);
  }

  if (responsible) {
    query += ' AND responsible LIKE ?';
    params.push(`%${responsible}%`);
  }

  query += ' ORDER BY asset_number';

  const assets = db.prepare(query).all(...params);
  const wb = exportAssets(assets, req.user);
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

  const date = new Date().toISOString().split('T')[0];
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=activos_${date}.xlsx`);
  res.send(buffer);
});

// Import assets from Excel
const uploadDir = '/app/data/uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: function(req, file, cb) { cb(null, uploadDir); },
    filename: function(req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Solo archivos Excel (.xlsx, .xls)'));
    }
  }
});

router.post('/import', authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió archivo' });
  }

  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const importedAssets = parseExcelFile(fileBuffer);
    const result = importAssets(db, importedAssets, req.user.id);

    logAudit('IMPORT', 'asset', null, `Importó ${result.created + result.updated} activos: ${result.created} nuevos, ${result.updated} actualizados`, req);

    fs.unlinkSync(req.file.path);

    res.json({
      created: result.created,
      updated: result.updated,
      errors: result.errors
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(400).json({ error: error.message });
  }
});

// ====================
// PARAMETERIZED ROUTES (must come after specific routes)
// ====================

// Get all assets with optional filters and pagination
router.get('/', authenticateToken, (req, res) => {
  const { search, status, category, location, responsible, page, limit } = req.query;

  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 25;
  const offset = (pageNum - 1) * limitNum;

  let whereClause = '1=1';
  const params = [];

  if (search) {
    whereClause += ' AND (description LIKE ? OR asset_number LIKE ? OR responsible LIKE ? OR brand LIKE ? OR model LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
  }

  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }

  if (category) {
    whereClause += ' AND category = ?';
    params.push(category);
  }

  if (location) {
    whereClause += ' AND location = ?';
    params.push(location);
  }

  if (responsible) {
    whereClause += ' AND responsible LIKE ?';
    params.push(`%${responsible}%`);
  }

  // Get total count
  const countQuery = `SELECT COUNT(*) as count FROM assets WHERE ${whereClause}`;
  const total = db.prepare(countQuery).get(...params).count;

  // Get paginated assets
  const assetsQuery = `SELECT * FROM assets WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  const assets = db.prepare(assetsQuery).all(...params, limitNum, offset);

  res.json({
    assets,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    }
  });
});

// Get single asset
router.get('/:id', authenticateToken, (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);

  if (!asset) {
    return res.status(404).json({ error: 'Activo no encontrado' });
  }

  res.json({ asset });
});

// Create asset
router.post('/', authenticateToken, (req, res) => {
  const {
    asset_number,
    description,
    responsible,
    brand,
    model,
    serial_number,
    acquisition_date,
    status,
    category,
    location,
    notes
  } = req.body;

  if (!description) {
    return res.status(400).json({ error: 'La descripción es requerida' });
  }

  const finalAssetNumber = asset_number || generateAssetNumber(db);

  const existing = db.prepare('SELECT id FROM assets WHERE asset_number = ?').get(finalAssetNumber);
  if (existing) {
    return res.status(400).json({ error: `El número de activo ${finalAssetNumber} ya existe` });
  }

  const result = db.prepare(`
    INSERT INTO assets (
      asset_number, description, responsible, brand, model, serial_number,
      acquisition_date, status, category, location, notes, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    finalAssetNumber, description, responsible || null, brand || null, model || null,
    serial_number || null, parseDate(acquisition_date) || null, status || 'Activo',
    category || null, location || null, notes || null, req.user.id
  );

  logAudit('CREATE', 'asset', result.lastInsertRowid, `Creado activo ${finalAssetNumber}: ${description}`, req);

  res.status(201).json({
    message: 'Activo creado correctamente',
    asset_id: result.lastInsertRowid,
    asset_number: finalAssetNumber
  });
});

// Update asset
router.put('/:id', authenticateToken, (req, res) => {
  const assetId = req.params.id;
  const {
    description,
    responsible,
    brand,
    model,
    serial_number,
    acquisition_date,
    status,
    category,
    location,
    notes
  } = req.body;

  const existing = db.prepare('SELECT * FROM assets WHERE id = ?').get(assetId);
  if (!existing) {
    return res.status(404).json({ error: 'Activo no encontrado' });
  }

  const changes = [];
  if (existing.status !== status && status) changes.push(`estado: ${existing.status} → ${status}`);
  if (existing.responsible !== responsible) changes.push(`responsable: "${existing.responsible}" → "${responsible}"`);
  if (existing.description !== description) changes.push(`descripción`);

  const auditDetails = changes.length > 0
    ? `Editó activo ${existing.asset_number}. Cambios: ${changes.join(', ')}`
    : `Editó activo ${existing.asset_number}`;

  db.prepare(`
    UPDATE assets SET
      description = COALESCE(?, description),
      responsible = COALESCE(?, responsible),
      brand = COALESCE(?, brand),
      model = COALESCE(?, model),
      serial_number = COALESCE(?, serial_number),
      acquisition_date = COALESCE(?, acquisition_date),
      status = COALESCE(?, status),
      category = COALESCE(?, category),
      location = COALESCE(?, location),
      notes = COALESCE(?, notes),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    description, responsible, brand, model, serial_number,
    parseDate(acquisition_date), status, category, location, notes, assetId
  );

  logAudit('UPDATE', 'asset', assetId, auditDetails, req);

  res.json({ message: 'Activo actualizado correctamente' });
});

// Delete (deactivate) asset
router.delete('/:id', authenticateToken, (req, res) => {
  const assetId = req.params.id;

  const existing = db.prepare('SELECT asset_number, status FROM assets WHERE id = ?').get(assetId);
  if (!existing) {
    return res.status(404).json({ error: 'Activo no encontrado' });
  }

  db.prepare("UPDATE assets SET status = 'Inactivo', updated_at = datetime('now') WHERE id = ?").run(assetId);

  logAudit('DELETE', 'asset', assetId, `Desactivó activo ${existing.asset_number}`, req);

  res.json({ message: 'Activo desactivado correctamente' });
});

// Reactivate (activate) asset
router.post('/:id/reactivate', authenticateToken, (req, res) => {
  const assetId = req.params.id;

  const existing = db.prepare('SELECT asset_number, status FROM assets WHERE id = ?').get(assetId);
  if (!existing) {
    return res.status(404).json({ error: 'Activo no encontrado' });
  }

  db.prepare("UPDATE assets SET status = 'Activo', updated_at = datetime('now') WHERE id = ?").run(assetId);

  logAudit('UPDATE', 'asset', assetId, `Activó activo ${existing.asset_number}`, req);

  res.json({ message: 'Activo activado correctamente' });
});

module.exports = router;
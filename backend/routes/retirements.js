const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { generateRetirementPDF } = require('../utils/pdf');

const router = express.Router();

// Create retirement and generate PDF
router.post('/', authenticateToken, (req, res) => {
  const {
    asset_id,
    reason,
    inspector_name,
    inspector_cedula,
    current_responsible_name,
    current_responsible_cedula,
    superior_name,
    superior_cedula
  } = req.body;

  // Validate required fields
  if (!asset_id) {
    return res.status(400).json({ error: 'ID del activo es requerido' });
  }
  if (!reason) {
    return res.status(400).json({ error: 'El motivo de la baja es requerido' });
  }

  // Get asset data
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(asset_id);
  if (!asset) {
    return res.status(404).json({ error: 'Activo no encontrado' });
  }

  // Check if already retired
  const existingRetirement = db.prepare('SELECT id FROM asset_retirements WHERE asset_id = ?').get(asset_id);
  if (existingRetirement) {
    return res.status(400).json({ error: 'El activo ya ha sido dado de baja anteriormente' });
  }

  // Insert retirement record
  const result = db.prepare(`
    INSERT INTO asset_retirements (
      asset_id, asset_number, description, brand, model, serial_number,
      responsible, location, category,
      reason,
      inspector_name, inspector_cedula,
      current_responsible_name, current_responsible_cedula,
      superior_name, superior_cedula,
      retired_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    asset_id,
    asset.asset_number,
    asset.description,
    asset.brand,
    asset.model,
    asset.serial_number,
    asset.responsible,
    asset.location,
    asset.category,
    reason,
    inspector_name || null,
    inspector_cedula || null,
    current_responsible_name || null,
    current_responsible_cedula || null,
    superior_name || null,
    superior_cedula || null,
    req.user.id
  );

  // Update asset status to "Dado de baja"
  db.prepare("UPDATE assets SET status = 'Dado de baja', updated_at = datetime('now') WHERE id = ?").run(asset_id);

  // Log audit
  logAudit('RETIRE', 'asset', asset_id, `Dar de baja activo ${asset.asset_number}: ${reason}`, req);

  res.status(201).json({
    message: 'Activo dado de baja correctamente',
    retirement_id: result.lastInsertRowid
  });
});

// Get retirement by asset ID
router.get('/asset/:asset_id', authenticateToken, (req, res) => {
  const retirement = db.prepare('SELECT * FROM asset_retirements WHERE asset_id = ?').get(req.params.asset_id);

  if (!retirement) {
    return res.status(404).json({ error: 'No se encontró registro de baja para este activo' });
  }

  res.json({ retirement });
});

// Download retirement PDF by asset ID
router.get('/asset/:asset_id/pdf', authenticateToken, (req, res) => {
  const retirement = db.prepare('SELECT * FROM asset_retirements WHERE asset_id = ?').get(req.params.asset_id);

  if (!retirement) {
    return res.status(404).json({ error: 'No se encontró registro de baja para este activo' });
  }

  // Get asset and branding data
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(retirement.asset_id);
  const branding = db.prepare('SELECT * FROM branding WHERE id = 1').get();

  // Get logo path
  let logoPath = null;
  if (branding.logo_path) {
    const fullPath = path.join('/app/data/branding', path.basename(branding.logo_path));
    if (fs.existsSync(fullPath)) {
      logoPath = fullPath;
    }
  }

  // Generate PDF
  let pdfBuffer;
  try {
    pdfBuffer = generateRetirementPDF(asset, retirement, branding, logoPath);
  } catch (err) {
    console.error('PDF generation error:', err);
    return res.status(500).json({ error: 'Error al generar PDF: ' + err.message });
  }

  if (!pdfBuffer || pdfBuffer.length === 0) {
    return res.status(500).json({ error: 'PDF vacío' });
  }

  // Save PDF to file
  const bajasDir = '/app/data/bajas';
  if (!fs.existsSync(bajasDir)) {
    fs.mkdirSync(bajasDir, { recursive: true });
  }

  const today = new Date().toISOString().split('T')[0];
  const fileName = `baja_${retirement.asset_number}_${today}.pdf`;
  const filePath = path.join(bajasDir, fileName);
  fs.writeFileSync(filePath, pdfBuffer);

  console.log('PDF saved to:', filePath);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
  res.send(pdfBuffer);
});

// Get all retirements with pagination
router.get('/', authenticateToken, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  const retirements = db.prepare(`
    SELECT ar.*, u.full_name as retired_by_name
    FROM asset_retirements ar
    LEFT JOIN users u ON ar.retired_by = u.id
    ORDER BY ar.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  const total = db.prepare('SELECT COUNT(*) as count FROM asset_retirements').get().count;

  res.json({
    retirements,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// Download retirement PDF
router.get('/:id/pdf', authenticateToken, (req, res) => {
  const retirement = db.prepare('SELECT * FROM asset_retirements WHERE id = ?').get(req.params.id);

  if (!retirement) {
    return res.status(404).json({ error: 'Registro de baja no encontrado' });
  }

  // Get asset and branding data
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(retirement.asset_id);
  const branding = db.prepare('SELECT * FROM branding WHERE id = 1').get();

  // Get logo path
  let logoPath = null;
  if (branding.logo_path) {
    const fullPath = path.join('/app/data/branding', path.basename(branding.logo_path));
    if (fs.existsSync(fullPath)) {
      logoPath = fullPath;
    }
  }

  // Generate PDF
  const pdfBuffer = generateRetirementPDF(asset, retirement, branding, logoPath);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=baja_${retirement.asset_number}.pdf`);
  res.send(pdfBuffer);
});

// Cancel retirement (reactivate asset)
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  const retirement = db.prepare('SELECT * FROM asset_retirements WHERE id = ?').get(req.params.id);

  if (!retirement) {
    return res.status(404).json({ error: 'Registro de baja no encontrado' });
  }

  // Update asset back to Activo
  db.prepare("UPDATE assets SET status = 'Activo', updated_at = datetime('now') WHERE id = ?").run(retirement.asset_id);

  // Delete retirement record
  db.prepare('DELETE FROM asset_retirements WHERE id = ?').run(req.params.id);

  // Log audit
  logAudit('CANCEL_RETIRE', 'asset', retirement.asset_id, `Canceló baja de activo ${retirement.asset_number}`, req);

  res.json({ message: 'Baja cancelada, activo reactivado' });
});

module.exports = router;
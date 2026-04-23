require('dotenv').config();
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || '/app/data/activos.db';

// Ensure directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize tables
function initializeDatabase() {
  console.log('[DB] Initializing database...');

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT,
      role TEXT DEFAULT 'operator',
      is_active INTEGER DEFAULT 1,
      must_change_password INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Assets table
  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_number TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL,
      responsible TEXT,
      brand TEXT,
      model TEXT,
      serial_number TEXT,
      acquisition_date TEXT,
      status TEXT DEFAULT 'Activo',
      category TEXT,
      location TEXT,
      notes TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // Audit log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Branding table
  db.exec(`
    CREATE TABLE IF NOT EXISTS branding (
      id INTEGER PRIMARY KEY,
      app_name TEXT DEFAULT 'Control de Activos',
      login_title TEXT DEFAULT 'Control de Activos',
      login_subtitle TEXT DEFAULT 'Sistema de Gestión de Activos Electrónicos',
      primary_color TEXT DEFAULT '#0d9488',
      secondary_color TEXT DEFAULT '#0f766e',
      logo_path TEXT,
      login_background_path TEXT,
      -- Encabezado genérico para PDF de baja de activos
      retirement_header_line1 TEXT DEFAULT 'Texto de Encabezado Línea 1',
      retirement_header_line2 TEXT DEFAULT 'Texto de Encabezado Línea 2',
      retirement_header_line3 TEXT DEFAULT 'Texto de Encabezado Línea 3',
      retirement_header_line4 TEXT DEFAULT 'Texto de Encabezado Línea 4',
      retirement_header_title TEXT DEFAULT 'Solicitud de Baja de Activos',
      retirement_header_note TEXT DEFAULT 'Nota: Ambas columnas son espacios disponibles para indicar bienes o traslados.',
      updated_by INTEGER,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (updated_by) REFERENCES users(id)
    )
  `);

  // Asset retirements table
  db.exec(`
    CREATE TABLE IF NOT EXISTS asset_retirements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL,
      asset_number TEXT NOT NULL,
      description TEXT,
      brand TEXT,
      model TEXT,
      serial_number TEXT,
      responsible TEXT,
      location TEXT,
      category TEXT,
      -- Motivo de la baja
      reason TEXT NOT NULL,
      -- Firmas y datos
      inspector_name TEXT,
      inspector_cedula TEXT,
      inspector_signature_path TEXT,
      current_responsible_name TEXT,
      current_responsible_cedula TEXT,
      current_responsible_signature_path TEXT,
      superior_name TEXT,
      superior_cedula TEXT,
      superior_signature_path TEXT,
      -- Metadata
      retired_by INTEGER,
      retired_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (asset_id) REFERENCES assets(id),
      FOREIGN KEY (retired_by) REFERENCES users(id)
    )
  `);

  // Initialize branding with default if empty
  const brandingCount = db.prepare('SELECT COUNT(*) as count FROM branding').get();
  if (brandingCount.count === 0) {
    db.prepare(`
      INSERT INTO branding (id, app_name, login_title, login_subtitle, primary_color, secondary_color, 
        retirement_header_line1, retirement_header_line2, retirement_header_line3, retirement_header_line4,
        retirement_header_title, retirement_header_note)
      VALUES (1, 'Control de Activos', 'Control de Activos', 'Sistema de Gestión de Activos Electrónicos', '#0d9488', '#0f766e',
        'Texto de Encabezado Línea 1', 'Texto de Encabezado Línea 2', 
        'Texto de Encabezado Línea 3', 'Texto de Encabezado Línea 4',
        'Solicitud de Baja de Activos', 'Nota: Ambas columnas son espacios disponibles para indicar bienes o traslados.')
    `).run();
  }

  // Add retirement header columns if they don't exist (migration for existing databases)
  try {
    db.prepare("ALTER TABLE branding ADD COLUMN retirement_header_line1 TEXT DEFAULT 'Texto de Encabezado Línea 1'").run();
  } catch (e) {}
  try {
    db.prepare("ALTER TABLE branding ADD COLUMN retirement_header_line2 TEXT DEFAULT 'Texto de Encabezado Línea 2'").run();
  } catch (e) {}
  try {
    db.prepare("ALTER TABLE branding ADD COLUMN retirement_header_line3 TEXT DEFAULT 'Texto de Encabezado Línea 3'").run();
  } catch (e) {}
  try {
    db.prepare("ALTER TABLE branding ADD COLUMN retirement_header_line4 TEXT DEFAULT 'Texto de Encabezado Línea 4'").run();
  } catch (e) {}
  try {
    db.prepare("ALTER TABLE branding ADD COLUMN retirement_header_title TEXT DEFAULT 'Solicitud de Baja de Activos'").run();
  } catch (e) {}
  try {
    db.prepare("ALTER TABLE branding ADD COLUMN retirement_header_note TEXT DEFAULT 'Nota: Ambas columnas son espacios disponibles para indicar bienes o traslados.'").run();
  } catch (e) {}

  console.log('[DB] Tables created successfully');
}

// Create admin user if not exists
function createAdminUser() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const adminFullName = process.env.ADMIN_FULL_NAME || 'Administrador';
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@empresa.local';

  const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername);

  if (!existingAdmin) {
    const passwordHash = bcrypt.hashSync(adminPassword, 10);
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, email, role, is_active, must_change_password)
      VALUES (?, ?, ?, ?, 'admin', 1, 1)
    `).run(adminUsername, passwordHash, adminFullName, adminEmail);
    console.log(`[DB] Admin user created: ${adminUsername}`);
  } else {
    console.log(`[DB] Admin user already exists: ${adminUsername}`);
  }
}

// Initialize database on module load
initializeDatabase();
createAdminUser();

module.exports = db;
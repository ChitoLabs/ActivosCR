const XLSX = require('xlsx');
const { generateAssetNumber, parseDate, parseScientificNotation } = require('./helpers');

// Headers for asset template
const ASSET_HEADERS = [
  'N° de Activo',
  'Descripción',
  'Responsable',
  'Marca',
  'Modelo',
  'Serie',
  'Fecha de Adquisición',
  'Estado',
  'Categoría',
  'Ubicación',
  'Observaciones'
];

// Create template workbook
function createTemplate() {
  const wb = XLSX.utils.book_new();

  // Main template sheet
  const templateData = [ASSET_HEADERS];
  const ws = XLSX.utils.aoa_to_sheet(templateData);

  // Set column widths
  ws['!cols'] = [
    { wch: 12 }, // N° de Activo
    { wch: 30 }, // Descripción
    { wch: 20 }, // Responsable
    { wch: 15 }, // Marca
    { wch: 15 }, // Modelo
    { wch: 20 }, // Serie
    { wch: 18 }, // Fecha de Adquisición
    { wch: 12 }, // Estado
    { wch: 15 }, // Categoría
    { wch: 20 }, // Ubicación
    { wch: 30 }  // Observaciones
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Activos');

  // Instructions sheet
  const instructionsData = [
    ['INSTRUCCIONES'],
    [''],
    ['1. Esta plantilla sirve para importar activos de forma masiva.'],
    ['2. Complete los datos en la hoja "Activos".'],
    ['3. "N° de Activo" es opcional; si lo deja vacío, se generará automáticamente.'],
    ['4. "Descripción" y "Responsable" son obligatorios.'],
    ['5. Fecha de Adquisición formato: YYYY-MM-DD (ejemplo: 2024-12-31)'],
    ['6. Estados válidos: Activo, Inactivo, Dado de baja'],
    [''],
    ['EJEMPLO:'],
    ['ACT-0001', 'Laptop Dell XPS 15', 'Juan Pérez', 'Dell', 'XPS 15', 'SN123456', '2024-01-15', 'Activo', 'Computación', 'Oficina Principal', '']
  ];

  const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsData);
  wsInstructions['!cols'] = [{ wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instrucciones');

  // Catalogs sheet
  const catalogsData = [
    ['CATÁLOGOS'],
    [''],
    ['Estados válidos:'],
    ['Activo'],
    ['Inactivo'],
    ['Inactivo'],
    ['Dado de baja'],
    [''],
    ['Categorías sugeridas:'],
    ['Computación'],
    ['Redes'],
    ['Telecomunicación'],
    ['Mobiliario'],
    ['Vehículos'],
    ['Herramientas'],
    ['Otro']
  ];

  const wsCatalogs = XLSX.utils.aoa_to_sheet(catalogsData);
  wsCatalogs['!cols'] = [{ wch: 25 }];
  XLSX.utils.book_append_sheet(wb, wsCatalogs, 'Catálogos');

  return wb;
}

// Export assets to Excel
function exportAssets(assets) {
  const wb = createTemplate();

  // Replace template data with actual assets
  const data = [ASSET_HEADERS];

  for (const asset of assets) {
    data.push([
      asset.asset_number,
      asset.description,
      asset.responsible,
      asset.brand,
      asset.model,
      asset.serial_number,
      asset.acquisition_date,
      asset.status,
      asset.category,
      asset.location,
      asset.notes
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 12 },
    { wch: 30 },
    { wch: 20 },
    { wch: 15 },
    { wch: 15 },
    { wch: 20 },
    { wch: 18 },
    { wch: 12 },
    { wch: 15 },
    { wch: 20 },
    { wch: 30 }
  ];

  // Replace sheet
  wb.SheetNames[0] = 'Activos';
  wb.Sheets['Activos'] = ws;

  return wb;
}

// Import assets from Excel
function importAssets(db, assets, userId) {
  const results = {
    created: 0,
    updated: 0,
    errors: []
  };

  for (let i = 0; i < assets.length; i++) {
    const row = assets[i];
    const rowNum = i + 2; // +2 because of header row and 0-index

    try {
      const assetNumber = row['N° de Activo'] || '';
      const description = row['Descripción'] || '';
      const responsible = row['Responsable'] || '';

      // Validate required fields
      if (!description) {
        results.errors.push({
          row: rowNum,
          error: 'Descripción es requerida'
        });
        continue;
      }

      if (!responsible) {
        results.errors.push({
          row: rowNum,
          error: 'Responsable es requerido'
        });
        continue;
      }

      // Check if asset exists
      let finalAssetNumber = assetNumber;
      let isNew = false;

      if (assetNumber) {
        const existing = db.prepare('SELECT id FROM assets WHERE asset_number = ?').get(assetNumber);
        if (existing) {
          // Update existing
          db.prepare(`
            UPDATE assets SET
              description = ?,
              responsible = ?,
              brand = ?,
              model = ?,
              serial_number = ?,
              acquisition_date = ?,
              status = ?,
              category = ?,
              location = ?,
              notes = ?,
              updated_at = datetime('now')
            WHERE asset_number = ?
          `).run(
            description,
            responsible,
            row['Marca'] || null,
            row['Modelo'] || null,
            parseScientificNotation(row['Serie']),
            parseDate(row['Fecha de Adquisición']),
            row['Estado'] || 'Activo',
            row['Categoría'] || null,
            row['Ubicación'] || null,
            row['Observaciones'] || null,
            assetNumber
          );
          results.updated++;
        } else {
          // Create new with provided number
          finalAssetNumber = assetNumber;
          isNew = true;
        }
      } else {
        // Generate new number
        finalAssetNumber = generateAssetNumber(db);
        isNew = true;
      }

      if (isNew) {
        db.prepare(`
          INSERT INTO assets (
            asset_number, description, responsible, brand, model, serial_number,
            acquisition_date, status, category, location, notes, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          finalAssetNumber,
          description,
          responsible,
          row['Marca'] || null,
          row['Modelo'] || null,
          parseScientificNotation(row['Serie']),
          parseDate(row['Fecha de Adquisición']),
          row['Estado'] || 'Activo',
          row['Categoría'] || null,
          row['Ubicación'] || null,
          row['Observaciones'] || null,
          userId
        );
        results.created++;
      }
    } catch (error) {
      results.errors.push({
        row: rowNum,
        error: error.message
      });
    }
  }

  return results;
}

// Parse Excel file
function parseExcelFile(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets['Activos'];

  if (!ws) {
    throw new Error('No se encontró la hoja "Activos" en el archivo');
  }

  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const headers = data[0];

  if (!headers || headers.length === 0) {
    throw new Error('El archivo está vacío');
  }

  // Map headers to expected names
  const headerMap = {};
  headers.forEach((header, index) => {
    headerMap[header.trim()] = index;
  });

  // Convert rows to objects
  const assets = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const asset = {};
    for (const header of ASSET_HEADERS) {
      const colIndex = headerMap[header];
      if (colIndex !== undefined) {
        asset[header] = row[colIndex];
      }
    }

    // Only add if has at least one field
    if (Object.values(asset).some(v => v !== undefined && v !== '')) {
      assets.push(asset);
    }
  }

  return assets;
}

module.exports = {
  createTemplate,
  exportAssets,
  importAssets,
  parseExcelFile,
  ASSET_HEADERS
};
// Generate next asset number
function generateAssetNumber(db) {
  const lastAsset = db.prepare('SELECT asset_number FROM assets ORDER BY id DESC LIMIT 1').get();

  let nextNum = 1;
  if (lastAsset) {
    const match = lastAsset.asset_number.match(/ACT-(\d+)/);
    if (match) {
      nextNum = parseInt(match[1]) + 1;
    }
  }

  return `ACT-${String(nextNum).padStart(4, '0')}`;
}

// Parse date from various formats
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Handle Excel serial date number (numeric value like 45400)
  if (typeof dateStr === 'number') {
    // Excel serial date: days since 1899-12-30
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + dateStr * 24 * 60 * 60 * 1000);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
    return null;
  }

  // If string, clean it up
  const str = String(dateStr).trim();

  // If already a valid date string (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // Handle DD/M/YYYY or D/M/YYYY format (Spanish/Latin America)
  const ddMmYyyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddMmYyyy) {
    const [, day, month, year] = ddMmYyyy;
    const formatted = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) {
      return formatted;
    }
  }

  // Try to parse from common formats
  const date = new Date(str);
  if (isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().split('T')[0];
}

// Format date for display
function formatDate(dateStr) {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  return date.toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Format datetime for display
function formatDateTime(dateStr) {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  return date.toLocaleString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Sanitize string for search
function sanitizeSearch(str) {
  if (!str) return '';
  return str.replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/gi, '').trim();
}

// Validate hex color
function isValidHexColor(color) {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

// Parse Excel scientific notation (e.g., "5,64565E+11" -> "564565000000")
function parseScientificNotation(value) {
  if (!value) return null;
  
  // If it's already a string, check if it looks like scientific notation
  const str = String(value).trim();
  
  // Check for scientific notation pattern (e.g., "5,64565E+11")
  const sciMatch = str.match(/^(\d[.,]?\d*)[eE]([+-]?\d+)$/);
  if (sciMatch) {
    const num = parseFloat(sciMatch[1].replace(',', '.'));
    const exp = parseInt(sciMatch[2]);
    const result = num * Math.pow(10, exp);
    return String(Math.round(result));
  }
  
  // Handle plain large numbers
  const plainNum = parseFloat(str.replace(',', '.'));
  if (!isNaN(plainNum) && Math.abs(plainNum) > 1e11) {
    return String(Math.round(plainNum));
  }
  
  // Return original if no conversion needed
  return value;
}

module.exports = {
  generateAssetNumber,
  parseDate,
  formatDate,
  formatDateTime,
  sanitizeSearch,
  isValidHexColor,
  parseScientificNotation
};
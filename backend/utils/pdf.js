const { jsPDF } = require('jspdf');
const path = require('path');
const fs = require('fs');

// Remove accents for PDF compatibility
function removeAccents(text) {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/gi, 'n')
    .replace(/Ñ/gi, 'N');
}

/**
 * Generate PDF for asset retirement
 * @param {Object} asset - Asset data
 * @param {Object} retirement - Retirement data with reason and signatures
 * @param {Object} branding - Branding data for header
 * @param {string} logoPath - Absolute path to logo file
 * @returns {Buffer} PDF buffer
 */
function generateRetirementPDF(asset, retirement, branding, logoPath) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);
  let y = margin;
  // === LOGO (right side) - Only PNG/JPG supported
  const logoSize = 20;
  const logoX = pageWidth - margin - logoSize; // Right-aligned
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      const ext = path.extname(logoPath).toLowerCase();
      // Only load PNG or JPG, skip SVG
      if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
        const imgData = fs.readFileSync(logoPath);
        if (ext === '.png') {
          doc.addImage(imgData, 'PNG', logoX, y, logoSize, logoSize);
        } else {
          doc.addImage(imgData, 'JPEG', logoX, y, logoSize, logoSize);
        }
      }
      // SVG is skipped - jsPDF doesn't support it
    } catch (e) {
      console.error('[PDF] Error loading logo:', e.message);
    }
  }

  // === HEADER TEXT ===
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  
  const line1 = removeAccents(branding.retirement_header_line1 || 'Texto de Encabezado Línea 1');
  const line2 = removeAccents(branding.retirement_header_line2 || 'Texto de Encabezado Línea 2');
  const line3 = removeAccents(branding.retirement_header_line3 || 'Texto de Encabezado Línea 3');
  const line4 = removeAccents(branding.retirement_header_line4 || 'Texto de Encabezado Línea 4');
  
  doc.text(line1, margin, y);
  y += 5;
  doc.text(line2, margin, y);
  y += 5;
  doc.text(line3, margin, y);
  y += 5;
  doc.text(line4, margin, y);
  y += 10;

  // === MAIN TITLE ===
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  const title = removeAccents(branding.retirement_header_title || 'Solicitud de Baja de Activos');
  doc.text(title, pageWidth / 2, y, { align: 'center' });
  y += 10;

  // === NOTE ===
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100);
  const note = removeAccents(branding.retirement_header_note || 'Nota: Ambas columnas son espacios disponibles para indicar bienes o traslados.');
  const noteLines = doc.splitTextToSize(note, contentWidth);
  doc.text(noteLines, pageWidth / 2, y, { align: 'center' });
  y += noteLines.length * 4 + 4;
  doc.setTextColor(0);

  // === DIVIDER LINE ===
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // === ASSET INFO ===
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('DATOS DEL ACTIVO', margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  // Column 1
  const col1 = [
    { label: 'Numero de Activo:', value: asset.asset_number },
    { label: 'Descripcion:', value: asset.description },
    { label: 'Marca:', value: asset.brand || 'N/A' },
    { label: 'Modelo:', value: asset.model || 'N/A' },
    { label: 'Numero de Serie:', value: asset.serial_number || 'N/A' }
  ];

  // Column 2
  const col2 = [
    { label: 'Responsable:', value: asset.responsible || 'N/A' },
    { label: 'Ubicacion:', value: asset.location || 'N/A' },
    { label: 'Categoria:', value: asset.category || 'N/A' },
    { label: 'Fecha de Adquisicion:', value: asset.acquisition_date || 'N/A' },
    { label: 'Fecha de Baja:', value: retirement.retired_at ? new Date(retirement.retired_at).toLocaleDateString('es-MX') : 'N/A' }
  ];

  // Render column 1
  col1.forEach(field => {
    doc.setFont('helvetica', 'bold');
    doc.text(field.label, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(field.value || 'N/A', margin + 45, y);
    y += 6;
  });

  // Render column 2 at the same Y position but offset X
  const col2X = pageWidth / 2;
  let col2Y = y - (col1.length * 6); // Go back to first line height
  col2.forEach(field => {
    doc.setFont('helvetica', 'bold');
    doc.text(field.label, col2X, col2Y);
    doc.setFont('helvetica', 'normal');
    doc.text(field.value || 'N/A', col2X + 45, col2Y);
    col2Y += 6;
  });

  y = y + Math.max(col1.length, col2.length) * 6;
  y += 2;

  // === REASON (MOTIVO DE LA BAJA) ===
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('MOTIVO DE LA BAJA', margin, y);
  y += 5;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const reasonText = removeAccents(retirement.reason) || 'N/A';
  const reasonLines = doc.splitTextToSize(reasonText, contentWidth);
  doc.text(reasonLines, margin, y);
  y += reasonLines.length * 5 + 5;

  // === SIGNATURE BLOCKS ===
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('FIRMAS DE AUTORIZACION', margin, y);
  y += 8;

  // Three signature blocks in 2 columns
  const sigCol2X = pageWidth / 2;
  
  const signatureBlocks = [
    {
      title: '1. Encargado de inspeccionar el equipo',
      name: retirement.inspector_name,
      cedula: retirement.inspector_cedula
    },
    {
      title: '2. Actualmente Bajo la responsabilidad de:',
      name: retirement.current_responsible_name,
      cedula: retirement.current_responsible_cedula
    },
    {
      title: '3. Autorizacion del Superior Jerarquico',
      name: retirement.superior_name,
      cedula: retirement.superior_cedula
    }
  ];

  signatureBlocks.forEach(block => {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const blockTitle = removeAccents(block.title);
    doc.text(blockTitle, margin, y);
    y += 5;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');

    // Column 1: Nombre and Cedula
    const nameField = `Nombre: ${block.name || '_________________________'}`;
    doc.text(nameField, margin, y);
    y += 4;
    
    const cedField = `Cedula: ${block.cedula || '_________________________'}`;
    doc.text(cedField, margin, y);
    
    // Column 2: Firma line - align with Cedula row
    doc.setLineWidth(0.5);
    doc.line(sigCol2X, y, sigCol2X + 70, y);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('Firma', sigCol2X + 20, y + 5);
    
    y += 12;
  });

  // === FOOTER ===
  const footerY = pageHeight - 15;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(128);
  const dateStr = new Date().toISOString().split('T')[0];
  doc.text(`Documento generado el ${dateStr}`, pageWidth / 2, footerY, { align: 'center' });

  // Return as array buffer then convert
  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

module.exports = {
  generateRetirementPDF
};
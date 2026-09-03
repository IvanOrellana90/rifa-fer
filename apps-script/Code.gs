/**
 * Rifa a beneficio de Fernanda — Backend (Google Apps Script)
 *
 * Este script vive DENTRO del Google Sheet de la rifa y expone dos endpoints:
 *   GET  → devuelve JSON con todos los vendedores, números y estados + totales
 *   POST → reserva un número (marca Estado = "Reservado" con nombre y teléfono)
 *
 * Deploy: Extensiones → Apps Script → pegar este código → Implementar →
 * Nueva implementación → App web → Ejecutar como: yo / Acceso: cualquier persona.
 */

const TICKET_PRICE = 2000;

const ESTADO_DISPONIBLE = 'disponible';
const ESTADO_RESERVADO = 'Reservado';

// ---------------------------------------------------------------- GET

function doGet() {
  return jsonResponse(buildData());
}

function buildData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const vendedores = [];

  ss.getSheets().forEach(function (sheet) {
    const parsed = parseVendorSheet(sheet);
    if (parsed) vendedores.push(parsed);
  });

  let total = 0;
  let pagados = 0;
  let reservados = 0;

  vendedores.forEach(function (v) {
    v.numeros.forEach(function (n) {
      total++;
      const estado = n.estado.toLowerCase();
      if (estado === 'pagado') pagados++;
      else if (estado === 'reservado') reservados++;
    });
  });

  return {
    ok: true,
    precio: TICKET_PRICE,
    meta: total * TICKET_PRICE,
    recaudado: pagados * TICKET_PRICE,
    comprometido: reservados * TICKET_PRICE,
    totales: {
      total: total,
      pagados: pagados,
      reservados: reservados,
      disponibles: total - pagados - reservados,
    },
    vendedores: vendedores,
    actualizado: new Date().toISOString(),
  };
}

/**
 * Una pestaña es "de vendedor" si tiene una fila de encabezados con columnas
 * "Número" y "Estado" en alguna de sus primeras filas (las pestañas reales
 * tienen título "RIFA n" en la fila 1 y los encabezados en la fila 4).
 * Cualquier otra pestaña (resumen, instrucciones, etc.) se ignora sola.
 */
function parseVendorSheet(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;

  const header = findHeaderRow(values);
  if (!header) return null;
  const cols = header.cols;

  const numeros = [];
  for (let r = header.row + 1; r < values.length; r++) {
    const raw = values[r][cols.numero];
    if (raw === '' || isNaN(raw)) continue;
    const estado = String(values[r][cols.estado]).trim();
    numeros.push({
      numero: Number(raw),
      estado: estado || 'Disponible',
    });
  }

  if (!numeros.length) return null;
  return { vendedor: sheet.getName(), numeros: numeros };
}

/**
 * Busca la fila de encabezados dentro de las primeras 10 filas.
 * Devuelve { row, cols } o null si la pestaña no tiene formato de vendedor.
 */
function findHeaderRow(values) {
  const maxScan = Math.min(values.length, 10);
  for (let r = 0; r < maxScan; r++) {
    const cols = findColumns(values[r]);
    if (cols.numero !== -1 && cols.estado !== -1) return { row: r, cols: cols };
  }
  return null;
}

function findColumns(headerRow) {
  const headers = headerRow.map(function (h) {
    return String(h).trim().toLowerCase();
  });
  const findBy = function (prefix) {
    for (let i = 0; i < headers.length; i++) {
      if (headers[i].indexOf(prefix) === 0) return i;
    }
    return -1;
  };
  return {
    numero: findBy('número') !== -1 ? findBy('número') : findBy('numero'),
    nombre: findBy('nombre'),
    telefono: findBy('tel'),
    estado: findBy('estado'),
    observaciones: findBy('observa'),
  };
}

// ---------------------------------------------------------------- POST

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    // Evita que dos personas reserven el mismo número al mismo tiempo.
    lock.waitLock(10000);
  } catch (err) {
    return jsonResponse({ ok: false, error: 'El sistema está ocupado, inténtalo de nuevo en unos segundos.' });
  }

  try {
    const body = JSON.parse(e.postData.contents);
    const vendedor = clean(body.vendedor);
    const numero = Number(body.numero);
    const nombre = clean(body.nombre);
    const telefono = clean(body.telefono);

    if (!vendedor || !numero || !nombre || !telefono) {
      return jsonResponse({ ok: false, error: 'Faltan datos para la reserva.' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(vendedor);
    if (!sheet) return jsonResponse({ ok: false, error: 'Vendedor no encontrado.' });

    const values = sheet.getDataRange().getValues();
    const header = findHeaderRow(values);
    if (!header) {
      return jsonResponse({ ok: false, error: 'La pestaña del vendedor no tiene el formato esperado.' });
    }
    const cols = header.cols;

    for (let r = header.row + 1; r < values.length; r++) {
      if (Number(values[r][cols.numero]) !== numero) continue;

      const estadoActual = String(values[r][cols.estado]).trim().toLowerCase();
      if (estadoActual && estadoActual !== ESTADO_DISPONIBLE) {
        return jsonResponse({ ok: false, error: 'Ese número ya no está disponible. Elige otro.' });
      }

      const row = r + 1;
      sheet.getRange(row, cols.estado + 1).setValue(ESTADO_RESERVADO);
      if (cols.nombre !== -1) sheet.getRange(row, cols.nombre + 1).setValue(nombre);
      if (cols.telefono !== -1) sheet.getRange(row, cols.telefono + 1).setValue(telefono);
      if (cols.observaciones !== -1) {
        sheet
          .getRange(row, cols.observaciones + 1)
          .setValue('Reserva web · ' + new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' }));
      }

      return jsonResponse({ ok: true, vendedor: vendedor, numero: numero });
    }

    return jsonResponse({ ok: false, error: 'Número no encontrado en la pestaña de ' + vendedor + '.' });
  } catch (err) {
    return jsonResponse({ ok: false, error: 'Error inesperado: ' + err.message });
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- helpers

function clean(value) {
  return String(value || '').trim().slice(0, 80);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

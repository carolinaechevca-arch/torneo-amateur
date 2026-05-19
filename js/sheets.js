/* =============================================
   sheets.js – Funciones de la API de Google Sheets
   ============================================= */

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

/* Crea una nueva hoja de cálculo con las hojas indicadas.
   Devuelve el objeto completo de la respuesta de la API. */
async function crearSheet(nombre, hojas) {
  const token = obtenerToken();
  const body = {
    properties: { title: nombre },
    sheets: hojas.map((h, i) => ({
      properties: { sheetId: i, title: h, index: i }
    }))
  };

  const resp = await fetch(SHEETS_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || 'No se pudo crear la hoja de cálculo en Drive');
  }

  return resp.json();
}

/* Lee un rango de celdas de una hoja.
   Devuelve un array de arrays (filas × columnas). */
async function leerHoja(sheetId, rango) {
  const token = obtenerToken();
  const url = `${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(rango)}`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `No se pudo leer el rango "${rango}"`);
  }

  const data = await resp.json();
  return data.values || [];
}

/* Escribe valores en un rango de celdas (reemplaza el contenido).
   `valores` es un array de arrays: [[fila1col1, fila1col2], [fila2col1, ...]] */
async function escribirHoja(sheetId, rango, valores) {
  const token = obtenerToken();
  const url = `${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(rango)}?valueInputOption=USER_ENTERED`;

  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values: valores })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `No se pudo escribir en el rango "${rango}"`);
  }

  return resp.json();
}

/* Limpia un rango completo y luego escribe los valores.
   Útil para recalcular tablas como Posiciones. */
async function limpiarYEscribir(sheetId, hoja, valores) {
  const token = obtenerToken();

  // Primero limpiar la hoja entera
  await fetch(`${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(hoja)}:clear`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });

  // Luego escribir los nuevos valores
  return escribirHoja(sheetId, `${hoja}!A1`, valores);
}

/* Agrega filas al final de una hoja (append).
   Ideal para estadísticas donde se acumulan registros. */
async function agregarFilas(sheetId, rango, valores) {
  const token = obtenerToken();
  const url = `${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(rango)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values: valores })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || 'No se pudo agregar datos a la hoja');
  }

  return resp.json();
}

/* Escribe múltiples rangos en una sola llamada a la API (batchUpdate).
   `datos` = [{ rango: 'Hoja!A1', valores: [[...]] }, ...] */
async function escribirLotes(sheetId, datos) {
  const token = obtenerToken();
  const url = `${SHEETS_BASE}/${sheetId}/values:batchUpdate`;

  const body = {
    valueInputOption: 'USER_ENTERED',
    data: datos.map(d => ({ range: d.rango, values: d.valores }))
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Error al guardar los datos en Sheets');
  }

  return resp.json();
}

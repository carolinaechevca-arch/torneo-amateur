/* =============================================
   exportar.js – Exportar tablas como imagen o HTML estático
   ============================================= */

/* Descarga una tabla como imagen PNG usando html2canvas */
async function exportarTabla(elementoId) {
  const el = document.getElementById(elementoId);
  if (!el) {
    mostrarError('No se encontró la tabla para exportar.');
    return;
  }

  // Verificar que html2canvas esté disponible
  if (typeof html2canvas === 'undefined') {
    mostrarError('El módulo de exportación no está disponible. Verifica tu conexión a internet.');
    return;
  }

  mostrarCarga('Generando imagen...');
  try {
    const canvas = await html2canvas(el, {
      scale:           2,         // mayor resolución
      backgroundColor: '#ffffff',
      useCORS:         true,
      logging:         false,
    });

    const link = document.createElement('a');
    const nombre = torneoActual?.nombre?.replace(/[^a-zA-Z0-9]/g, '_') || 'torneo';
    link.download = `${nombre}_${elementoId}_${_fechaHoy()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    mostrarExito('✅ Imagen descargada correctamente');
  } catch (err) {
    mostrarError('No se pudo generar la imagen: ' + err.message);
    console.error(err);
  } finally {
    ocultarCarga();
  }
}

/* Genera un archivo HTML estático con toda la información del torneo
   para compartir fácilmente por WhatsApp o correo */
function generarHTMLEstatico() {
  if (!torneoActual) {
    mostrarError('No hay torneo activo para exportar.');
    return;
  }

  mostrarCarga('Generando página web...');

  try {
    const pos       = calcularClasificacion();
    const goleadores = _calcularGoleadoresList();
    const tarjetas   = _calcularTarjetasList();
    const juegoLimpio = _calcularJuegoLimpioList();

    const html = _plantillaHTMLEstatico(pos, goleadores, tarjetas, juegoLimpio);

    const blob  = new Blob([html], { type: 'text/html;charset=utf-8' });
    const link  = document.createElement('a');
    const nombre = torneoActual.nombre.replace(/[^a-zA-Z0-9]/g, '_');
    link.download = `${nombre}_${_fechaHoy()}.html`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);

    mostrarExito('✅ Página web descargada. ¡Envíala por WhatsApp!');
  } catch (err) {
    mostrarError('No se pudo generar la página: ' + err.message);
    console.error(err);
  } finally {
    ocultarCarga();
  }
}

/* ──────────────────────────────────────────────
   HELPERS PARA DATOS
   ────────────────────────────────────────────── */

function _calcularGoleadoresList() {
  const mapa = {};
  statsActual.forEach(s => {
    if (s.goles <= 0) return;
    const k = `${s.jugador}|||${s.equipo}`;
    if (!mapa[k]) mapa[k] = { jugador: s.jugador, equipo: s.equipo, goles: 0 };
    mapa[k].goles += s.goles;
  });
  return Object.values(mapa).sort((a, b) => b.goles - a.goles);
}

function _calcularTarjetasList() {
  const mapa = {};
  statsActual.forEach(s => {
    if (!s.amarillas && !s.rojas) return;
    const k = `${s.jugador}|||${s.equipo}`;
    if (!mapa[k]) mapa[k] = { jugador: s.jugador, equipo: s.equipo, amarillas: 0, rojas: 0 };
    mapa[k].amarillas += s.amarillas;
    mapa[k].rojas     += s.rojas;
  });
  return Object.values(mapa).sort((a, b) => (b.rojas * 3 + b.amarillas) - (a.rojas * 3 + a.amarillas));
}

function _calcularJuegoLimpioList() {
  if (!torneoActual) return [];
  const mapa = {};
  torneoActual.equipos.forEach(e => { mapa[e] = { equipo: e, amarillas: 0, rojas: 0 }; });
  statsActual.forEach(s => {
    if (mapa[s.equipo]) {
      mapa[s.equipo].amarillas += s.amarillas;
      mapa[s.equipo].rojas     += s.rojas;
    }
  });
  return Object.values(mapa)
    .map(e => ({ ...e, puntos: -(e.amarillas + e.rojas * 3) }))
    .sort((a, b) => b.puntos - a.puntos);
}

function _fechaHoy() {
  return new Date().toISOString().slice(0, 10);
}

/* ──────────────────────────────────────────────
   PLANTILLA HTML ESTÁTICO
   ────────────────────────────────────────────── */

function _plantillaHTMLEstatico(pos, goleadores, tarjetas, juegoLimpio) {
  const nombre = torneoActual.nombre;
  const fecha  = new Date().toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' });

  const filasPos = pos.map((e, i) => {
    const fondo = i === 0 ? '#1D9E75' : i === 1 ? '#378ADD' : i === 2 ? '#f0ad00' : '';
    const color = i < 3 ? '#fff' : '';
    const signo = e.dg > 0 ? '+' : '';
    return `<tr style="background:${fondo};color:${color}">
      <td>${i + 1}</td><td>${e.equipo}</td>
      <td>${e.pj}</td><td>${e.pg}</td><td>${e.pe}</td><td>${e.pp}</td>
      <td>${e.gf}</td><td>${e.gc}</td><td>${signo}${e.dg}</td>
      <td><strong>${e.pts}</strong></td>
    </tr>`;
  }).join('');

  const filasGol = goleadores.slice(0, 10).map((j, i) =>
    `<tr><td>${i + 1}</td><td>${j.jugador}</td><td>${j.equipo}</td><td>${j.goles} ⚽</td></tr>`
  ).join('') || '<tr><td colspan="4">Sin datos</td></tr>';

  const filasTar = tarjetas.slice(0, 10).map((j, i) =>
    `<tr><td>${i + 1}</td><td>${j.jugador}</td><td>${j.equipo}</td><td>${j.amarillas} 🟨</td><td>${j.rojas} 🟥</td></tr>`
  ).join('') || '<tr><td colspan="5">Sin datos</td></tr>';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>⚽ ${nombre}</title>
<style>
  body{font-family:system-ui,sans-serif;background:#f8f9fa;margin:0;padding:16px;color:#222}
  h1{color:#1D9E75;text-align:center;margin:0 0 4px}
  .fecha{text-align:center;color:#888;font-size:.9rem;margin-bottom:24px}
  h2{color:#378ADD;border-bottom:2px solid #378ADD;padding-bottom:4px;margin-top:32px}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1);margin-bottom:24px}
  th{background:#1D9E75;color:#fff;padding:10px 8px;font-size:.85rem;text-align:center}
  td{padding:8px;text-align:center;border-bottom:1px solid #eee;font-size:.9rem}
  td:nth-child(2){text-align:left}
  tr:last-child td{border-bottom:none}
  .footer{text-align:center;color:#aaa;font-size:.8rem;margin-top:32px}
</style>
</head>
<body>
<h1>⚽ ${nombre}</h1>
<p class="fecha">Actualizado: ${fecha}</p>

<h2>📊 Tabla de Posiciones</h2>
<table>
  <thead><tr><th>#</th><th>Equipo</th><th>PJ</th><th>PG</th><th>PE</th><th>PP</th><th>GF</th><th>GC</th><th>DG</th><th>Pts</th></tr></thead>
  <tbody>${filasPos}</tbody>
</table>

<h2>⚽ Goleadores</h2>
<table>
  <thead><tr><th>#</th><th>Jugador</th><th>Equipo</th><th>Goles</th></tr></thead>
  <tbody>${filasGol}</tbody>
</table>

<h2>🟨 Tarjetas</h2>
<table>
  <thead><tr><th>#</th><th>Jugador</th><th>Equipo</th><th>Amarillas</th><th>Rojas</th></tr></thead>
  <tbody>${filasTar}</tbody>
</table>

<p class="footer">Generado con Torneo Amateur App</p>
</body>
</html>`;
}

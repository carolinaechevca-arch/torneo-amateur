/* =============================================
   exportar.js – Exportar tablas como imagen o HTML estático
   ============================================= */

/* Mapa de IDs a títulos legibles para el encabezado de la imagen */
const _TITULOS_EXPORT = {
  'tabla-posiciones-container': '📊 Tabla de Posiciones',
  'tabla-goleadores':           '⚽ Goleadores',
  'tabla-goleadores-wrap':      '⚽ Goleadores',
  'tabla-tarjetas':             '🟨 Tarjetas',
  'tabla-tarjetas-wrap':        '🟨 Tarjetas',
  'tabla-juego-limpio':         '🤝 Juego Limpio',
  'tabla-juego-limpio-wrap':    '🤝 Juego Limpio',
  'tabla-valla':                '🥅 Valla Menos Vencida',
  'tabla-valla-wrap':           '🥅 Valla Menos Vencida',
  'inicio-proximos':            'Próximos Partidos',
};

/* Descarga una tabla como imagen PNG usando html2canvas, incluyendo el título */
async function exportarTabla(elementoId) {
  const el = document.getElementById(elementoId);
  if (!el) { mostrarError('No se encontró la tabla para exportar.'); return; }
  if (typeof html2canvas === 'undefined') {
    mostrarError('El módulo de exportación no está disponible. Verifica tu conexión a internet.');
    return;
  }

  const isDark  = document.documentElement.getAttribute('data-theme') === 'dark';
  const bgColor = isDark ? '#162816' : '#ffffff';
  const txColor = isDark ? '#E8F5E8' : '#11360E';
  const titulo  = _TITULOS_EXPORT[elementoId] || '';
  const fecha   = new Date().toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' });

  // Wrapper temporal off-screen con encabezado + tabla clonada
  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    'position:fixed', 'top:-9999px', 'left:-9999px',
    `background:${bgColor}`, 'padding:20px 24px 24px',
    'border-radius:12px', 'min-width:340px',
    "font-family:'Poppins',system-ui,sans-serif"
  ].join(';');

  wrapper.innerHTML = `
    <div style="text-align:center;margin-bottom:14px;border-bottom:2px solid #288024;padding-bottom:12px;">
      <div style="font-size:1.5rem;font-weight:800;color:#288024;letter-spacing:-.5px;">
        ⚽ ${torneoActual?.nombre || 'Torneo'}
      </div>
      ${titulo ? `<div style="font-size:1rem;font-weight:600;color:#56AF57;margin-top:2px;">${titulo}</div>` : ''}
      <div style="font-size:.72rem;color:#888;margin-top:4px;">${fecha}</div>
    </div>
  `;

  wrapper.appendChild(el.cloneNode(true));
  document.body.appendChild(wrapper);

  mostrarCarga('Generando imagen...');
  try {
    const canvas = await html2canvas(wrapper, {
      scale:           2,
      backgroundColor: bgColor,
      useCORS:         true,
      logging:         false,
    });

    const link = document.createElement('a');
    const nombreArchivo = torneoActual?.nombre?.replace(/[^a-zA-Z0-9]/g, '_') || 'torneo';
    link.download = `${nombreArchivo}_${elementoId}_${_fechaHoy()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    mostrarExito('✅ Imagen descargada correctamente');
  } catch (err) {
    mostrarError('No se pudo generar la imagen: ' + err.message);
    console.error(err);
  } finally {
    document.body.removeChild(wrapper);
    ocultarCarga();
  }
}

/* Genera un HTML con las 4 tablas del torneo para descargar y compartir */
function generarHTMLEstatico() {
  if (!torneoActual) { mostrarError('No hay torneo activo para exportar.'); return; }

  mostrarCarga('Generando página web...');
  try {
    const nombre     = torneoActual.nombre;
    const fecha      = new Date().toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' });
    const pos        = calcularClasificacion();
    const goleadores = _calcularGoleadoresList();
    const jl         = _calcularJuegoLimpioList();
    const valla      = [...pos].sort((a, b) => a.gc - b.gc || a.equipo.localeCompare(b.equipo));

    const filasPos = pos.map((e, i) => {
      const sg = e.dg > 0 ? '+' : '';
      return `<tr><td>${i+1}</td><td class="iz">${e.equipo}</td><td>${e.pj}</td><td>${e.pg}</td><td>${e.pe}</td><td>${e.pp}</td><td>${e.gf}</td><td>${e.gc}</td><td>${sg}${e.dg}</td><td><strong>${e.pts}</strong></td></tr>`;
    }).join('') || '<tr><td colspan="10">Sin partidos jugados aún</td></tr>';

    const filasGol = goleadores.slice(0, 10).map((j, i) =>
      `<tr><td>${i+1}</td><td class="iz">${j.jugador}</td><td>${j.equipo}</td><td><strong>${j.goles}</strong></td></tr>`
    ).join('') || '<tr><td colspan="4">Sin goles registrados</td></tr>';

    const filasValla = valla.map((e, i) =>
      `<tr><td>${i+1}</td><td class="iz">${e.equipo}</td><td>${e.pj}</td><td><strong>${e.gc}</strong></td></tr>`
    ).join('') || '<tr><td colspan="4">Sin partidos jugados aún</td></tr>';

    const filasJL = jl.map((e, i) =>
      `<tr><td>${i+1}</td><td class="iz">${e.equipo}</td><td>${e.amarillas}</td><td>${e.rojas}</td><td><strong>${e.puntos}</strong></td></tr>`
    ).join('') || '<tr><td colspan="5">Sin tarjetas registradas</td></tr>';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${nombre}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0;font-family:'Poppins',system-ui,sans-serif}
  body{background:#F0F7F0;color:#11360E;min-height:100vh}
  .ph{background:linear-gradient(90deg,#11360E,#1A4117);color:#fff;padding:1.25rem 1.5rem;display:flex;align-items:center;gap:.85rem;box-shadow:0 3px 12px rgba(0,0,0,.35)}
  .ph-icon{font-size:2rem}
  .ph-title{font-size:1.25rem;font-weight:800}
  .ph-date{font-size:.76rem;opacity:.7;margin-top:2px}
  .body{max-width:900px;margin:0 auto;padding:1.25rem}
  .sec{font-size:1.05rem;font-weight:800;color:#11360E;padding:.4rem 0;margin:1.75rem 0 .8rem;border-bottom:3px solid #288024}
  .tw{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(17,54,14,.1);margin-bottom:1rem;overflow-x:auto}
  table{width:100%;border-collapse:collapse;min-width:340px}
  thead tr{background:#11360E;color:#fff}
  th{padding:10px 8px;font-size:.8rem;font-weight:700;text-align:center;white-space:nowrap}
  td{padding:8px;text-align:center;border-bottom:1px solid rgba(86,175,87,.18);font-size:.88rem}
  td.iz{text-align:left;font-weight:600}
  tr:last-child td{border-bottom:none}
  .nota{font-size:.76rem;color:#56AF57;padding:.4rem .6rem;text-align:center}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem}
  .footer{text-align:center;color:#56AF57;font-size:.76rem;padding:2rem 0 1rem;font-weight:600;border-top:1px solid rgba(40,128,36,.2);margin-top:1rem}
</style>
</head>
<body>
<div class="ph">
  <div class="ph-icon">&#9917;</div>
  <div>
    <div class="ph-title">${nombre}</div>
    <div class="ph-date">Actualizado: ${fecha}</div>
  </div>
</div>
<div class="body">

  <div class="sec">&#128202; Tabla de Posiciones</div>
  <div class="tw"><table>
    <thead><tr><th>#</th><th style="text-align:left">Equipo</th><th>PJ</th><th>PG</th><th>PE</th><th>PP</th><th>GF</th><th>GC</th><th>DG</th><th>Pts</th></tr></thead>
    <tbody>${filasPos}</tbody>
  </table></div>

  <div class="grid">
    <div>
      <div class="sec">&#127748; Valla Menos Vencida</div>
      <div class="tw"><table>
        <thead><tr><th>#</th><th style="text-align:left">Equipo</th><th>PJ</th><th>GC</th></tr></thead>
        <tbody>${filasValla}</tbody>
      </table><p class="nota">Menor cantidad de goles en contra</p></div>
    </div>
    <div>
      <div class="sec">&#129309; Juego Limpio por Equipo</div>
      <div class="tw"><table>
        <thead><tr><th>#</th><th style="text-align:left">Equipo</th><th>Amarillas</th><th>Rojas</th><th>Pts</th></tr></thead>
        <tbody>${filasJL}</tbody>
      </table><p class="nota">Menor puntaje = más limpio</p></div>
    </div>
  </div>

  <div class="sec">&#9917; Top 10 Goleadores</div>
  <div class="tw"><table>
    <thead><tr><th>#</th><th style="text-align:left">Jugador</th><th>Equipo</th><th>Goles</th></tr></thead>
    <tbody>${filasGol}</tbody>
  </table><p class="nota">Top 10 goleadores del torneo</p></div>

</div>
<p class="footer">Generado con Torneo Amateur App</p>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const link = document.createElement('a');
    link.download = `${nombre.replace(/[^a-zA-Z0-9]/g, '_')}_${_fechaHoy()}.html`;
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

/* Descarga las 4 tablas principales como imágenes PNG independientes */
async function generarCuatroImagenes() {
  if (!torneoActual) { mostrarError('No hay torneo activo para exportar.'); return; }
  if (typeof html2canvas === 'undefined') {
    mostrarError('El módulo de exportación no está disponible. Verifica tu conexión a internet.');
    return;
  }

  const isDark  = document.documentElement.getAttribute('data-theme') === 'dark';
  const bgColor = isDark ? '#162816' : '#ffffff';
  const nombre  = torneoActual.nombre;
  const fecha   = new Date().toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' });

  const pos       = calcularClasificacion();
  const goleadores = _calcularGoleadoresList();
  const jl        = _calcularJuegoLimpioList();
  const valla     = [...pos].sort((a, b) => a.gc - b.gc || a.equipo.localeCompare(b.equipo));

  // Estilos inline para las tablas (independiente del CSS de la app)
  const S = {
    wrap:  'background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(17,54,14,.1);overflow-x:auto;',
    tbl:   'width:100%;border-collapse:collapse;min-width:320px;font-family:Poppins,system-ui,sans-serif;',
    thead: 'background:#11360E;color:#fff;',
    th:    'padding:9px 8px;font-size:.8rem;font-weight:700;text-align:center;white-space:nowrap;',
    thL:   'padding:9px 8px;font-size:.8rem;font-weight:700;text-align:left;white-space:nowrap;',
    td:    'padding:8px;text-align:center;border-bottom:1px solid rgba(86,175,87,.18);font-size:.86rem;',
    tdL:   'padding:8px;text-align:left;font-weight:600;border-bottom:1px solid rgba(86,175,87,.18);font-size:.86rem;',
  };

  const _th  = t => `<th style="${S.th}">${t}</th>`;
  const _thL = t => `<th style="${S.thL}">${t}</th>`;
  const _td  = t => `<td style="${S.td}">${t}</td>`;
  const _tdL = t => `<td style="${S.tdL}">${t}</td>`;

  // ── Filas de cada tabla ──────────────────────────────────────
  const filasPos = pos.map((e, i) => {
    const sg = e.dg > 0 ? '+' : '';
    return `<tr>${_td(i+1)}${_tdL(e.equipo)}${_td(e.pj)}${_td(e.pg)}${_td(e.pe)}${_td(e.pp)}${_td(e.gf)}${_td(e.gc)}${_td(sg+e.dg)}<td style="${S.td}"><strong>${e.pts}</strong></td></tr>`;
  }).join('') || `<tr><td colspan="10" style="${S.td}">Sin partidos jugados</td></tr>`;

  const filasGol = goleadores.slice(0, 10).map((j, i) =>
    `<tr>${_td(i+1)}${_tdL(j.jugador)}${_td(j.equipo)}<td style="${S.td}"><strong>${j.goles}</strong></td></tr>`
  ).join('') || `<tr><td colspan="4" style="${S.td}">Sin goles registrados</td></tr>`;

  const filasJL = jl.map((e, i) =>
    `<tr>${_td(i+1)}${_tdL(e.equipo)}${_td(e.amarillas)}${_td(e.rojas)}<td style="${S.td}"><strong>${e.puntos}</strong></td></tr>`
  ).join('') || `<tr><td colspan="5" style="${S.td}">Sin tarjetas registradas</td></tr>`;

  const filasValla = valla.map((e, i) =>
    `<tr>${_td(i+1)}${_tdL(e.equipo)}${_td(e.pj)}<td style="${S.td}"><strong>${e.gc}</strong></td></tr>`
  ).join('') || `<tr><td colspan="4" style="${S.td}">Sin partidos jugados</td></tr>`;

  const secciones = [
    {
      titulo: 'Tabla de Posiciones', archivo: 'posiciones',
      tabla: `<table style="${S.tbl}"><thead><tr style="${S.thead}">${_th('#')}${_thL('Equipo')}${_th('PJ')}${_th('PG')}${_th('PE')}${_th('PP')}${_th('GF')}${_th('GC')}${_th('DG')}${_th('Pts')}</tr></thead><tbody>${filasPos}</tbody></table>`,
    },
    {
      titulo: 'Top 10 Goleadores', archivo: 'goleadores',
      tabla: `<table style="${S.tbl}"><thead><tr style="${S.thead}">${_th('#')}${_thL('Jugador')}${_th('Equipo')}${_th('Goles')}</tr></thead><tbody>${filasGol}</tbody></table>`,
    },
    {
      titulo: 'Juego Limpio por Equipo', archivo: 'juego_limpio',
      tabla: `<table style="${S.tbl}"><thead><tr style="${S.thead}">${_th('#')}${_thL('Equipo')}${_th('Amarillas')}${_th('Rojas')}${_th('Pts')}</tr></thead><tbody>${filasJL}</tbody></table>`,
    },
    {
      titulo: 'Valla Menos Vencida', archivo: 'valla',
      tabla: `<table style="${S.tbl}"><thead><tr style="${S.thead}">${_th('#')}${_thL('Equipo')}${_th('PJ')}${_th('GC')}</tr></thead><tbody>${filasValla}</tbody></table>`,
    },
  ];

  mostrarCarga('Generando 4 imágenes...');
  try {
    const nombreArchivo = nombre.replace(/[^a-zA-Z0-9]/g, '_');
    for (const sec of secciones) {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = [
        'position:fixed', 'top:-9999px', 'left:-9999px',
        `background:${bgColor}`, 'padding:20px 24px 24px',
        'border-radius:12px', 'min-width:360px',
        "font-family:'Poppins',system-ui,sans-serif",
      ].join(';');
      wrapper.innerHTML = `
        <div style="text-align:center;margin-bottom:14px;border-bottom:2px solid #288024;padding-bottom:12px;">
          <div style="font-size:1.3rem;font-weight:800;color:#288024;">${nombre}</div>
          <div style="font-size:.95rem;font-weight:600;color:#56AF57;margin-top:2px;">${sec.titulo}</div>
          <div style="font-size:.72rem;color:#888;margin-top:4px;">${fecha}</div>
        </div>
        <div style="${S.wrap}">${sec.tabla}</div>
      `;
      document.body.appendChild(wrapper);
      const canvas = await html2canvas(wrapper, { scale: 2, backgroundColor: bgColor, useCORS: true, logging: false });
      const link = document.createElement('a');
      link.download = `${nombreArchivo}_${sec.archivo}_${_fechaHoy()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      document.body.removeChild(wrapper);
      await new Promise(r => setTimeout(r, 400));
    }
    mostrarExito('✅ 4 imágenes descargadas correctamente');
  } catch (err) {
    mostrarError('No se pudo generar las imágenes: ' + err.message);
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


function _calcularJuegoLimpioList() {
  if (!torneoActual) return [];
  const mapa = {};
  torneoActual.equipos.forEach(e => { mapa[e] = { equipo: e, amarillas: 0, rojas: 0, puntos: 0 }; });
  statsActual.forEach(s => {
    if (!mapa[s.equipo]) return;
    mapa[s.equipo].amarillas += Number(s.amarillas) || 0;
    mapa[s.equipo].rojas     += Number(s.rojas)     || 0;
  });
  Object.values(mapa).forEach(e => { e.puntos = e.amarillas * 5 + e.rojas * 10; });
  return Object.values(mapa).sort((a, b) =>
    a.puntos !== b.puntos ? a.puntos - b.puntos : a.equipo.localeCompare(b.equipo)
  );
}

function _fechaHoy() {
  return new Date().toISOString().slice(0, 10);
}

/* Descarga el fixture completo como archivo HTML */
function exportarFixtureHTML() {
  if (!torneoActual) { mostrarError('No hay torneo activo.'); return; }
  mostrarCarga('Generando fixture...');
  try {
    const nombre = torneoActual.nombre;
    const fecha  = new Date().toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' });
    const jornadas = [...new Set(fixtureActual.map(p => p.jornada))].sort((a, b) => a - b);

    const bloques = jornadas.map(j => {
      const partidos = fixtureActual.filter(p => p.jornada === j);
      const filas = partidos.map(p => {
        if (p.estado === 'descansa') {
          return `<tr><td colspan="3" style="text-align:left;color:#888">${p.local} — descansa</td><td>–</td></tr>`;
        }
        const h = horariosActual.find(h => h.partidoId === p.id) || {};
        const fechaP = h.fecha ? new Date(h.fecha + 'T00:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
        const horaP  = h.hora || '';
        const meta   = [fechaP, horaP].filter(Boolean).join(' · ') || '–';
        const result = p.estado === 'jugado' ? `${p.golesLocal} – ${p.golesVisitante}` : '–';
        return `<tr><td>${meta}</td><td style="text-align:left">${p.local} vs ${p.visitante}</td><td>${result}</td></tr>`;
      }).join('');
      return `<h2>Jornada ${j}</h2><table><thead><tr><th>Fecha / Hora</th><th style="text-align:left">Partido</th><th>Resultado</th></tr></thead><tbody>${filas}</tbody></table>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fixture – ${nombre}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0;font-family:'Poppins',system-ui,sans-serif}
  body{background:#F0F7F0;color:#11360E;padding:0}
  .page-header{background:linear-gradient(90deg,#11360E,#1A4117);color:#fff;padding:1.25rem 1.5rem}
  .page-header h1{font-size:1.25rem;font-weight:800}
  .page-header .sub{font-size:.76rem;opacity:.7;margin-top:3px}
  .body{max-width:800px;margin:0 auto;padding:1.25rem}
  h2{font-size:.95rem;font-weight:800;color:#11360E;margin:1.5rem 0 .6rem;padding-bottom:.35rem;border-bottom:3px solid #288024}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(17,54,14,.1);margin-bottom:.5rem}
  thead tr{background:#11360E;color:#fff}
  th{padding:9px 8px;font-size:.78rem;font-weight:700;text-align:center}
  td{padding:8px;text-align:center;border-bottom:1px solid rgba(86,175,87,.18);font-size:.86rem}
  tr:last-child td{border-bottom:none}
  .footer{text-align:center;color:#56AF57;font-size:.75rem;padding:1.5rem 0;font-weight:600}
</style>
</head>
<body>
<div class="page-header">
  <h1>&#127942; ${nombre} — Fixture</h1>
  <div class="sub">Generado: ${fecha}</div>
</div>
<div class="body">
${bloques}
</div>
<p class="footer">Generado con Torneo Amateur App</p>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const link = document.createElement('a');
    link.download = `${nombre.replace(/[^a-zA-Z0-9]/g, '_')}_fixture_${_fechaHoy()}.html`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    mostrarExito('Fixture descargado');
  } catch (err) {
    mostrarError('No se pudo generar el fixture: ' + err.message);
  } finally {
    ocultarCarga();
  }
}


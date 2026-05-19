/* =============================================
   estadisticas.js – Estadísticas de jugadores
   ============================================= */

/* ──────────────────────────────────────────────
   POPULACIÓN DE SELECTORES EN EL FORMULARIO
   ────────────────────────────────────────────── */

/* Llena el selector de jornadas con las jornadas que tienen partidos jugados */
function poblarSelectorJornadas() {
  const sel = document.getElementById('stat-jornada');
  if (!sel) return;

  const jornadasJugadas = [
    ...new Set(fixtureActual.filter(p => p.estado === 'jugado').map(p => p.jornada))
  ].sort((a, b) => a - b);

  sel.innerHTML = '<option value="">Seleccionar jornada...</option>' +
    jornadasJugadas.map(j => `<option value="${j}">Jornada ${j}</option>`).join('');

  // Resetear dependientes
  document.getElementById('stat-partido').innerHTML = '<option value="">Seleccionar jornada primero</option>';
  document.getElementById('stat-equipo').innerHTML  = '<option value="">Seleccionar partido primero</option>';
}

/* Llena el selector de partidos según la jornada elegida */
function onCambioJornada() {
  const jornada    = parseInt(document.getElementById('stat-jornada')?.value);
  const selPartido = document.getElementById('stat-partido');
  const selEquipo  = document.getElementById('stat-equipo');
  if (!selPartido) return;

  if (!jornada) {
    selPartido.innerHTML = '<option value="">Seleccionar jornada primero</option>';
    selEquipo.innerHTML  = '<option value="">Seleccionar partido primero</option>';
    return;
  }

  const partidos = fixtureActual.filter(p => p.jornada === jornada && p.estado === 'jugado');
  selPartido.innerHTML = '<option value="">Seleccionar partido...</option>' +
    partidos.map(p => `<option value="${p.id}">${p.local} vs ${p.visitante}</option>`).join('');

  selEquipo.innerHTML = '<option value="">Seleccionar partido primero</option>';
}

/* Llena el selector de equipos según el partido elegido */
function onCambioPartido() {
  const partidoId = document.getElementById('stat-partido')?.value;
  const selEquipo = document.getElementById('stat-equipo');
  if (!selEquipo) return;

  if (!partidoId) {
    selEquipo.innerHTML = '<option value="">Seleccionar partido primero</option>';
    return;
  }

  const partido = fixtureActual.find(p => p.id === partidoId);
  if (!partido) return;

  selEquipo.innerHTML = '<option value="">Seleccionar equipo...</option>' +
    [partido.local, partido.visitante].map(e => `<option value="${e}">${e}</option>`).join('');
}

/* ──────────────────────────────────────────────
   GUARDAR ESTADÍSTICA
   ────────────────────────────────────────────── */

async function guardarEstadistica() {
  const jornada   = parseInt(document.getElementById('stat-jornada')?.value);
  const partidoId = document.getElementById('stat-partido')?.value?.trim();
  const equipo    = document.getElementById('stat-equipo')?.value?.trim();
  const jugador   = document.getElementById('stat-jugador')?.value?.trim();
  const goles     = parseInt(document.getElementById('stat-goles')?.value     || 0);
  const amarillas = parseInt(document.getElementById('stat-amarillas')?.value || 0);
  const rojas     = parseInt(document.getElementById('stat-rojas')?.value     || 0);

  // Validaciones
  if (!jornada || !partidoId) { mostrarError('Selecciona la jornada y el partido.'); return; }
  if (!equipo)                { mostrarError('Selecciona el equipo.'); return; }
  if (!jugador)               { mostrarError('Ingresa el nombre del jugador.'); return; }
  if (goles === 0 && amarillas === 0 && rojas === 0) {
    mostrarError('Ingresa al menos un gol o una tarjeta para guardar.');
    return;
  }

  const nuevaStat = { jornada, partidoId, equipo, jugador, goles, amarillas, rojas };

  mostrarCarga('Guardando estadística...');
  try {
    statsActual.push(nuevaStat);
    guardarStatsLocal(statsActual);

    // Agregar fila a la hoja Estadísticas
    if (torneoActual?.sheetId) {
      await agregarFilas(torneoActual.sheetId, 'Estadísticas!A:G', [
        [jornada, partidoId, equipo, jugador, goles, amarillas, rojas]
      ]);
    }

    mostrarExito(`✅ Estadística de ${jugador} guardada`);

    // Limpiar formulario
    document.getElementById('stat-jugador').value  = '';
    document.getElementById('stat-goles').value    = 0;
    document.getElementById('stat-amarillas').value = 0;
    document.getElementById('stat-rojas').value    = 0;

    renderizarEstadisticas();

  } catch (err) {
    mostrarError('No se pudo guardar la estadística: ' + err.message);
    statsActual.pop(); // revertir si falló el Sheets
    guardarStatsLocal(statsActual);
  } finally {
    ocultarCarga();
  }
}

/* ──────────────────────────────────────────────
   RENDERIZADO DE TABLAS DE ESTADÍSTICAS
   ────────────────────────────────────────────── */

function renderizarEstadisticas() {
  poblarSelectorJornadas();
  _renderGoleadores();
  _renderTarjetas();
  _renderJuegoLimpio();
}

/* Tabla de goleadores (jugadores con más goles) */
function _renderGoleadores() {
  const cont = document.getElementById('tabla-goleadores');
  if (!cont) return;

  if (statsActual.length === 0) {
    cont.innerHTML = '<p class="sin-datos">Sin goles registrados</p>';
    return;
  }

  // Agrupar goles por jugador
  const mapa = {};
  statsActual.forEach(s => {
    if (s.goles <= 0) return;
    const clave = `${s.jugador}|||${s.equipo}`;
    if (!mapa[clave]) mapa[clave] = { jugador: s.jugador, equipo: s.equipo, goles: 0 };
    mapa[clave].goles += s.goles;
  });

  const lista = Object.values(mapa).sort((a, b) => b.goles - a.goles);

  if (lista.length === 0) {
    cont.innerHTML = '<p class="sin-datos">Sin goles registrados</p>';
    return;
  }

  const filas = lista.map((j, i) => `
    <tr ${i < 3 ? `class="top-${i + 1}"` : ''}>
      <td>${i + 1}</td>
      <td>${j.jugador}</td>
      <td>${j.equipo}</td>
      <td class="col-num"><strong>${j.goles} ⚽</strong></td>
    </tr>
  `).join('');

  cont.innerHTML = `
    <div id="tabla-goleadores-wrap" class="tabla-wrapper">
      <table class="tabla-datos tabla-compacta">
        <thead><tr><th>#</th><th>Jugador</th><th>Equipo</th><th>Goles</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  `;
}

/* Tabla de tarjetas (amarillas y rojas por jugador) */
function _renderTarjetas() {
  const cont = document.getElementById('tabla-tarjetas');
  if (!cont) return;

  const mapa = {};
  statsActual.forEach(s => {
    if (s.amarillas <= 0 && s.rojas <= 0) return;
    const clave = `${s.jugador}|||${s.equipo}`;
    if (!mapa[clave]) mapa[clave] = { jugador: s.jugador, equipo: s.equipo, amarillas: 0, rojas: 0 };
    mapa[clave].amarillas += s.amarillas;
    mapa[clave].rojas     += s.rojas;
  });

  const lista = Object.values(mapa).sort((a, b) => {
    // Ordenar por puntos de disciplina (roja=3, amarilla=1)
    return (b.rojas * 3 + b.amarillas) - (a.rojas * 3 + a.amarillas);
  });

  if (lista.length === 0) {
    cont.innerHTML = '<p class="sin-datos">Sin tarjetas registradas</p>';
    return;
  }

  const filas = lista.map((j, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${j.jugador}</td>
      <td>${j.equipo}</td>
      <td class="col-num">${j.amarillas > 0 ? `${j.amarillas} 🟨` : '–'}</td>
      <td class="col-num">${j.rojas     > 0 ? `${j.rojas}     🟥` : '–'}</td>
    </tr>
  `).join('');

  cont.innerHTML = `
    <div id="tabla-tarjetas-wrap" class="tabla-wrapper">
      <table class="tabla-datos tabla-compacta">
        <thead><tr><th>#</th><th>Jugador</th><th>Equipo</th><th>🟨</th><th>🟥</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  `;
}

/* Ranking de juego limpio por equipo (menos tarjetas = mejor posición) */
function _renderJuegoLimpio() {
  const cont = document.getElementById('tabla-juego-limpio');
  if (!cont || !torneoActual) return;

  // Construir mapa de todos los equipos (aunque no tengan stats)
  const mapa = {};
  torneoActual.equipos.forEach(e => {
    mapa[e] = { equipo: e, amarillas: 0, rojas: 0, puntos: 0 };
  });

  statsActual.forEach(s => {
    if (!mapa[s.equipo]) return;
    mapa[s.equipo].amarillas += s.amarillas;
    mapa[s.equipo].rojas     += s.rojas;
  });

  // Puntos de penalización: amarilla = -1, roja = -3
  Object.values(mapa).forEach(e => {
    e.puntos = -(e.amarillas * 1 + e.rojas * 3);
  });

  const lista = Object.values(mapa).sort((a, b) => b.puntos - a.puntos);

  const filas = lista.map((e, i) => `
    <tr ${i === 0 ? 'class="primer-lugar"' : ''}>
      <td>${i + 1}</td>
      <td class="col-equipo">${e.equipo}</td>
      <td class="col-num">${e.amarillas > 0 ? `${e.amarillas} 🟨` : '0'}</td>
      <td class="col-num">${e.rojas     > 0 ? `${e.rojas}     🟥` : '0'}</td>
      <td class="col-num"><strong>${e.puntos}</strong></td>
    </tr>
  `).join('');

  cont.innerHTML = `
    <div id="tabla-juego-limpio-wrap" class="tabla-wrapper">
      <table class="tabla-datos tabla-compacta">
        <thead><tr><th>#</th><th class="col-equipo">Equipo</th><th>🟨</th><th>🟥</th><th>Pts</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <p class="tabla-nota">Amarilla = –1 pto &nbsp;|&nbsp; Roja = –3 pts</p>
    </div>
  `;
}

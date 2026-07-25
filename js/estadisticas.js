/* =============================================
   estadisticas.js – Estadísticas de jugadores
   ============================================= */

/* ──────────────────────────────────────────────
   POPULACIÓN DE SELECTORES EN EL FORMULARIO
   ────────────────────────────────────────────── */

function _resetJugadorSel() {
  const sel = document.getElementById('stat-jugador-sel');
  if (sel) sel.innerHTML = '<option value="">Seleccionar equipo primero</option>';
  document.getElementById('inline-agregar-jugador')?.classList.add('oculto');
}

/* Llena el selector de jornadas (todas, no solo jugadas) */
function poblarSelectorJornadas() {
  const sel = document.getElementById('stat-jornada');
  if (!sel) return;

  const jornadas = [...new Set(
    fixtureActual.filter(p => p.estado !== 'descansa').map(p => p.jornada)
  )].sort((a, b) => a - b);

  sel.innerHTML = '<option value="">Seleccionar jornada...</option>' +
    jornadas.map(j => `<option value="${j}">Jornada ${j}</option>`).join('');

  document.getElementById('stat-partido').innerHTML = '<option value="">Seleccionar jornada primero</option>';
  document.getElementById('stat-equipo').innerHTML  = '<option value="">Seleccionar partido primero</option>';
  _resetJugadorSel();
}

/* Llena el selector de partidos según la jornada elegida */
function onCambioJornada() {
  const jornada    = parseInt(document.getElementById('stat-jornada')?.value);
  const selPartido = document.getElementById('stat-partido');
  const selEquipo  = document.getElementById('stat-equipo');
  if (!selPartido) return;

  if (!jornada) {
    selPartido.innerHTML = '<option value="">Seleccionar jornada primero</option>';
    if (selEquipo) selEquipo.innerHTML = '<option value="">Seleccionar partido primero</option>';
    _resetJugadorSel();
    return;
  }

  const partidos = fixtureActual.filter(p => p.jornada === jornada && p.estado !== 'descansa');
  selPartido.innerHTML = '<option value="">Seleccionar partido...</option>' +
    partidos.map(p => `<option value="${p.id}">${p.local} vs ${p.visitante}</option>`).join('');

  if (selEquipo) selEquipo.innerHTML = '<option value="">Seleccionar partido primero</option>';
  _resetJugadorSel();
}

/* Llena el selector de equipos según el partido elegido */
function onCambioPartido() {
  const partidoId = document.getElementById('stat-partido')?.value;
  const selEquipo = document.getElementById('stat-equipo');
  if (!selEquipo) return;

  if (!partidoId) {
    selEquipo.innerHTML = '<option value="">Seleccionar partido primero</option>';
    _resetJugadorSel();
    return;
  }

  const partido = fixtureActual.find(p => p.id === partidoId);
  if (!partido) return;

  selEquipo.innerHTML = '<option value="">Seleccionar equipo...</option>' +
    [partido.local, partido.visitante].map(e => `<option value="${e}">${e}</option>`).join('');
  _resetJugadorSel();
}

/* Llena el selector de jugadores según el equipo elegido */
function onCambioEquipo() {
  const equipo = document.getElementById('stat-equipo')?.value;
  const sel    = document.getElementById('stat-jugador-sel');
  document.getElementById('inline-agregar-jugador')?.classList.add('oculto');
  if (!sel) return;
  if (!equipo) { sel.innerHTML = '<option value="">Seleccionar equipo primero</option>'; return; }

  const jugadores = jugadoresActual.filter(j => j.equipo === equipo);
  sel.innerHTML = '<option value="">Seleccionar jugador...</option>' +
    jugadores.map(j => `<option value="${j.nombre}">${j.nombre}</option>`).join('') +
    '<option value="__nuevo__">➕ Agregar nuevo jugador...</option>';
}

/* Muestra el formulario inline si el usuario elige "Agregar nuevo" */
function onCambioJugadorSel() {
  const val    = document.getElementById('stat-jugador-sel')?.value;
  const inline = document.getElementById('inline-agregar-jugador');
  if (inline) inline.classList.toggle('oculto', val !== '__nuevo__');
}

/* Agrega un jugador desde el formulario inline dentro de estadísticas */
function agregarJugadorDesdeStats() {
  const equipo  = document.getElementById('stat-equipo')?.value;
  const nombre  = document.getElementById('inline-jugador-nombre')?.value?.trim();
  const cedula  = document.getElementById('inline-jugador-cedula')?.value;
  const celular = document.getElementById('inline-jugador-celular')?.value;
  if (!equipo) { mostrarError('Selecciona un equipo primero.'); return; }
  if (agregarJugador(equipo, nombre, cedula, celular)) {
    onCambioEquipo();
    const sel = document.getElementById('stat-jugador-sel');
    if (sel) sel.value = nombre;
    document.getElementById('inline-agregar-jugador')?.classList.add('oculto');
    ['inline-jugador-nombre', 'inline-jugador-cedula', 'inline-jugador-celular'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    renderizarJugadores();
  }
}

/* ──────────────────────────────────────────────
   GUARDAR ESTADÍSTICA
   ────────────────────────────────────────────── */

async function guardarEstadistica() {
  const jornada   = parseInt(document.getElementById('stat-jornada')?.value);
  const partidoId = document.getElementById('stat-partido')?.value?.trim();
  const equipo    = document.getElementById('stat-equipo')?.value?.trim();
  const jugador   = document.getElementById('stat-jugador-sel')?.value?.trim();
  const goles     = parseInt(document.getElementById('stat-goles')?.value     || 0);
  let   amarillas = parseInt(document.getElementById('stat-amarillas')?.value || 0);
  let   rojas     = parseInt(document.getElementById('stat-rojas')?.value     || 0);

  if (!jornada || !partidoId) { mostrarError('Selecciona la jornada y el partido.'); return; }
  if (!equipo)                { mostrarError('Selecciona el equipo.'); return; }
  if (!jugador || jugador === '__nuevo__') { mostrarError('Selecciona o agrega un jugador.'); return; }

  // El partido debe estar jugado para registrar estadísticas
  const partido = fixtureActual.find(p => p.id === partidoId);
  if (!partido || partido.estado !== 'jugado') {
    mostrarError('El partido debe tener un resultado guardado antes de registrar estadísticas.');
    return;
  }

  // Validar que los goles no superen el resultado del equipo en ese partido
  if (goles > 0) {
    const esLocal  = partido.local === equipo;
    const maxGoles = esLocal ? Number(partido.golesLocal) : Number(partido.golesVisitante);
    const yaRegistrados = statsActual
      .filter(s => s.partidoId === partidoId && s.equipo === equipo)
      .reduce((sum, s) => sum + (Number(s.goles) || 0), 0);
    if (yaRegistrados + goles > maxGoles) {
      const restantes = Math.max(0, maxGoles - yaRegistrados);
      mostrarError(`El equipo anotó ${maxGoles} gol(es) en este partido. Ya hay ${yaRegistrados} registrado(s); solo puedes agregar hasta ${restantes} más.`);
      return;
    }
  }

  // Máximo 2 amarillas por partido; 2 amarillas = 1 roja automática
  if (amarillas > 2) amarillas = 2;
  if (amarillas === 2 && rojas === 0) {
    rojas = 1;
    const inputR = document.getElementById('stat-rojas');
    if (inputR) inputR.value = 1;
    mostrarExito('⚠️ 2 amarillas = 1 roja asignada automáticamente');
  }

  if (goles === 0 && amarillas === 0 && rojas === 0) {
    mostrarError('Ingresa al menos un gol o una tarjeta para guardar.');
    return;
  }

  const nuevaStat = { jornada, partidoId, equipo, jugador, goles, amarillas, rojas };

  mostrarCarga('Guardando estadística...');
  try {
    statsActual.push(nuevaStat);
    guardarStatsLocal(statsActual);

    if (torneoActual?.sheetId) {
      await agregarFilas(torneoActual.sheetId, 'Estadísticas!A:G', [
        [jornada, partidoId, equipo, jugador, goles, amarillas, rojas]
      ]);
    }

    mostrarExito(`✅ Estadística de ${jugador} guardada`);

    document.getElementById('stat-jugador-sel').value  = '';
    document.getElementById('stat-goles').value        = 0;
    document.getElementById('stat-amarillas').value    = 0;
    document.getElementById('stat-rojas').value        = 0;

    renderizarEstadisticas();

  } catch (err) {
    mostrarError('No se pudo guardar la estadística: ' + err.message);
    statsActual.pop();
    guardarStatsLocal(statsActual);
  } finally {
    ocultarCarga();
  }
}

/* ──────────────────────────────────────────────
   RENDERIZADO DE TABLAS DE ESTADÍSTICAS
   ────────────────────────────────────────────── */

function renderizarEstadisticas() {
  // Guardar selecciones actuales antes de repoblar
  const jornadaVal = document.getElementById('stat-jornada')?.value;
  const partidoVal = document.getElementById('stat-partido')?.value;
  const equipoVal  = document.getElementById('stat-equipo')?.value;
  const jugadorVal = document.getElementById('stat-jugador-sel')?.value;

  _poblarEquiposJugadores();
  poblarSelectorJornadas();

  // Restaurar selecciones y volver a poblar los selectores en cascada
  const selJornada = document.getElementById('stat-jornada');
  if (jornadaVal && selJornada) {
    selJornada.value = jornadaVal;
    if (selJornada.value === jornadaVal) {
      onCambioJornada();
      const selPartido = document.getElementById('stat-partido');
      if (partidoVal && selPartido) {
        selPartido.value = partidoVal;
        if (selPartido.value === partidoVal) {
          onCambioPartido();
          const selEquipo = document.getElementById('stat-equipo');
          if (equipoVal && selEquipo) {
            selEquipo.value = equipoVal;
            if (selEquipo.value === equipoVal) {
              onCambioEquipo();
              const selJug = document.getElementById('stat-jugador-sel');
              if (jugadorVal && selJug) selJug.value = jugadorVal;
            }
          }
        }
      }
    }
  }

  _renderGoleadores();
  _renderJuegoLimpio();
  _renderVallaMenosVencida();
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

  const lista = Object.values(mapa).sort((a, b) => b.goles - a.goles).slice(0, 10);

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
      <p class="tabla-nota">Top 10 goleadores del torneo</p>
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

/* Ranking de juego limpio — menor puntaje = más limpio */
function _renderJuegoLimpio() {
  const cont = document.getElementById('tabla-juego-limpio');
  if (!cont || !torneoActual) return;

  const mapa = {};
  torneoActual.equipos.forEach(e => {
    mapa[e] = { equipo: e, amarillas: 0, rojas: 0, puntos: 0 };
  });

  statsActual.forEach(s => {
    if (!mapa[s.equipo]) return;
    mapa[s.equipo].amarillas += s.amarillas;
    mapa[s.equipo].rojas     += s.rojas;
  });

  // Amarilla = 5 pts · Roja = 10 pts — orden ascendente (menos = más limpio)
  Object.values(mapa).forEach(e => {
    e.puntos = e.amarillas * 5 + e.rojas * 10;
  });

  const lista = Object.values(mapa).sort((a, b) =>
    a.puntos !== b.puntos ? a.puntos - b.puntos : a.equipo.localeCompare(b.equipo)
  );

  const filas = lista.map((e, i) => `
    <tr ${i === 0 ? 'class="primer-lugar"' : ''}>
      <td>${i + 1}</td>
      <td class="col-equipo">${e.equipo}</td>
      <td class="col-num">${e.amarillas} 🟨</td>
      <td class="col-num">${e.rojas} 🟥</td>
      <td class="col-num"><strong>${e.puntos}</strong></td>
    </tr>
  `).join('');

  cont.innerHTML = `
    <div id="tabla-juego-limpio-wrap" class="tabla-wrapper">
      <table class="tabla-datos tabla-compacta">
        <thead><tr><th>#</th><th class="col-equipo">Equipo</th><th>🟨</th><th>🟥</th><th>Pts</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <p class="tabla-nota">🟨 Amarilla = 5 pts &nbsp;|&nbsp; 🟥 Roja = 10 pts &nbsp;|&nbsp; Menor puntaje = equipo más limpio</p>
    </div>
  `;
}

/* Valla menos vencida — equipos con menos goles en contra */
function _renderVallaMenosVencida() {
  const cont = document.getElementById('tabla-valla');
  if (!cont || !torneoActual) return;

  const pos = calcularClasificacion();

  if (pos.length === 0) {
    cont.innerHTML = '<p class="sin-datos">Sin partidos jugados aún</p>';
    return;
  }

  const lista = [...pos].sort((a, b) =>
    a.gc !== b.gc ? a.gc - b.gc : a.equipo.localeCompare(b.equipo)
  );

  const filas = lista.map((e, i) => `
    <tr ${i === 0 ? 'class="primer-lugar"' : ''}>
      <td>${i + 1}</td>
      <td class="col-equipo">${e.equipo}</td>
      <td class="col-num">${e.pj}</td>
      <td class="col-num"><strong>${e.gc}</strong></td>
    </tr>
  `).join('');

  cont.innerHTML = `
    <div id="tabla-valla-wrap" class="tabla-wrapper">
      <table class="tabla-datos tabla-compacta">
        <thead><tr><th>#</th><th class="col-equipo">Equipo</th><th title="Partidos jugados">PJ</th><th title="Goles en contra">GC</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <p class="tabla-nota">Menor cantidad de goles en contra = valla menos vencida</p>
    </div>
  `;
}

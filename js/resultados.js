/* =============================================
   resultados.js – Resultados de partidos por jornada
   ============================================= */

/* ──────────────────────────────────────────────
   NAVEGACIÓN ENTRE JORNADAS
   ────────────────────────────────────────────── */

function jornadaAnterior() {
  if (jornadaViendo > 1) {
    jornadaViendo--;
    renderizarResultados(jornadaViendo);
  }
}

function jornadaSiguiente() {
  const maxJornada = Math.max(...fixtureActual.map(p => p.jornada), 1);
  if (jornadaViendo < maxJornada) {
    jornadaViendo++;
    renderizarResultados(jornadaViendo);
  }
}

/* ──────────────────────────────────────────────
   RENDERIZADO DE PARTIDOS
   ────────────────────────────────────────────── */

function renderizarResultados(jornada) {
  if (!torneoActual || !fixtureActual.length) {
    _setText('partidos-jornada', '');
    document.getElementById('partidos-jornada').innerHTML =
      '<p class="sin-datos">No hay partidos. Crea un torneo primero.</p>';
    return;
  }

  const maxJornada = Math.max(...fixtureActual.map(p => p.jornada));
  _setText('jornada-actual-label', `Jornada ${jornada} de ${maxJornada}`);

  const partidos = fixtureActual.filter(p => p.jornada === jornada);
  const jornadaActualCalculada = calcularJornadaActual();
  const esJornadaActiva = jornada === jornadaActualCalculada;

  const contenedor = document.getElementById('partidos-jornada');
  if (!contenedor) return;

  if (partidos.length === 0) {
    contenedor.innerHTML = '<p class="sin-datos">No hay partidos en esta jornada.</p>';
    return;
  }

  contenedor.innerHTML = partidos.map(p => {
    if (p.estado === 'descansa') {
      return `
        <div class="partido-card partido-descansa">
          <div class="partido-contenido" style="justify-content:center;gap:1rem;">
            <span style="font-size:1.5rem">😴</span>
            <div>
              <div class="equipo-nombre">${p.local}</div>
              <div class="partido-estado-badge" style="text-align:left;margin-top:.2rem;">Descansa esta jornada</div>
            </div>
          </div>
        </div>`;
    }

    const horario  = horariosActual.find(h => h.partidoId === p.id);
    const jugado   = p.estado === 'jugado';
    const editable = esJornadaActiva && !jugado;

    const fecha = horario?.fecha
      ? new Date(horario.fecha + 'T00:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
      : '';
    const hora   = horario?.hora   || '';
    const cancha = horario?.cancha || '';

    return `
      <div class="partido-card ${jugado ? 'partido-jugado' : esJornadaActiva ? 'partido-activo' : 'partido-pendiente'}">
        ${fecha ? `<div class="partido-meta">${fecha}${hora ? ` – ${hora}` : ''}${cancha ? ` • ${cancha}` : ''}</div>` : ''}
        <div class="partido-contenido">
          <div class="partido-equipo partido-local">
            <span class="equipo-nombre">${p.local}</span>
          </div>

          <div class="partido-marcador">
            ${editable ? `
              <input type="number" class="input-gol" id="gol-${p.id}-local"
                     value="${p.golesLocal !== '' ? p.golesLocal : ''}"
                     min="0" max="99" placeholder="–" aria-label="Goles ${p.local}">
              <span class="vs-sep">:</span>
              <input type="number" class="input-gol" id="gol-${p.id}-visitante"
                     value="${p.golesVisitante !== '' ? p.golesVisitante : ''}"
                     min="0" max="99" placeholder="–" aria-label="Goles ${p.visitante}">
            ` : jugado ? `
              <span class="marcador-fijo">${p.golesLocal} : ${p.golesVisitante}</span>
            ` : `
              <span class="marcador-pendiente">vs</span>
            `}
          </div>

          <div class="partido-equipo partido-visitante">
            <span class="equipo-nombre">${p.visitante}</span>
          </div>
        </div>
        ${jugado ? '<div class="partido-estado-badge">✅ Finalizado</div>' : ''}
      </div>
    `;
  }).join('');

  // Botón guardar: solo visible en jornada activa con partidos pendientes
  const btnContainer = document.getElementById('btn-guardar-resultados-container');
  if (btnContainer) {
    btnContainer.classList.toggle('oculto', !esJornadaActiva);
  }
}

/* ──────────────────────────────────────────────
   GUARDAR RESULTADOS
   ────────────────────────────────────────────── */

async function guardarResultados() {
  const partidos = fixtureActual.filter(p => p.jornada === jornadaViendo);
  let cambios = 0;

  // Recoger los marcadores ingresados
  for (const p of partidos) {
    if (p.estado === 'jugado') continue;

    const inputLocal  = document.getElementById(`gol-${p.id}-local`);
    const inputVisita = document.getElementById(`gol-${p.id}-visitante`);

    if (!inputLocal || !inputVisita) continue;

    const gl = inputLocal.value.trim();
    const gv = inputVisita.value.trim();

    if (gl === '' || gv === '') continue; // partido sin completar, omitir

    const glNum = parseInt(gl);
    const gvNum = parseInt(gv);

    if (isNaN(glNum) || isNaN(gvNum) || glNum < 0 || gvNum < 0) {
      mostrarError(`Marcador inválido en el partido ${p.local} vs ${p.visitante}.`);
      return;
    }

    p.golesLocal     = glNum;
    p.golesVisitante = gvNum;
    p.estado         = 'jugado';
    cambios++;
  }

  if (cambios === 0) {
    mostrarError('Ingresa al menos un resultado antes de guardar.');
    return;
  }

  mostrarCarga('Guardando resultados...');

  try {
    // Actualizar localStorage
    guardarFixtureLocal(fixtureActual);

    // Sincronizar Fixture en Sheets
    await _sincronizarFixtureSheets();

    // Recalcular y escribir Posiciones en Sheets
    const posiciones = calcularClasificacion();
    await _sincronizarPosicionesSheets(posiciones);

    mostrarExito(`✅ ${cambios} resultado${cambios > 1 ? 's' : ''} guardado${cambios > 1 ? 's' : ''} correctamente`);

    // Avanzar a la siguiente jornada si esta quedó completa
    const jornadaCompleta = fixtureActual
      .filter(p => p.jornada === jornadaViendo)
      .every(p => p.estado === 'jugado');

    if (jornadaCompleta) {
      const maxJ = Math.max(...fixtureActual.map(p => p.jornada));
      if (jornadaViendo < maxJ) jornadaViendo++;
    }

    renderizarResultados(jornadaViendo);
    renderizarPosiciones();
    renderizarInicio();

  } catch (err) {
    mostrarError('No se pudieron guardar los resultados: ' + err.message);
    console.error(err);
  } finally {
    ocultarCarga();
  }
}

/* Escribe el fixture completo en la hoja "Fixture" de Sheets */
async function _sincronizarFixtureSheets() {
  const sheetId = torneoActual?.sheetId;
  if (!sheetId) return;

  const filas = [
    ['Jornada', 'ID', 'Local', 'Visitante', 'Goles Local', 'Goles Visitante', 'Estado'],
    ...fixtureActual.map(p => [
      p.jornada, p.id, p.local, p.visitante,
      p.golesLocal !== '' ? p.golesLocal : '',
      p.golesVisitante !== '' ? p.golesVisitante : '',
      p.estado
    ])
  ];

  await limpiarYEscribir(sheetId, 'Fixture', filas);
}

/* Escribe la tabla de posiciones en la hoja "Posiciones" de Sheets */
async function _sincronizarPosicionesSheets(posiciones) {
  const sheetId = torneoActual?.sheetId;
  if (!sheetId) return;

  const filas = [
    ['Equipo', 'PJ', 'PG', 'PE', 'PP', 'GF', 'GC', 'DG', 'Pts'],
    ...posiciones.map(e => [e.equipo, e.pj, e.pg, e.pe, e.pp, e.gf, e.gc, e.dg, e.pts])
  ];

  await limpiarYEscribir(sheetId, 'Posiciones', filas);
}

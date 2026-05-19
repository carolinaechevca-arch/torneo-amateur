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

    const horario = horariosActual.find(h => h.partidoId === p.id);
    const jugado  = p.estado === 'jugado';

    const fecha = horario?.fecha
      ? new Date(horario.fecha + 'T00:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
      : '';
    const hora   = horario?.hora   || '';
    const cancha = horario?.cancha || '';

    return `
      <div class="partido-card ${jugado ? 'partido-jugado' : 'partido-pendiente'}">
        ${fecha ? `<div class="partido-meta">${fecha}${hora ? ` – ${hora}` : ''}${cancha ? ` • ${cancha}` : ''}</div>` : ''}
        <div class="partido-contenido">
          <div class="partido-equipo partido-local">
            <span class="equipo-nombre">${p.local}</span>
          </div>

          <div class="partido-marcador">
            <input type="number" class="input-gol" id="gol-${p.id}-local"
                   value="${p.golesLocal !== '' ? p.golesLocal : ''}"
                   min="0" max="99" placeholder="–" aria-label="Goles ${p.local}">
            <span class="vs-sep">:</span>
            <input type="number" class="input-gol" id="gol-${p.id}-visitante"
                   value="${p.golesVisitante !== '' ? p.golesVisitante : ''}"
                   min="0" max="99" placeholder="–" aria-label="Goles ${p.visitante}">
          </div>

          <div class="partido-equipo partido-visitante">
            <span class="equipo-nombre">${p.visitante}</span>
          </div>
        </div>
        ${jugado ? '<div class="partido-estado-badge">✅ Finalizado</div>' : ''}
      </div>
    `;
  }).join('');

  // Botón guardar: visible siempre que haya partidos reales (no solo descansos)
  const btnContainer = document.getElementById('btn-guardar-resultados-container');
  if (btnContainer) {
    btnContainer.classList.toggle('oculto', partidos.every(p => p.estado === 'descansa'));
  }
}

/* ──────────────────────────────────────────────
   GUARDAR RESULTADOS
   ────────────────────────────────────────────── */

async function guardarResultados() {
  const partidos = fixtureActual.filter(p => p.jornada === jornadaViendo && p.estado !== 'descansa');
  let cambios = 0;
  const ahora = new Date().toISOString();

  for (const p of partidos) {
    const inputLocal  = document.getElementById(`gol-${p.id}-local`);
    const inputVisita = document.getElementById(`gol-${p.id}-visitante`);
    if (!inputLocal || !inputVisita) continue;

    const gl = inputLocal.value.trim();
    const gv = inputVisita.value.trim();
    const prevGL = p.golesLocal;
    const prevGV = p.golesVisitante;

    if (gl === '' || gv === '') {
      // Si estaba jugado y se borraron los goles, revertir a pendiente
      if (p.estado === 'jugado') {
        p.golesLocal = ''; p.golesVisitante = ''; p.estado = 'pendiente';
        cambios++;
      }
      continue;
    }

    const glNum = parseInt(gl);
    const gvNum = parseInt(gv);
    if (isNaN(glNum) || isNaN(gvNum) || glNum < 0 || gvNum < 0) {
      mostrarError(`Marcador inválido en ${p.local} vs ${p.visitante}.`);
      return;
    }

    if (p.golesLocal !== glNum || p.golesVisitante !== gvNum || p.estado !== 'jugado') {
      historialActual.push({
        ts: ahora, jornada: p.jornada,
        local: p.local, visitante: p.visitante,
        golesLocal: glNum, golesVisitante: gvNum,
        prevGolesLocal: prevGL !== '' ? prevGL : null,
        prevGolesVisitante: prevGV !== '' ? prevGV : null
      });
      p.golesLocal = glNum; p.golesVisitante = gvNum; p.estado = 'jugado';
      cambios++;
    }
  }

  if (cambios === 0) {
    mostrarError('No hay cambios que guardar.');
    return;
  }

  mostrarCarga('Guardando resultados...');
  try {
    guardarFixtureLocal(fixtureActual);
    guardarHistorialLocal(historialActual);
    await _sincronizarFixtureSheets();
    const posiciones = calcularClasificacion();
    await _sincronizarPosicionesSheets(posiciones);

    mostrarExito(`✅ ${cambios} cambio${cambios > 1 ? 's' : ''} guardado${cambios > 1 ? 's' : ''}`);
    renderizarResultados(jornadaViendo);
    renderizarPosiciones();
    renderizarInicio();
    renderizarHistorial();
  } catch (err) {
    mostrarError('No se pudieron guardar los resultados: ' + err.message);
    console.error(err);
  } finally {
    ocultarCarga();
  }
}

/* Renderiza el historial de cambios en resultados */
function renderizarHistorial() {
  const cont = document.getElementById('historial-resultados');
  if (!cont) return;
  if (!historialActual.length) {
    cont.innerHTML = '<p class="sin-datos">No hay cambios registrados aún.</p>';
    return;
  }
  const items = [...historialActual].reverse().slice(0, 50);
  cont.innerHTML = items.map(h => {
    const fecha = new Date(h.ts).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
    const esCambio = h.prevGolesLocal !== null;
    return `<div class="historial-item">
      <span class="historial-fecha">${fecha}</span>
      <span class="historial-partido">J${h.jornada} · ${h.local} <strong>${h.golesLocal}–${h.golesVisitante}</strong> ${h.visitante}</span>
      ${esCambio ? `<span class="historial-prev">(antes: ${h.prevGolesLocal}–${h.prevGolesVisitante})</span>` : ''}
    </div>`;
  }).join('');
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

/* =============================================
   equipos.js – Panel único de gestión por equipo:
   estado/renombrar, plantilla de jugadores (con historial de goles
   y tarjetas por partido) y finanzas (inscripción + multas).
   ============================================= */

let _equipoExpandido = null; // equipo con el panel de detalle abierto

/* Convierte el nombre de un equipo en un id seguro para usar en el DOM */
function _slugEquipo(equipo) {
  return String(equipo).replace(/[^a-zA-Z0-9]/g, '_');
}

/* ──────────────────────────────────────────────
   TABLA PRINCIPAL DE EQUIPOS
   ────────────────────────────────────────────── */

function renderizarEquipos() {
  _actualizarResumenFinanzas();

  const cont = document.getElementById('tabla-equipos-container');
  if (!cont) return;
  if (!torneoActual) {
    cont.innerHTML = '<p class="sin-datos">Crea un torneo para gestionar los equipos.</p>';
    const panelVacio = document.getElementById('equipo-detalle-panel');
    if (panelVacio) panelVacio.innerHTML = '';
    return;
  }

  const posiciones = calcularClasificacion();
  const finEquipos = calcularFinanzasEquipos();

  const filas = torneoActual.equipos.map(equipo => {
    const pos = posiciones.find(p => p.equipo === equipo) || { pj: 0, pts: 0 };
    const fin = finEquipos.find(f => f.equipo === equipo) || { estado: 'Pendiente' };
    const numJugadores = jugadoresActual.filter(j => j.equipo === equipo).length;
    const equipoJs = equipo.replace(/'/g, "\\'");
    const abierto = _equipoExpandido === equipo;
    return `
      <tr id="eqrow-${_slugEquipo(equipo)}" class="${abierto ? 'fila-equipo-activa' : ''}">
        <td class="col-equipo">${equipo}</td>
        <td class="col-num">${numJugadores}</td>
        <td class="col-num">${pos.pj}</td>
        <td class="col-num">${pos.pts}</td>
        <td>${_botonEstadoEquipo(equipoJs, fin.estado, abierto)}</td>
        <td class="col-acciones-eq">
          <button class="btn-secundario btn-xs" onclick="iniciarRenombrarEquipo('${equipoJs}')" title="Renombrar equipo">
            <i class="bi bi-pencil-fill"></i>
          </button>
        </td>
      </tr>`;
  }).join('');

  cont.innerHTML = `
    <div class="tabla-wrapper">
      <table class="tabla-datos">
        <thead>
          <tr>
            <th class="col-equipo">Equipo</th>
            <th title="Jugadores registrados">Jugadores</th>
            <th title="Partidos jugados">PJ</th>
            <th title="Puntos">Pts</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  `;

  if (_equipoExpandido && torneoActual.equipos.includes(_equipoExpandido)) {
    renderizarDetalleEquipo(_equipoExpandido);
  } else {
    _equipoExpandido = null;
    const panel = document.getElementById('equipo-detalle-panel');
    if (panel) panel.innerHTML = '';
  }
}

/* Actualiza las 4 tarjetas de resumen financiero global (arriba de la tabla) */
function _actualizarResumenFinanzas() {
  if (!torneoActual) return;
  const eqs  = calcularFinanzasEquipos();
  const jugs = calcularFinanzasJugadores();
  const recaudado = eqs.reduce((s, e) => s + e.abonado, 0) + jugs.filter(j => j.pagado).reduce((s, j) => s + j.monto, 0);
  const pendiente = eqs.reduce((s, e) => s + e.saldo, 0) + jugs.filter(j => !j.pagado).reduce((s, j) => s + j.monto, 0);
  _setText('fin-recaudado', _formatoMoneda(recaudado));
  _setText('fin-pendiente', _formatoMoneda(pendiente));
  _setText('fin-equipos-pendientes', eqs.filter(e => e.saldo > 0).length);
  _setText('fin-jugadores-pendientes', jugs.filter(j => !j.pagado).length);
}

/* Pill de estado financiero del equipo — es un botón: tocarlo abre/cierra su panel de gestión */
function _botonEstadoEquipo(equipoJs, estado, abierto) {
  const clase = estado === 'Pagado' ? 'fin-badge-pagado' : (estado === 'Parcial' ? 'fin-badge-parcial' : 'fin-badge-pendiente');
  return `<button class="fin-badge fin-badge-clickable ${clase}" onclick="toggleDetalleEquipo('${equipoJs}')" title="Toca para gestionar jugadores y finanzas de este equipo">
    ${estado} <i class="bi bi-chevron-${abierto ? 'up' : 'down'}" style="font-size:.65em;margin-left:.25em"></i>
  </button>`;
}

/* Pill de estado de pago de un jugador con tarjetas — tocarlo alterna Pagado/Pendiente directamente */
function _botonEstadoPago(jugadorId, pagado) {
  const clase = pagado ? 'fin-badge-pagado' : 'fin-badge-pendiente';
  return `<button class="fin-badge fin-badge-clickable ${clase}" onclick="toggleJugadorPagado('${jugadorId}')" title="Toca para marcar como ${pagado ? 'pendiente' : 'pagado'}">
    ${pagado ? 'Pagado' : 'Pendiente'}
  </button>`;
}

/* Expande o colapsa el panel de gestión de un equipo (jugadores + finanzas) */
function toggleDetalleEquipo(equipo) {
  _equipoExpandido = (_equipoExpandido === equipo) ? null : equipo;
  renderizarEquipos();
}

/* ──────────────────────────────────────────────
   PANEL DE DETALLE UNIFICADO (finanzas + plantilla)
   ────────────────────────────────────────────── */

function renderizarDetalleEquipo(equipo) {
  const panel = document.getElementById('equipo-detalle-panel');
  if (!panel) return;

  const eq = calcularFinanzasEquipos().find(e => e.equipo === equipo);
  if (!eq) { panel.innerHTML = ''; return; }

  const equipoJs = equipo.replace(/'/g, "\\'");

  const fin = finanzasEquiposActual.find(f => f.equipo === equipo) || { abonos: [] };
  const abonosOrdenados = [...fin.abonos].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  const filasAbonos = abonosOrdenados.map(a => `
    <div class="historial-item">
      <span class="historial-fecha">${a.fecha || '–'}</span>
      <span class="historial-partido">${_formatoMoneda(a.monto)}</span>
      <button class="btn-peligro btn-xs" onclick="eliminarAbono('${equipoJs}', '${a.id}')" title="Eliminar abono">
        <i class="bi bi-trash3-fill"></i>
      </button>
    </div>
  `).join('') || '<p class="sin-datos">Sin abonos registrados.</p>';

  const jugadoresConTarjetas = calcularFinanzasJugadores(equipo);
  const filasTarjetas = jugadoresConTarjetas.map(j => `
    <tr>
      <td class="col-camisa">${j.numeroCamisa || '–'}</td>
      <td><strong>${j.jugador}</strong></td>
      <td>${j.cargosTexto}</td>
      <td class="col-num">${_formatoMoneda(j.monto)}</td>
      <td>${_botonEstadoPago(j.jugadorId, j.pagado)}</td>
    </tr>
  `).join('');

  const roster = jugadoresActual
    .filter(j => j.equipo === equipo)
    .map(j => ({ ...j, ..._statsJugador(j.equipo, j.nombre) }))
    .sort((a, b) => b.goles - a.goles || a.nombre.localeCompare(b.nombre));

  const filasRoster = roster.map(j => `
    <tr id="jrow-${j.id}">
      <td class="col-camisa">${j.numeroCamisa || '–'}</td>
      <td><strong>${j.nombre}</strong></td>
      <td>${j.cedula || '–'}</td>
      <td>${j.celular || '–'}</td>
      <td class="col-num">${j.goles}</td>
      <td class="col-num">${j.amarillas}</td>
      <td class="col-num">${j.rojas}</td>
      <td class="col-acciones">
        <button class="btn-secundario btn-xs" onclick="toggleHistorialStatsJugador('${j.id}')" title="Ver goles y tarjetas por partido"><i class="bi bi-list-ul"></i></button>
        <button class="btn-secundario btn-xs" onclick="iniciarEditarJugador('${j.id}')" title="Editar datos"><i class="bi bi-pencil-fill"></i></button>
        <button class="btn-peligro   btn-xs" onclick="eliminarJugador('${j.id}')" title="Eliminar"><i class="bi bi-trash3-fill"></i></button>
      </td>
    </tr>
    <tr id="stats-hist-row-${j.id}" class="oculto">
      <td colspan="8"><div id="stats-hist-${j.id}"></div></td>
    </tr>
  `).join('');

  panel.innerHTML = `
    <div class="equipo-detalle-panel">
      <div class="seccion-header">
        <h3><i class="bi bi-shield-fill"></i> ${equipo}</h3>
        <button class="btn-secundario btn-pequeño" onclick="toggleDetalleEquipo('${equipoJs}')"><i class="bi bi-x-lg"></i> Cerrar</button>
      </div>

      <div class="jugadores-card">
        <h4><i class="bi bi-cash-coin"></i> Finanzas del equipo</h4>
        <div class="cards-grid" style="margin:.75rem 0 1rem">
          <div class="card-stat"><div class="card-stat-num">${_formatoMoneda(eq.inscripcion)}</div><div class="card-stat-label">Inscripción</div></div>
          <div class="card-stat"><div class="card-stat-num">${_formatoMoneda(eq.abonado)}</div><div class="card-stat-label">Abonado</div></div>
          <div class="card-stat"><div class="card-stat-num">${_formatoMoneda(eq.saldo)}</div><div class="card-stat-label">Saldo</div></div>
        </div>

        <div class="form-fila" style="margin-bottom:.75rem">
          <div class="form-grupo">
            <label for="fin-abono-monto">Monto del abono</label>
            <input type="number" id="fin-abono-monto" min="0" step="0.01" placeholder="0" inputmode="decimal">
          </div>
          <div class="form-grupo">
            <label for="fin-abono-fecha">Fecha</label>
            <input type="date" id="fin-abono-fecha" value="${_hoyISO()}">
          </div>
        </div>
        <button class="btn-principal btn-pequeño" onclick="guardarAbono('${equipoJs}')" style="margin-bottom:1.25rem">
          <i class="bi bi-floppy-fill"></i> Registrar abono
        </button>

        <h5 class="subtitulo-card">Historial de abonos</h5>
        <div class="historial-container">${filasAbonos}</div>

        ${jugadoresConTarjetas.length > 0 ? `
          <h5 class="subtitulo-card" style="margin-top:1.25rem"><i class="bi bi-square-fill"></i> Multas por tarjeta</h5>
          <p class="info-texto" style="margin-bottom:.5rem">Toca el estado para marcarlo como pagado o pendiente.</p>
          <div class="tabla-wrapper">
            <table class="tabla-datos tabla-compacta">
              <thead><tr><th>#</th><th>Jugador</th><th>Cargos</th><th>Monto</th><th>Estado</th></tr></thead>
              <tbody>${filasTarjetas}</tbody>
            </table>
          </div>
        ` : ''}
      </div>

      <div class="jugadores-card">
        <h4><i class="bi bi-people-fill"></i> Plantilla de jugadores</h4>
        ${roster.length === 0 ? '<p class="sin-datos">Sin jugadores registrados. Agrégalos abajo.</p>' : `
          <div class="tabla-wrapper">
            <table class="tabla-datos tabla-compacta">
              <thead>
                <tr>
                  <th title="N° de camisa">#</th>
                  <th>Nombre</th>
                  <th>Cédula</th>
                  <th>Celular</th>
                  <th title="Goles"><i class="bi bi-award-fill"></i></th>
                  <th title="Amarillas"><i class="bi bi-square-fill" style="color:#D4820A"></i></th>
                  <th title="Rojas"><i class="bi bi-square-fill" style="color:#C0392B"></i></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>${filasRoster}</tbody>
            </table>
          </div>
          <p class="info-texto" style="margin-top:.5rem"><i class="bi bi-list-ul"></i> Toca este ícono en un jugador para ver o corregir sus goles/tarjetas partido por partido.</p>
        `}

        <h5 class="subtitulo-card" style="margin-top:1.25rem"><i class="bi bi-person-plus-fill"></i> Agregar jugador</h5>
        <div class="form-fila">
          <div class="form-grupo">
            <label for="nuevo-jugador-nombre">Nombre *</label>
            <input type="text" id="nuevo-jugador-nombre" placeholder="Nombre completo" maxlength="50" autocapitalize="words">
          </div>
          <div class="form-grupo" style="max-width:100px">
            <label for="nuevo-jugador-camisa"># Camisa</label>
            <input type="number" id="nuevo-jugador-camisa" placeholder="Ej: 10" min="1" max="99">
          </div>
          <div class="form-grupo">
            <label for="nuevo-jugador-cedula">Cédula</label>
            <input type="text" id="nuevo-jugador-cedula" placeholder="Opcional" maxlength="20">
          </div>
          <div class="form-grupo">
            <label for="nuevo-jugador-celular">Celular</label>
            <input type="tel" id="nuevo-jugador-celular" placeholder="Opcional" maxlength="15">
          </div>
        </div>
        <button class="btn-principal btn-pequeño" onclick="guardarNuevoJugadorEquipo('${equipoJs}')"><i class="bi bi-person-plus-fill"></i> Agregar jugador</button>
      </div>
    </div>
  `;
}

/* ──────────────────────────────────────────────
   PLANTILLA — alta, edición y eliminación de jugadores
   ────────────────────────────────────────────── */

function guardarNuevoJugadorEquipo(equipo) {
  const nombre  = document.getElementById('nuevo-jugador-nombre')?.value;
  const camisa  = document.getElementById('nuevo-jugador-camisa')?.value;
  const cedula  = document.getElementById('nuevo-jugador-cedula')?.value;
  const celular = document.getElementById('nuevo-jugador-celular')?.value;
  if (agregarJugador(equipo, nombre, cedula, celular, camisa)) {
    renderizarEquipos();
    mostrarExito(`Jugador registrado en ${equipo}`);
  }
}

/* Pone una fila en modo edición inline (solo datos personales; los goles/tarjetas
   se corrigen por partido en el historial, no aquí) */
function iniciarEditarJugador(id) {
  const j = jugadoresActual.find(j => j.id === id);
  const row = document.getElementById(`jrow-${id}`);
  if (!j || !row) return;
  const st = _statsJugador(j.equipo, j.nombre);
  row.innerHTML = `
    <td><input type="number" id="ec-${id}"   value="${j.numeroCamisa||''}" min="1" max="99"  class="input-edit input-edit-xs" placeholder="#"></td>
    <td><input type="text"   id="en-${id}"   value="${j.nombre}"           maxlength="50"    class="input-edit" required></td>
    <td><input type="text"   id="eced-${id}" value="${j.cedula||''}"       maxlength="20"    class="input-edit"></td>
    <td><input type="tel"    id="ecel-${id}" value="${j.celular||''}"      maxlength="15"    class="input-edit"></td>
    <td class="col-num">${st.goles}</td>
    <td class="col-num">${st.amarillas}</td>
    <td class="col-num">${st.rojas}</td>
    <td class="col-acciones">
      <button class="btn-principal  btn-xs" onclick="guardarEdicionJugador('${id}')"><i class="bi bi-check-lg"></i></button>
      <button class="btn-secundario btn-xs" onclick="renderizarDetalleEquipo(_equipoExpandido)"><i class="bi bi-x-lg"></i></button>
    </td>`;
  document.getElementById(`en-${id}`)?.focus();
}

/* Guarda los cambios de datos personales de un jugador (el nombre se propaga a sus stats) */
function guardarEdicionJugador(id) {
  const idx = jugadoresActual.findIndex(j => j.id === id);
  if (idx === -1) return;
  const j      = jugadoresActual[idx];
  const nombre = document.getElementById(`en-${id}`)?.value?.trim();
  if (!nombre) { mostrarError('El nombre es obligatorio.'); return; }

  const nombreAnterior = j.nombre;
  jugadoresActual[idx] = {
    ...j,
    nombre,
    numeroCamisa: document.getElementById(`ec-${id}`)?.value?.trim()   || '',
    cedula:       document.getElementById(`eced-${id}`)?.value?.trim() || '',
    celular:      document.getElementById(`ecel-${id}`)?.value?.trim() || ''
  };
  guardarJugadoresLocal(jugadoresActual);
  _renombrarJugadorEnStats(j.equipo, nombreAnterior, nombre);

  renderizarEquipos();
  renderizarEstadisticas();
  mostrarExito('Jugador actualizado');
}

async function eliminarJugador(id) {
  const jugador = jugadoresActual.find(j => j.id === id);
  const ok = await confirmarAccion({
    titulo: 'Eliminar jugador',
    mensaje: `¿Eliminar a "${jugador?.nombre || 'este jugador'}"? Esta acción no se puede deshacer.`,
    textoConfirmar: 'Eliminar'
  });
  if (!ok) return;
  jugadoresActual = jugadoresActual.filter(j => j.id !== id);
  guardarJugadoresLocal(jugadoresActual);
  renderizarEquipos();
  renderizarEstadisticas();
}

/* Actualiza el nombre de un jugador dentro de statsActual (goles/tarjetas ya registrados) */
function _renombrarJugadorEnStats(equipo, nombreAnterior, nombreNuevo) {
  if (nombreAnterior === nombreNuevo) return;
  statsActual.forEach(s => { if (s.equipo === equipo && s.jugador === nombreAnterior) s.jugador = nombreNuevo; });
  guardarStatsLocal(statsActual);
}

/* ──────────────────────────────────────────────
   HISTORIAL DE GOLES/TARJETAS POR PARTIDO
   Cada gol se guarda con el partido en el que se anotó (partidoId), así que
   una corrección se valida contra el marcador real de ESE partido en vez de
   contra un total global sin contexto.
   ────────────────────────────────────────────── */

function _nuevoIdStat() {
  return 'S_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

/* Migración silenciosa: asegura que toda entrada de statsActual tenga un id estable */
function _asegurarIdsStats() {
  let cambiado = false;
  statsActual.forEach(s => { if (!s.id) { s.id = _nuevoIdStat(); cambiado = true; } });
  if (cambiado) guardarStatsLocal(statsActual);
}

function _entradasStatsJugador(equipo, nombre) {
  return statsActual
    .filter(s => s.equipo === equipo && s.jugador === nombre)
    .slice()
    .sort((a, b) => a.jornada - b.jornada);
}

function toggleHistorialStatsJugador(jugadorId) {
  const fila = document.getElementById(`stats-hist-row-${jugadorId}`);
  if (!fila) return;
  const vaAbrir = fila.classList.contains('oculto');
  fila.classList.toggle('oculto');
  if (vaAbrir) _renderHistorialStatsJugador(jugadorId);
}

function _renderHistorialStatsJugador(jugadorId) {
  const jugador = jugadoresActual.find(j => j.id === jugadorId);
  const cont = document.getElementById(`stats-hist-${jugadorId}`);
  if (!jugador || !cont) return;

  const entradas = _entradasStatsJugador(jugador.equipo, jugador.nombre);
  if (entradas.length === 0) {
    cont.innerHTML = '<p class="sin-datos" style="padding:.5rem 0">Sin goles ni tarjetas registradas para este jugador.</p>';
    return;
  }

  cont.innerHTML = `
    <table class="tabla-datos tabla-compacta" style="margin:.5rem 0">
      <thead><tr><th style="text-align:left">Partido</th><th>Goles</th><th>Am.</th><th>Roj.</th><th></th></tr></thead>
      <tbody>
        ${entradas.map(s => {
          const partido = fixtureActual.find(p => p.id === s.partidoId);
          const rival = partido ? (partido.local === jugador.equipo ? partido.visitante : partido.local) : null;
          const etiqueta = partido ? `J${s.jornada} · vs ${rival}` : 'Ajuste manual (sin partido)';
          return `
            <tr id="stat-row-${s.id}">
              <td style="text-align:left">${etiqueta}</td>
              <td class="col-num">${s.goles}</td>
              <td class="col-num">${s.amarillas}</td>
              <td class="col-num">${s.rojas}</td>
              <td class="col-acciones">
                <button class="btn-secundario btn-xs" onclick="iniciarEditarStatEntry('${s.id}')" title="Editar"><i class="bi bi-pencil-fill"></i></button>
                <button class="btn-peligro   btn-xs" onclick="eliminarStatEntry('${s.id}')" title="Eliminar"><i class="bi bi-trash3-fill"></i></button>
              </td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

function iniciarEditarStatEntry(statId) {
  const s = statsActual.find(x => x.id === statId);
  const row = document.getElementById(`stat-row-${statId}`);
  if (!s || !row) return;
  const partido = fixtureActual.find(p => p.id === s.partidoId);
  const jugador = jugadoresActual.find(j => j.equipo === s.equipo && j.nombre === s.jugador);
  const etiqueta = partido ? `J${s.jornada}` : 'Ajuste manual';
  row.innerHTML = `
    <td style="text-align:left">${etiqueta}</td>
    <td><input type="number" id="es-g-${statId}" value="${s.goles}"     min="0" max="20" class="input-edit input-edit-xs"></td>
    <td><input type="number" id="es-a-${statId}" value="${s.amarillas}" min="0" max="2"  class="input-edit input-edit-xs"></td>
    <td><input type="number" id="es-r-${statId}" value="${s.rojas}"     min="0" max="1"  class="input-edit input-edit-xs"></td>
    <td class="col-acciones">
      <button class="btn-principal btn-xs" onclick="guardarEdicionStatEntry('${statId}')"><i class="bi bi-check-lg"></i></button>
      <button class="btn-secundario btn-xs" onclick="_renderHistorialStatsJugador('${jugador?.id}')"><i class="bi bi-x-lg"></i></button>
    </td>
  `;
}

/* Guarda la corrección de una entrada, validando contra el marcador real del partido
   (si tiene uno asociado), sin contar el goleo de esta misma entrada como "ya registrado" */
function guardarEdicionStatEntry(statId) {
  const s = statsActual.find(x => x.id === statId);
  if (!s) return;

  const goles     = Math.max(0, parseInt(document.getElementById(`es-g-${statId}`)?.value || 0));
  const amarillas = Math.max(0, parseInt(document.getElementById(`es-a-${statId}`)?.value || 0));
  const rojas     = Math.max(0, parseInt(document.getElementById(`es-r-${statId}`)?.value || 0));

  const partido = fixtureActual.find(p => p.id === s.partidoId);
  if (partido && goles > 0) {
    const esLocal  = partido.local === s.equipo;
    const maxGoles = esLocal ? Number(partido.golesLocal) : Number(partido.golesVisitante);
    const otrosGoles = statsActual
      .filter(x => x.partidoId === s.partidoId && x.equipo === s.equipo && x.id !== statId)
      .reduce((sum, x) => sum + (Number(x.goles) || 0), 0);
    if (otrosGoles + goles > maxGoles) {
      mostrarError(`El equipo anotó ${maxGoles} gol(es) en este partido. Entre los demás jugadores ya hay ${otrosGoles}; para este jugador puedes poner hasta ${Math.max(0, maxGoles - otrosGoles)}.`);
      return;
    }
  }

  s.goles = goles; s.amarillas = amarillas; s.rojas = rojas;
  guardarStatsLocal(statsActual);

  renderizarEquipos();
  renderizarEstadisticas();
  mostrarExito('Estadística actualizada');
}

async function eliminarStatEntry(statId) {
  const s = statsActual.find(x => x.id === statId);
  if (!s) return;
  const ok = await confirmarAccion({
    titulo: 'Eliminar registro',
    mensaje: `¿Eliminar este registro de ${s.jugador} (${s.goles} gol(es), ${s.amarillas} amarilla(s), ${s.rojas} roja(s))?`,
    textoConfirmar: 'Eliminar'
  });
  if (!ok) return;

  statsActual = statsActual.filter(x => x.id !== statId);
  guardarStatsLocal(statsActual);

  renderizarEquipos();
  renderizarEstadisticas();
  mostrarExito('Registro eliminado');
}

/* ──────────────────────────────────────────────
   RENOMBRAR EQUIPO
   ────────────────────────────────────────────── */

function iniciarRenombrarEquipo(equipo) {
  const row = document.getElementById(`eqrow-${_slugEquipo(equipo)}`);
  if (!row) return;
  const equipoJs = equipo.replace(/'/g, "\\'");
  const celda = row.querySelector('.col-equipo');
  if (!celda) return;

  celda.innerHTML = `
    <div style="display:flex; gap:.4rem; align-items:center;">
      <input type="text" id="input-renombrar-equipo" value="${equipo.replace(/"/g, '&quot;')}" maxlength="30" class="input-edit" style="flex:1">
      <button class="btn-principal btn-xs" onclick="guardarRenombreEquipo('${equipoJs}')" title="Guardar"><i class="bi bi-check-lg"></i></button>
      <button class="btn-secundario btn-xs" onclick="renderizarEquipos()" title="Cancelar"><i class="bi bi-x-lg"></i></button>
    </div>
  `;
  const input = document.getElementById('input-renombrar-equipo');
  input?.focus();
  input?.select();
}

async function guardarRenombreEquipo(nombreAnterior) {
  const nuevoNombre = document.getElementById('input-renombrar-equipo')?.value.trim();
  if (!nuevoNombre) { mostrarError('El nombre del equipo no puede estar vacío.'); return; }
  if (nuevoNombre === nombreAnterior) { renderizarEquipos(); return; }
  if (torneoActual.equipos.some(e => e.toLowerCase() === nuevoNombre.toLowerCase())) {
    mostrarError(`Ya existe un equipo llamado "${nuevoNombre}".`);
    return;
  }

  mostrarCarga('Renombrando equipo...');
  try {
    _renombrarEquipoEnDatos(nombreAnterior, nuevoNombre);
    await _sincronizarRenombreEquipoSheets();
    mostrarExito(`✅ Equipo renombrado a "${nuevoNombre}"`);
  } catch (err) {
    mostrarError('No se pudo renombrar el equipo en Google Sheets: ' + err.message);
  } finally {
    ocultarCarga();
    renderizarInicio();
    renderizarPosiciones();
    renderizarFixture();
    renderizarCalendario();
    renderizarResultados(jornadaViendo);
    renderizarEstadisticas();
    renderizarHistorial();
    renderizarEquipos();
  }
}

/* Reemplaza el nombre del equipo en todo el estado local y lo persiste */
function _renombrarEquipoEnDatos(nombreAnterior, nuevoNombre) {
  torneoActual.equipos = torneoActual.equipos.map(e => e === nombreAnterior ? nuevoNombre : e);
  guardarTorneoLocal(torneoActual);

  fixtureActual.forEach(p => {
    if (p.local === nombreAnterior)     p.local = nuevoNombre;
    if (p.visitante === nombreAnterior) p.visitante = nuevoNombre;
  });
  guardarFixtureLocal(fixtureActual);

  jugadoresActual.forEach(j => { if (j.equipo === nombreAnterior) j.equipo = nuevoNombre; });
  guardarJugadoresLocal(jugadoresActual);

  statsActual.forEach(s => { if (s.equipo === nombreAnterior) s.equipo = nuevoNombre; });
  guardarStatsLocal(statsActual);

  finanzasEquiposActual.forEach(f => { if (f.equipo === nombreAnterior) f.equipo = nuevoNombre; });
  guardarFinanzasEquiposLocal(finanzasEquiposActual);

  historialActual.forEach(h => {
    if (h.local === nombreAnterior)     h.local = nuevoNombre;
    if (h.visitante === nombreAnterior) h.visitante = nuevoNombre;
  });
  guardarHistorialLocal(historialActual);

  if (_equipoExpandido === nombreAnterior) _equipoExpandido = nuevoNombre;

  const el = document.getElementById('header-titulo-torneo');
  if (el && torneoActual.nombre) el.textContent = torneoActual.nombre;
}

/* Re-sincroniza con Google Sheets todas las hojas que contienen nombres de equipo */
async function _sincronizarRenombreEquipoSheets() {
  const sheetId = torneoActual?.sheetId;
  if (!sheetId) return;

  const filasEquipos = [
    ['ID', 'Nombre'],
    ...torneoActual.equipos.map((e, i) => [i + 1, e])
  ];
  await limpiarYEscribir(sheetId, 'Equipos', filasEquipos);

  await _sincronizarFixtureSheets();
  await _sincronizarPosicionesSheets(calcularClasificacion());
  await _sincronizarJornadasSheets();
  await _sincronizarEstadisticasSheets();
  await _sincronizarFinanzasSheets();
}

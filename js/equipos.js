/* =============================================
   equipos.js – Panel único de gestión por equipo:
   estado/renombrar, plantilla de jugadores (con historial de goles
   y tarjetas por partido) y finanzas (inscripción + multas).
   ============================================= */

let _equipoExpandido = null;      // equipo con el panel de detalle abierto
let _jugadorModalAbierto = null;    // id del jugador con el modal de detalle abierto (o null)
let _modalEquipoAbierto = null;     // { tipo, equipo } del modal de acción de equipo abierto (o null)

/* ──────────────────────────────────────────────
   SELECTOR DE EQUIPO
   Un solo flujo: elegís un equipo del <select> y ahí abajo aparece su
   resumen financiero + las 4 acciones (nada de tabla con todos los
   equipos listados en "Pendiente").
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

  if (_equipoExpandido && !torneoActual.equipos.includes(_equipoExpandido)) _equipoExpandido = null;

  const opciones = torneoActual.equipos
    .map(e => `<option value="${e.replace(/"/g, '&quot;')}" ${e === _equipoExpandido ? 'selected' : ''}>${e}</option>`)
    .join('');

  cont.innerHTML = `
    <div class="selector-equipo-fila">
      <div class="form-grupo" style="max-width:320px;margin-bottom:0">
        <label for="selector-equipo">Equipo</label>
        <select id="selector-equipo" onchange="onCambioEquipoSeleccionado()">
          <option value="">Seleccionar equipo...</option>
          ${opciones}
        </select>
      </div>
      <button class="btn-secundario btn-pequeño" onclick="iniciarRenombrarEquipo()" title="Renombrar equipo" ${_equipoExpandido ? '' : 'disabled'}>
        <i class="bi bi-pencil-fill"></i> Renombrar
      </button>
    </div>
  `;

  if (_equipoExpandido) {
    renderizarDetalleEquipo(_equipoExpandido);
  } else {
    const panel = document.getElementById('equipo-detalle-panel');
    if (panel) panel.innerHTML = '';
  }
}

function onCambioEquipoSeleccionado() {
  _equipoExpandido = document.getElementById('selector-equipo')?.value || null;
  _cerrarModalEquipo();
  renderizarEquipos();
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

/* Pill de estado de un cargo (tarjetas o resolución) — tocarlo alterna Pagado/Pendiente directamente */
function _botonEstadoPago(jugadorId, cargoId, pagado) {
  const clase = pagado ? 'fin-badge-pagado' : 'fin-badge-pendiente';
  return `<button class="fin-badge fin-badge-clickable ${clase}" onclick="toggleCargoJugador('${jugadorId}', '${cargoId}')" title="Toca para marcar como ${pagado ? 'pendiente' : 'pagado'}">
    ${pagado ? 'Pagado' : 'Pendiente'}
  </button>`;
}

/* Vuelve al placeholder "Seleccionar equipo..." del selector */
function cerrarDetalleEquipo() {
  _equipoExpandido = null;
  _cerrarModalEquipo();
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
  const roster = jugadoresActual.filter(j => j.equipo === equipo);
  const cargosPendientes = calcularFinanzasJugadores(equipo).filter(c => !c.pagado).length;

  panel.innerHTML = `
    <div class="equipo-detalle-panel">
      <div class="seccion-header">
        <h3><i class="bi bi-shield-fill"></i> ${equipo}</h3>
        <button class="btn-secundario btn-pequeño" onclick="cerrarDetalleEquipo()"><i class="bi bi-x-lg"></i> Cerrar</button>
      </div>

      ${_htmlResumenFinancieroEquipo(eq)}
      ${_htmlBotonesAccionesEquipo(equipoJs, fin, roster, cargosPendientes)}
    </div>
  `;

  _refrescarModalEquipoSiAbierto();
}

/* Paso 2: lo primero que se ve al elegir un equipo — la plata, de un vistazo */
function _htmlResumenFinancieroEquipo(eq) {
  const clase = eq.estado === 'Pagado' ? 'fin-badge-pagado' : (eq.estado === 'Parcial' ? 'fin-badge-parcial' : 'fin-badge-pendiente');
  return `
    <div class="jugadores-card">
      <div class="seccion-header" style="margin-bottom:1rem">
        <h4 style="font-size:1.05rem"><i class="bi bi-cash-coin"></i> Resumen financiero</h4>
        <span class="fin-badge ${clase}">${eq.estado === 'Parcial' ? 'Abono parcial' : eq.estado}</span>
      </div>
      <div class="cards-grid">
        <div class="card-stat"><div class="card-stat-num">${_formatoMoneda(eq.inscripcion)}</div><div class="card-stat-label">Inscripción</div></div>
        <div class="card-stat"><div class="card-stat-num">${_formatoMoneda(eq.abonado)}</div><div class="card-stat-label">Abonado</div></div>
        <div class="card-stat"><div class="card-stat-num" style="${eq.saldo > 0 ? 'color:var(--c-danger)' : ''}">${_formatoMoneda(eq.saldo)}</div><div class="card-stat-label">Saldo pendiente</div></div>
      </div>
    </div>
  `;
}

/* Paso 3: 4 acciones del equipo, cada una abre su propio modal (mismo patrón
   .modal-overlay que el detalle de un jugador) en vez de un panel colapsable */
function _htmlBotonesAccionesEquipo(equipoJs, fin, roster, cargosPendientes) {
  return `
    <div class="acciones-equipo-grid">
      <button class="btn-accion-equipo" onclick="abrirModalAbonos('${equipoJs}')">
        <span class="izq"><i class="bi bi-wallet2 icono"></i> Gestionar abonos <span class="contador">${fin.abonos.length} registrado${fin.abonos.length === 1 ? '' : 's'}</span></span>
        <i class="bi bi-chevron-right chevron"></i>
      </button>
      <button class="btn-accion-equipo" onclick="abrirModalAgregarJugador('${equipoJs}')">
        <span class="izq"><i class="bi bi-person-plus-fill icono"></i> Agregar jugador</span>
        <i class="bi bi-chevron-right chevron"></i>
      </button>
      <button class="btn-accion-equipo" onclick="abrirModalStatsEquipo('${equipoJs}')">
        <span class="izq"><i class="bi bi-award-fill icono"></i> Goles y tarjetas <span class="contador">${roster.length} jugador${roster.length === 1 ? '' : 'es'}</span></span>
        <i class="bi bi-chevron-right chevron"></i>
      </button>
      <button class="btn-accion-equipo" onclick="abrirModalPagosJugadores('${equipoJs}')">
        <span class="izq"><i class="bi bi-cash-coin icono"></i> Pagos de jugadores <span class="contador">${cargosPendientes} pendiente${cargosPendientes === 1 ? '' : 's'}</span></span>
        <i class="bi bi-chevron-right chevron"></i>
      </button>
    </div>
  `;
}

/* ──────────────────────────────────────────────
   MODAL GENÉRICO DE ACCIÓN DE EQUIPO
   Un único overlay reutilizado por los 4 botones de arriba — mismo patrón
   (X, click afuera, Esc, foco al abrir) que abrirDetalleJugador.
   ────────────────────────────────────────────── */

function _abrirModalEquipo(tipo, equipo, tituloHtml, renderFn) {
  _cerrarModalEquipo();
  _modalEquipoAbierto = { tipo, equipo };

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'equipo-modal-overlay';
  overlay.innerHTML = `
    <div class="modal-panel" role="dialog" aria-modal="true" aria-label="${tituloHtml.replace(/<[^>]*>/g, '')}">
      <div class="modal-header">
        <h2>${tituloHtml}</h2>
        <button class="modal-cerrar" onclick="_cerrarModalEquipo()" aria-label="Cerrar"><i class="bi bi-x-lg"></i></button>
      </div>
      <div class="modal-body" id="equipo-modal-body"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) _cerrarModalEquipo(); });
  document.addEventListener('keydown', _escapeCierraModalEquipo);
  overlay.querySelector('.modal-cerrar')?.focus();

  renderFn(equipo);
}

function _escapeCierraModalEquipo(e) {
  if (e.key === 'Escape') _cerrarModalEquipo();
}

function _cerrarModalEquipo() {
  _modalEquipoAbierto = null;
  document.removeEventListener('keydown', _escapeCierraModalEquipo);
  document.getElementById('equipo-modal-overlay')?.remove();
}

/* Llamado desde renderizarDetalleEquipo tras cualquier acción (registrar abono,
   alta de jugador, editar/eliminar, toggle de pago...) para que el modal de
   equipo que esté abierto se vea siempre actualizado */
function _refrescarModalEquipoSiAbierto() {
  if (!_modalEquipoAbierto) return;
  const { tipo, equipo } = _modalEquipoAbierto;
  if (tipo === 'abonos') _renderModalAbonos(equipo);
  if (tipo === 'jugador') _renderModalAgregarJugador(equipo);
  if (tipo === 'stats') _renderModalStatsEquipo(equipo);
  if (tipo === 'pagos') _renderModalPagosJugadores(equipo);
}

/* ── Modal: Gestionar abonos — reutiliza guardarAbono/eliminarAbono de finanzas.js ── */

function abrirModalAbonos(equipo) {
  _abrirModalEquipo('abonos', equipo, '<i class="bi bi-wallet2"></i> Gestionar abonos', _renderModalAbonos);
}

function _renderModalAbonos(equipo) {
  const body = document.getElementById('equipo-modal-body');
  if (!body) return;
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

  body.innerHTML = `
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
  `;
}

/* ── Modal: Agregar jugador — reutiliza guardarNuevoJugadorEquipo (más abajo) ── */

function abrirModalAgregarJugador(equipo) {
  _abrirModalEquipo('jugador', equipo, '<i class="bi bi-person-plus-fill"></i> Agregar jugador', _renderModalAgregarJugador);
}

function _renderModalAgregarJugador(equipo) {
  const body = document.getElementById('equipo-modal-body');
  if (!body) return;
  const equipoJs = equipo.replace(/'/g, "\\'");
  body.innerHTML = `
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
  `;
  document.getElementById('nuevo-jugador-nombre')?.focus();
}

/* ── Modal: Goles y tarjetas — plantilla del equipo sin columnas de dinero ── */

function abrirModalStatsEquipo(equipo) {
  _abrirModalEquipo('stats', equipo, `<i class="bi bi-award-fill"></i> Goles y tarjetas — ${equipo}`, _renderModalStatsEquipo);
}

function _renderModalStatsEquipo(equipo) {
  const body = document.getElementById('equipo-modal-body');
  if (!body) return;
  const roster = jugadoresActual.filter(j => j.equipo === equipo)
    .map(j => ({ ...j, ..._statsJugador(j.equipo, j.nombre) }))
    .sort((a, b) => b.goles - a.goles || a.nombre.localeCompare(b.nombre));

  if (roster.length === 0) {
    body.innerHTML = '<p class="sin-datos">Sin jugadores registrados en este equipo.</p>';
    return;
  }

  const filas = roster.map(j => `
    <tr id="jrow-${j.id}">
      <td class="col-camisa">${j.numeroCamisa || '–'}</td>
      <td><strong>${j.nombre}</strong></td>
      <td>${j.cedula || '–'}</td>
      <td>${j.celular || '–'}</td>
      <td class="col-num">${j.goles}</td>
      <td class="col-num">${j.amarillas}</td>
      <td class="col-num">${j.rojas}</td>
      <td class="col-acciones">
        <button class="btn-secundario btn-xs" onclick="abrirDetalleJugador('${j.id}')" title="Ver detalle"><i class="bi bi-eye-fill"></i></button>
        <button class="btn-secundario btn-xs" onclick="iniciarEditarJugador('${j.id}')" title="Editar datos"><i class="bi bi-pencil-fill"></i></button>
        <button class="btn-peligro   btn-xs" onclick="eliminarJugador('${j.id}')" title="Eliminar"><i class="bi bi-trash3-fill"></i></button>
      </td>
    </tr>`).join('');

  body.innerHTML = `
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
        <tbody>${filas}</tbody>
      </table>
    </div>
    <p class="info-texto" style="margin-top:.5rem"><i class="bi bi-eye-fill"></i> "Ver detalle" muestra los goles y tarjetas partido por partido.</p>
  `;
}

/* ── Modal: Pagos de jugadores — un cargo por fila (tarjetas + multas de
   resolución), cada uno con su propio pill togglable (_botonEstadoPago,
   dispara toggleCargoJugador de finanzas.js sin cambios) ── */

function abrirModalPagosJugadores(equipo) {
  _abrirModalEquipo('pagos', equipo, `<i class="bi bi-cash-coin"></i> Pagos de jugadores — ${equipo}`, _renderModalPagosJugadores);
}

function _renderModalPagosJugadores(equipo) {
  const body = document.getElementById('equipo-modal-body');
  if (!body) return;
  const cargos = calcularFinanzasJugadores(equipo);

  if (cargos.length === 0) {
    body.innerHTML = '<p class="sin-datos">Sin cargos ni multas registradas para jugadores de este equipo.</p>';
    return;
  }

  const filas = cargos.map(c => `
    <tr>
      <td style="text-align:left"><strong>${c.jugador}</strong></td>
      <td style="text-align:left">${c.concepto}</td>
      <td class="col-num">${_formatoMoneda(c.monto)}</td>
      <td>${_botonEstadoPago(c.jugadorId, c.cargoId, c.pagado)}</td>
    </tr>
  `).join('');

  body.innerHTML = `
    <div class="tabla-wrapper">
      <table class="tabla-datos tabla-compacta">
        <thead><tr><th style="text-align:left">Jugador</th><th style="text-align:left">Concepto</th><th>Monto</th><th>Estado</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
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

/* Migración silenciosa: asegura que toda entrada de statsActual tenga un id estable
   y que las que tienen roja tengan el campo `sancionado` (para la lista de
   pendientes de sancionar en Resoluciones). */
function _asegurarIdsStats() {
  let cambiado = false;
  statsActual.forEach(s => {
    if (!s.id) { s.id = _nuevoIdStat(); cambiado = true; }
    if (s.rojas > 0 && typeof s.sancionado === 'undefined') { s.sancionado = false; cambiado = true; }
  });
  if (cambiado) guardarStatsLocal(statsActual);
}

function _entradasStatsJugador(equipo, nombre) {
  return statsActual
    .filter(s => s.equipo === equipo && s.jugador === nombre)
    .slice()
    .sort((a, b) => a.jornada - b.jornada);
}

/* Busca si una tarjeta roja (por su statsId) ya quedó incluida en alguna
   resolución publicada, para mostrarlo en el modal de detalle del jugador. */
function _resolucionQueSanciono(statsId) {
  if (!statsId || typeof resolucionesActual === 'undefined') return null;
  for (const r of resolucionesActual) {
    if (r.estado !== 'publicada') continue;
    if (r.tablaSanciones.some(f => f.statsId === statsId)) return r.numero;
  }
  return null;
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
      <thead><tr><th style="text-align:left">Partido</th><th>Goles</th><th>Am.</th><th>Roj.</th><th>Sanción</th><th></th></tr></thead>
      <tbody>
        ${entradas.map(s => {
          const partido = fixtureActual.find(p => p.id === s.partidoId);
          const rival = partido ? (partido.local === jugador.equipo ? partido.visitante : partido.local) : null;
          const etiqueta = partido ? `J${s.jornada} · vs ${rival}` : 'Ajuste manual (sin partido)';

          let sancionTag = '<span class="sin-datos" style="padding:0">–</span>';
          if (s.rojas > 0) {
            const numeroRes = _resolucionQueSanciono(s.id);
            sancionTag = s.sancionado
              ? `<span class="fin-badge fin-badge-pagado">Sancionada${numeroRes ? ' #' + numeroRes : ''}</span>`
              : '<span class="fin-badge fin-badge-pendiente">Pendiente</span>';
          }

          const pagado = _cargoTarjetasEstaPagado(s.id);
          const btnEliminar = pagado
            ? `<button class="btn-peligro btn-xs" disabled title="No editable: cargo ya pagado"><i class="bi bi-trash3-fill"></i></button>`
            : `<button class="btn-peligro btn-xs" onclick="eliminarStatEntry('${s.id}')" title="Eliminar"><i class="bi bi-trash3-fill"></i></button>`;

          return `
            <tr id="stat-row-${s.id}">
              <td style="text-align:left">${etiqueta}</td>
              <td class="col-num">${s.goles}</td>
              <td class="col-num">${s.amarillas}</td>
              <td class="col-num">${s.rojas}</td>
              <td>${sancionTag}</td>
              <td class="col-acciones">
                <button class="btn-secundario btn-xs" onclick="iniciarEditarStatEntry('${s.id}')" title="Editar"><i class="bi bi-pencil-fill"></i></button>
                ${btnEliminar}
              </td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

/* El campo de goles siempre se puede editar; los de amarillas/rojas se
   deshabilitan si el cargo de tarjetas de este partido ya está Pagado
   (editarlos alteraría un cobro ya cerrado). */
function iniciarEditarStatEntry(statId) {
  const s = statsActual.find(x => x.id === statId);
  const row = document.getElementById(`stat-row-${statId}`);
  if (!s || !row) return;
  const partido = fixtureActual.find(p => p.id === s.partidoId);
  const jugador = jugadoresActual.find(j => j.equipo === s.equipo && j.nombre === s.jugador);
  const etiqueta = partido ? `J${s.jornada}` : 'Ajuste manual';
  const pagado = _cargoTarjetasEstaPagado(statId);
  const disabledTarjetas = pagado ? 'disabled title="No editable: cargo ya pagado"' : '';
  row.innerHTML = `
    <td style="text-align:left">${etiqueta}</td>
    <td><input type="number" id="es-g-${statId}" value="${s.goles}"     min="0" max="20" class="input-edit input-edit-xs"></td>
    <td><input type="number" id="es-a-${statId}" value="${s.amarillas}" min="0" max="2"  class="input-edit input-edit-xs" ${disabledTarjetas}></td>
    <td><input type="number" id="es-r-${statId}" value="${s.rojas}"     min="0" max="1"  class="input-edit input-edit-xs" ${disabledTarjetas}></td>
    <td>–</td>
    <td class="col-acciones">
      <button class="btn-principal btn-xs" onclick="guardarEdicionStatEntry('${statId}')"><i class="bi bi-check-lg"></i></button>
      <button class="btn-secundario btn-xs" onclick="_renderHistorialStatsJugador('${jugador?.id}')"><i class="bi bi-x-lg"></i></button>
    </td>
  `;
}

/* Guarda la corrección de una entrada, validando contra el marcador real del partido
   (si tiene uno asociado), sin contar el goleo de esta misma entrada como "ya registrado".
   Si el cargo de tarjetas de ESE partido ya está Pagado, amarillas/rojas quedan
   congeladas en su valor original (los inputs ya están disabled, pero se refuerza
   acá por si alguien fuerza el DOM) — solo goles se puede seguir editando. */
async function guardarEdicionStatEntry(statId) {
  const s = statsActual.find(x => x.id === statId);
  if (!s) return;

  const goles = Math.max(0, parseInt(document.getElementById(`es-g-${statId}`)?.value || 0));
  const pagado = _cargoTarjetasEstaPagado(statId);
  const amarillas = pagado ? s.amarillas : Math.max(0, parseInt(document.getElementById(`es-a-${statId}`)?.value || 0));
  const rojas     = pagado ? s.rojas     : Math.max(0, parseInt(document.getElementById(`es-r-${statId}`)?.value || 0));

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

  const jugador = jugadoresActual.find(j => j.equipo === s.equipo && j.nombre === s.jugador);
  if (jugador) _sincronizarCargoTarjetasEntrada(jugador, statId, amarillas, rojas);

  s.goles = goles; s.amarillas = amarillas; s.rojas = rojas;
  guardarStatsLocal(statsActual);

  renderizarEquipos();
  renderizarEstadisticas();
  _refrescarModalJugadorPorEquipoNombre(s.equipo, s.jugador);
  mostrarExito('Estadística actualizada');
}

async function eliminarStatEntry(statId) {
  const s = statsActual.find(x => x.id === statId);
  if (!s) return;
  if (_cargoTarjetasEstaPagado(statId)) {
    mostrarError('No se puede eliminar: el cargo de tarjetas de este partido ya está pagado.');
    return;
  }
  const ok = await confirmarAccion({
    titulo: 'Eliminar registro',
    mensaje: `¿Eliminar este registro de ${s.jugador} (${s.goles} gol(es), ${s.amarillas} amarilla(s), ${s.rojas} roja(s))?`,
    textoConfirmar: 'Eliminar'
  });
  if (!ok) return;

  const { equipo, jugador } = s;
  const jugadorObj = jugadoresActual.find(j => j.equipo === equipo && j.nombre === jugador);
  if (jugadorObj) _sincronizarCargoTarjetasEntrada(jugadorObj, statId, 0, 0); // baja a 0: nunca pregunta

  statsActual = statsActual.filter(x => x.id !== statId);
  guardarStatsLocal(statsActual);

  renderizarEquipos();
  renderizarEstadisticas();
  _refrescarModalJugadorPorEquipoNombre(equipo, jugador);
  mostrarExito('Registro eliminado');
}

/* ──────────────────────────────────────────────
   MODAL DE DETALLE DE JUGADOR
   Un solo lugar para ver TODO de un jugador: cada cargo (tarjetas y multas de
   resolución) con su propio estado de pago, y el historial de goles/tarjetas
   partido por partido con su estado de sanción. No cambia ningún cálculo — solo
   junta en una vista lo que ya vive en calcularFinanzasJugadores() y statsActual.
   ────────────────────────────────────────────── */

function abrirDetalleJugador(jugadorId) {
  const jugador = jugadoresActual.find(j => j.id === jugadorId);
  if (!jugador) return;
  cerrarDetalleJugador(); // por si quedó otro abierto
  _jugadorModalAbierto = jugadorId;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'jugador-detalle-overlay';
  overlay.innerHTML = `
    <div class="modal-panel" role="dialog" aria-modal="true" aria-label="Detalle de ${jugador.nombre}">
      <div class="modal-header">
        <h2><i class="bi bi-person-fill"></i> ${jugador.nombre} <span style="font-weight:400;font-size:.78rem;opacity:.85">— ${jugador.equipo}</span></h2>
        <button class="modal-cerrar" onclick="cerrarDetalleJugador()" aria-label="Cerrar"><i class="bi bi-x-lg"></i></button>
      </div>
      <div class="modal-body">
        <h4 class="subtitulo-card"><i class="bi bi-cash-coin"></i> Cargos y multas</h4>
        <div id="modal-jugador-cargos"></div>

        <h4 class="subtitulo-card" style="margin-top:1.5rem"><i class="bi bi-list-ul"></i> Goles y tarjetas por partido</h4>
        <div id="stats-hist-${jugadorId}"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) cerrarDetalleJugador(); });
  document.addEventListener('keydown', _escapeCierraModalJugador);

  _renderizarCargosModalJugador(jugadorId);
  _renderHistorialStatsJugador(jugadorId);
}

function _escapeCierraModalJugador(e) {
  if (e.key === 'Escape') cerrarDetalleJugador();
}

function cerrarDetalleJugador() {
  _jugadorModalAbierto = null;
  document.removeEventListener('keydown', _escapeCierraModalJugador);
  document.getElementById('jugador-detalle-overlay')?.remove();
}

function _renderizarCargosModalJugador(jugadorId) {
  const jugador = jugadoresActual.find(j => j.id === jugadorId);
  const cont = document.getElementById('modal-jugador-cargos');
  if (!jugador || !cont) return;

  const cargos = calcularFinanzasJugadores(jugador.equipo).filter(c => c.jugadorId === jugadorId);
  if (cargos.length === 0) {
    cont.innerHTML = '<p class="sin-datos">Sin cargos ni multas registradas.</p>';
    return;
  }

  cont.innerHTML = `
    <div class="tabla-wrapper">
      <table class="tabla-datos tabla-compacta">
        <thead><tr><th style="text-align:left">Concepto</th><th>Monto</th><th>Estado</th></tr></thead>
        <tbody>
          ${cargos.map(c => `
            <tr>
              <td style="text-align:left">${c.concepto}</td>
              <td class="col-num">${_formatoMoneda(c.monto)}</td>
              <td>${_botonEstadoPago(c.jugadorId, c.cargoId, c.pagado)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* Llamado desde toggleCargoJugador (finanzas.js) tras alternar un pago, para que
   el modal se vea actualizado si está abierto para ese mismo jugador */
function _refrescarModalJugadorSiAbierto(jugadorId) {
  if (_jugadorModalAbierto !== jugadorId) return;
  _renderizarCargosModalJugador(jugadorId);
}

/* statsActual identifica al jugador por equipo+nombre, no por id — este helper
   resuelve el id y refresca el historial del modal si está abierto para él */
function _refrescarModalJugadorPorEquipoNombre(equipo, nombre) {
  const jugador = jugadoresActual.find(j => j.equipo === equipo && j.nombre === nombre);
  if (!jugador || _jugadorModalAbierto !== jugador.id) return;
  _renderHistorialStatsJugador(jugador.id);
  _renderizarCargosModalJugador(jugador.id); // el cobro de tarjetas depende de goles/tarjetas, así que también debe refrescarse
}

/* ──────────────────────────────────────────────
   RENOMBRAR EQUIPO
   ────────────────────────────────────────────── */

function iniciarRenombrarEquipo() {
  const equipo = _equipoExpandido;
  if (!equipo) return;
  const cont = document.getElementById('tabla-equipos-container');
  if (!cont) return;
  const equipoJs = equipo.replace(/'/g, "\\'");

  cont.innerHTML = `
    <div class="selector-equipo-fila">
      <div class="form-grupo" style="max-width:320px;margin-bottom:0">
        <label for="input-renombrar-equipo">Nuevo nombre del equipo</label>
        <input type="text" id="input-renombrar-equipo" value="${equipo.replace(/"/g, '&quot;')}" maxlength="30" class="input-edit">
      </div>
      <button class="btn-principal btn-pequeño" onclick="guardarRenombreEquipo('${equipoJs}')" title="Guardar"><i class="bi bi-check-lg"></i></button>
      <button class="btn-secundario btn-pequeño" onclick="renderizarEquipos()" title="Cancelar"><i class="bi bi-x-lg"></i></button>
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

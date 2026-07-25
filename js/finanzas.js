/* =============================================
   finanzas.js – Inscripción por equipo y multas por tarjeta
   (el renderizado vive en equipos.js, que unifica equipos + jugadores + finanzas)
   ============================================= */

/* ──────────────────────────────────────────────
   HELPERS
   ────────────────────────────────────────────── */

function _formatoMoneda(n) {
  return '$' + (Number(n) || 0).toLocaleString('es', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function _hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function _badgeEstado(estado) {
  const clase = estado === 'Pagado' ? 'fin-badge-pagado' : (estado === 'Parcial' ? 'fin-badge-parcial' : 'fin-badge-pendiente');
  return `<span class="fin-badge ${clase}">${estado}</span>`;
}

function _textoCargos(amarillas, rojas) {
  const partes = [];
  if (amarillas > 0) partes.push(`${amarillas} amarilla${amarillas > 1 ? 's' : ''}`);
  if (rojas > 0) partes.push(`${rojas} roja${rojas > 1 ? 's' : ''}`);
  return partes.join(', ') || '–';
}

/* ──────────────────────────────────────────────
   CÁLCULO — todo se deriva en vivo de statsActual/finanzasEquiposActual/
   finanzasJugadoresActual, así que corregir o borrar una tarjeta nunca
   deja un cargo huérfano.
   ────────────────────────────────────────────── */

function calcularFinanzasEquipos() {
  if (!torneoActual) return [];
  const precioInscripcion = Number(torneoActual.precioInscripcion) || 0;

  return torneoActual.equipos.map(equipo => {
    const fin = finanzasEquiposActual.find(f => f.equipo === equipo) || { equipo, abonos: [] };
    const abonado = fin.abonos.reduce((sum, a) => sum + (Number(a.monto) || 0), 0);
    const saldo = Math.max(0, precioInscripcion - abonado);
    let estado;
    if (precioInscripcion <= 0 || saldo <= 0) estado = 'Pagado';
    else if (abonado > 0) estado = 'Parcial';
    else estado = 'Pendiente';
    return { equipo, inscripcion: precioInscripcion, abonado, saldo, estado };
  });
}

/* Un jugador tiene una lista de "cargos" en finanzasJugadoresActual:
   - origen 'tarjetas': UNO POR PARTIDO (id T_<statId>, o T_<statId>_2, _3... si
     hubo más de un cobro para ese mismo partido porque el anterior ya estaba
     pagado). Cada fila tiene su propio monto fijo y su propio Pagado/Pendiente,
     con la fecha de esa jornada — no es un total agregado del jugador.
   - origen 'resolucion': uno por cada fila de sanciones con multa>0 al publicar una
     Resolución. Su monto queda fijo para siempre; "pagado" es un booleano simple.
   Ambos se normalizan aquí a la misma forma de fila para que la UI (equipos.js) los
   pinte igual, cada uno con su propio pill de estado togglable. */

/* Migración silenciosa: las entradas guardadas con la forma vieja ({ jugadorId,
   montoCubierto }) se envuelven en la forma nueva ({ jugadorId, cargos: [...] }) */
function _migrarFinanzasJugadoresActual() {
  let cambiado = false;
  finanzasJugadoresActual = finanzasJugadoresActual.map(f => {
    if (Array.isArray(f.cargos)) return f;
    cambiado = true;
    const cargos = [];
    if (typeof f.montoCubierto !== 'undefined') {
      cargos.push({ id: `T_${f.jugadorId}`, origen: 'tarjetas', montoCubierto: Number(f.montoCubierto) || 0 });
    }
    return { jugadorId: f.jugadorId, cargos };
  });
  if (cambiado) guardarFinanzasJugadoresLocal(finanzasJugadoresActual);
}

/* Migración/sincronización de arranque: se corre en cada carga de la app y
   es idempotente (no toca lo que ya está sincronizado). Dos trabajos:
   1) Migra el cobro de tarjetas viejo (un solo total agregado por jugador,
      sin fecha ni partido asociado) al modelo nuevo de una fila por partido,
      marcando como pagados —en orden cronológico— tantos como cubra el monto
      que ya estaba cubierto en el cargo viejo, para no perder el pago.
   2) Genera la fila que falte para cualquier partido con tarjetas que todavía
      no tenga su cobro registrado (por ejemplo, si nunca se tocó el pago de
      ese jugador no existía ninguna fila para ese partido). */
function _migrarCargosTarjetasPorPartido() {
  if (!torneoActual) return;
  const precioAmarilla = Number(torneoActual.precioAmarilla) || 0;
  const precioRoja     = Number(torneoActual.precioRoja) || 0;
  let cambiado = false;

  jugadoresActual.forEach(jugador => {
    const entradasStats    = statsActual.filter(s => s.equipo === jugador.equipo && s.jugador === jugador.nombre);
    const entradaExistente = finanzasJugadoresActual.find(f => f.jugadorId === jugador.id);
    const tieneLegacy      = entradaExistente?.cargos.some(c => c.origen === 'tarjetas' && !c.statId);
    if (entradasStats.length === 0 && !tieneLegacy) return; // nada que hacer para este jugador

    const entrada = _obtenerEntradaFinanzasJugador(jugador.id, true);

    let restanteLegacy = 0;
    const legacyIdx = entrada.cargos.findIndex(c => c.origen === 'tarjetas' && !c.statId);
    if (legacyIdx !== -1) {
      restanteLegacy = Number(entrada.cargos[legacyIdx].montoCubierto) || 0;
      entrada.cargos.splice(legacyIdx, 1);
      cambiado = true;
    }

    entradasStats
      .slice()
      .sort((a, b) => a.jornada - b.jornada)
      .forEach(s => {
        if (entrada.cargos.some(c => c.origen === 'tarjetas' && c.statId === s.id)) return; // ya sincronizado

        const monto = _feeEstandarEntrada(s, precioAmarilla, precioRoja);
        if (monto <= 0) return;

        const pagarEsteAhora = restanteLegacy >= monto;
        entrada.cargos.push({
          id: `T_${s.id}`,
          origen: 'tarjetas',
          statId: s.id,
          amarillas: Number(s.amarillas) || 0,
          rojas: Number(s.rojas) || 0,
          fecha: _fechaEntradaTarjetas(s),
          monto,
          pagado: pagarEsteAhora
        });
        if (pagarEsteAhora) restanteLegacy -= monto;
        cambiado = true;
      });
  });

  if (cambiado) guardarFinanzasJugadoresLocal(finanzasJugadoresActual);
}

function _obtenerEntradaFinanzasJugador(jugadorId, crear) {
  let entrada = finanzasJugadoresActual.find(f => f.jugadorId === jugadorId);
  if (!entrada && crear) {
    entrada = { jugadorId, cargos: [] };
    finanzasJugadoresActual.push(entrada);
  }
  return entrada;
}

/* Fee estándar de UNA entrada de stats (un partido): si llegó a 2 amarillas
   (expulsión por doble amarilla) se cobra solo el precio de la roja, sin
   sumar además el precio de esas 2 amarillas — la expulsión ya "absorbe" la
   sanción. Amarilla(s) sueltas + una roja directa (sin llegar a 2 amarillas
   en ese mismo partido) sí se cobran sumadas. */
function _feeEstandarEntrada(s, precioAmarilla, precioRoja) {
  const am = Number(s.amarillas) || 0;
  const ro = Number(s.rojas) || 0;
  return am >= 2 ? precioRoja : (am * precioAmarilla + ro * precioRoja);
}

/* Fee "descartando" lo anterior: si el partido tiene roja, se cobra solo la
   roja (se descarta cualquier amarilla de ese mismo partido, aunque no llegue
   a 2). Se usa cuando el admin elige "descartar" en el diálogo de ajuste. */
function _feeDescartandoAnterior(s, precioAmarilla, precioRoja) {
  const ro = Number(s.rojas) || 0;
  if (ro > 0) return ro * precioRoja;
  return (Number(s.amarillas) || 0) * precioAmarilla;
}

function _fechaEntradaTarjetas(s) {
  const horario = (typeof horariosActual !== 'undefined') ? horariosActual.find(h => h.partidoId === s.partidoId) : null;
  return horario?.fecha ? _formatoFechaCortaResolucion(horario.fecha) : `Jornada ${s.jornada}`;
}

/* Reconcilia el cobro de tarjetas de UN partido con las nuevas cantidades de
   amarillas/rojas, después de que el admin confirmó el cambio (o antes de
   guardarlo, para poder preguntar si hace falta):
   - Si ya hay un cobro pendiente para este partido: si el fee sube, PREGUNTA
     sumar (usa el fee estándar completo) o descartar lo anterior (usa el fee
     "solo la roja" si hay roja); si baja, se ajusta solo sin preguntar.
   - Si no hay pendiente (nunca hubo, o el único cobro de este partido ya está
     pagado): si lo ya pagado no alcanza para el fee nuevo, se genera un cobro
     nuevo y separado por la diferencia, sin preguntar nada (el pagado queda
     intacto). Si ya alcanza o sobra, no se genera nada.
   Devuelve true si se puede continuar guardando la edición, false si el
   usuario canceló el diálogo. */
async function _sincronizarCargoTarjetasEntrada(jugador, statId, amarillasNuevas, rojasNuevas) {
  if (!torneoActual) return true;
  const precioAmarilla = Number(torneoActual.precioAmarilla) || 0;
  const precioRoja     = Number(torneoActual.precioRoja) || 0;
  const entradaSimulada = { amarillas: amarillasNuevas, rojas: rojasNuevas };
  const feeEstandar = _feeEstandarEntrada(entradaSimulada, precioAmarilla, precioRoja);

  const entrada = _obtenerEntradaFinanzasJugador(jugador.id, true);
  const filasDelPartido = entrada.cargos.filter(c => c.origen === 'tarjetas' && c.statId === statId);
  const filaPendiente   = filasDelPartido.find(c => !c.pagado);
  const totalPagado     = filasDelPartido.filter(c => c.pagado).reduce((s, c) => s + (Number(c.monto) || 0), 0);

  const s = statsActual.find(x => x.id === statId);
  const fecha = s ? _fechaEntradaTarjetas(s) : '';

  if (filaPendiente) {
    if (feeEstandar > filaPendiente.monto) {
      const eleccion = await confirmarAjusteCobroTarjetas(jugador.nombre, filaPendiente.monto, feeEstandar);
      if (eleccion === null) return false;
      filaPendiente.monto = eleccion === 'descartar'
        ? _feeDescartandoAnterior(entradaSimulada, precioAmarilla, precioRoja)
        : feeEstandar;
    } else {
      filaPendiente.monto = feeEstandar; // baja o queda igual: se ajusta solo
    }
    filaPendiente.amarillas = amarillasNuevas;
    filaPendiente.rojas     = rojasNuevas;
    filaPendiente.fecha     = fecha;
    if (filaPendiente.monto <= 0) {
      entrada.cargos = entrada.cargos.filter(c => c !== filaPendiente);
    }
  } else {
    const faltante = feeEstandar - totalPagado;
    if (faltante > 0) {
      const filasPagadas = filasDelPartido.filter(c => c.pagado);
      const sufijo = filasPagadas.length === 0 ? '' : `_${filasPagadas.length + 1}`;
      entrada.cargos.push({
        id: `T_${statId}${sufijo}`,
        origen: 'tarjetas',
        statId,
        amarillas: amarillasNuevas,
        rojas: rojasNuevas,
        fecha,
        monto: faltante,
        pagado: false
      });
    }
  }

  guardarFinanzasJugadoresLocal(finanzasJugadoresActual);
  return true;
}

function _cargosTarjetasDeJugador(jugador) {
  const entrada = finanzasJugadoresActual.find(f => f.jugadorId === jugador.id);
  if (!entrada) return [];
  return entrada.cargos
    .filter(c => c.origen === 'tarjetas')
    .map(c => ({
      cargoId:      c.id,
      origen:       'tarjetas',
      jugadorId:    jugador.id,
      jugador:      jugador.nombre,
      equipo:       jugador.equipo,
      numeroCamisa: jugador.numeroCamisa,
      concepto:     `${_textoCargos(c.amarillas || 0, c.rojas || 0)} · ${c.fecha || ''}`,
      monto:        Number(c.monto) || 0,
      pagado:       !!c.pagado
    }))
    .sort((a, b) => a.concepto.localeCompare(b.concepto));
}

function _cargosResolucionDeJugador(jugador) {
  const entrada = finanzasJugadoresActual.find(f => f.jugadorId === jugador.id);
  if (!entrada) return [];
  return entrada.cargos
    .filter(c => c.origen === 'resolucion')
    .map(c => ({
      cargoId:      c.id,
      origen:       'resolucion',
      jugadorId:    jugador.id,
      jugador:      jugador.nombre,
      equipo:       jugador.equipo,
      numeroCamisa: jugador.numeroCamisa,
      concepto:     `Resolución #${c.resolucionNumero}${c.concepto ? ' · ' + c.concepto : ''}`,
      monto:        Number(c.monto) || 0,
      pagado:       !!c.pagado
    }));
}

/* Todos los cargos pendientes/pagados de los jugadores (tarjetas + resoluciones),
   uno por fila — un jugador con tarjetas Y una multa de resolución aparece dos veces. */
function calcularFinanzasJugadores(equipoFiltro) {
  if (!torneoActual) return [];

  const cargos = [];
  jugadoresActual
    .filter(j => !equipoFiltro || j.equipo === equipoFiltro)
    .forEach(j => {
      cargos.push(..._cargosTarjetasDeJugador(j));
      cargos.push(..._cargosResolucionDeJugador(j));
    });

  return cargos.sort((a, b) => b.monto - a.monto);
}

/* Registra el cargo de una multa de Resolución para un jugador (no sincroniza:
   quien publica la resolución hace un único sync al final por todas las filas). */
function agregarCargoResolucion(jugadorId, resolucionNumero, concepto, monto) {
  const entrada = _obtenerEntradaFinanzasJugador(jugadorId, true);
  entrada.cargos.push({
    id: `R_${resolucionNumero}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    origen: 'resolucion',
    resolucionNumero,
    concepto,
    monto: Number(monto) || 0,
    pagado: false
  });
  guardarFinanzasJugadoresLocal(finanzasJugadoresActual);
}

/* ──────────────────────────────────────────────
   ACCIONES (abonos de equipo y pago de jugador)
   ────────────────────────────────────────────── */

async function guardarAbono(equipo) {
  const monto = parseFloat(document.getElementById('fin-abono-monto')?.value || 0);
  const fecha = document.getElementById('fin-abono-fecha')?.value || _hoyISO();
  if (!monto || monto <= 0) { mostrarError('Ingresa un monto válido para el abono.'); return; }

  const eq = calcularFinanzasEquipos().find(e => e.equipo === equipo);
  if (eq && monto > eq.saldo) {
    mostrarError(`El saldo pendiente de ${equipo} es ${_formatoMoneda(eq.saldo)}. No puedes abonar más que eso.`);
    return;
  }

  let fin = finanzasEquiposActual.find(f => f.equipo === equipo);
  if (!fin) { fin = { equipo, abonos: [] }; finanzasEquiposActual.push(fin); }
  fin.abonos.push({ id: `A_${Date.now()}`, monto, fecha });

  mostrarCarga('Guardando abono...');
  try {
    guardarFinanzasEquiposLocal(finanzasEquiposActual);
    await _sincronizarFinanzasSheets();
    mostrarExito('✅ Abono registrado');
  } catch (err) {
    mostrarError('No se pudo guardar el abono: ' + err.message);
  } finally {
    ocultarCarga();
    renderizarEquipos();
  }
}

async function eliminarAbono(equipo, abonoId) {
  const fin = finanzasEquiposActual.find(f => f.equipo === equipo);
  if (!fin) return;
  const ok = await confirmarAccion({
    titulo: 'Eliminar abono',
    mensaje: '¿Eliminar este abono? Esta acción no se puede deshacer.',
    textoConfirmar: 'Eliminar'
  });
  if (!ok) return;

  fin.abonos = fin.abonos.filter(a => a.id !== abonoId);

  mostrarCarga('Eliminando abono...');
  try {
    guardarFinanzasEquiposLocal(finanzasEquiposActual);
    await _sincronizarFinanzasSheets();
  } catch (err) {
    mostrarError('No se pudo eliminar el abono: ' + err.message);
  } finally {
    ocultarCarga();
    renderizarEquipos();
  }
}

/* Marca/desmarca un cargo puntual como pagado (tarjetas o resolución: ambos son
   ya un simple booleano con monto fijo). Se dispara directamente al tocar el
   pill de estado (sin botón aparte al lado). */
async function toggleCargoJugador(jugadorId, cargoId) {
  const jugador = jugadoresActual.find(j => j.id === jugadorId);
  if (!jugador || !torneoActual) return;

  mostrarCarga('Actualizando pago...');
  try {
    const entrada = _obtenerEntradaFinanzasJugador(jugadorId, false);
    const cargo = entrada?.cargos.find(c => c.id === cargoId);
    if (!cargo) return;
    cargo.pagado = !cargo.pagado;

    guardarFinanzasJugadoresLocal(finanzasJugadoresActual);
    await _sincronizarFinanzasSheets();
  } catch (err) {
    mostrarError('No se pudo actualizar el pago: ' + err.message);
  } finally {
    ocultarCarga();
    renderizarEquipos();
    _refrescarModalJugadorSiAbierto(jugadorId);
  }
}

/* Diálogo de 2 opciones para cuando editar las tarjetas de un partido sube el
   cobro de ese partido y todavía queda un pendiente sin pagar. "Sumar" cobra
   todas las tarjetas de ese partido sumadas (amarillas + roja); "Descartar"
   cobra solo la roja, descartando la(s) amarilla(s) de ese mismo partido.
   Devuelve 'sumar' | 'descartar' | null (canceló, no se guarda el cambio). */
function confirmarAjusteCobroTarjetas(nombreJugador, montoAntes, montoDespues) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-panel" role="alertdialog" aria-modal="true" aria-labelledby="cat-titulo">
        <h3 class="confirm-titulo" id="cat-titulo">El cobro de ${nombreJugador} sube</h3>
        <p class="confirm-mensaje">
          Este partido ya tenía un cobro pendiente de ${_formatoMoneda(montoAntes)}. Con el cambio subiría a
          ${_formatoMoneda(montoDespues)} si se suman todas las tarjetas. ¿Qué preferís cobrar?
        </p>
        <div class="confirm-acciones">
          <button class="btn-secundario" id="cat-btn-cancelar">Cancelar</button>
          <button class="btn-secundario" id="cat-btn-descartar">Solo la roja (descartar amarilla)</button>
          <button class="btn-principal"  id="cat-btn-sumar">Sumar todas las tarjetas</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const cerrar = (resultado) => {
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      resolve(resultado);
    };
    const onKeydown = (e) => { if (e.key === 'Escape') cerrar(null); };

    overlay.querySelector('#cat-btn-cancelar').onclick  = () => cerrar(null);
    overlay.querySelector('#cat-btn-descartar').onclick = () => cerrar('descartar');
    overlay.querySelector('#cat-btn-sumar').onclick     = () => cerrar('sumar');
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(null); });
    document.addEventListener('keydown', onKeydown);

    overlay.querySelector('#cat-btn-sumar')?.focus();
  });
}

/* ──────────────────────────────────────────────
   SYNC CON GOOGLE SHEETS
   ────────────────────────────────────────────── */

async function _sincronizarFinanzasSheets() {
  const sheetId = torneoActual?.sheetId;
  if (!sheetId) return;

  const filasEquipos = [['Equipo', 'Monto', 'Fecha']];
  finanzasEquiposActual.forEach(f => {
    f.abonos.forEach(a => filasEquipos.push([f.equipo, a.monto, a.fecha]));
  });
  await limpiarYEscribir(sheetId, 'Finanzas_Equipos', filasEquipos);

  const filasJugadores = [['Jugador', 'Equipo', 'Origen', 'Concepto', 'Monto', 'Pagado']];
  calcularFinanzasJugadores().forEach(c => {
    filasJugadores.push([c.jugador, c.equipo, c.origen, c.concepto, c.monto, c.pagado ? 'Sí' : 'No']);
  });
  await limpiarYEscribir(sheetId, 'Finanzas_Jugadores', filasJugadores);
}

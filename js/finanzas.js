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
   - origen 'tarjetas': UNO POR PARTIDO (id T_<statId>, 1 a 1 con la fila de
     statsActual de ese jugador en esa jornada). Cada fila tiene su propio
     monto y su propio Pagado/Pendiente — no es un total agregado del jugador.
     Una vez Pagado, el cargo queda bloqueado: no se recalcula más (ver
     _cargoTarjetasEstaPagado, usado por equipos.js para deshabilitar la
     edición de amarillas/rojas y el borrado de esa fila de stats).
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

  // Limpieza de huérfanos: cargos de tarjetas cuyo partido (statId) ya no
  // existe en statsActual — restos de pruebas/ediciones de versiones
  // anteriores que nunca se borraron solos. Se corre para TODOS los
  // jugadores, incluso los que ya no tienen ninguna estadística registrada,
  // así no quedan "cobros fantasma" sin ningún partido real detrás.
  finanzasJugadoresActual.forEach(entrada => {
    const antes = entrada.cargos.length;
    entrada.cargos = entrada.cargos.filter(c => {
      if (c.origen !== 'tarjetas' || !c.statId) return true; // no es de tarjetas, o es legacy sin statId (se migra más abajo)
      return statsActual.some(s => s.id === c.statId);
    });
    if (entrada.cargos.length !== antes) cambiado = true;
  });

  jugadoresActual.forEach(jugador => {
    const entradasStats    = statsActual.filter(s => s.equipo === jugador.equipo && s.jugador === jugador.nombre);
    const entradaExistente = finanzasJugadoresActual.find(f => f.jugadorId === jugador.id);
    const tieneLegacy      = entradaExistente?.cargos.some(c => c.origen === 'tarjetas' && !c.statId);
    if (entradasStats.length === 0 && !tieneLegacy) return; // nada que hacer para este jugador

    const entrada = _obtenerEntradaFinanzasJugador(jugador.id, true);

    // Consolida duplicados de un modelo anterior (más de una fila para el
    // mismo partido, ej. T_<statId> y T_<statId>_2): un solo cargo por
    // partido, pagado solo si TODas las filas viejas ya lo estaban.
    const porStatId = {};
    entrada.cargos.filter(c => c.origen === 'tarjetas' && c.statId).forEach(c => {
      (porStatId[c.statId] = porStatId[c.statId] || []).push(c);
    });
    Object.values(porStatId).forEach(filas => {
      if (filas.length <= 1) return;
      const montoTotal = filas.reduce((s, c) => s + (Number(c.monto) || 0), 0);
      const pagado = filas.every(c => c.pagado);
      const base = filas[0];
      entrada.cargos = entrada.cargos.filter(c => !filas.includes(c));
      entrada.cargos.push({ ...base, id: `T_${base.statId}`, monto: montoTotal, pagado });
      cambiado = true;
    });

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
          fecha: _etiquetaPartidoTarjetas(s),
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

/* Fee de UNA entrada de stats (un partido), a partir SOLO de los datos de ese
   partido — nunca acumulado con otros. Si hay roja de cualquier tipo (directa,
   ingresada en el campo "Rojas", o por conversión de 2 amarillas) se cobra
   ÚNICAMENTE el precio de la roja — las amarillas de ese mismo partido no se
   cobran aparte. Solo se cobran las amarillas cuando NO hay ninguna roja. */
function _feeEstandarEntrada(s, precioAmarilla, precioRoja) {
  const amarillas = Number(s.amarillas) || 0;
  const rojas     = Number(s.rojas) || 0;
  if (rojas > 0 || amarillas >= 2) return precioRoja;
  return amarillas * precioAmarilla;
}

/* Etiqueta de partido para el concepto del cargo — misma convención "J{n}"
   que ya usa la tabla "Goles y tarjetas por partido". */
function _etiquetaPartidoTarjetas(s) {
  return `J${s.jornada}`;
}

/* Reconcilia el cobro de tarjetas de UN partido con las nuevas cantidades de
   amarillas/rojas (una sola fila por partido, id T_<statId>):
   - Si el cargo de ese partido ya está Pagado: NO se toca (la UI debe impedir
     llegar acá deshabilitando la edición de amarillas/rojas de esa fila).
   - Si está Pendiente o no existe: se (re)calcula libremente con la fórmula
     de arriba, sin preguntar nada. Si el fee da 0, se borra la fila. */
function _sincronizarCargoTarjetasEntrada(jugador, statId, amarillasNuevas, rojasNuevas) {
  if (!torneoActual) return;
  const precioAmarilla = Number(torneoActual.precioAmarilla) || 0;
  const precioRoja     = Number(torneoActual.precioRoja) || 0;
  const fee = _feeEstandarEntrada({ amarillas: amarillasNuevas, rojas: rojasNuevas }, precioAmarilla, precioRoja);

  const entrada = _obtenerEntradaFinanzasJugador(jugador.id, true);
  const cargo   = entrada.cargos.find(c => c.origen === 'tarjetas' && c.statId === statId);
  if (cargo?.pagado) return; // cerrado: no se modifica

  const s = statsActual.find(x => x.id === statId);
  const etiqueta = s ? _etiquetaPartidoTarjetas(s) : '';

  if (fee <= 0) {
    if (cargo) entrada.cargos = entrada.cargos.filter(c => c !== cargo);
  } else if (cargo) {
    cargo.monto = fee;
    cargo.amarillas = amarillasNuevas;
    cargo.rojas = rojasNuevas;
    cargo.fecha = etiqueta;
  } else {
    entrada.cargos.push({
      id: `T_${statId}`,
      origen: 'tarjetas',
      statId,
      amarillas: amarillasNuevas,
      rojas: rojasNuevas,
      fecha: etiqueta,
      monto: fee,
      pagado: false
    });
  }

  guardarFinanzasJugadoresLocal(finanzasJugadoresActual);
}

/* ¿El cargo de tarjetas de ESTE partido específico ya está pagado? Se usa para
   bloquear la edición de amarillas/rojas y el borrado de esa fila de stats. */
function _cargoTarjetasEstaPagado(statId) {
  for (const entrada of finanzasJugadoresActual) {
    const c = entrada.cargos.find(x => x.origen === 'tarjetas' && x.statId === statId);
    if (c) return !!c.pagado;
  }
  return false;
}

function _cargosTarjetasDeJugador(jugador) {
  const entrada = finanzasJugadoresActual.find(f => f.jugadorId === jugador.id);
  if (!entrada) return [];
  return entrada.cargos
    .filter(c => c.origen === 'tarjetas')
    .map(c => {
      const s = statsActual.find(x => x.id === c.statId);
      return {
        cargoId:      c.id,
        origen:       'tarjetas',
        jugadorId:    jugador.id,
        jugador:      jugador.nombre,
        equipo:       jugador.equipo,
        numeroCamisa: jugador.numeroCamisa,
        concepto:     `${c.fecha || ''} · ${_textoCargos(c.amarillas || 0, c.rojas || 0)}`,
        monto:        Number(c.monto) || 0,
        pagado:       !!c.pagado,
        _jornada:     s ? Number(s.jornada) || 0 : 0
      };
    })
    .sort((a, b) => a._jornada - b._jornada);
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

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
   - origen 'tarjetas': uno solo por jugador, id determinístico T_<jugadorId>.
     Su monto siempre se recalcula en vivo desde statsActual (nunca se guarda fijo);
     lo que se guarda es "montoCubierto" (el monto que había cuando se marcó pagado),
     así que si después se le carga otra tarjeta, vuelve a verse "pendiente" solo.
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

function _obtenerEntradaFinanzasJugador(jugadorId, crear) {
  let entrada = finanzasJugadoresActual.find(f => f.jugadorId === jugadorId);
  if (!entrada && crear) {
    entrada = { jugadorId, cargos: [] };
    finanzasJugadoresActual.push(entrada);
  }
  return entrada;
}

/* Monto de tarjetas a partir de una lista de entradas de stats ya filtrada,
   partido por partido: si en un mismo partido llegó a 2 amarillas (expulsión
   por doble amarilla) se cobra solo el precio de la roja, sin sumar además
   el precio de esas 2 amarillas — la expulsión ya "absorbe" la sanción. Una
   roja directa (sin 2 amarillas en esa misma entrada) sí se cobra aparte de
   cualquier amarilla suelta de otro partido. Se necesitan las entradas por
   separado (no el total agregado) para saber cuáles amarillas coincidieron
   con cuál roja. Recibe las entradas ya armadas (en vez de leerlas siempre de
   statsActual) para poder simular "¿cuánto quedaría si edito esta entrada?"
   antes de guardar el cambio. */
function _calcularMontoTarjetas(entradas, precioAmarilla, precioRoja) {
  let totalAmarillas = 0, totalRojas = 0, monto = 0;
  entradas.forEach(s => {
    const am = Number(s.amarillas) || 0;
    const ro = Number(s.rojas) || 0;
    totalAmarillas += am;
    totalRojas += ro;
    monto += am >= 2 ? precioRoja : (am * precioAmarilla + ro * precioRoja);
  });
  return { monto, totalAmarillas, totalRojas };
}

function _montoTarjetasDeJugador(jugador) {
  const precioAmarilla = Number(torneoActual?.precioAmarilla) || 0;
  const precioRoja     = Number(torneoActual?.precioRoja) || 0;
  const entradas = statsActual.filter(s => s.equipo === jugador.equipo && s.jugador === jugador.nombre);
  return _calcularMontoTarjetas(entradas, precioAmarilla, precioRoja);
}

function _cargoTarjetasDeJugador(jugador) {
  if (!torneoActual) return null;
  const { monto, totalAmarillas, totalRojas } = _montoTarjetasDeJugador(jugador);
  if (monto <= 0) return null;

  const entrada = finanzasJugadoresActual.find(f => f.jugadorId === jugador.id);
  const cargoGuardado = entrada?.cargos.find(c => c.origen === 'tarjetas');
  const montoCubierto = cargoGuardado ? Number(cargoGuardado.montoCubierto) || 0 : 0;

  return {
    cargoId:      `T_${jugador.id}`,
    origen:       'tarjetas',
    jugadorId:    jugador.id,
    jugador:      jugador.nombre,
    equipo:       jugador.equipo,
    numeroCamisa: jugador.numeroCamisa,
    concepto:     _textoCargos(totalAmarillas, totalRojas),
    monto,
    pagado: montoCubierto >= monto
  };
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
      const cTarjetas = _cargoTarjetasDeJugador(j);
      if (cTarjetas) cargos.push(cTarjetas);
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

/* Marca/desmarca un cargo puntual como pagado. Se dispara directamente al tocar
   el pill de estado (sin botón aparte al lado).
   - Cargos de tarjetas: se guarda el monto cubierto (no un booleano), para que si
     después se le carga otra tarjeta, vuelva a verse "pendiente" solo.
   - Cargos de resolución: booleano simple, el monto ya quedó fijo al publicar. */
async function toggleCargoJugador(jugadorId, cargoId) {
  const jugador = jugadoresActual.find(j => j.id === jugadorId);
  if (!jugador || !torneoActual) return;

  mostrarCarga('Actualizando pago...');
  try {
    if (cargoId.startsWith('T_')) {
      const { monto } = _montoTarjetasDeJugador(jugador);

      const entrada = _obtenerEntradaFinanzasJugador(jugadorId, true);
      let cargo = entrada.cargos.find(c => c.origen === 'tarjetas');
      const yaPagado = !!cargo && Number(cargo.montoCubierto) >= monto && monto > 0;
      if (!cargo) { cargo = { id: cargoId, origen: 'tarjetas', montoCubierto: 0 }; entrada.cargos.push(cargo); }
      cargo.montoCubierto = yaPagado ? 0 : monto;
    } else {
      const entrada = _obtenerEntradaFinanzasJugador(jugadorId, false);
      const cargo = entrada?.cargos.find(c => c.id === cargoId);
      if (!cargo) return;
      cargo.pagado = !cargo.pagado;
    }

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

/* Diálogo de 3 opciones para cuando editar una tarjeta cambia el cobro de un
   jugador que ya tenía un pago registrado para ese cargo. "Sumar" deja el pago
   tal cual (se sigue contando a favor del monto nuevo, igual que hoy); "Descartar"
   resetea lo cubierto a $0, así el monto nuevo completo vuelve a verse pendiente.
   Devuelve 'sumar' | 'descartar' | null (canceló). */
function confirmarAjusteCobroTarjetas(nombreJugador, montoAntes, montoDespues) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-panel" role="alertdialog" aria-modal="true" aria-labelledby="cat-titulo">
        <h3 class="confirm-titulo" id="cat-titulo">El cobro de ${nombreJugador} cambia</h3>
        <p class="confirm-mensaje">
          Este jugador ya tenía un pago registrado por tarjetas. Editar esta entrada cambia su cobro
          de ${_formatoMoneda(montoAntes)} a ${_formatoMoneda(montoDespues)}. ¿Qué hacemos con el pago ya registrado?
        </p>
        <div class="confirm-acciones">
          <button class="btn-secundario" id="cat-btn-cancelar">Cancelar</button>
          <button class="btn-secundario" id="cat-btn-descartar">Descartar el pago anterior</button>
          <button class="btn-principal"  id="cat-btn-sumar">Mantenerlo (sumar la diferencia)</button>
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

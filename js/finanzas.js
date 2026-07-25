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

/* Jugadores con al menos una tarjeta cargada, con su monto total (amarillas+rojas)
   y si ese monto ya está cubierto (comparando contra el "montoCubierto" guardado). */
function calcularFinanzasJugadores(equipoFiltro) {
  if (!torneoActual) return [];
  const precioAmarilla = Number(torneoActual.precioAmarilla) || 0;
  const precioRoja     = Number(torneoActual.precioRoja) || 0;

  return jugadoresActual
    .filter(j => !equipoFiltro || j.equipo === equipoFiltro)
    .map(j => {
      const st = _statsJugador(j.equipo, j.nombre);
      return { jugador: j, st, monto: st.amarillas * precioAmarilla + st.rojas * precioRoja };
    })
    .filter(({ st }) => st.amarillas > 0 || st.rojas > 0)
    .map(({ jugador, st, monto }) => {
      const finJ = finanzasJugadoresActual.find(f => f.jugadorId === jugador.id);
      const montoCubierto = finJ ? Number(finJ.montoCubierto) || 0 : 0;
      return {
        jugadorId:    jugador.id,
        jugador:      jugador.nombre,
        equipo:       jugador.equipo,
        numeroCamisa: jugador.numeroCamisa,
        cargosTexto:  _textoCargos(st.amarillas, st.rojas),
        monto,
        pagado: monto > 0 && montoCubierto >= monto
      };
    })
    .sort((a, b) => b.monto - a.monto);
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

/* Marca/desmarca a un jugador como pagado. Guarda el total cubierto (no un booleano)
   para que, si después se le carga otra tarjeta, vuelva a verse "No pagado" solo.
   Se dispara directamente al tocar el badge de estado (sin botón aparte). */
async function toggleJugadorPagado(jugadorId) {
  const jugador = jugadoresActual.find(j => j.id === jugadorId);
  if (!jugador || !torneoActual) return;

  const st = _statsJugador(jugador.equipo, jugador.nombre);
  const monto = st.amarillas * (Number(torneoActual.precioAmarilla) || 0) + st.rojas * (Number(torneoActual.precioRoja) || 0);

  let entrada = finanzasJugadoresActual.find(f => f.jugadorId === jugadorId);
  const yaPagado = !!entrada && Number(entrada.montoCubierto) >= monto && monto > 0;

  if (!entrada) {
    entrada = { jugadorId, montoCubierto: 0 };
    finanzasJugadoresActual.push(entrada);
  }
  entrada.montoCubierto = yaPagado ? 0 : monto;

  mostrarCarga('Actualizando pago...');
  try {
    guardarFinanzasJugadoresLocal(finanzasJugadoresActual);
    await _sincronizarFinanzasSheets();
  } catch (err) {
    mostrarError('No se pudo actualizar el pago: ' + err.message);
  } finally {
    ocultarCarga();
    renderizarEquipos();
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

  const filasJugadores = [['Jugador', 'Equipo', 'MontoCubierto']];
  finanzasJugadoresActual.forEach(f => {
    const jugador = jugadoresActual.find(j => j.id === f.jugadorId);
    if (jugador) filasJugadores.push([jugador.nombre, jugador.equipo, f.montoCubierto]);
  });
  await limpiarYEscribir(sheetId, 'Finanzas_Jugadores', filasJugadores);
}

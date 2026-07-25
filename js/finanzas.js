/* =============================================
   finanzas.js – Inscripción por equipo y multas por tarjeta
   ============================================= */

let _equipoFinanzasSeleccionado = null; // equipo actualmente mostrado en el detalle

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
   RENDERIZADO
   ────────────────────────────────────────────── */

function renderizarFinanzas() {
  if (!torneoActual) return;

  const eqs  = calcularFinanzasEquipos();
  const jugs = calcularFinanzasJugadores();

  const recaudado  = eqs.reduce((s, e) => s + e.abonado, 0) + jugs.filter(j => j.pagado).reduce((s, j) => s + j.monto, 0);
  const pendiente  = eqs.reduce((s, e) => s + e.saldo, 0) + jugs.filter(j => !j.pagado).reduce((s, j) => s + j.monto, 0);

  _setText('fin-recaudado', _formatoMoneda(recaudado));
  _setText('fin-pendiente', _formatoMoneda(pendiente));
  _setText('fin-equipos-pendientes', eqs.filter(e => e.saldo > 0).length);
  _setText('fin-jugadores-pendientes', jugs.filter(j => !j.pagado).length);

  const cont = document.getElementById('tabla-finanzas-equipos-container');
  if (!cont) return;

  if (eqs.length === 0) {
    cont.innerHTML = '<p class="sin-datos">Crea un torneo para ver Finanzas.</p>';
    return;
  }

  const filas = eqs.map(e => {
    const claseSaldo = e.saldo > 0 ? 'dg-negativo' : 'dg-positivo';
    const equipoJs = e.equipo.replace(/'/g, "\\'");
    return `
      <tr>
        <td class="col-equipo">${e.equipo}</td>
        <td>${_formatoMoneda(e.inscripcion)}</td>
        <td>${_formatoMoneda(e.abonado)}</td>
        <td class="${claseSaldo}">${_formatoMoneda(e.saldo)}</td>
        <td>${_badgeEstado(e.estado)}</td>
        <td class="col-acciones">
          <button class="btn-secundario btn-xs" onclick="seleccionarEquipoFinanzas('${equipoJs}')" title="Ver detalle">
            <i class="bi bi-eye-fill"></i>
          </button>
        </td>
      </tr>`;
  }).join('');

  cont.innerHTML = `
    <div id="tabla-finanzas-equipos" class="tabla-wrapper">
      <table class="tabla-datos">
        <thead>
          <tr>
            <th class="col-equipo">Equipo</th>
            <th>Inscripción</th>
            <th>Abonado</th>
            <th>Saldo</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  `;

  // Si había un equipo seleccionado, refrescar su detalle con los datos nuevos
  if (_equipoFinanzasSeleccionado) renderizarDetalleEquipoFinanzas(_equipoFinanzasSeleccionado);
}

/* Abre (o refresca) el panel de detalle de un equipo: inscripción, abonos y sus jugadores */
function seleccionarEquipoFinanzas(equipo) {
  _equipoFinanzasSeleccionado = equipo;
  renderizarDetalleEquipoFinanzas(equipo);
}

function cerrarDetalleEquipoFinanzas() {
  _equipoFinanzasSeleccionado = null;
  document.getElementById('finanzas-detalle-equipo')?.classList.add('oculto');
}

function renderizarDetalleEquipoFinanzas(equipo) {
  const cont = document.getElementById('finanzas-detalle-equipo');
  if (!cont) return;

  const eq = calcularFinanzasEquipos().find(e => e.equipo === equipo);
  if (!eq) { cont.classList.add('oculto'); return; }

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

  const jugadoresEquipo = calcularFinanzasJugadores(equipo);
  const filasJugadores = jugadoresEquipo.map(j => `
    <tr>
      <td class="col-camisa">${j.numeroCamisa || '–'}</td>
      <td><strong>${j.jugador}</strong></td>
      <td>${j.cargosTexto}</td>
      <td class="col-num">${_formatoMoneda(j.monto)}</td>
      <td>${_badgeEstado(j.pagado ? 'Pagado' : 'Pendiente')}</td>
      <td class="col-acciones">
        <button class="btn-secundario btn-xs" onclick="toggleJugadorPagado('${j.jugadorId}')" title="${j.pagado ? 'Marcar como no pagado' : 'Marcar como pagado'}">
          <i class="bi bi-arrow-repeat"></i>
        </button>
      </td>
    </tr>
  `).join('');

  cont.classList.remove('oculto');
  cont.innerHTML = `
    <div class="seccion-header">
      <h3><i class="bi bi-shield-fill"></i> ${equipo}</h3>
      <button class="btn-secundario btn-pequeño" onclick="cerrarDetalleEquipoFinanzas()"><i class="bi bi-x-lg"></i> Cerrar</button>
    </div>

    <div class="cards-grid" style="margin-bottom:1rem">
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

    <h4 style="font-size:.85rem;margin-bottom:.5rem;font-weight:700">Historial de abonos</h4>
    <div class="historial-container" style="margin-bottom:1.5rem">${filasAbonos}</div>

    <h4 style="font-size:.85rem;margin-bottom:.5rem;font-weight:700"><i class="bi bi-people-fill"></i> Jugadores con tarjetas</h4>
    ${jugadoresEquipo.length === 0 ? '<p class="sin-datos">Sin tarjetas registradas para este equipo.</p>' : `
      <div class="tabla-wrapper">
        <table class="tabla-datos tabla-compacta">
          <thead><tr><th>#</th><th>Jugador</th><th>Cargos</th><th>Monto</th><th>Estado</th><th></th></tr></thead>
          <tbody>${filasJugadores}</tbody>
        </table>
      </div>
    `}
  `;
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
    renderizarFinanzas();
    seleccionarEquipoFinanzas(equipo);
  } catch (err) {
    mostrarError('No se pudo guardar el abono: ' + err.message);
  } finally {
    ocultarCarga();
  }
}

async function eliminarAbono(equipo, abonoId) {
  const fin = finanzasEquiposActual.find(f => f.equipo === equipo);
  if (!fin) return;
  if (!confirm('¿Eliminar este abono?')) return;

  fin.abonos = fin.abonos.filter(a => a.id !== abonoId);

  mostrarCarga('Eliminando abono...');
  try {
    guardarFinanzasEquiposLocal(finanzasEquiposActual);
    await _sincronizarFinanzasSheets();
    renderizarFinanzas();
    seleccionarEquipoFinanzas(equipo);
  } catch (err) {
    mostrarError('No se pudo eliminar el abono: ' + err.message);
  } finally {
    ocultarCarga();
  }
}

/* Marca/desmarca a un jugador como pagado. Guarda el total cubierto (no un booleano)
   para que, si después se le carga otra tarjeta, vuelva a verse "No pagado" solo. */
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
    renderizarFinanzas();
  } catch (err) {
    mostrarError('No se pudo actualizar el pago: ' + err.message);
  } finally {
    ocultarCarga();
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

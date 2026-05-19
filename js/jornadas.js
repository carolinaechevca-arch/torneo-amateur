/* =============================================
   jornadas.js – Calendario de partidos (fecha, hora y cancha)
   ============================================= */

/* Renderiza el calendario editable con todos los partidos agrupados por jornada */
function renderizarCalendario() {
  const cont = document.getElementById('calendario-jornadas');
  if (!cont || !torneoActual || !fixtureActual.length) {
    if (cont) cont.innerHTML = '<p class="sin-datos">Crea un torneo para ver el calendario.</p>';
    return;
  }

  const jornadas = [...new Set(fixtureActual.map(p => p.jornada))].sort((a, b) => a - b);

  cont.innerHTML = jornadas.map(j => {
    const partidos = fixtureActual.filter(p => p.jornada === j);

    const filaPartidos = partidos.map(p => {
      const h = horariosActual.find(h => h.partidoId === p.id) || {};
      return `
        <div class="jornada-partido-fila">
          <div class="partido-vs-mini">
            <span class="equipo-mini">${p.local}</span>
            <span class="vs-mini">vs</span>
            <span class="equipo-mini">${p.visitante}</span>
          </div>
          <div class="horario-inputs">
            <div class="horario-campo">
              <label>📅 Fecha</label>
              <input type="date" id="fecha-${p.id}" value="${h.fecha || ''}"
                     class="input-horario">
            </div>
            <div class="horario-campo">
              <label>🕐 Hora</label>
              <input type="time" id="hora-${p.id}" value="${h.hora || ''}"
                     class="input-horario">
            </div>
            <div class="horario-campo horario-cancha">
              <label>🏟️ Cancha</label>
              <input type="text" id="cancha-${p.id}" value="${h.cancha || ''}"
                     placeholder="Nombre de la cancha" maxlength="50"
                     class="input-horario">
            </div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="jornada-bloque">
        <div class="jornada-bloque-header">
          <span class="jornada-num">Jornada ${j}</span>
          <span class="jornada-partidos-count">${partidos.length} partido${partidos.length > 1 ? 's' : ''}</span>
        </div>
        ${filaPartidos}
      </div>
    `;
  }).join('');
}

/* Recoge todos los horarios del formulario y los guarda en localStorage y Sheets */
async function guardarJornadas() {
  const nuevosHorarios = [];

  fixtureActual.forEach(p => {
    const fecha  = document.getElementById(`fecha-${p.id}`)?.value  || '';
    const hora   = document.getElementById(`hora-${p.id}`)?.value   || '';
    const cancha = document.getElementById(`cancha-${p.id}`)?.value?.trim() || '';

    // Solo guardar si hay al menos un campo completado
    if (fecha || hora || cancha) {
      nuevosHorarios.push({ partidoId: p.id, jornada: p.jornada, fecha, hora, cancha });
    }
  });

  mostrarCarga('Guardando calendario...');
  try {
    horariosActual = nuevosHorarios;
    guardarHorariosLocal(horariosActual);

    // Sincronizar con Sheets
    if (torneoActual?.sheetId) {
      await _sincronizarJornadasSheets();
    }

    mostrarExito('✅ Calendario guardado correctamente');
    renderizarInicio(); // actualizar próximos partidos en inicio

  } catch (err) {
    mostrarError('No se pudo guardar el calendario: ' + err.message);
  } finally {
    ocultarCarga();
  }
}

/* Escribe los horarios en la hoja "Jornadas" del spreadsheet */
async function _sincronizarJornadasSheets() {
  const sheetId = torneoActual?.sheetId;
  if (!sheetId) return;

  const filas = [
    ['Jornada', 'Partido', 'Local', 'Visitante', 'Fecha', 'Hora', 'Cancha'],
    ...horariosActual.map(h => {
      const p = fixtureActual.find(fp => fp.id === h.partidoId);
      return [
        h.jornada,
        h.partidoId,
        p?.local     || '',
        p?.visitante || '',
        h.fecha,
        h.hora,
        h.cancha
      ];
    })
  ];

  await limpiarYEscribir(sheetId, 'Jornadas', filas);
}

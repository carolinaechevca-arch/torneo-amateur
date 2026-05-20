/* =============================================
   torneo.js – Gestión central del torneo
   ============================================= */

// Claves de localStorage
const LS_TORNEO    = 'ta_torneo';
const LS_FIXTURE   = 'ta_fixture';
const LS_STATS     = 'ta_stats';
const LS_HORARIOS  = 'ta_horarios';
const LS_JUGADORES = 'ta_jugadores';
const LS_HISTORIAL = 'ta_historial';

// Estado global de la aplicación
let torneoActual    = null;  // { sheetId, nombre, equipos, modalidad }
let fixtureActual   = [];    // array de partidos con resultados
let statsActual     = [];    // array de estadísticas de jugadores
let horariosActual  = [];    // array de horarios de partidos
let jugadoresActual = [];    // array de jugadores { id, equipo, nombre, cedula, celular }
let historialActual = [];    // array de cambios en resultados
let jornadaViendo   = 1;     // jornada actualmente visible en Resultados

/* ──────────────────────────────────────────────
   PERSISTENCIA LOCAL
   ────────────────────────────────────────────── */

function guardarTorneoLocal(datos) {
  localStorage.setItem(LS_TORNEO, JSON.stringify(datos));
}

function cargarTorneoLocal() {
  try {
    return JSON.parse(localStorage.getItem(LS_TORNEO) || 'null');
  } catch (_) { return null; }
}

function borrarTorneoLocal() {
  [LS_TORNEO, LS_FIXTURE, LS_STATS, LS_HORARIOS, LS_JUGADORES, LS_HISTORIAL].forEach(k => localStorage.removeItem(k));
}

function guardarFixtureLocal(fixture) {
  localStorage.setItem(LS_FIXTURE, JSON.stringify(fixture));
}

function cargarFixtureLocal() {
  try {
    return JSON.parse(localStorage.getItem(LS_FIXTURE) || '[]');
  } catch (_) { return []; }
}

function guardarStatsLocal(stats) {
  localStorage.setItem(LS_STATS, JSON.stringify(stats));
}

function cargarStatsLocal() {
  try {
    return JSON.parse(localStorage.getItem(LS_STATS) || '[]');
  } catch (_) { return []; }
}

function guardarHorariosLocal(horarios) {
  localStorage.setItem(LS_HORARIOS, JSON.stringify(horarios));
}

function cargarHorariosLocal() {
  try {
    return JSON.parse(localStorage.getItem(LS_HORARIOS) || '[]');
  } catch (_) { return []; }
}

function guardarJugadoresLocal(j) { localStorage.setItem(LS_JUGADORES, JSON.stringify(j)); }
function cargarJugadoresLocal()   { try { return JSON.parse(localStorage.getItem(LS_JUGADORES) || '[]'); } catch (_) { return []; } }
function guardarHistorialLocal(h) { localStorage.setItem(LS_HISTORIAL, JSON.stringify(h)); }
function cargarHistorialLocal()   { try { return JSON.parse(localStorage.getItem(LS_HISTORIAL) || '[]'); } catch (_) { return []; } }

/* ──────────────────────────────────────────────
   CARGA INICIAL DE LA APP
   ────────────────────────────────────────────── */

function cargarDatosApp() {
  torneoActual    = cargarTorneoLocal();
  fixtureActual   = cargarFixtureLocal();
  statsActual     = cargarStatsLocal();
  horariosActual  = cargarHorariosLocal();
  jugadoresActual = cargarJugadoresLocal();
  historialActual = cargarHistorialLocal();

  if (!torneoActual) return;

  // Actualizar encabezado
  const el = document.getElementById('header-titulo-torneo');
  if (el) el.textContent = torneoActual.nombre;

  // Renderizar cada sección
  renderizarInicio();
  renderizarPosiciones();
  renderizarEstadisticas();
  renderizarCalendario();
  renderizarHistorial();
  _poblarEquiposJugadores();

  // Jornada actual: primera con partidos pendientes
  jornadaViendo = calcularJornadaActual();
  renderizarResultados(jornadaViendo);

  // Link a Google Sheets
  const link = document.getElementById('link-sheet');
  const info = document.getElementById('link-sheet-info');
  if (link && torneoActual.sheetId) {
    link.href = `https://docs.google.com/spreadsheets/d/${torneoActual.sheetId}`;
    link.classList.remove('oculto');
    if (info) info.classList.add('oculto');
  }
}

/* ──────────────────────────────────────────────
   FORMULARIO DE NUEVO TORNEO
   ────────────────────────────────────────────── */

/* Actualiza dinámicamente los inputs de nombre de equipo */
function actualizarCamposEquipos() {
  const n = parseInt(document.getElementById('num-equipos')?.value || 8);
  const contenedor = document.getElementById('campos-equipos');
  if (!contenedor) return;

  contenedor.innerHTML = '';

  // Aviso si el número es impar
  const aviso = document.getElementById('aviso-impar');
  if (aviso) aviso.remove();
  if (n % 2 !== 0) {
    const nota = document.createElement('p');
    nota.id = 'aviso-impar';
    nota.className = 'info-texto';
    nota.style.gridColumn = '1 / -1';
    nota.innerHTML = '⚠️ Con número impar de equipos, uno descansa por jornada (se indica en el fixture).';
    contenedor.appendChild(nota);
  }

  for (let i = 1; i <= n; i++) {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = `Equipo ${i}`;
    input.id = `equipo-${i}`;
    input.maxLength = 30;
    contenedor.appendChild(input);
  }
}

/* Crea el torneo: genera fixture, crea la hoja en Drive y guarda en localStorage */
async function crearTorneo() {
  const nombre = document.getElementById('torneo-nombre')?.value.trim();
  const numEquipos = parseInt(document.getElementById('num-equipos')?.value || 8);
  const modalidad  = document.getElementById('modalidad')?.value || 'ida';

  // Validar nombre
  if (!nombre) {
    mostrarError('Por favor ingresa el nombre del torneo.');
    document.getElementById('torneo-nombre')?.focus();
    return;
  }

  // Recoger nombres de equipos
  const equipos = [];
  for (let i = 1; i <= numEquipos; i++) {
    const v = document.getElementById(`equipo-${i}`)?.value.trim();
    if (!v) {
      mostrarError(`Por favor ingresa el nombre del Equipo ${i}.`);
      document.getElementById(`equipo-${i}`)?.focus();
      return;
    }
    if (equipos.includes(v)) {
      mostrarError(`El nombre "${v}" está repetido. Cada equipo debe tener un nombre único.`);
      return;
    }
    equipos.push(v);
  }

  // Mostrar estado de carga
  const btnTexto   = document.getElementById('btn-crear-texto');
  const btnCargand = document.getElementById('btn-crear-cargando');
  const btn        = document.getElementById('btn-crear-torneo');
  if (btnTexto)   btnTexto.classList.add('oculto');
  if (btnCargand) btnCargand.classList.remove('oculto');
  if (btn)        btn.disabled = true;

  mostrarCarga('Creando la hoja de cálculo en tu Google Drive...');

  try {
    // 1. Crear hoja de cálculo en Drive
    const sheetData = await crearSheet(
      `⚽ ${nombre}`,
      ['Equipos', 'Fixture', 'Posiciones', 'Estadísticas', 'Jornadas']
    );
    const sheetId = sheetData.spreadsheetId;

    // 2. Generar fixture
    const fixture = modalidad === 'ida-vuelta'
      ? generarFixtureIdaVuelta(equipos)
      : generarFixtureRoundRobin(equipos);

    // 3. Escribir datos iniciales en las hojas
    mostrarCarga('Escribiendo datos iniciales...');
    await _inicializarHojasSheets(sheetId, nombre, equipos, fixture);

    // 4. Guardar en localStorage
    const torneoData = { sheetId, nombre, equipos, modalidad };
    guardarTorneoLocal(torneoData);
    guardarFixtureLocal(fixture);
    guardarStatsLocal([]);
    guardarHorariosLocal([]);

    mostrarExito(`¡Torneo "${nombre}" creado con éxito! 🎉`);
    mostrarPantalla('app');
    cargarDatosApp();

  } catch (err) {
    mostrarError('No se pudo crear el torneo: ' + err.message);
    console.error(err);
  } finally {
    ocultarCarga();
    if (btnTexto)   btnTexto.classList.remove('oculto');
    if (btnCargand) btnCargand.classList.add('oculto');
    if (btn)        btn.disabled = false;
  }
}

/* Escribe los datos iniciales en todas las hojas del spreadsheet */
async function _inicializarHojasSheets(sheetId, nombre, equipos, fixture) {
  // Hoja Equipos
  const filasEquipos = [
    ['ID', 'Nombre'],
    ...equipos.map((e, i) => [i + 1, e])
  ];

  // Hoja Fixture
  const filasFixture = [
    ['Jornada', 'ID', 'Local', 'Visitante', 'Goles Local', 'Goles Visitante', 'Estado'],
    ...fixture.map(p => [p.jornada, p.id, p.local, p.visitante, '', '', 'pendiente'])
  ];

  // Hoja Posiciones (inicial con ceros)
  const filasPos = [
    ['Equipo', 'PJ', 'PG', 'PE', 'PP', 'GF', 'GC', 'DG', 'Pts'],
    ...equipos.map(e => [e, 0, 0, 0, 0, 0, 0, 0, 0])
  ];

  // Hoja Estadísticas
  const filasStats = [['Jornada', 'Partido', 'Equipo', 'Jugador', 'Goles', 'Amarillas', 'Rojas']];

  // Hoja Jornadas
  const filasJornadas = [['Jornada', 'Partido', 'Local', 'Visitante', 'Fecha', 'Hora', 'Cancha']];

  await escribirLotes(sheetId, [
    { rango: 'Equipos!A1',     valores: filasEquipos },
    { rango: 'Fixture!A1',     valores: filasFixture  },
    { rango: 'Posiciones!A1',  valores: filasPos      },
    { rango: 'Estadísticas!A1', valores: filasStats   },
    { rango: 'Jornadas!A1',    valores: filasJornadas },
  ]);
}

/* ──────────────────────────────────────────────
   GENERACIÓN DE FIXTURE (Round-Robin)
   ────────────────────────────────────────────── */

/* Genera el fixture de una vuelta (todos contra todos una vez).
   Con número impar de equipos agrega BYE y genera una entrada
   de "descansa" para el equipo libre en cada jornada. */
function generarFixtureRoundRobin(equipos) {
  const lista = [...equipos];
  const esImpar = lista.length % 2 !== 0;
  if (esImpar) lista.push('BYE');

  const n        = lista.length;
  const rounds   = n - 1;
  const porRonda = n / 2;
  const partidos = [];

  const fijo = lista[0];
  const rot  = lista.slice(1);

  for (let r = 0; r < rounds; r++) {
    const current = [fijo, ...rot];

    for (let i = 0; i < porRonda; i++) {
      const local     = current[i];
      const visitante = current[n - 1 - i];

      if (local === 'BYE') {
        // visitante descansa esta jornada
        partidos.push({
          jornada: r + 1, id: `D${r + 1}_${i + 1}`,
          local: visitante, visitante: 'DESCANSA',
          golesLocal: '', golesVisitante: '', estado: 'descansa'
        });
      } else if (visitante === 'BYE') {
        // local descansa esta jornada
        partidos.push({
          jornada: r + 1, id: `D${r + 1}_${i + 1}`,
          local, visitante: 'DESCANSA',
          golesLocal: '', golesVisitante: '', estado: 'descansa'
        });
      } else {
        partidos.push({
          jornada: r + 1, id: `J${r + 1}_${i + 1}`,
          local, visitante,
          golesLocal: '', golesVisitante: '', estado: 'pendiente'
        });
      }
    }

    rot.unshift(rot.pop());
  }

  return partidos;
}

/* Genera el fixture de ida y vuelta (duplica con equipos invertidos). */
function generarFixtureIdaVuelta(equipos) {
  const ida      = generarFixtureRoundRobin(equipos);
  const maxJorn  = Math.max(...ida.map(p => p.jornada));

  const vuelta = ida.map(p => ({
    ...p,
    jornada:        p.jornada + maxJorn,
    id:             `V${p.jornada}_${p.id.split('_')[1]}`,
    local:          p.visitante,
    visitante:      p.local,
    golesLocal:     '',
    golesVisitante: '',
    estado:         'pendiente'
  }));

  return [...ida, ...vuelta];
}

/* Devuelve la primera jornada que todavía tiene partidos pendientes */
function calcularJornadaActual() {
  if (!fixtureActual.length) return 1;
  const jornadas = [...new Set(fixtureActual.map(p => p.jornada))].sort((a, b) => a - b);
  for (const j of jornadas) {
    if (fixtureActual.filter(p => p.jornada === j).some(p => p.estado === 'pendiente')) return j;
  }
  return jornadas[jornadas.length - 1];
}

/* ──────────────────────────────────────────────
   SECCIÓN INICIO – Renderizado del resumen
   ────────────────────────────────────────────── */

function renderizarInicio() {
  if (!torneoActual) return;

  // Estadísticas de tarjetas
  const jugados   = fixtureActual.filter(p => p.estado === 'jugado').length;
  const pendientes = fixtureActual.filter(p => p.estado === 'pendiente').length;
  const jornadas  = new Set(fixtureActual.map(p => p.jornada)).size;

  _setText('stat-equipos',   torneoActual.equipos.length);
  _setText('stat-jornadas',  jornadas);
  _setText('stat-jugados',   jugados);
  _setText('stat-pendientes', pendientes);

  // Top 3 posiciones
  const pos = calcularClasificacion();
  const top3El = document.getElementById('inicio-top3');
  if (top3El) {
    if (pos.length === 0) {
      top3El.innerHTML = '<p class="sin-datos">Aún no hay partidos jugados</p>';
    } else {
      const medallas = ['🥇', '🥈', '🥉'];
      top3El.innerHTML = pos.slice(0, 3).map((e, i) => `
        <div class="top3-fila puesto-${i + 1}">
          <span class="top3-medal">${medallas[i]}</span>
          <span class="top3-nombre">${e.equipo}</span>
          <span class="top3-pts">${e.pts} pts</span>
        </div>
      `).join('');
    }
  }

  // Próximos partidos — jornada activa completa
  const proxEl = document.getElementById('inicio-proximos');
  if (proxEl) {
    const jornadaActiva = calcularJornadaActual();
    const partidosJornada = fixtureActual.filter(p => p.jornada === jornadaActiva);
    const hayPendientes = partidosJornada.some(p => p.estado === 'pendiente');

    if (!hayPendientes || partidosJornada.length === 0) {
      proxEl.innerHTML = '<p class="sin-datos">¡Torneo finalizado! 🏆</p>';
    } else {
      proxEl.innerHTML = partidosJornada.map(p => {
        const horario = horariosActual.find(h => h.partidoId === p.id);
        const fecha = horario?.fecha ? new Date(horario.fecha + 'T00:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
        if (p.estado === 'descansa') {
          return `
            <div class="proximo-partido proximo-descansa">
              <div class="proximo-jornada">J${p.jornada}</div>
              <div class="proximo-equipos">😴 <span>${p.local}</span> descansa</div>
            </div>
          `;
        }
        return `
          <div class="proximo-partido ${p.estado === 'jugado' ? 'proximo-jugado' : ''}">
            <div class="proximo-jornada">J${p.jornada}</div>
            <div class="proximo-equipos">${p.local} <span>vs</span> ${p.visitante}</div>
            ${fecha ? `<div class="proximo-fecha">${fecha}</div>` : ''}
          </div>
        `;
      }).join('');
    }
  }
}

/* ──────────────────────────────────────────────
   NAVEGACIÓN ENTRE SECCIONES
   ────────────────────────────────────────────── */

function mostrarSeccion(seccionId) {
  document.querySelectorAll('.seccion').forEach(s => s.classList.add('oculto'));
  document.querySelectorAll('.sidebar-item[data-seccion]').forEach(b => b.classList.remove('activo'));

  const sec = document.getElementById(seccionId);
  if (sec) sec.classList.remove('oculto');

  const btn = document.querySelector(`.sidebar-item[data-seccion="${seccionId}"]`);
  if (btn) btn.classList.add('activo');

  // Close sidebar overlay on mobile after navigation
  if (window.innerWidth < 768) {
    document.getElementById('app-sidebar')?.classList.remove('abierto');
    document.getElementById('sidebar-overlay')?.classList.add('oculto');
  }

  // Renderizar la sección según sea necesaria
  if (seccionId === 'sec-resultados')  renderizarResultados(jornadaViendo);
  if (seccionId === 'sec-posiciones')  renderizarPosiciones();
  if (seccionId === 'sec-estadisticas') renderizarEstadisticas();
  if (seccionId === 'sec-jornadas')    renderizarCalendario();
  if (seccionId === 'sec-jugadores')   { _poblarEquiposJugadores(); renderizarJugadores(); }
}

/* Toggle sidebar — colapsa en desktop, abre/cierra en móvil */
function toggleSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;

  if (window.innerWidth < 768) {
    const abierto = sidebar.classList.toggle('abierto');
    if (overlay) overlay.classList.toggle('oculto', !abierto);
  } else {
    const colapsado = sidebar.classList.toggle('colapsado');
    localStorage.setItem('ta_sidebar_col', colapsado ? '1' : '');
  }
}

/* ──────────────────────────────────────────────
   UTILIDADES UI
   ────────────────────────────────────────────── */

function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* Muestra un mensaje toast de error */
function mostrarError(msg) {
  _toast(msg, 'error');
}

/* Muestra un mensaje toast de éxito */
function mostrarExito(msg) {
  _toast(msg, 'exito');
}

function _toast(msg, tipo) {
  const cont = document.getElementById('toast-container');
  if (!cont) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.textContent = msg;
  cont.appendChild(toast);

  setTimeout(() => toast.classList.add('visible'), 10);
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

/* Muestra el overlay de carga con un mensaje */
function mostrarCarga(msg = 'Procesando...') {
  _setText('carga-mensaje', msg);
  document.getElementById('overlay-carga')?.classList.remove('oculto');
}

/* Oculta el overlay de carga */
function ocultarCarga() {
  document.getElementById('overlay-carga')?.classList.add('oculto');
}

/* ──────────────────────────────────────────────
   GESTIÓN DE JUGADORES POR EQUIPO
   ────────────────────────────────────────────── */

function _poblarEquiposJugadores() {
  const sel = document.getElementById('gestion-equipo');
  if (!sel || !torneoActual) return;
  sel.innerHTML = '<option value="">Seleccionar equipo...</option>' +
    torneoActual.equipos.map(e => `<option value="${e}">${e}</option>`).join('');
}

/* Navega a la sección de gestión de jugadores */
function abrirModalPlantilla() {
  mostrarSeccion('sec-jugadores');
}

/* Agrega un jugador al equipo. Devuelve true si tuvo éxito. */
function agregarJugador(equipo, nombre, cedula, celular, numeroCamisa) {
  nombre = nombre?.trim() || '';
  if (!nombre) { mostrarError('El nombre del jugador es obligatorio.'); return false; }
  if (jugadoresActual.some(j => j.equipo === equipo && j.nombre.toLowerCase() === nombre.toLowerCase())) {
    mostrarError(`"${nombre}" ya está registrado en ${equipo}.`);
    return false;
  }
  jugadoresActual.push({
    id: `J_${Date.now()}`,
    equipo,
    nombre,
    numeroCamisa: numeroCamisa?.toString().trim() || '',
    cedula:       cedula?.trim()  || '',
    celular:      celular?.trim() || ''
  });
  guardarJugadoresLocal(jugadoresActual);
  return true;
}

/* Guarda el jugador desde el formulario del modal */
function guardarJugadorForm() {
  const equipo      = document.getElementById('gestion-equipo')?.value;
  const nombre      = document.getElementById('nuevo-jugador-nombre')?.value;
  const camisa      = document.getElementById('nuevo-jugador-camisa')?.value;
  const cedula      = document.getElementById('nuevo-jugador-cedula')?.value;
  const celular     = document.getElementById('nuevo-jugador-celular')?.value;
  if (!equipo) { mostrarError('Selecciona un equipo primero.'); return; }
  if (agregarJugador(equipo, nombre, cedula, celular, camisa)) {
    ['nuevo-jugador-nombre','nuevo-jugador-camisa','nuevo-jugador-cedula','nuevo-jugador-celular'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    renderizarJugadores();
    mostrarExito(`Jugador registrado en ${equipo}`);
  }
}

/* Devuelve los totales de estadísticas de un jugador calculados desde statsActual */
function _statsJugador(equipo, nombre) {
  return statsActual
    .filter(s => s.equipo === equipo && s.jugador === nombre)
    .reduce((acc, s) => ({
      goles:     acc.goles     + (Number(s.goles)     || 0),
      amarillas: acc.amarillas + (Number(s.amarillas) || 0),
      rojas:     acc.rojas     + (Number(s.rojas)     || 0)
    }), { goles: 0, amarillas: 0, rojas: 0 });
}

/* Reemplaza todas las entradas de un jugador en statsActual con un único total corregido */
function _corregirStatsJugador(equipo, nombreAnterior, nombreNuevo, goles, amarillas, rojas) {
  statsActual = statsActual.filter(s => !(s.equipo === equipo && s.jugador === nombreAnterior));
  if (goles > 0 || amarillas > 0 || rojas > 0) {
    statsActual.push({ jornada: 0, partidoId: 'CORR', equipo, jugador: nombreNuevo, goles, amarillas, rojas });
  }
  guardarStatsLocal(statsActual);
}

/* Renderiza la lista de jugadores con sus estadísticas, ordenados por goles desc */
function renderizarJugadores() {
  const equipo = document.getElementById('gestion-equipo')?.value;
  const lista  = document.getElementById('lista-jugadores');
  const form   = document.getElementById('form-agregar-jugador');
  if (!lista) return;
  if (form) form.classList.toggle('oculto', !equipo);
  if (!equipo) {
    lista.innerHTML = '<p class="sin-datos">Selecciona un equipo para ver sus jugadores.</p>';
    return;
  }

  // Enriquecer cada jugador con sus totales y ordenar por goles desc
  const jug = jugadoresActual
    .filter(j => j.equipo === equipo)
    .map(j => ({ ...j, ..._statsJugador(j.equipo, j.nombre) }))
    .sort((a, b) => b.goles - a.goles || a.nombre.localeCompare(b.nombre));

  if (jug.length === 0) {
    lista.innerHTML = '<p class="sin-datos">Sin jugadores registrados. Agrégalos abajo.</p>';
    return;
  }

  lista.innerHTML = `<div class="tabla-wrapper"><table class="tabla-datos tabla-compacta">
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
    <tbody>${jug.map(j => `
      <tr id="jrow-${j.id}">
        <td class="col-camisa">${j.numeroCamisa || '–'}</td>
        <td><strong>${j.nombre}</strong></td>
        <td>${j.cedula || '–'}</td>
        <td>${j.celular || '–'}</td>
        <td class="col-num">${j.goles}</td>
        <td class="col-num">${j.amarillas}</td>
        <td class="col-num">${j.rojas}</td>
        <td class="col-acciones">
          <button class="btn-secundario btn-xs" onclick="editarJugador('${j.id}')" title="Editar"><i class="bi bi-pencil-fill"></i></button>
          <button class="btn-peligro   btn-xs" onclick="eliminarJugador('${j.id}')" title="Eliminar"><i class="bi bi-trash3-fill"></i></button>
        </td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

/* Pone una fila en modo edición inline (datos personales + estadísticas) */
function editarJugador(id) {
  const j = jugadoresActual.find(j => j.id === id);
  if (!j) return;
  const st  = _statsJugador(j.equipo, j.nombre);
  const row = document.getElementById(`jrow-${id}`);
  if (!row) return;
  row.innerHTML = `
    <td><input type="number" id="ec-${id}"   value="${j.numeroCamisa||''}" min="1" max="99"  class="input-edit input-edit-xs" placeholder="#"></td>
    <td><input type="text"   id="en-${id}"   value="${j.nombre}"           maxlength="50"    class="input-edit" required></td>
    <td><input type="text"   id="eced-${id}" value="${j.cedula||''}"       maxlength="20"    class="input-edit"></td>
    <td><input type="tel"    id="ecel-${id}" value="${j.celular||''}"      maxlength="15"    class="input-edit"></td>
    <td><input type="number" id="eg-${id}"   value="${st.goles}"     min="0" max="999"       class="input-edit input-edit-xs"></td>
    <td><input type="number" id="ea-${id}"   value="${st.amarillas}" min="0" max="999"       class="input-edit input-edit-xs"></td>
    <td><input type="number" id="er-${id}"   value="${st.rojas}"     min="0" max="999"       class="input-edit input-edit-xs"></td>
    <td class="col-acciones">
      <button class="btn-principal  btn-xs" onclick="guardarEdicionJugador('${id}')"><i class="bi bi-check-lg"></i></button>
      <button class="btn-secundario btn-xs" onclick="renderizarJugadores()"><i class="bi bi-x-lg"></i></button>
    </td>`;
  document.getElementById(`en-${id}`)?.focus();
}

/* Guarda los cambios de una edición inline (datos + estadísticas) */
function guardarEdicionJugador(id) {
  const idx = jugadoresActual.findIndex(j => j.id === id);
  if (idx === -1) return;
  const j      = jugadoresActual[idx];
  const nombre = document.getElementById(`en-${id}`)?.value?.trim();
  if (!nombre) { mostrarError('El nombre es obligatorio.'); return; }

  const goles     = Math.max(0, parseInt(document.getElementById(`eg-${id}`)?.value || 0));
  const amarillas = Math.max(0, parseInt(document.getElementById(`ea-${id}`)?.value || 0));
  const rojas     = Math.max(0, parseInt(document.getElementById(`er-${id}`)?.value || 0));

  jugadoresActual[idx] = {
    ...j,
    nombre,
    numeroCamisa: document.getElementById(`ec-${id}`)?.value?.trim()   || '',
    cedula:       document.getElementById(`eced-${id}`)?.value?.trim() || '',
    celular:      document.getElementById(`ecel-${id}`)?.value?.trim() || ''
  };
  guardarJugadoresLocal(jugadoresActual);

  _corregirStatsJugador(j.equipo, j.nombre, nombre, goles, amarillas, rojas);

  renderizarJugadores();
  renderizarEstadisticas();
  mostrarExito('Jugador actualizado');
}

function eliminarJugador(id) {
  if (!confirm('¿Eliminar este jugador?')) return;
  jugadoresActual = jugadoresActual.filter(j => j.id !== id);
  guardarJugadoresLocal(jugadoresActual);
  renderizarJugadores();
}

/* Elimina el torneo completo: datos locales + hoja en Google Drive */
async function eliminarTorneoCompleto() {
  const nombre = torneoActual?.nombre || 'este torneo';
  if (!confirm(`¿Eliminar "${nombre}"?\n\nSe borrarán todos los datos locales y se eliminará la hoja de cálculo de Google Drive.\n\nEsta acción NO se puede deshacer.`)) return;
  if (!confirm('Segunda confirmación: ¿estás seguro de que quieres eliminar el torneo permanentemente?')) return;

  const sheetId = torneoActual?.sheetId;
  mostrarCarga('Eliminando torneo...');
  try {
    if (sheetId) {
      await eliminarArchivoEnDrive(sheetId);
    }
    borrarTorneoLocal();
    mostrarExito('Torneo eliminado correctamente');
    setTimeout(() => { mostrarPantalla('setup'); actualizarCamposEquipos(); }, 1200);
  } catch (err) {
    mostrarError('No se pudo eliminar de Drive: ' + err.message);
  } finally {
    ocultarCarga();
  }
}

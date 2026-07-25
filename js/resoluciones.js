/* =============================================
   resoluciones.js – Resoluciones disciplinarias: constructor + vista previa
   en vivo, plantillas reutilizables, pendientes de sancionar, histórico y PDF.
   ============================================= */

/* ──────────────────────────────────────────────
   UTILIDADES DE TEXTO LEGAL
   ────────────────────────────────────────────── */

const _ORDINALES = [
  'Primero', 'Segundo', 'Tercero', 'Cuarto', 'Quinto', 'Sexto', 'Séptimo', 'Octavo', 'Noveno', 'Décimo',
  'Undécimo', 'Duodécimo', 'Decimotercero', 'Decimocuarto', 'Decimoquinto', 'Decimosexto', 'Decimoséptimo',
  'Decimoctavo', 'Decimonoveno', 'Vigésimo'
];
function _ordinalArticulo(n) {
  return _ORDINALES[n - 1] || `N°${n}`;
}

const _MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const _UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const _DIEZ_A_DIECINUEVE = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
const _VEINTI = ['veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];

/* Convierte un día del mes (1-31) a su forma cardinal en español */
function _diaEnPalabras(n) {
  n = parseInt(n);
  if (!n || n <= 0 || n > 31) return String(n);
  if (n < 10)  return _UNIDADES[n];
  if (n < 20)  return _DIEZ_A_DIECINUEVE[n - 10];
  if (n < 30)  return _VEINTI[n - 20];
  if (n === 30) return 'treinta';
  return 'treinta y ' + _UNIDADES[n - 30];
}

function _formatoFechaLegible(fechaISO) {
  if (!fechaISO) return '';
  const d = new Date(fechaISO + 'T00:00:00');
  return `${d.getDate()} de ${_MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

/* Detecta los {placeholders} únicos de un texto de plantilla, en orden de aparición */
function _detectarPlaceholders(texto) {
  const encontrados = [];
  const regex = /\{([a-zA-Z0-9_]+)\}/g;
  let m;
  while ((m = regex.exec(texto || '')) !== null) {
    if (!encontrados.includes(m[1])) encontrados.push(m[1]);
  }
  return encontrados;
}

/* Reemplaza los {placeholders} de una plantilla por los valores dados
   (deja el placeholder intacto si no se llenó, para que sea visible que falta) */
function _resolverPlantilla(texto, valores) {
  return (texto || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (match, nombre) => {
    const v = valores[nombre];
    return (v === undefined || v === null || v === '') ? match : v;
  });
}

/* ──────────────────────────────────────────────
   ESTADO DEL MÓDULO
   ────────────────────────────────────────────── */

let _borradorActual = null;           // la resolución que se está editando en la pestaña "Nueva"
let _articuloEnConstruccion = null;   // mini-formulario de un artículo variable antes de agregarlo
let _plantillaEditandoId = null;      // plantilla en edición en la pestaña "Plantillas"
let _pestanaResolucionesActiva = 'nueva';

/* Los 3 artículos de cierre + el Considerando son "fijos": traen un texto por
   defecto pero se pueden editar u omitir. El único bloque siempre presente y
   sin checkbox es el Artículo primero (tabla de sanciones), que no vive acá. */
function _articulosFijosPorDefecto(fechaISO) {
  return {
    considerando: { activo: true, texto: 'Que es deber de la comisión atender los asuntos disciplinarios relacionados con todos aquellos jugadores y cuerpo técnico, de acuerdo con las normas establecidas en las reglas del juego.' },
    apelacion:    { activo: true, texto: 'Contra la presente resolución proceden los recursos de apelación y reposición, en los términos que señala el reglamento y la ley.' },
    comuniquese:  { activo: true, texto: 'Comuníquese y cúmplase.' },
    fechaCierre:  { activo: true, texto: _textoFechaCierre(fechaISO), editadoManual: false }
  };
}

/* Mismo texto que se mostraba hardcodeado antes de que esto fuera editable —
   usado tanto para el valor por defecto como para recalcularlo al cambiar la fecha */
function _textoFechaCierre(fechaISO) {
  if (!fechaISO) return 'Dado a los ___ días del mes de ___ de ___.';
  const d = new Date(fechaISO + 'T00:00:00');
  return `Dado a los ${_diaEnPalabras(d.getDate())} días del mes de ${_MESES[d.getMonth()]} de ${d.getFullYear()}.`;
}

/* Resoluciones publicadas antes de que existiera este campo no lo tienen guardado;
   se les arma un equivalente con todo activo para que se vean igual que siempre */
function _articulosFijosLegacyDefault(res) {
  return _articulosFijosPorDefecto(res.fecha);
}

function _crearBorradorVacio() {
  const fecha = _hoyISO();
  return {
    id: 'RES_' + Date.now(),
    numero: null,
    estado: 'borrador',
    fecha,
    tablaSanciones: [],
    articulosVariables: [],
    articulosFijos: _articulosFijosPorDefecto(fecha)
  };
}

/* ──────────────────────────────────────────────
   NAVEGACIÓN ENTRE PESTAÑAS
   ────────────────────────────────────────────── */

function mostrarPestanaResoluciones(tab) {
  _pestanaResolucionesActiva = tab;
  ['nueva', 'pendientes', 'historico', 'plantillas'].forEach(t => {
    document.getElementById(`res-tab-${t}`)?.classList.toggle('oculto', t !== tab);
    document.getElementById(`res-tabbtn-${t}`)?.classList.toggle('activo', t === tab);
  });
}

/* Punto de entrada de la sección — llamado desde mostrarSeccion() y cargarDatosApp() */
function renderizarResoluciones() {
  if (!torneoActual) return;
  if (!_borradorActual) {
    _borradorActual = resolucionesActual.find(r => r.estado === 'borrador') || _crearBorradorVacio();
  }
  // Borrador guardado antes de que existiera este campo (migración silenciosa)
  if (!_borradorActual.articulosFijos) {
    _borradorActual.articulosFijos = _articulosFijosPorDefecto(_borradorActual.fecha);
  }
  mostrarPestanaResoluciones(_pestanaResolucionesActiva);
  _renderizarConstructorResolucion();
  _renderizarPendientesSancion();
  _renderizarHistoricoResoluciones();
  _renderizarPlantillas();
}

/* ──────────────────────────────────────────────
   CONSTRUCTOR — Tabla de sanciones (Artículo primero)
   ────────────────────────────────────────────── */

function _renderizarConstructorResolucion() {
  if (!_borradorActual) return;
  const fechaInput = document.getElementById('res-fecha');
  if (fechaInput) fechaInput.value = _borradorActual.fecha || '';
  _poblarSelectPlantillas();
  _renderizarTablaSancionesEditor();
  _renderizarArticulosVariablesEditor();
  _renderizarArticulosFijosEditor();
  _actualizarVistaPreviaResolucion();
}

function onCambioFechaResolucion() {
  if (!_borradorActual) return;
  _borradorActual.fecha = document.getElementById('res-fecha')?.value || '';
  const fc = _borradorActual.articulosFijos.fechaCierre;
  if (!fc.editadoManual) {
    fc.texto = _textoFechaCierre(_borradorActual.fecha);
    _renderizarArticulosFijosEditor();
  }
  _actualizarVistaPreviaResolucion();
}

function agregarFilaSancion() {
  if (!_borradorActual) return;
  _borradorActual.tablaSanciones.push({
    id: 'FS_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    equipo: '', jugador: '', tipoSancion: 'Roja directa',
    jornadasSancionadas: 1, contendor: '', multa: 0, statsId: null
  });
  _renderizarTablaSancionesEditor();
  _actualizarVistaPreviaResolucion();
}

function eliminarFilaSancion(rowId) {
  if (!_borradorActual) return;
  _borradorActual.tablaSanciones = _borradorActual.tablaSanciones.filter(f => f.id !== rowId);
  _renderizarTablaSancionesEditor();
  _actualizarVistaPreviaResolucion();
}

/* Un jugador solo puede sancionarse si tiene una roja registrada en Estadísticas
   que todavía no esté incluida en ninguna resolución (misma regla que "Pendientes") */
function _tarjetaPendienteDe(equipo, jugadorNombre) {
  return statsActual.find(s => s.equipo === equipo && s.jugador === jugadorNombre && s.rojas > 0 && !s.sancionado) || null;
}

function _jugadoresConRojaPendiente(equipo) {
  return jugadoresActual.filter(j => j.equipo === equipo && _tarjetaPendienteDe(equipo, j.nombre));
}

/* Cambiar el equipo de una fila resetea jugador (ya no aplica) y contendor si quedó igual */
function onCambioEquipoSancion(rowId, valor) {
  const fila = _borradorActual?.tablaSanciones.find(f => f.id === rowId);
  if (!fila) return;
  fila.equipo = valor;
  fila.jugador = '';
  fila.statsId = null;
  if (fila.contendor === valor) fila.contendor = '';
  _renderizarTablaSancionesEditor();
  _actualizarVistaPreviaResolucion();
}

/* Al elegir el jugador (ya filtrado a los que tienen roja pendiente) se enlaza
   directamente con esa tarjeta y se sugiere el tipo de sanción real */
function onCambioJugadorSancion(rowId, valor) {
  const fila = _borradorActual?.tablaSanciones.find(f => f.id === rowId);
  if (!fila) return;
  fila.jugador = valor;
  const tarjeta = valor ? _tarjetaPendienteDe(fila.equipo, valor) : null;
  fila.statsId = tarjeta ? tarjeta.id : null;
  if (tarjeta) fila.tipoSancion = tarjeta.amarillas >= 2 ? 'Doble amarilla' : 'Roja directa';
  _renderizarTablaSancionesEditor();
  _actualizarVistaPreviaResolucion();
}

function onCambioCampoSancion(rowId, campo, valor) {
  const fila = _borradorActual?.tablaSanciones.find(f => f.id === rowId);
  if (!fila) return;
  fila[campo] = (campo === 'jornadasSancionadas' || campo === 'multa') ? (parseFloat(valor) || 0) : valor;
  _actualizarVistaPreviaResolucion();
}

function _renderizarTablaSancionesEditor() {
  const cont = document.getElementById('res-tabla-sanciones-editor');
  if (!cont || !_borradorActual) return;

  if (_borradorActual.tablaSanciones.length === 0) {
    cont.innerHTML = '<p class="sin-datos">Sin jugadores agregados. Usa el botón de abajo o la pestaña "Pendientes".</p>';
    return;
  }

  cont.innerHTML = `
    <div class="tabla-wrapper">
      <table class="tabla-datos tabla-compacta res-tabla-form">
        <thead>
          <tr><th>Equipo</th><th>Jugador</th><th>Sanción</th><th>Fechas</th><th>Contendor</th><th>Multa</th><th></th></tr>
        </thead>
        <tbody>${_borradorActual.tablaSanciones.map(_filaSancionHTML).join('')}</tbody>
      </table>
    </div>
  `;
}

function _filaSancionHTML(fila) {
  const jugadoresDelEquipo = fila.equipo ? _jugadoresConRojaPendiente(fila.equipo) : [];
  const equiposContendor  = (torneoActual.equipos || []).filter(e => e !== fila.equipo);

  return `
    <tr>
      <td>
        <select onchange="onCambioEquipoSancion('${fila.id}', this.value)">
          <option value="">Seleccionar...</option>
          ${torneoActual.equipos.map(e => `<option value="${e}" ${e === fila.equipo ? 'selected' : ''}>${e}</option>`).join('')}
        </select>
      </td>
      <td>
        <select onchange="onCambioJugadorSancion('${fila.id}', this.value)" ${!fila.equipo ? 'disabled' : ''} title="Solo se listan jugadores con roja pendiente de sancionar">
          ${jugadoresDelEquipo.length === 0
            ? `<option value="">${fila.equipo ? 'Sin jugadores con roja pendiente' : 'Elige un equipo primero'}</option>`
            : '<option value="">Seleccionar...</option>' + jugadoresDelEquipo.map(j => `<option value="${j.nombre}" ${j.nombre === fila.jugador ? 'selected' : ''}>${j.nombre}</option>`).join('')}
        </select>
      </td>
      <td>
        <select onchange="onCambioCampoSancion('${fila.id}', 'tipoSancion', this.value)">
          <option value="Roja directa" ${fila.tipoSancion === 'Roja directa' ? 'selected' : ''}>Roja directa</option>
          <option value="Doble amarilla" ${fila.tipoSancion === 'Doble amarilla' ? 'selected' : ''}>Doble amarilla</option>
        </select>
      </td>
      <td><input type="number" min="0" value="${fila.jornadasSancionadas || ''}" class="input-edit input-edit-xs" style="max-width:60px" onchange="onCambioCampoSancion('${fila.id}', 'jornadasSancionadas', this.value)"></td>
      <td>
        <select onchange="onCambioCampoSancion('${fila.id}', 'contendor', this.value)" ${!fila.equipo ? 'disabled' : ''}>
          <option value="">Seleccionar...</option>
          ${equiposContendor.map(e => `<option value="${e}" ${e === fila.contendor ? 'selected' : ''}>${e}</option>`).join('')}
        </select>
      </td>
      <td><input type="number" min="0" value="${fila.multa || ''}" class="input-edit" style="max-width:100px" onchange="onCambioCampoSancion('${fila.id}', 'multa', this.value)"></td>
      <td><button class="btn-peligro btn-xs" onclick="eliminarFilaSancion('${fila.id}')" title="Quitar"><i class="bi bi-trash3-fill"></i></button></td>
    </tr>
  `;
}

/* ──────────────────────────────────────────────
   CONSTRUCTOR — Artículos variables (desde plantilla o texto libre)
   ────────────────────────────────────────────── */

function _poblarSelectPlantillas() {
  const sel = document.getElementById('res-nueva-plantilla');
  if (!sel) return;
  const valorPrevio = sel.value;
  sel.innerHTML = '<option value="">Seleccionar plantilla...</option>' +
    plantillasActual.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
  if (valorPrevio) sel.value = valorPrevio;
}

function agregarArticuloDesdePlantilla() {
  const plantillaId = document.getElementById('res-nueva-plantilla')?.value;
  if (!plantillaId) { mostrarError('Selecciona una plantilla primero.'); return; }
  const plantilla = plantillasActual.find(p => p.id === plantillaId);
  if (!plantilla) return;

  _articuloEnConstruccion = { plantillaId, placeholders: _detectarPlaceholders(plantilla.texto), valores: {} };
  _renderizarArticulosVariablesEditor();
}

function agregarArticuloLibre() {
  _articuloEnConstruccion = { plantillaId: null, placeholders: [], valores: { texto: '' } };
  _renderizarArticulosVariablesEditor();
}

function onCambioValorPlaceholder(placeholder, valor) {
  if (!_articuloEnConstruccion) return;
  _articuloEnConstruccion.valores[placeholder] = valor;
}

function onCambioTextoLibreArticulo(valor) {
  if (!_articuloEnConstruccion) return;
  _articuloEnConstruccion.valores.texto = valor;
}

function confirmarArticuloDesdePlantilla() {
  const c = _articuloEnConstruccion;
  const plantilla = plantillasActual.find(p => p.id === c?.plantillaId);
  if (!c || !plantilla) return;

  const textoResuelto = _resolverPlantilla(plantilla.texto, c.valores);
  _borradorActual.articulosVariables.push({ id: 'AV_' + Date.now(), plantillaId: c.plantillaId, textoResuelto });
  _articuloEnConstruccion = null;
  _renderizarArticulosVariablesEditor();
  _actualizarVistaPreviaResolucion();
}

function confirmarArticuloLibre() {
  const texto = (_articuloEnConstruccion?.valores.texto || '').trim();
  if (!texto) { mostrarError('Escribe el texto del artículo.'); return; }

  _borradorActual.articulosVariables.push({ id: 'AV_' + Date.now(), plantillaId: null, textoResuelto: texto });
  _articuloEnConstruccion = null;
  _renderizarArticulosVariablesEditor();
  _actualizarVistaPreviaResolucion();
}

function cancelarArticuloEnConstruccion() {
  _articuloEnConstruccion = null;
  _renderizarArticulosVariablesEditor();
}

function iniciarEditarArticuloVariable(id) {
  const item = document.getElementById(`artvar-${id}`);
  const art  = _borradorActual?.articulosVariables.find(a => a.id === id);
  if (!item || !art) return;
  item.innerHTML = `
    <textarea rows="3" id="edit-artvar-${id}" class="input-edit" style="width:100%">${art.textoResuelto}</textarea>
    <div class="res-botones-agregar-articulo" style="margin-top:.5rem">
      <button class="btn-principal btn-pequeño" onclick="guardarEdicionArticuloVariable('${id}')"><i class="bi bi-check-lg"></i> Guardar</button>
      <button class="btn-secundario btn-pequeño" onclick="_renderizarArticulosVariablesEditor()"><i class="bi bi-x-lg"></i> Cancelar</button>
    </div>
  `;
}

function guardarEdicionArticuloVariable(id) {
  const art   = _borradorActual?.articulosVariables.find(a => a.id === id);
  const texto = document.getElementById(`edit-artvar-${id}`)?.value?.trim();
  if (!art || !texto) return;
  art.textoResuelto = texto;
  _renderizarArticulosVariablesEditor();
  _actualizarVistaPreviaResolucion();
}

function eliminarArticuloVariable(id) {
  _borradorActual.articulosVariables = _borradorActual.articulosVariables.filter(a => a.id !== id);
  _renderizarArticulosVariablesEditor();
  _actualizarVistaPreviaResolucion();
}

function moverArticuloVariable(id, direccion) {
  const arr = _borradorActual.articulosVariables;
  const idx = arr.findIndex(a => a.id === id);
  const nuevoIdx = idx + direccion;
  if (idx < 0 || nuevoIdx < 0 || nuevoIdx >= arr.length) return;
  [arr[idx], arr[nuevoIdx]] = [arr[nuevoIdx], arr[idx]];
  _renderizarArticulosVariablesEditor();
  _actualizarVistaPreviaResolucion();
}

function _renderizarArticulosVariablesEditor() {
  const cont = document.getElementById('res-articulos-variables-editor');
  if (!cont || !_borradorActual) return;

  const existentes = _borradorActual.articulosVariables.map((a, i) => `
    <div class="res-articulo-editor-item" id="artvar-${a.id}">
      <div class="res-articulo-editor-cab">
        <span class="res-articulo-chip-mini">${_ordinalArticulo(i + 2)}</span>
        <div class="res-articulo-editor-acciones">
          <button class="btn-secundario btn-xs" onclick="moverArticuloVariable('${a.id}', -1)" ${i === 0 ? 'disabled' : ''} title="Subir"><i class="bi bi-arrow-up"></i></button>
          <button class="btn-secundario btn-xs" onclick="moverArticuloVariable('${a.id}', 1)" ${i === _borradorActual.articulosVariables.length - 1 ? 'disabled' : ''} title="Bajar"><i class="bi bi-arrow-down"></i></button>
          <button class="btn-secundario btn-xs" onclick="iniciarEditarArticuloVariable('${a.id}')" title="Editar"><i class="bi bi-pencil-fill"></i></button>
          <button class="btn-peligro btn-xs" onclick="eliminarArticuloVariable('${a.id}')" title="Quitar"><i class="bi bi-trash3-fill"></i></button>
        </div>
      </div>
      <p class="res-articulo-editor-texto">${a.textoResuelto}</p>
    </div>
  `).join('') || '<p class="sin-datos">Sin artículos variables agregados.</p>';

  cont.innerHTML = existentes + (_articuloEnConstruccion ? _htmlMiniFormularioArticulo() : '');
}

function _htmlMiniFormularioArticulo() {
  const c = _articuloEnConstruccion;
  if (c.plantillaId) {
    const plantilla = plantillasActual.find(p => p.id === c.plantillaId);
    const campos = c.placeholders.map(ph => `
      <div class="form-grupo">
        <label>${ph}</label>
        <input type="text" value="${c.valores[ph] || ''}" oninput="onCambioValorPlaceholder('${ph}', this.value)">
      </div>
    `).join('');
    return `
      <div class="res-mini-form">
        <p class="subtitulo-card">Completar: ${plantilla?.nombre || 'Plantilla'}</p>
        <div class="form-fila">${campos}</div>
        <div class="res-botones-agregar-articulo">
          <button class="btn-principal btn-pequeño" onclick="confirmarArticuloDesdePlantilla()"><i class="bi bi-check-lg"></i> Agregar artículo</button>
          <button class="btn-secundario btn-pequeño" onclick="cancelarArticuloEnConstruccion()"><i class="bi bi-x-lg"></i> Cancelar</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="res-mini-form">
      <p class="subtitulo-card">Texto libre</p>
      <textarea rows="3" class="input-edit" style="width:100%" oninput="onCambioTextoLibreArticulo(this.value)">${c.valores.texto || ''}</textarea>
      <div class="res-botones-agregar-articulo">
        <button class="btn-principal btn-pequeño" onclick="confirmarArticuloLibre()"><i class="bi bi-check-lg"></i> Agregar artículo</button>
        <button class="btn-secundario btn-pequeño" onclick="cancelarArticuloEnConstruccion()"><i class="bi bi-x-lg"></i> Cancelar</button>
      </div>
    </div>
  `;
}

/* ──────────────────────────────────────────────
   CONSTRUCTOR — Artículos fijos (Considerando + cierre): traen texto por
   defecto pero se pueden editar u omitir. El único bloque obligatorio es el
   Artículo primero (tabla de sanciones), que no pasa por acá.
   ────────────────────────────────────────────── */

const _ETIQUETAS_ARTICULOS_FIJOS = {
  considerando: 'Considerando',
  apelacion:    'Cierre — Apelación y reposición',
  comuniquese:  'Cierre — Comuníquese y cúmplase',
  fechaCierre:  'Cierre — Fecha'
};

function onToggleArticuloFijo(clave) {
  const item = _borradorActual?.articulosFijos?.[clave];
  if (!item) return;
  item.activo = !item.activo;
  _renderizarArticulosFijosEditor();
  _actualizarVistaPreviaResolucion();
}

function onCambioTextoArticuloFijo(clave, valor) {
  const item = _borradorActual?.articulosFijos?.[clave];
  if (!item) return;
  item.texto = valor;
  if (clave === 'fechaCierre') item.editadoManual = true;
  _actualizarVistaPreviaResolucion();
}

function restablecerTextoArticuloFijo(clave) {
  const item = _borradorActual?.articulosFijos?.[clave];
  if (!item) return;
  if (clave === 'fechaCierre') {
    item.texto = _textoFechaCierre(_borradorActual.fecha);
    item.editadoManual = false;
  } else {
    item.texto = _articulosFijosPorDefecto(_borradorActual.fecha)[clave].texto;
  }
  _renderizarArticulosFijosEditor();
  _actualizarVistaPreviaResolucion();
}

function _renderizarArticulosFijosEditor() {
  const cont = document.getElementById('res-articulos-fijos-editor');
  if (!cont || !_borradorActual) return;

  cont.innerHTML = Object.keys(_ETIQUETAS_ARTICULOS_FIJOS).map(clave => {
    const item = _borradorActual.articulosFijos[clave];
    return `
      <div class="res-articulo-fijo-item ${item.activo ? '' : 'res-articulo-fijo-inactivo'}">
        <label class="res-articulo-fijo-check">
          <input type="checkbox" ${item.activo ? 'checked' : ''} onchange="onToggleArticuloFijo('${clave}')">
          <span>${_ETIQUETAS_ARTICULOS_FIJOS[clave]}</span>
        </label>
        <textarea rows="2" class="input-edit" ${item.activo ? '' : 'disabled'}
          oninput="onCambioTextoArticuloFijo('${clave}', this.value)">${item.texto || ''}</textarea>
        <button class="btn-secundario btn-xs" onclick="restablecerTextoArticuloFijo('${clave}')" title="Restablecer texto por defecto">
          <i class="bi bi-arrow-counterclockwise"></i> Restablecer
        </button>
      </div>
    `;
  }).join('');
}

/* ──────────────────────────────────────────────
   VISTA PREVIA EN VIVO (mismo documento se usa para PDF e Histórico)
   ────────────────────────────────────────────── */

function _actualizarVistaPreviaResolucion() {
  const cont = document.getElementById('res-vista-previa');
  if (!cont || !_borradorActual) return;
  cont.innerHTML = _htmlDocumentoResolucion(_borradorActual);
}

function _htmlDocumentoResolucion(res) {
  const numeroTexto = res.numero ? `Resolución #${String(res.numero).padStart(3, '0')}` : 'Resolución (borrador)';
  const fechaTexto  = res.fecha ? _formatoFechaLegible(res.fecha) : 'Sin fecha';

  const filasSanciones = res.tablaSanciones.map(f => `
    <tr>
      <td>${res.fecha ? _formatoFechaCortaResolucion(res.fecha) : '–'}</td>
      <td>Libre</td>
      <td class="jugador">${f.jugador || '—'}</td>
      <td class="equipo-tag">${f.equipo || '—'}</td>
      <td class="sancion">${f.jornadasSancionadas || 0} fecha${f.jornadasSancionadas === 1 ? '' : 's'} por ${(f.tipoSancion || '').toLowerCase()}</td>
      <td class="equipo-tag">${f.contendor || '—'}</td>
      <td class="multa ${Number(f.multa) > 0 ? '' : 'sin-multa'}">${Number(f.multa) > 0 ? _formatoMoneda(f.multa) : '–'}</td>
    </tr>
  `).join('') || `<tr><td colspan="7" style="text-align:center;color:var(--c-text-muted)">Sin jugadores agregados aún</td></tr>`;

  const fijos = res.articulosFijos || _articulosFijosLegacyDefault(res);

  let ordinalIdx = 1; // 1 = Primero (tabla de sanciones), ya usado arriba
  const articulosVariablesHtml = res.articulosVariables.map(a => {
    ordinalIdx++;
    return _htmlBloqueArticulo(ordinalIdx, a.textoResuelto);
  }).join('');

  const articulosFijosHtml = ['apelacion', 'comuniquese', 'fechaCierre']
    .map(clave => fijos[clave])
    .filter(item => item && item.activo)
    .map(item => {
      ordinalIdx++;
      return _htmlBloqueArticulo(ordinalIdx, item.texto);
    }).join('');

  const considerandoHtml = fijos.considerando?.activo ? `
        <div class="res-doc-considerando">
          <span class="res-considerando-cab">Considerando</span>
          ${fijos.considerando.texto}
        </div>` : '';

  return `
    <div class="res-documento">
      <div class="res-doc-encabezado">
        <div class="res-doc-torneo">${torneoActual?.nombre || 'Torneo'}</div>
        <div class="res-doc-titulo">${numeroTexto}</div>
        <div class="res-doc-fecha-pill">${fechaTexto}</div>
      </div>
      <div class="res-doc-cuerpo">
        <p class="res-doc-intro">Por medio de la cual se resuelven asuntos relacionados con los participantes del torneo:</p>
        ${considerandoHtml}

        <div class="res-articulo">
          <div class="res-articulo-cab">
            <span class="res-articulo-chip">1°</span>
            <span class="res-articulo-titulo">Artículo primero</span>
          </div>
          <p class="res-articulo-texto" style="margin-bottom:.85rem">Sancionar a los siguientes jugadores:</p>
          <div class="res-tabla-wrap">
            <table class="res-sanciones">
              <thead>
                <tr><th>Fecha</th><th>Categoría</th><th>Jugador</th><th>Equipo</th><th>Sanción</th><th>Contendor</th><th>Multa</th></tr>
              </thead>
              <tbody>${filasSanciones}</tbody>
            </table>
          </div>
        </div>

        ${articulosVariablesHtml}
        ${articulosFijosHtml}

        <div class="res-doc-pie">Comisión de Disciplina y Castigo Torneo ${torneoActual?.nombre || ''}</div>
      </div>
    </div>
  `;
}

function _htmlBloqueArticulo(ordinalIdx, texto) {
  return `
    <div class="res-articulo">
      <div class="res-articulo-cab">
        <span class="res-articulo-chip">${ordinalIdx}°</span>
        <span class="res-articulo-titulo">Artículo ${_ordinalArticulo(ordinalIdx).toLowerCase()}</span>
      </div>
      <p class="res-articulo-texto">${texto}</p>
    </div>
  `;
}

function _formatoFechaCortaResolucion(fechaISO) {
  const d = new Date(fechaISO + 'T00:00:00');
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/* ──────────────────────────────────────────────
   GUARDAR BORRADOR / PUBLICAR
   ────────────────────────────────────────────── */

function guardarBorradorResolucion() {
  if (!_borradorActual) return;
  if (!resolucionesActual.some(r => r.id === _borradorActual.id)) {
    resolucionesActual.push(_borradorActual);
  }
  guardarResolucionesLocal(resolucionesActual);
  mostrarExito('Borrador guardado. Puedes retomarlo cuando quieras.');
}

async function publicarResolucion() {
  if (!_borradorActual) return;
  if (!_borradorActual.fecha) { mostrarError('Selecciona la fecha de la resolución.'); return; }
  if (_borradorActual.tablaSanciones.length === 0) { mostrarError('Agrega al menos un jugador sancionado.'); return; }
  const filaIncompleta = _borradorActual.tablaSanciones.find(f => !f.equipo || !f.jugador || !f.contendor);
  if (filaIncompleta) { mostrarError('Completa equipo, jugador y contendor en todas las filas de sanciones.'); return; }

  const ok = await confirmarAccion({
    titulo: 'Publicar resolución',
    mensaje: 'Al publicar se le asigna un número definitivo y ya no se podrá editar el contenido. ¿Continuar?',
    textoConfirmar: 'Publicar',
    peligro: false
  });
  if (!ok) return;

  mostrarCarga('Publicando resolución...');
  try {
    _borradorActual.numero = _resolucionesContador + 1;
    _borradorActual.estado = 'publicada';
    _resolucionesContador  = _borradorActual.numero;
    guardarResolucionesContadorLocal(_resolucionesContador);

    if (!resolucionesActual.some(r => r.id === _borradorActual.id)) {
      resolucionesActual.push(_borradorActual);
    }
    guardarResolucionesLocal(resolucionesActual);

    _borradorActual.tablaSanciones.forEach(fila => {
      if (Number(fila.multa) > 0) {
        const jugador = jugadoresActual.find(j => j.equipo === fila.equipo && j.nombre === fila.jugador);
        if (jugador) agregarCargoResolucion(jugador.id, _borradorActual.numero, fila.tipoSancion, fila.multa);
      }

      if (fila.statsId) {
        const s = statsActual.find(x => x.id === fila.statsId);
        if (s) s.sancionado = true;
      } else {
        const candidatos = statsActual.filter(s => s.equipo === fila.equipo && s.jugador === fila.jugador && s.rojas > 0 && !s.sancionado);
        if (candidatos.length === 1) candidatos[0].sancionado = true;
      }
    });
    guardarStatsLocal(statsActual);

    await _sincronizarResolucionesSheets();
    await _sincronizarFinanzasSheets();

    mostrarExito(`✅ Resolución #${_borradorActual.numero} publicada`);
  } catch (err) {
    // La resolución ya quedó guardada localmente con su número definitivo (eso
    // pasó antes de intentar sincronizar) — si falla la sincronización con Sheets
    // no se pierde ni se debe reintentar publicar, solo avisamos que falló el respaldo.
    mostrarError('La resolución quedó guardada, pero no se pudo sincronizar con Google Sheets: ' + err.message);
  } finally {
    ocultarCarga();
    // No se llama renderizarResoluciones() aquí: esa función también restaura la
    // pestaña activa, y si el usuario ya navegó a otra mientras esto sincronizaba
    // en segundo plano, lo regresaría a "Nueva" sin que lo pidiera. Se refresca
    // cada parte por separado, dejando la pestaña actual intacta. Va en `finally`
    // (no solo en el camino feliz) porque los datos ya se guardaron localmente
    // antes del intento de sync, sin importar si ese sync falla.
    if (_borradorActual?.estado === 'publicada') _borradorActual = _crearBorradorVacio();
    _renderizarConstructorResolucion();
    _renderizarPendientesSancion();
    _renderizarHistoricoResoluciones();
    renderizarEquipos();
  }
}

/* ──────────────────────────────────────────────
   PENDIENTES DE SANCIONAR
   ────────────────────────────────────────────── */

function _renderizarPendientesSancion() {
  const cont = document.getElementById('res-pendientes-lista');
  if (!cont) return;

  const pendientes = statsActual.filter(s => s.rojas > 0 && !s.sancionado);
  if (pendientes.length === 0) {
    cont.innerHTML = '<p class="sin-datos">Sin jugadores pendientes de sancionar.</p>';
    return;
  }

  const filas = pendientes.map(s => {
    const partido  = fixtureActual.find(p => p.id === s.partidoId);
    const horario  = horariosActual.find(h => h.partidoId === s.partidoId);
    const fechaTxt = horario?.fecha ? _formatoFechaCortaResolucion(horario.fecha) : (partido ? `Jornada ${partido.jornada}` : '–');
    const tipo     = s.amarillas >= 2 ? 'Doble amarilla' : 'Roja directa';
    return `
      <tr>
        <td><strong>${s.jugador}</strong></td>
        <td class="equipo-tag">${s.equipo}</td>
        <td>${fechaTxt}</td>
        <td>${tipo}</td>
        <td class="col-acciones">
          <button class="btn-principal btn-xs" onclick="agregarDesdePendiente('${s.id}')"><i class="bi bi-plus-lg"></i> Agregar a resolución</button>
        </td>
      </tr>
    `;
  }).join('');

  cont.innerHTML = `
    <div class="tabla-wrapper">
      <table class="tabla-datos tabla-compacta">
        <thead><tr><th>Jugador</th><th>Equipo</th><th>Fecha</th><th>Tipo</th><th></th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  `;
}

function agregarDesdePendiente(statId) {
  const s = statsActual.find(x => x.id === statId);
  if (!s) return;
  if (!_borradorActual) _borradorActual = _crearBorradorVacio();

  _borradorActual.tablaSanciones.push({
    id: 'FS_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    equipo: s.equipo,
    jugador: s.jugador,
    tipoSancion: s.amarillas >= 2 ? 'Doble amarilla' : 'Roja directa',
    jornadasSancionadas: 1,
    contendor: '',
    multa: 0,
    statsId: s.id
  });

  mostrarPestanaResoluciones('nueva');
  _renderizarConstructorResolucion();
  mostrarExito(`${s.jugador} agregado a la resolución en curso`);
}

/* ──────────────────────────────────────────────
   HISTÓRICO
   ────────────────────────────────────────────── */

function _renderizarHistoricoResoluciones() {
  const cont = document.getElementById('res-historico-lista');
  if (!cont) return;

  const publicadas = resolucionesActual.filter(r => r.estado === 'publicada').sort((a, b) => b.numero - a.numero);
  if (publicadas.length === 0) {
    cont.innerHTML = '<p class="sin-datos">Aún no hay resoluciones publicadas.</p>';
    return;
  }

  cont.innerHTML = `
    <div class="tabla-wrapper">
      <table class="tabla-datos tabla-compacta">
        <thead><tr><th>#</th><th>Fecha</th><th>Sancionados</th><th></th></tr></thead>
        <tbody>
          ${publicadas.map(r => `
            <tr>
              <td class="col-num">${r.numero}</td>
              <td>${r.fecha ? _formatoFechaLegible(r.fecha) : '–'}</td>
              <td class="col-num">${r.tablaSanciones.length}</td>
              <td class="col-acciones">
                <button class="btn-secundario btn-xs" onclick="verResolucionHistorico(${r.numero})" title="Ver"><i class="bi bi-eye-fill"></i></button>
                <button class="btn-secundario btn-xs" onclick="descargarResolucionPDF(${r.numero})" title="Descargar PDF"><i class="bi bi-download"></i></button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function verResolucionHistorico(numero) {
  const res  = resolucionesActual.find(r => r.numero === numero);
  const cont = document.getElementById('res-historico-detalle');
  if (!res || !cont) return;
  cont.innerHTML = `
    <div class="seccion-header" style="margin-top:1.25rem">
      <h3>Resolución #${numero} <span style="font-weight:400;font-size:.8rem;color:var(--c-text-muted)">(solo lectura)</span></h3>
      <button class="btn-secundario btn-pequeño" onclick="document.getElementById('res-historico-detalle').innerHTML=''"><i class="bi bi-x-lg"></i> Cerrar</button>
    </div>
    ${_htmlDocumentoResolucion(res)}
  `;
  cont.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ──────────────────────────────────────────────
   PLANTILLAS (CRUD)
   ────────────────────────────────────────────── */

function _renderizarPlantillas() {
  _poblarSelectPlantillas();
  const cont = document.getElementById('res-plantillas-lista');
  if (!cont) return;

  if (plantillasActual.length === 0) {
    cont.innerHTML = '<p class="sin-datos">Aún no hay plantillas guardadas.</p>';
    return;
  }

  cont.innerHTML = plantillasActual.map(p => `
    <div class="jugadores-card" style="margin-bottom:.75rem">
      <div class="seccion-header" style="margin-bottom:.5rem">
        <h4 style="font-size:.92rem">${p.nombre}</h4>
        <div class="res-botones-plantilla">
          <button class="btn-secundario btn-xs" onclick="iniciarEditarPlantilla('${p.id}')" title="Editar"><i class="bi bi-pencil-fill"></i></button>
          <button class="btn-peligro btn-xs" onclick="eliminarPlantilla('${p.id}')" title="Eliminar"><i class="bi bi-trash3-fill"></i></button>
        </div>
      </div>
      <p class="info-texto" style="margin:0">${p.texto}</p>
    </div>
  `).join('');
}

function guardarPlantilla() {
  const nombre = document.getElementById('res-plantilla-nombre')?.value?.trim();
  const texto  = document.getElementById('res-plantilla-texto')?.value?.trim();
  if (!nombre || !texto) { mostrarError('Completa el nombre y el texto de la plantilla.'); return; }

  if (_plantillaEditandoId) {
    const p = plantillasActual.find(x => x.id === _plantillaEditandoId);
    if (p) { p.nombre = nombre; p.texto = texto; }
  } else {
    plantillasActual.push({ id: 'PL_' + Date.now(), nombre, texto });
  }

  guardarPlantillasResolucionLocal(plantillasActual);
  cancelarEdicionPlantilla();
  _renderizarPlantillas();
  mostrarExito('Plantilla guardada');
  _sincronizarPlantillasSheets().catch(err => mostrarError('No se pudo sincronizar la plantilla: ' + err.message));
}

function iniciarEditarPlantilla(id) {
  const p = plantillasActual.find(x => x.id === id);
  if (!p) return;
  _plantillaEditandoId = id;
  document.getElementById('res-plantilla-nombre').value = p.nombre;
  document.getElementById('res-plantilla-texto').value  = p.texto;
  document.getElementById('res-plantilla-form-titulo').innerHTML = '<i class="bi bi-pencil-fill"></i> Editando plantilla';
  document.getElementById('res-btn-cancelar-plantilla')?.classList.remove('oculto');
  document.getElementById('res-plantilla-nombre')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelarEdicionPlantilla() {
  _plantillaEditandoId = null;
  const nombreEl = document.getElementById('res-plantilla-nombre');
  const textoEl  = document.getElementById('res-plantilla-texto');
  if (nombreEl) nombreEl.value = '';
  if (textoEl)  textoEl.value  = '';
  document.getElementById('res-plantilla-form-titulo').innerHTML = '<i class="bi bi-file-earmark-plus-fill"></i> Nueva plantilla';
  document.getElementById('res-btn-cancelar-plantilla')?.classList.add('oculto');
}

async function eliminarPlantilla(id) {
  const ok = await confirmarAccion({
    titulo: 'Eliminar plantilla',
    mensaje: '¿Eliminar esta plantilla? Las resoluciones que ya la usaron no se ven afectadas: su texto quedó copiado en cada una.',
    textoConfirmar: 'Eliminar'
  });
  if (!ok) return;

  plantillasActual = plantillasActual.filter(p => p.id !== id);
  guardarPlantillasResolucionLocal(plantillasActual);
  _renderizarPlantillas();
  try { await _sincronizarPlantillasSheets(); } catch (err) { mostrarError('No se pudo sincronizar: ' + err.message); }
}

/* ──────────────────────────────────────────────
   SYNC CON GOOGLE SHEETS
   ────────────────────────────────────────────── */

async function _sincronizarResolucionesSheets() {
  const sheetId = torneoActual?.sheetId;
  if (!sheetId) return;
  await agregarHojaSiNoExiste(sheetId, 'Resoluciones');
  const filas = [
    ['Numero', 'Fecha', 'Estado', 'JSON'],
    ...resolucionesActual.map(r => [r.numero ?? '', r.fecha || '', r.estado, JSON.stringify(r)])
  ];
  await limpiarYEscribir(sheetId, 'Resoluciones', filas);
}

async function _sincronizarPlantillasSheets() {
  const sheetId = torneoActual?.sheetId;
  if (!sheetId) return;
  await agregarHojaSiNoExiste(sheetId, 'Plantillas_Resolucion');
  const filas = [
    ['ID', 'Nombre', 'Texto'],
    ...plantillasActual.map(p => [p.id, p.nombre, p.texto])
  ];
  await limpiarYEscribir(sheetId, 'Plantillas_Resolucion', filas);
}

/* ──────────────────────────────────────────────
   DESCARGA EN PDF (html2canvas + jsPDF)
   ────────────────────────────────────────────── */

async function _descargarNodoComoPDF(nodoHTML, nombreArchivo) {
  if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
    mostrarError('El módulo de PDF no está disponible. Verifica tu conexión a internet.');
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:740px;background:#fff;';
  wrapper.innerHTML = nodoHTML;
  document.body.appendChild(wrapper);

  mostrarCarga('Generando PDF...');
  try {
    const canvas = await html2canvas(wrapper, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth  = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth   = pageWidth;
    const imgHeight  = (canvas.height * imgWidth) / canvas.width;
    // JPEG en vez de PNG: el degradado del encabezado comprime muy mal como PNG
    // (varios MB para una sola página) — en JPEG queda liviano para compartir por WhatsApp.
    const imgData    = canvas.toDataURL('image/jpeg', 0.92);

    let heightLeft = imgHeight;
    let position   = 0;
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`${nombreArchivo}.pdf`);
    mostrarExito('✅ PDF descargado correctamente');
  } catch (err) {
    mostrarError('No se pudo generar el PDF: ' + err.message);
  } finally {
    document.body.removeChild(wrapper);
    ocultarCarga();
  }
}

function descargarResolucionPDF(numero) {
  const res = resolucionesActual.find(r => r.numero === numero);
  if (!res) return;
  const nombre = `Resolucion_${String(numero).padStart(3, '0')}_${(torneoActual?.nombre || 'torneo').replace(/[^a-zA-Z0-9]/g, '_')}`;
  _descargarNodoComoPDF(_htmlDocumentoResolucion(res), nombre);
}

function descargarBorradorPDF() {
  if (!_borradorActual) return;
  const nombre = `Resolucion_borrador_${(torneoActual?.nombre || 'torneo').replace(/[^a-zA-Z0-9]/g, '_')}`;
  _descargarNodoComoPDF(_htmlDocumentoResolucion(_borradorActual), nombre);
}

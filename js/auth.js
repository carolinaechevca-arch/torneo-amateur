/* =============================================
   auth.js – Autenticación con Google usando GSI
   ============================================= */

const CLIENT_ID = '1066256690452-4pu3ucqo1n8rgdkqh5tkq35bacm2p6lv.apps.googleusercontent.com';
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file'
].join(' ');

let tokenClient = null;
let _accessToken = null;
let _usuarioActual = null;
let _refrescoTokenTimeoutId = null;

/* Inicializa el cliente de token de Google Identity Services */
function inicializarAuth() {
  if (typeof google === 'undefined') {
    setTimeout(inicializarAuth, 300);
    return;
  }

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: _manejarTokenRespuesta,
    error_callback: _manejarErrorVentanaOAuth,
  });

  // Restaurar token guardado en la sesión actual
  const tokenGuardado = sessionStorage.getItem('ga_token');
  const expira = parseInt(sessionStorage.getItem('ga_exp') || '0');

  if (tokenGuardado && Date.now() < expira) {
    _accessToken = tokenGuardado;
    _programarRefrescoToken(expira);
    _verificarYMostrarApp();
  }
}

/* Procesa la respuesta del token de Google */
async function _manejarTokenRespuesta(resp) {
  if (resp.error) {
    const detalle = resp.error_description || _mensajeErrorOAuth(resp.error);
    _mostrarErrorLogin(detalle, resp.error, resp.error_uri);
    mostrarError('No se pudo iniciar sesión: ' + detalle);
    return;
  }

  try {
    if (!resp.access_token) throw new Error('Google no devolvió un token de acceso.');

    _accessToken = resp.access_token;
    // Guardar token con 1 minuto de margen antes de vencimiento
    const expira = Date.now() + Number(resp.expires_in || 3600) * 1000 - 60_000;
    sessionStorage.setItem('ga_token', _accessToken);
    sessionStorage.setItem('ga_exp', String(expira));
    _programarRefrescoToken(expira);

    await _cargarPerfilUsuario();
    _limpiarErrorLogin();
    _verificarYMostrarApp();
  } catch (err) {
    const detalle = err?.message || String(err);
    _mostrarErrorLogin(detalle, 'error_al_procesar_token');
    mostrarError('No se pudo completar el inicio de sesión: ' + detalle);
  }
}

/* Google comunica por este callback los errores de la ventana emergente que no
   forman parte de la respuesta OAuth (por ejemplo, popup bloqueado o cerrado). */
function _manejarErrorVentanaOAuth(err) {
  const tipo = err?.type || 'error_desconocido';
  const mensajes = {
    popup_failed_to_open: 'El navegador bloqueó la ventana de inicio de sesión de Google. Habilita las ventanas emergentes e inténtalo nuevamente.',
    popup_closed: 'La ventana de Google se cerró antes de terminar la autorización.',
    unknown: 'Google no pudo abrir o completar la ventana de autorización.'
  };
  const detalle = mensajes[tipo] || err?.message || 'Ocurrió un error al abrir el acceso con Google.';
  _mostrarErrorLogin(detalle, tipo);
  mostrarError(detalle);
}

function _mensajeErrorOAuth(codigo) {
  const mensajes = {
    access_denied: 'Google rechazó el acceso para esta cuenta. Verifica que sea un usuario de prueba autorizado y que hayas aceptado todos los permisos.',
    admin_policy_enforced: 'El administrador de esta cuenta bloqueó el acceso a Google Drive o Sheets para esta aplicación.',
    disallowed_useragent: 'Google no permite iniciar sesión desde este navegador o ventana.',
    invalid_client: 'La configuración de acceso de la aplicación no es válida.',
    invalid_scope: 'La aplicación está solicitando un permiso que Google no reconoce.',
    org_internal: 'Esta aplicación solo permite cuentas de la organización configurada.'
  };
  return mensajes[codigo] || `Google devolvió el error “${codigo}”.`;
}

function _mostrarErrorLogin(mensaje, codigo, errorUri) {
  const cont = document.getElementById('login-error');
  const mensajeEl = document.getElementById('login-error-mensaje');
  const codigoEl = document.getElementById('login-error-codigo');
  if (!cont) return;

  if (mensajeEl) mensajeEl.textContent = mensaje || 'Google no permitió completar el acceso.';
  if (codigoEl) {
    const partes = [];
    if (codigo) partes.push(`Código: ${codigo}`);
    if (errorUri) partes.push(`Detalles: ${errorUri}`);
    codigoEl.textContent = partes.join(' · ');
  }
  cont.classList.remove('oculto');
}

function _limpiarErrorLogin() {
  document.getElementById('login-error')?.classList.add('oculto');
}

/* Programa un refresco silencioso (sin popup) un poco antes de que venza el
   token, para que la sesión de Google Sheets/Drive nunca se corte mientras
   la pestaña siga abierta. Cada refresco vuelve a llamar a este mismo
   callback (_manejarTokenRespuesta), que reprograma el siguiente. */
function _programarRefrescoToken(expiraEnMs) {
  if (_refrescoTokenTimeoutId) clearTimeout(_refrescoTokenTimeoutId);
  const demora = Math.max(0, expiraEnMs - Date.now());
  _refrescoTokenTimeoutId = setTimeout(_refrescarTokenSilenciosamente, demora);
}

/* Pide un token nuevo sin mostrar el popup de consentimiento (prompt: ''):
   funciona sola si el usuario sigue con sesión de Google iniciada en el
   navegador y ya había autorizado esta app antes. Si falla (sesión de Google
   cerrada, consentimiento revocado, etc.), el error lo maneja
   _manejarTokenRespuesta como con cualquier otro pedido de token. */
function _refrescarTokenSilenciosamente() {
  if (!tokenClient) return;
  tokenClient.requestAccessToken({ prompt: '' });
}

/* Obtiene el nombre del usuario autenticado */
async function _cargarPerfilUsuario() {
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${_accessToken}` }
    });
    if (r.ok) {
      _usuarioActual = await r.json();
      const el = document.getElementById('usuario-nombre');
      if (el && _usuarioActual.name) el.textContent = _usuarioActual.name;
    }
  } catch (_) { /* perfil no crítico */ }
}

/* Decide qué pantalla mostrar según si hay torneo guardado */
function _verificarYMostrarApp() {
  const datos = cargarTorneoLocal();
  if (datos && datos.sheetId) {
    mostrarPantalla('app');
    cargarDatosApp();
  } else {
    mostrarPantalla('setup');
    actualizarCamposEquipos();
  }
}

/* Inicia el flujo OAuth con la ventana emergente de Google */
function iniciarSesion() {
  _limpiarErrorLogin();
  if (!tokenClient) {
    inicializarAuth();
    // Esperar a que GSI esté listo antes de pedir token
    setTimeout(() => tokenClient && tokenClient.requestAccessToken({ prompt: 'consent' }), 800);
  } else {
    tokenClient.requestAccessToken({ prompt: 'consent' });
  }
}

/* Cierra sesión y limpia todos los datos de sesión */
function cerrarSesion() {
  if (_refrescoTokenTimeoutId) clearTimeout(_refrescoTokenTimeoutId);
  if (_accessToken) {
    google.accounts.oauth2.revoke(_accessToken, () => {});
  }
  _accessToken = null;
  _usuarioActual = null;
  sessionStorage.removeItem('ga_token');
  sessionStorage.removeItem('ga_exp');
  mostrarPantalla('login');
}

/* Devuelve el token de acceso actual */
function obtenerToken() {
  return _accessToken;
}

/* Muestra una pantalla y oculta las demás */
function mostrarPantalla(cual) {
  const pantallas = ['login', 'setup', 'app'];
  pantallas.forEach(p => {
    const el = document.getElementById(`pantalla-${p}`);
    if (el) el.classList.toggle('oculto', p !== cual);
  });

  // El botón de logout flotante solo aparece en setup (en la app va en el sidebar)
  const btnLogout = document.getElementById('btn-logout-fijo');
  if (btnLogout) btnLogout.classList.toggle('oculto', cual !== 'setup');

  // El switch de tema flotante se oculta en la app (el sidebar tiene el suyo)
  const temaWrapper = document.querySelector('.tema-switch-wrapper');
  if (temaWrapper) temaWrapper.classList.toggle('oculto', cual === 'app');

  // Al mostrar la app, restaurar estado de colapso del sidebar
  if (cual === 'app') {
    const sidebar = document.getElementById('app-sidebar');
    if (sidebar && window.innerWidth >= 768 && localStorage.getItem('ta_sidebar_col') === '1') {
      sidebar.classList.add('colapsado');
    }
  }
}


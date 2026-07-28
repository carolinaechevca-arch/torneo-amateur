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
    mostrarError('No se pudo iniciar sesión: ' + (resp.error_description || resp.error));
    return;
  }

  _accessToken = resp.access_token;
  // Guardar token con 1 minuto de margen antes de vencimiento
  const expira = Date.now() + resp.expires_in * 1000 - 60_000;
  sessionStorage.setItem('ga_token', _accessToken);
  sessionStorage.setItem('ga_exp', String(expira));
  _programarRefrescoToken(expira);

  await _cargarPerfilUsuario();
  _verificarYMostrarApp();
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


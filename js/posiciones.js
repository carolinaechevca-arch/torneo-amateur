/* =============================================
   posiciones.js – Tabla de posiciones y clasificación
   ============================================= */

/* Calcula la tabla de posiciones a partir del fixture con resultados.
   Ordena por: puntos → diferencia de goles → goles a favor → nombre. */
function calcularClasificacion() {
  if (!torneoActual || !fixtureActual.length) return [];

  // Inicializar un objeto por equipo
  const tabla = {};
  torneoActual.equipos.forEach(e => {
    tabla[e] = { equipo: e, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 };
  });

  // Procesar solo partidos jugados
  fixtureActual
    .filter(p => p.estado === 'jugado')
    .forEach(p => {
      const gl = Number(p.golesLocal)     || 0;
      const gv = Number(p.golesVisitante) || 0;

      const local  = tabla[p.local];
      const visita = tabla[p.visitante];
      if (!local || !visita) return;

      local.pj++;  visita.pj++;
      local.gf  += gl; local.gc  += gv;
      visita.gf += gv; visita.gc += gl;

      if (gl > gv) {
        local.pg++;  local.pts  += 3;
        visita.pp++;
      } else if (gl < gv) {
        visita.pg++; visita.pts += 3;
        local.pp++;
      } else {
        local.pe++;  local.pts++;
        visita.pe++; visita.pts++;
      }
    });

  // Calcular diferencia de goles
  Object.values(tabla).forEach(e => { e.dg = e.gf - e.gc; });

  // Ordenar
  return Object.values(tabla).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.dg  !== a.dg)  return b.dg  - a.dg;
    if (b.gf  !== a.gf)  return b.gf  - a.gf;
    return a.equipo.localeCompare(b.equipo);
  });
}

/* Renderiza la tabla de posiciones en el DOM */
function renderizarPosiciones() {
  const contenedor = document.getElementById('tabla-posiciones-container');
  if (!contenedor) return;

  const pos = calcularClasificacion();

  if (pos.length === 0) {
    contenedor.innerHTML = '<p class="sin-datos">Aún no hay resultados para mostrar posiciones.</p>';
    return;
  }

  const coloresClase = ['primer-lugar', 'segundo-lugar', 'tercer-lugar'];
  const medallas     = ['🥇', '🥈', '🥉'];

  const filas = pos.map((e, i) => {
    const clase    = coloresClase[i] || '';
    const medalla  = medallas[i]   || '';
    const signo    = e.dg > 0 ? '+' : '';

    return `
      <tr class="${clase}">
        <td class="col-pos">${medalla || i + 1}</td>
        <td class="col-equipo">${e.equipo}</td>
        <td>${e.pj}</td>
        <td>${e.pg}</td>
        <td>${e.pe}</td>
        <td>${e.pp}</td>
        <td>${e.gf}</td>
        <td>${e.gc}</td>
        <td class="${e.dg >= 0 ? 'dg-positivo' : 'dg-negativo'}">${signo}${e.dg}</td>
        <td class="col-pts"><strong>${e.pts}</strong></td>
      </tr>
    `;
  }).join('');

  contenedor.innerHTML = `
    <div id="tabla-posiciones" class="tabla-wrapper">
      <table class="tabla-datos">
        <thead>
          <tr>
            <th>#</th>
            <th class="col-equipo">Equipo</th>
            <th title="Partidos jugados">PJ</th>
            <th title="Partidos ganados">PG</th>
            <th title="Partidos empatados">PE</th>
            <th title="Partidos perdidos">PP</th>
            <th title="Goles a favor">GF</th>
            <th title="Goles en contra">GC</th>
            <th title="Diferencia de goles">DG</th>
            <th title="Puntos">Pts</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      <p class="tabla-nota">🥇 Campeón &nbsp;🥈 Segundo &nbsp;🥉 Tercero</p>
    </div>
  `;
}

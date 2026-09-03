/**
 * Rifa a beneficio de Fernanda — Frontend
 *
 * CONFIGURACIÓN: pega aquí la URL de tu Apps Script desplegado como Web App
 * (termina en /exec). Mientras esté vacía, el sitio corre en MODO DEMO con
 * datos de ejemplo para que puedas ver todo funcionando.
 */
const API_URL = 'https://script.google.com/macros/s/AKfycbwzY-H78plll9nMB_Ny_LhCnH-CkkPPX9-8z67Ic-X8qxfJmkGLrodR2mWkGIpZDvj6/exec';

const PRECIO_FALLBACK = 2000;
const DEMO_MODE = !API_URL;

// Datos iniciales instantáneos mientras llega la respuesta (lenta) de Apps Script:
// snapshot del repo (lo refresca un GitHub Action cada hora) + cache del navegador.
const SNAPSHOT_URL = 'data/snapshot.json';
const CACHE_KEY = 'rifa-fer-data';

const clp = (n) => '$' + Number(n).toLocaleString('es-CL');

// ------------------------------------------------------------------ estado

let data = null;
let vendedorActual = null;
let seleccionados = new Set(); // números elegidos del encargado(a) actual

// ------------------------------------------------------------------ carga

async function cargarDatos() {
  if (DEMO_MODE) {
    data = datosDemo();
    render();
    document.getElementById('grid-hint').textContent =
      '⚠️ Modo demo con datos de ejemplo — configura API_URL en js/app.js para conectar con el sheet real.';
    return;
  }

  // Pintado instantáneo: última visita (localStorage) o snapshot del repo.
  if (!data) {
    const previo = leerCache() || (await leerSnapshot());
    if (previo) {
      data = previo;
      render();
      setUpdating(true);
    }
  }

  try {
    const res = await fetch(API_URL);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Respuesta inválida');
    data = json;
    guardarCache(json);
    render();
  } catch (err) {
    if (!data) {
      document.getElementById('faltan').textContent =
        'No pudimos cargar los datos de la rifa. Recarga la página o inténtalo más tarde.';
    }
    console.error('Error cargando datos:', err);
  } finally {
    setUpdating(false);
  }
}

function leerCache() {
  try {
    const json = JSON.parse(localStorage.getItem(CACHE_KEY));
    return json && json.ok ? json : null;
  } catch {
    return null;
  }
}

function guardarCache(json) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(json));
  } catch {
    /* modo incógnito o storage lleno: seguimos sin cache */
  }
}

async function leerSnapshot() {
  try {
    const res = await fetch(SNAPSHOT_URL, { cache: 'no-cache' });
    if (!res.ok) return null;
    const json = await res.json();
    return json && json.ok ? json : null;
  } catch {
    return null;
  }
}

function setUpdating(visible) {
  document.getElementById('updating').hidden = !visible;
}

// ------------------------------------------------------------------ render

function render() {
  renderProgreso();
  renderVendedores();
  renderGrid();
}

function renderProgreso() {
  const { meta, recaudado, totales } = data;
  const pct = meta > 0 ? Math.round((recaudado / meta) * 100) : 0;
  const faltan = Math.max(0, meta - recaudado);

  document.getElementById('recaudado').textContent = clp(recaudado);
  document.getElementById('meta').textContent = clp(meta);
  document.getElementById('porcentaje').textContent = pct + '%';
  document.getElementById('barra-fill').style.width = Math.min(100, pct) + '%';
  document.getElementById('barra').setAttribute('aria-valuenow', pct);
  document.getElementById('faltan').textContent =
    faltan > 0 ? `Nos faltan ${clp(faltan)} para completar la rifa 💪` : '¡Meta cumplida! Gracias a todos 🎉';

  document.getElementById('stat-pagados').textContent = totales.pagados;
  document.getElementById('stat-reservados').textContent = totales.reservados;
  document.getElementById('stat-disponibles').textContent = totales.disponibles;
}

function renderVendedores() {
  const select = document.getElementById('vendedor-select');
  select.innerHTML = '';

  data.vendedores.forEach((v) => {
    const disponibles = v.numeros.filter((n) => esDisponible(n.estado)).length;
    const opt = document.createElement('option');
    opt.value = v.vendedor;
    opt.textContent = `${v.vendedor} (${disponibles} disponibles)`;
    select.appendChild(opt);
  });

  if (!vendedorActual || !data.vendedores.some((v) => v.vendedor === vendedorActual)) {
    vendedorActual = data.vendedores[0]?.vendedor || null;
  }
  select.value = vendedorActual;
}

function renderGrid() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';

  const vendedor = data.vendedores.find((v) => v.vendedor === vendedorActual);
  if (!vendedor) return;

  // Tras un refresco de datos, soltamos números que ya no están disponibles.
  seleccionados.forEach((num) => {
    const n = vendedor.numeros.find((x) => x.numero === num);
    if (!n || !esDisponible(n.estado)) seleccionados.delete(num);
  });
  actualizarSelectbar();

  vendedor.numeros.forEach((n) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = n.numero;
    btn.className = 'number';
    btn.setAttribute('role', 'listitem');

    const estado = n.estado.toLowerCase();
    if (estado === 'pagado') {
      btn.classList.add('number--pagado');
      btn.disabled = true;
      btn.title = 'Pagado';
    } else if (estado === 'reservado') {
      btn.classList.add('number--reservado');
      btn.disabled = true;
      btn.title = 'Reservado';
    } else {
      btn.classList.toggle('number--selected', seleccionados.has(n.numero));
      btn.title = `Seleccionar el número ${n.numero}`;
      btn.setAttribute('aria-pressed', seleccionados.has(n.numero));
      btn.addEventListener('click', () => toggleSeleccion(n.numero));
    }

    grid.appendChild(btn);
  });
}

function esDisponible(estado) {
  const e = String(estado).trim().toLowerCase();
  return e === '' || e === 'disponible';
}

// ------------------------------------------------------------------ selección

function toggleSeleccion(numero) {
  if (seleccionados.has(numero)) seleccionados.delete(numero);
  else seleccionados.add(numero);
  renderGrid();
}

function actualizarSelectbar() {
  const bar = document.getElementById('selectbar');
  const count = seleccionados.size;
  bar.hidden = count === 0;
  if (!count) return;
  const total = count * (data?.precio || PRECIO_FALLBACK);
  document.getElementById('selectbar-text').textContent =
    `${count} ${count === 1 ? 'número' : 'números'} · ${clp(total)}`;
}

function formatNumeros(nums) {
  const orden = [...nums].sort((a, b) => a - b);
  if (orden.length === 1) return 'el número ' + orden[0];
  return 'los números ' + orden.slice(0, -1).join(', ') + ' y ' + orden[orden.length - 1];
}

// ------------------------------------------------------------------ modal

function abrirModal() {
  if (!seleccionados.size || !vendedorActual) return;
  const total = seleccionados.size * (data?.precio || PRECIO_FALLBACK);
  document.getElementById('modal-numeros').textContent = formatNumeros([...seleccionados]);
  document.getElementById('modal-total').textContent = clp(total);
  document.getElementById('modal-vendedor').textContent = vendedorActual;
  document.getElementById('modal-error').hidden = true;
  document.getElementById('modal-form-view').hidden = false;
  document.getElementById('modal-success-view').hidden = true;
  document.getElementById('reserva-form').reset();
  document.getElementById('modal').hidden = false;
  document.getElementById('input-nombre').focus();
}

function cerrarModal() {
  document.getElementById('modal').hidden = true;
}

async function enviarReserva(event) {
  event.preventDefault();
  if (!seleccionados.size) return;

  const numeros = [...seleccionados].sort((a, b) => a - b);
  const nombre = document.getElementById('input-nombre').value.trim();
  const telefono = document.getElementById('input-telefono').value.trim();
  const submit = document.getElementById('modal-submit');
  const error = document.getElementById('modal-error');

  error.hidden = true;
  submit.disabled = true;
  submit.textContent = 'Reservando…';

  try {
    let resultado;
    if (DEMO_MODE) {
      await new Promise((r) => setTimeout(r, 600));
      resultado = { ok: true, reservados: numeros, fallidos: [] };
    } else {
      // Sin headers custom: el body viaja como text/plain y evita el preflight
      // CORS que Apps Script no soporta.
      const payload = { vendedor: vendedorActual, nombre, telefono };
      if (numeros.length === 1) payload.numero = numeros[0];
      else payload.numeros = numeros;
      const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
      resultado = await res.json();
    }

    if (!resultado.ok) throw new Error(resultado.error || 'No se pudo reservar.');

    const reservados = resultado.reservados || [resultado.numero];
    const fallidos = resultado.fallidos || [];
    reservados.forEach((num) => marcarReservadoLocal(vendedorActual, num));

    document.getElementById('success-numeros').textContent = formatNumeros(reservados);
    document.getElementById('success-vendedor').textContent = vendedorActual;
    document.getElementById('success-total').textContent =
      clp(reservados.length * (data?.precio || PRECIO_FALLBACK));

    const warning = document.getElementById('success-warning');
    if (fallidos.length) {
      warning.textContent =
        `Ojo: ${formatNumeros(fallidos.map((f) => f.numero))} ya no ` +
        `${fallidos.length === 1 ? 'estaba disponible y quedó' : 'estaban disponibles y quedaron'} fuera de la reserva.`;
      warning.hidden = false;
    } else {
      warning.hidden = true;
    }

    seleccionados.clear();
    document.getElementById('modal-form-view').hidden = true;
    document.getElementById('modal-success-view').hidden = false;
    render();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
    // Si los números se los ganó otro, refrescamos para mostrar el estado real.
    if (!DEMO_MODE) cargarDatos();
  } finally {
    submit.disabled = false;
    submit.textContent = 'Reservar 💗';
  }
}

function marcarReservadoLocal(vendedor, numero) {
  const v = data.vendedores.find((x) => x.vendedor === vendedor);
  const n = v?.numeros.find((x) => x.numero === numero);
  if (n) n.estado = 'Reservado';
  data.totales.reservados++;
  data.totales.disponibles--;
  data.comprometido += data.precio || PRECIO_FALLBACK;
}

// ------------------------------------------------------------------ demo

function datosDemo() {
  const vendedores = ['Daniela', 'Ivan', 'Caro'].map((nombre, vi) => ({
    vendedor: nombre,
    numeros: Array.from({ length: 50 }, (_, i) => {
      const numero = i + 1;
      let estado = 'Disponible';
      if ((numero + vi) % 11 === 0) estado = 'Pagado';
      else if ((numero + vi) % 7 === 0) estado = 'Reservado';
      return { numero, estado };
    }),
  }));

  let total = 0, pagados = 0, reservados = 0;
  vendedores.forEach((v) =>
    v.numeros.forEach((n) => {
      total++;
      if (n.estado === 'Pagado') pagados++;
      if (n.estado === 'Reservado') reservados++;
    })
  );

  return {
    ok: true,
    precio: PRECIO_FALLBACK,
    meta: total * PRECIO_FALLBACK,
    recaudado: pagados * PRECIO_FALLBACK,
    comprometido: reservados * PRECIO_FALLBACK,
    totales: { total, pagados, reservados, disponibles: total - pagados - reservados },
    vendedores,
  };
}

// ------------------------------------------------------------------ wiring

document.getElementById('vendedor-select').addEventListener('change', (e) => {
  vendedorActual = e.target.value;
  seleccionados.clear();
  renderGrid();
});

document.getElementById('selectbar-btn').addEventListener('click', abrirModal);

document.getElementById('reserva-form').addEventListener('submit', enviarReserva);

document.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', cerrarModal));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('modal').hidden) cerrarModal();
});

document.getElementById('copy-transfer').addEventListener('click', async (e) => {
  const texto = [
    'Daniela Beatriz Sandoval Heijboer',
    'RUT: 17.659.501-9',
    'Mercado Pago — Cuenta Vista',
    'N° de cuenta: 1012244925',
    'danielasandovalheijboer@gmail.com',
    'Monto: $2.000',
  ].join('\n');
  try {
    await navigator.clipboard.writeText(texto);
    e.target.textContent = '✅ ¡Copiado!';
    setTimeout(() => (e.target.textContent = '📋 Copiar datos'), 2000);
  } catch {
    e.target.textContent = 'No se pudo copiar 😕';
  }
});

cargarDatos();
// Refresco periódico para que el contador y la grilla se mantengan al día.
if (!DEMO_MODE) setInterval(cargarDatos, 60_000);

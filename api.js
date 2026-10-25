// ============================================================
//  api.js · Capa de datos (no toca el DOM)
//
//  - Validación de la consulta del usuario y de las respuestas
//  - Peticiones con tiempo límite y cancelación
//  - Cadena de endpoints ("join" anidado):
//
//      Eslabón 1  GET /pokemon?limit=…          → candidatos (cada uno trae su URL)
//         │  item.url
//      Eslabón 2  GET {item.url}                → valida que existe + tipos, stats…
//         │  poke.species.url
//      Eslabón 3  GET {poke.species.url}        → categoría, descripción, legendario…
// ============================================================
const API = "https://pokeapi.co/api/v2";
const ID_FORMAS = 10000;          // ids >= 10000 son formas alternativas (megas, regionales…)
const MAX_ID = ID_FORMAS - 1;
const TIMEOUT_MS = 8000;          // tiempo máximo por petición
const MAX_CONSULTA = 30;          // largo máximo del texto buscado
const MAX_CATALOGO = 2000;

let catalogo = null;              // [{id, nombre, url}] (eslabón 1)
let promesaCatalogo = null;
const cacheCadena = new Map();    // id → { poke, especie } (eslabones 2 y 3)

// ============================================================
//  Utilidades
// ============================================================
// Quita tildes, mayúsculas, apóstrofes y puntos; los espacios se vuelven guiones
// ("Mr. Mime" → "mr-mime", "Farfetch'd" → "farfetchd")
function normalizar(texto) {
  return String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/['’.]/g, "")
    .replace(/\s+/g, "-");
}

// "https://pokeapi.co/api/v2/pokemon/25/"  →  25
const idDesdeUrl = (url) => Number(url.split("/").filter(Boolean).pop());
const aItem = (r) => ({ id: idDesdeUrl(r.url), nombre: r.name, url: r.url });
const esCancelacion = (err) => err && err.name === "AbortError";

// ============================================================
//  Validación de la consulta (ANTES de hacer cualquier petición)
// ============================================================
function validarConsulta(texto) {
  const limpio = normalizar(texto);

  if (!limpio) {
    return { ok: false, motivo: "Escribe el nombre o el número de un Pokémon." };
  }
  if (limpio.length > MAX_CONSULTA) {
    return { ok: false, motivo: `La búsqueda es demasiado larga (máximo ${MAX_CONSULTA} caracteres).` };
  }
  if (!/^[a-z0-9-]+$/.test(limpio)) {
    return { ok: false, motivo: "Usa solo letras, números y guiones." };
  }

  const esNumero = /^\d+$/.test(limpio);
  if (esNumero && (Number(limpio) < 1 || Number(limpio) > MAX_ID)) {
    return { ok: false, motivo: `El número debe estar entre 1 y ${MAX_ID}.` };
  }
  return { ok: true, consulta: limpio, esNumero };
}

// ============================================================
//  Validación de las respuestas (forma mínima esperada)
// ============================================================
const esListaValida = (d) => Boolean(d) && Array.isArray(d.results);

const esPokemonValido = (d) =>
  Boolean(d) &&
  Number.isInteger(d.id) &&
  typeof d.name === "string" &&
  Array.isArray(d.types) &&
  Array.isArray(d.stats) &&
  Boolean(d.species && typeof d.species.url === "string");

const esEspecieValida = (d) =>
  Boolean(d) && Array.isArray(d.flavor_text_entries) && Array.isArray(d.genera);

// ============================================================
//  Petición base: tiempo límite + cancelación + control de errores HTTP
// ============================================================
async function api(ruta, { signal } = {}) {
  if (signal && signal.aborted) throw new DOMException("Petición cancelada", "AbortError");

  const ctrl = new AbortController();
  let expiro = false;
  const temporizador = setTimeout(() => {
    expiro = true;
    ctrl.abort();
  }, TIMEOUT_MS);
  const cancelarPorFuera = () => ctrl.abort();
  if (signal) signal.addEventListener("abort", cancelarPorFuera, { once: true });

  try {
    const res = await fetch(API + ruta, { signal: ctrl.signal });
    if (!res.ok) {
      const error = new Error(`HTTP ${res.status}`);
      error.status = res.status;      // fetch NO falla solo con 404/500: hay que revisarlo
      throw error;
    }
    return await res.json();
  } catch (err) {
    if (expiro) {
      const error = new Error("Tiempo de espera agotado");
      error.timeout = true;
      throw error;
    }
    throw err;
  } finally {
    clearTimeout(temporizador);
    if (signal) signal.removeEventListener("abort", cancelarPorFuera);
  }
}

// Sigue una URL que vino dentro de otra respuesta, pero SOLO si pertenece a PokeAPI
function apiUrl(url, opciones) {
  if (typeof url !== "string" || !url.startsWith(API + "/")) {
    throw new Error("URL no permitida");
  }
  return api(url.slice(API.length), opciones);
}

// ============================================================
//  Eslabón 1: lista de Pokémon (paginada o catálogo completo)
// ============================================================
async function listarPokemon(limite, offset = 0, opciones) {
  const l = Math.min(Math.max(parseInt(limite, 10) || 1, 1), MAX_CATALOGO);
  const o = Math.max(parseInt(offset, 10) || 0, 0);

  const data = await api(`/pokemon?limit=${l}&offset=${o}`, opciones);
  if (!esListaValida(data)) throw new Error("Respuesta inesperada de la API (lista)");
  return data;
}

function cargarCatalogo() {
  if (!promesaCatalogo) {
    promesaCatalogo = listarPokemon(MAX_CATALOGO, 0)
      .then((data) => {
        catalogo = data.results.map(aItem).filter((p) => p.id < ID_FORMAS);
        return catalogo;
      })
      .catch((err) => {
        promesaCatalogo = null;       // permite reintentar más tarde
        throw err;
      });
  }
  return promesaCatalogo;
}

// Candidatos que coinciden con el texto (primero los que EMPIEZAN con él)
function buscarCoincidencias(texto, limite = Infinity) {
  const q = normalizar(texto);
  if (!q || !catalogo) return [];

  // Si escribe solo números, busca por número de Pokédex
  if (/^\d+$/.test(q)) {
    const n = String(Number(q));
    const lista = catalogo.filter((p) => String(p.id).startsWith(n));
    lista.sort((a, b) => (String(a.id) === n ? -1 : 0) - (String(b.id) === n ? -1 : 0));
    return lista.slice(0, limite);
  }

  const empiezan = [];
  const contienen = [];
  for (const p of catalogo) {
    if (p.nombre.startsWith(q)) empiezan.push(p);
    else if (p.nombre.includes(q)) contienen.push(p);
  }
  // Si el texto es justo el nombre de un Pokémon ("mew"), ese va primero ("mewtwo" después)
  const exacto = empiezan.findIndex((p) => p.nombre === q);
  if (exacto > 0) empiezan.unshift(...empiezan.splice(exacto, 1));

  return [...empiezan, ...contienen].slice(0, limite);
}

// ============================================================
//  Eslabones 2 y 3: de la lista al detalle y del detalle a la especie
// ============================================================
async function resolverCadena(item, opciones = {}) {
  if (cacheCadena.has(item.id)) return cacheCadena.get(item.id);

  // Eslabón 2: la URL viene de la respuesta del eslabón 1. Si falla, el candidato se descarta.
  const poke = await apiUrl(item.url, opciones);
  if (!esPokemonValido(poke)) throw new Error("Respuesta inesperada de la API (pokemon)");

  // Eslabón 3: la URL viene de la respuesta del eslabón 2. Si falla, se muestra sin esos datos.
  let especie = null;
  let completo = true;
  try {
    const data = await apiUrl(poke.species.url, opciones);
    if (esEspecieValida(data)) especie = data;
  } catch (err) {
    if (esCancelacion(err)) throw err;      // una cancelación SÍ se propaga
    completo = err.status === 404;          // 404 = no existe; cualquier otro fallo puede ser pasajero
  }

  const datos = { poke, especie };
  if (completo) cacheCadena.set(item.id, datos);   // solo se guarda lo completo
  return datos;
}

// Búsqueda completa: eslabón 1 → candidatos; cada candidato recorre los eslabones 2 y 3.
// Se procesa por lotes para no lanzar cientos de peticiones de golpe.
async function buscarEnCadena(consulta, { desde = 0, cantidad = 12, signal } = {}) {
  await cargarCatalogo();                                   // eslabón 1
  const coincidencias = buscarCoincidencias(consulta);
  const lote = coincidencias.slice(desde, desde + cantidad);

  const resultados = await Promise.allSettled(
    lote.map((item) => resolverCadena(item, { signal }))    // eslabones 2 y 3
  );
  if (signal && signal.aborted) throw new DOMException("Búsqueda cancelada", "AbortError");

  const encontrados = [];
  let descartados = 0;
  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") encontrados.push({ item: lote[i], ...r.value });
    else descartados++;
  });

  return { total: coincidencias.length, procesados: lote.length, encontrados, descartados };
}

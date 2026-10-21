// ============================================================
//  Configuración
// ============================================================
const API = "https://pokeapi.co/api/v2";
const POR_PAGINA = 24;          // tarjetas que se cargan cada vez
const RETRASO_MS = 4000;        // debounce: espera SIN mostrar nada antes de sugerir / autocompletar (4 s)
const MAX_SUGERENCIAS = 8;
const MAX_RESULTADOS = 60;
const ID_FORMAS = 10000;        // ids >= 10000 son formas alternativas (megas, regionales…)

const imgOficial = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const imgSprite = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

// Tipos: [nombre en español, color de fondo, color de texto]
const TIPOS = {
  normal:   ["Normal",    "#6f6f5f", "#ffffff"],
  fire:     ["Fuego",     "#c4441a", "#ffffff"],
  water:    ["Agua",      "#2f6fcb", "#ffffff"],
  electric: ["Eléctrico", "#f0c419", "#2a2200"],
  grass:    ["Planta",    "#357f32", "#ffffff"],
  ice:      ["Hielo",     "#7fd0de", "#0f2f36"],
  fighting: ["Lucha",     "#b5322c", "#ffffff"],
  poison:   ["Veneno",    "#8f3fa6", "#ffffff"],
  ground:   ["Tierra",    "#94692a", "#ffffff"],
  flying:   ["Volador",   "#5568c4", "#ffffff"],
  psychic:  ["Psíquico",  "#c32e69", "#ffffff"],
  bug:      ["Bicho",     "#5f7d0f", "#ffffff"],
  rock:     ["Roca",      "#7d6e33", "#ffffff"],
  ghost:    ["Fantasma",  "#5b4a8f", "#ffffff"],
  dragon:   ["Dragón",    "#4b3fd0", "#ffffff"],
  dark:     ["Siniestro", "#4a3f3a", "#ffffff"],
  steel:    ["Acero",     "#5c7587", "#ffffff"],
  fairy:    ["Hada",      "#eba1d2", "#3a1030"],
};

const ESTADISTICAS = {
  hp: "PS",
  attack: "Ataque",
  defense: "Defensa",
  "special-attack": "At. especial",
  "special-defense": "Def. especial",
  speed: "Velocidad",
};

// ---------------- Estado ----------------
let offset = 0;
let mostrados = 0;
let cargandoPagina = false;

let catalogo = null;            // [{id, nombre}] de todos los Pokémon (para buscar)
let promesaCatalogo = null;

let consultaActiva = "";
let sugerencias = [];
let indiceActivo = -1;

let tokenDetalle = 0;           // evita mostrar respuestas viejas en el popup
const cacheDetalle = new Map();

// ---------------- Elementos del DOM ----------------
const $ = (id) => document.getElementById(id);
const el = {
  form: $("searchForm"),
  input: $("searchInput"),
  suggestions: $("suggestions"),
  resultsSection: $("resultsSection"),
  resultsTitle: $("resultsTitle"),
  resultsGrid: $("resultsGrid"),
  clearSearch: $("clearSearch"),
  grid: $("grid"),
  count: $("count"),
  status: $("status"),
  moreWrap: $("moreWrap"),
  moreBtn: $("moreBtn"),
  dialog: $("detailDialog"),
  detailBody: $("detailBody"),
  backBtn: $("backBtn"),
};

// ============================================================
//  Utilidades
// ============================================================
function nodo(tag, clase, texto) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto !== undefined) n.textContent = texto;
  return n;
}

const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const nombreBonito = (n) => n.split("-").map(capitalizar).join(" ");
const numero = (id) => `#${String(id).padStart(3, "0")}`;

// "https://pokeapi.co/api/v2/pokemon/25/"  →  25
const idDesdeUrl = (url) => Number(url.split("/").filter(Boolean).pop());
const aItem = (r) => ({ id: idDesdeUrl(r.url), nombre: r.name });

// Quita tildes y mayúsculas; los espacios se vuelven guiones ("mr mime" → "mr-mime")
function normalizar(t) {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, "-");
}

function crearImagen(id, alt, perezosa = true) {
  const img = document.createElement("img");
  img.src = imgOficial(id);
  img.alt = alt;
  img.decoding = "async";
  if (perezosa) img.loading = "lazy";
  img.addEventListener("error", () => {
    if (!img.dataset.respaldo) {
      img.dataset.respaldo = "1";
      img.src = imgSprite(id);          // plan B: sprite pequeño
    } else {
      img.classList.add("img--rota");   // plan C: ocultar imagen rota
    }
  });
  return img;
}

// ============================================================
//  Comunicación con PokeAPI
// ============================================================
async function api(ruta) {
  const res = await fetch(API + ruta);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

// Endpoint 1: lista paginada → tarjetas de la página principal
async function cargarPagina() {
  if (cargandoPagina) return;
  cargandoPagina = true;
  el.moreBtn.disabled = true;
  mostrarEstado("Cargando Pokémon…");

  try {
    const data = await api(`/pokemon?limit=${POR_PAGINA}&offset=${offset}`);
    const items = data.results.map(aItem);
    const validos = items.filter((p) => p.id < ID_FORMAS);

    el.grid.append(...validos.map(crearTarjeta));
    offset += POR_PAGINA;
    mostrados += validos.length;

    el.count.textContent = `${mostrados} Pokémon`;
    el.moreWrap.hidden = !(data.next && validos.length === items.length);
    mostrarEstado("");
  } catch (err) {
    mostrarEstado("No se pudieron cargar los Pokémon. Revisa tu conexión a internet.", {
      error: true,
      reintentar: cargarPagina,
    });
  } finally {
    cargandoPagina = false;
    el.moreBtn.disabled = false;
  }
}

// Endpoint 1 (otra vez): catálogo completo de nombres, solo para buscar
function cargarCatalogo() {
  if (!promesaCatalogo) {
    promesaCatalogo = api("/pokemon?limit=2000&offset=0")
      .then((data) => {
        catalogo = data.results.map(aItem).filter((p) => p.id < ID_FORMAS);
        return catalogo;
      })
      .catch((err) => {
        promesaCatalogo = null;   // permite reintentar más tarde
        throw err;
      });
  }
  return promesaCatalogo;
}

// Endpoints 2 y 3: datos del Pokémon + descripción de su especie
async function obtenerDetalle(id) {
  if (cacheDetalle.has(id)) return cacheDetalle.get(id);

  const [poke, especie] = await Promise.allSettled([
    api(`/pokemon/${id}`),
    api(`/pokemon-species/${id}`),
  ]);
  if (poke.status !== "fulfilled") throw poke.reason;

  const datos = {
    poke: poke.value,
    especie: especie.status === "fulfilled" ? especie.value : null,
  };
  cacheDetalle.set(id, datos);
  return datos;
}

// ============================================================
//  Render: tarjetas y estado
// ============================================================
function mostrarEstado(texto, { error = false, reintentar = null } = {}) {
  el.status.replaceChildren();
  el.status.classList.toggle("status--error", error);
  if (!texto) return;
  el.status.append(texto);
  if (reintentar) {
    const b = nodo("button", "btn btn--ghost", "Reintentar");
    b.type = "button";
    b.addEventListener("click", reintentar);
    el.status.append(b);
  }
}

function crearTarjeta(p) {
  const card = nodo("button", "card");
  card.type = "button";
  card.setAttribute("aria-label", `Ver detalles de ${nombreBonito(p.nombre)}`);

  const imgWrap = nodo("div", "card__img");
  imgWrap.append(crearImagen(p.id, ""));

  card.append(imgWrap, nodo("span", "card__num", numero(p.id)), nodo("span", "card__name", nombreBonito(p.nombre)));
  card.addEventListener("click", () => abrirDetalle(p.id, p.nombre));
  return card;
}

// ============================================================
//  Búsqueda: sugerencias con debounce de 4 s + autocompletado
// ============================================================
function buscarCoincidencias(texto, limite) {
  const q = normalizar(texto);
  if (!q || !catalogo) return [];

  // Si escribe números, busca por número de Pokédex
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
  return [...empiezan, ...contienen].slice(0, limite);
}

function resaltar(texto, consulta) {
  const frag = document.createDocumentFragment();
  const q = normalizar(consulta);
  const i = q ? normalizar(texto).indexOf(q) : -1;
  if (i < 0) {
    frag.append(texto);
    return frag;
  }
  const marca = nodo("mark", "", texto.slice(i, i + q.length));
  frag.append(texto.slice(0, i), marca, texto.slice(i + q.length));
  return frag;
}

function abrirLista() {
  el.suggestions.hidden = false;
  el.input.setAttribute("aria-expanded", "true");
}

function ocultarSugerencias() {
  el.suggestions.hidden = true;
  el.input.setAttribute("aria-expanded", "false");
  el.input.removeAttribute("aria-activedescendant");
  indiceActivo = -1;
}

// ---- Debounce: Lodash espera RETRASO_MS desde la ÚLTIMA tecla, sin mostrar nada ----
// Si la librería no cargó (sin internet / CDN bloqueado) se usa una versión mínima propia.
function debounceBasico(fn, ms) {
  let t;
  const d = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  d.cancel = () => clearTimeout(t);
  return d;
}

const debounce = (window._ && window._.debounce) || debounceBasico;
const mostrarSugerenciasDebounced = debounce(mostrarSugerencias, RETRASO_MS);
const cancelarEspera = () => mostrarSugerenciasDebounced.cancel();

// Se llama en cada tecla: oculta lo anterior y reinicia la espera (en silencio)
function programarSugerencias() {
  sugerencias = [];
  ocultarSugerencias();
  if (!el.input.value.trim()) {
    cancelarEspera();
    return;
  }
  mostrarSugerenciasDebounced();
}

function mostrarMensajeLista(texto) {
  const li = nodo("li", "suggestions__empty", texto);
  li.setAttribute("role", "presentation");
  el.suggestions.replaceChildren(li);
  abrirLista();
}

async function mostrarSugerencias() {
  const texto = el.input.value;
  if (!texto.trim() || document.activeElement !== el.input) return;

  try {
    await cargarCatalogo();
  } catch (err) {
    mostrarMensajeLista("No se pudo cargar la lista de Pokémon.");
    return;
  }
  if (texto !== el.input.value) return; // siguió escribiendo: otra ejecución del debounce se encarga

  sugerencias = buscarCoincidencias(texto, MAX_SUGERENCIAS);
  if (!sugerencias.length) {
    mostrarMensajeLista("Sin coincidencias");
    return;
  }

  el.suggestions.replaceChildren(
    ...sugerencias.map((p, i) => {
      const li = nodo("li", "suggestions__item");
      li.id = `sug-${i}`;
      li.setAttribute("role", "option");

      const sprite = document.createElement("img");
      sprite.src = imgSprite(p.id);
      sprite.alt = "";
      sprite.loading = "lazy";

      const nombre = nodo("span", "suggestions__name");
      nombre.append(resaltar(nombreBonito(p.nombre), texto));

      li.append(sprite, nombre, nodo("span", "suggestions__num", numero(p.id)));
      // mousedown (y no click) para que el input no pierda el foco antes de elegir
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        elegirSugerencia(p);
      });
      return li;
    })
  );
  abrirLista();
  autocompletarTexto(texto);
}

// Completa la palabra en el campo y deja seleccionada la parte sugerida
// (si el usuario sigue escribiendo o presiona Borrar, esa parte desaparece)
function autocompletarTexto(texto) {
  const primero = sugerencias[0];
  const q = texto.toLowerCase();
  if (!primero || document.activeElement !== el.input) return;
  if (!primero.nombre.startsWith(q) || primero.nombre.length === q.length) return;

  el.input.value = texto + primero.nombre.slice(texto.length);
  el.input.setSelectionRange(texto.length, el.input.value.length);
}

function moverSeleccion(paso) {
  if (el.suggestions.hidden || !sugerencias.length) return;
  indiceActivo = (indiceActivo + paso + sugerencias.length) % sugerencias.length;
  [...el.suggestions.children].forEach((li, i) => li.classList.toggle("is-active", i === indiceActivo));
  el.input.setAttribute("aria-activedescendant", `sug-${indiceActivo}`);
}

function elegirSugerencia(p) {
  el.input.value = p.nombre;
  buscar();
}

// ---- Lupa / Enter: búsqueda inmediata (sin esperar los 4 s) ----
async function buscar() {
  cancelarEspera();
  ocultarSugerencias();

  consultaActiva = el.input.value.trim();
  if (!consultaActiva) {
    limpiarBusqueda();
    return;
  }

  const miConsulta = consultaActiva;
  el.resultsSection.hidden = false;
  el.resultsTitle.textContent = `Buscando “${miConsulta}”…`;
  el.resultsGrid.replaceChildren();
  el.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    await cargarCatalogo();
  } catch (err) {
    if (miConsulta !== consultaActiva) return;
    el.resultsTitle.textContent = `Resultados para “${miConsulta}”`;
    el.resultsGrid.replaceChildren(nodo("p", "empty", "No se pudo cargar la lista de Pokémon. Revisa tu conexión e inténtalo de nuevo."));
    return;
  }
  if (miConsulta !== consultaActiva) return;

  const encontrados = buscarCoincidencias(miConsulta, MAX_RESULTADOS + 1);
  const recortado = encontrados.length > MAX_RESULTADOS;
  const lista = recortado ? encontrados.slice(0, MAX_RESULTADOS) : encontrados;

  el.resultsTitle.textContent = lista.length
    ? `Resultados para “${miConsulta}” (${recortado ? `primeros ${MAX_RESULTADOS}` : lista.length})`
    : `Resultados para “${miConsulta}”`;

  if (!lista.length) {
    el.resultsGrid.replaceChildren(nodo("p", "empty", "No encontramos ningún Pokémon con ese nombre o número. Revisa la ortografía."));
  } else {
    el.resultsGrid.replaceChildren(...lista.map(crearTarjeta));
  }
}

function limpiarBusqueda() {
  cancelarEspera();
  consultaActiva = "";
  el.input.value = "";
  el.resultsSection.hidden = true;
  el.resultsGrid.replaceChildren();
  ocultarSugerencias();
}

// ============================================================
//  Popup de detalle
// ============================================================
async function abrirDetalle(id, nombre) {
  const token = ++tokenDetalle;
  el.dialog.setAttribute("aria-label", `Detalle de ${nombreBonito(nombre)}`);

  if (!cacheDetalle.has(id)) {
    el.detailBody.replaceChildren(nodo("p", "detalle__msg", `Cargando información de ${nombreBonito(nombre)}…`));
  }
  if (!el.dialog.open) el.dialog.showModal();

  try {
    const datos = await obtenerDetalle(id);
    if (token !== tokenDetalle) return;       // ya cerró o abrió otro Pokémon
    renderDetalle(datos);
  } catch (err) {
    if (token !== tokenDetalle) return;
    const msg = nodo("p", "detalle__msg", "No se pudo cargar la información de este Pokémon.");
    const reintento = nodo("button", "btn btn--ghost", "Reintentar");
    reintento.type = "button";
    reintento.addEventListener("click", () => abrirDetalle(id, nombre));
    msg.append(document.createElement("br"), reintento);
    el.detailBody.replaceChildren(msg);
  }
}

// Busca el texto en español; si no existe, usa inglés
function textoIdioma(lista, campo) {
  if (!lista) return "";
  const es = lista.filter((x) => x.language.name === "es");
  const fuente = es.length ? es : lista.filter((x) => x.language.name === "en");
  return fuente.length ? fuente[fuente.length - 1][campo] : "";
}

function crearDato(titulo, valor, ancho = false) {
  const d = nodo("div", "dato" + (ancho ? " dato--ancho" : ""));
  d.append(nodo("dt", "", titulo), nodo("dd", "", valor));
  return d;
}

function renderDetalle({ poke, especie }) {
  const nombre = nombreBonito(poke.name);
  const tipos = poke.types.map((t) => TIPOS[t.type.name] || [nombreBonito(t.type.name), "#5b6577", "#ffffff"]);
  const colorPrincipal = tipos[0]?.[1] || "#c62f38";

  // Imagen grande
  const figura = nodo("div", "detalle__img");
  const img = document.createElement("img");
  img.src = poke.sprites?.other?.["official-artwork"]?.front_default || poke.sprites?.front_default || imgOficial(poke.id);
  img.alt = `Ilustración de ${nombre}`;
  figura.append(img);

  // Encabezado
  const info = nodo("div", "detalle__info");
  info.append(nodo("span", "detalle__num", numero(poke.id)), nodo("h2", "detalle__titulo", nombre));

  const categoria = textoIdioma(especie?.genera, "genus");
  if (categoria) info.append(nodo("p", "detalle__cat", categoria));

  // Tipos
  const chips = nodo("div", "chips");
  for (const [etiqueta, bg, fg] of tipos) {
    const chip = nodo("span", "chip", etiqueta);
    chip.style.setProperty("--chip-bg", bg);
    chip.style.setProperty("--chip-fg", fg);
    chips.append(chip);
  }
  info.append(chips);

  // Descripción (endpoint pokemon-species)
  const descripcion = textoIdioma(especie?.flavor_text_entries, "flavor_text").replace(/[\n\f\r\u00ad]+/g, " ");
  if (descripcion) info.append(nodo("p", "detalle__desc", descripcion));

  // Altura, peso y habilidades
  const datos = nodo("dl", "datos");
  datos.append(
    crearDato("Altura", `${(poke.height / 10).toLocaleString("es-EC")} m`),
    crearDato("Peso", `${(poke.weight / 10).toLocaleString("es-EC")} kg`),
    crearDato("Habilidades", poke.abilities.map((a) => nombreBonito(a.ability.name)).join(", "), true)
  );
  info.append(datos);

  // Estadísticas base (el máximo posible es 255)
  info.append(nodo("h3", "", "Estadísticas base"));
  const lista = nodo("ul", "stats");
  for (const s of poke.stats) {
    const fila = nodo("li", "stat");
    const barra = nodo("span", "stat__bar");
    const relleno = nodo("span", "stat__fill");
    relleno.style.width = `${Math.min(100, (s.base_stat / 255) * 100)}%`;
    relleno.style.background = colorPrincipal;
    barra.append(relleno);
    barra.setAttribute("aria-hidden", "true");
    fila.append(nodo("span", "stat__label", ESTADISTICAS[s.stat.name] || nombreBonito(s.stat.name)), nodo("span", "stat__val", String(s.base_stat)), barra);
    lista.append(fila);
  }
  info.append(lista);

  const contenido = nodo("div", "detalle");
  contenido.append(figura, info);
  el.detailBody.replaceChildren(contenido);
  el.detailBody.scrollTop = 0;
}

// ============================================================
//  Eventos
// ============================================================
el.input.addEventListener("input", programarSugerencias);
el.input.addEventListener("blur", () => {
  cancelarEspera();
  ocultarSugerencias();
});

el.input.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); moverSeleccion(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); moverSeleccion(-1); }
  else if (e.key === "Escape") { cancelarEspera(); ocultarSugerencias(); }
  else if (e.key === "Enter" && indiceActivo >= 0) {
    e.preventDefault();
    elegirSugerencia(sugerencias[indiceActivo]);
  }
});

el.form.addEventListener("submit", (e) => {
  e.preventDefault();
  buscar();
});

el.clearSearch.addEventListener("click", limpiarBusqueda);
el.moreBtn.addEventListener("click", cargarPagina);

// Botón "Regresar": cierra el popup y vuelve a la página principal
el.backBtn.addEventListener("click", () => el.dialog.close());
el.dialog.addEventListener("click", (e) => {
  if (e.target === el.dialog) el.dialog.close();   // clic fuera de la ventana
});
el.dialog.addEventListener("close", () => { tokenDetalle++; });

// ---------------- Inicio ----------------
cargarPagina().then(() => cargarCatalogo().catch(() => {}));

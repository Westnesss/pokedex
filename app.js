// ============================================================
//  app.js · Interfaz
//  Usa las funciones de api.js (que debe cargarse antes en el HTML).
// ============================================================
const POR_PAGINA = 24;          // tarjetas que se cargan cada vez en la lista principal
const RETRASO_MS = 4000;        // debounce: espera SIN mostrar nada antes de sugerir / autocompletar (4 s)
const MAX_SUGERENCIAS = 8;
const LOTE_RESULTADOS = 12;     // resultados de búsqueda que se completan por lote

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

let sugerencias = [];
let indiceActivo = -1;
let busqueda = null;            // { consulta, texto, mostrados, total, descartados, ctrl }
let tokenDetalle = 0;           // evita mostrar respuestas viejas en el popup

// ---------------- Elementos del DOM ----------------
const $ = (id) => document.getElementById(id);
const el = {
  form: $("searchForm"),
  input: $("searchInput"),
  suggestions: $("suggestions"),
  resultsSection: $("resultsSection"),
  resultsTitle: $("resultsTitle"),
  resultsNote: $("resultsNote"),
  resultsGrid: $("resultsGrid"),
  resultsMoreWrap: $("resultsMoreWrap"),
  resultsMoreBtn: $("resultsMoreBtn"),
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
//  Utilidades de interfaz
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

function crearChip(nombreTipo, pequeno = false) {
  const [etiqueta, bg, fg] = TIPOS[nombreTipo] || [nombreBonito(nombreTipo), "#5b6577", "#ffffff"];
  const chip = nodo("span", "chip" + (pequeno ? " chip--sm" : ""), etiqueta);
  chip.style.setProperty("--chip-bg", bg);
  chip.style.setProperty("--chip-fg", fg);
  return chip;
}

// Busca el texto en español; si no existe, usa inglés
function textoIdioma(lista, campo) {
  if (!lista) return "";
  const es = lista.filter((x) => x.language.name === "es");
  const fuente = es.length ? es : lista.filter((x) => x.language.name === "en");
  return fuente.length ? fuente[fuente.length - 1][campo] : "";
}

// ============================================================
//  Lista principal (eslabón 1, paginada)
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

async function cargarPagina() {
  if (cargandoPagina) return;
  cargandoPagina = true;
  el.moreBtn.disabled = true;
  mostrarEstado("Cargando Pokémon…");

  try {
    const data = await listarPokemon(POR_PAGINA, offset);
    const items = data.results.map(aItem);
    const validos = items.filter((p) => p.id < ID_FORMAS);

    el.grid.append(...validos.map(crearTarjeta));
    offset += POR_PAGINA;
    mostrados += validos.length;

    el.count.textContent = `${mostrados} Pokémon`;
    el.moreWrap.hidden = !(data.next && validos.length === items.length);
    mostrarEstado("");
  } catch (err) {
    const motivo = err.timeout ? "La API tardó demasiado en responder." : "Revisa tu conexión a internet.";
    mostrarEstado(`No se pudieron cargar los Pokémon. ${motivo}`, { error: true, reintentar: cargarPagina });
  } finally {
    cargandoPagina = false;
    el.moreBtn.disabled = false;
  }
}

function crearTarjeta(p) {
  const card = nodo("button", "card");
  card.type = "button";
  card.setAttribute("aria-label", `Ver detalles de ${nombreBonito(p.nombre)}`);

  const imgWrap = nodo("div", "card__img");
  imgWrap.append(crearImagen(p.id, ""));

  card.append(imgWrap, nodo("span", "card__num", numero(p.id)), nodo("span", "card__name", nombreBonito(p.nombre)));
  card.addEventListener("click", () => abrirDetalle(p));
  return card;
}

// Tarjeta de resultado de búsqueda: la base + datos de los eslabones 2 y 3
function crearTarjetaDetallada({ item, poke, especie }) {
  const card = crearTarjeta(item);

  const tipos = nodo("div", "card__types");
  poke.types.forEach((t) => tipos.append(crearChip(t.type.name, true)));
  card.append(tipos);

  const categoria = textoIdioma(especie && especie.genera, "genus");
  if (categoria) card.append(nodo("span", "card__cat", categoria));

  if (especie && especie.is_mythical) card.append(nodo("span", "badge badge--mitico", "Mítico"));
  else if (especie && especie.is_legendary) card.append(nodo("span", "badge", "Legendario"));

  return card;
}

function mostrarEsqueletos(contenedor, cantidad) {
  const tarjetas = Array.from({ length: cantidad }, () => {
    const card = nodo("div", "card card--skeleton");
    card.setAttribute("aria-hidden", "true");
    card.append(
      nodo("div", "card__img skeleton"),
      nodo("span", "skeleton skeleton--linea"),
      nodo("span", "skeleton skeleton--linea skeleton--corta")
    );
    return card;
  });
  contenedor.replaceChildren(...tarjetas);
}

// ============================================================
//  Sugerencias con debounce (la espera NO se muestra) + autocompletado
// ============================================================
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

// ============================================================
//  Búsqueda: valida → eslabón 1 → eslabones 2 y 3 (por lotes)
// ============================================================
async function buscar() {
  cancelarEspera();
  ocultarSugerencias();
  if (busqueda) busqueda.ctrl.abort();          // cancela la búsqueda anterior si seguía en curso

  const texto = el.input.value.trim();
  if (!texto) {
    limpiarBusqueda();
    return;
  }

  el.resultsSection.hidden = false;
  el.resultsMoreWrap.hidden = true;
  el.resultsNote.textContent = "";

  // 1) Validar la consulta ANTES de pedir nada a la API
  const v = validarConsulta(texto);
  if (!v.ok) {
    busqueda = null;
    el.resultsTitle.textContent = `Resultados para “${texto}”`;
    el.resultsGrid.replaceChildren(nodo("p", "empty", v.motivo));
    el.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  // 2) Lanzar la cadena de endpoints
  const b = { consulta: v.consulta, texto, mostrados: 0, total: 0, descartados: 0, ctrl: new AbortController() };
  busqueda = b;
  el.resultsTitle.textContent = `Buscando “${texto}”…`;
  mostrarEsqueletos(el.resultsGrid, 6);
  el.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });

  await cargarLote(b, true);
}

async function cargarLote(b, primera) {
  el.resultsMoreBtn.disabled = true;
  try {
    const r = await buscarEnCadena(b.consulta, {
      desde: b.mostrados,
      cantidad: LOTE_RESULTADOS,
      signal: b.ctrl.signal,
    });
    if (busqueda !== b) return;                 // llegó tarde: ya hay otra búsqueda

    b.total = r.total;
    b.mostrados += r.procesados;
    b.descartados += r.descartados;
    const tarjetas = r.encontrados.map(crearTarjetaDetallada);

    if (primera) {
      if (!b.total) {
        el.resultsTitle.textContent = `Resultados para “${b.texto}”`;
        el.resultsGrid.replaceChildren(
          nodo("p", "empty", "No encontramos ningún Pokémon con ese nombre o número. Revisa la ortografía.")
        );
        return;
      }
      el.resultsGrid.replaceChildren(
        ...(tarjetas.length
          ? tarjetas
          : [nodo("p", "empty", "No se pudieron verificar los resultados con la API. Inténtalo de nuevo en unos segundos.")])
      );
    } else {
      el.resultsGrid.append(...tarjetas);
    }
    actualizarEncabezadoResultados(b);
  } catch (err) {
    if (esCancelacion(err) || busqueda !== b) return;
    const motivo = err.timeout ? "La API tardó demasiado en responder." : "No se pudo completar la búsqueda. Revisa tu conexión.";
    if (primera) {
      el.resultsTitle.textContent = `Resultados para “${b.texto}”`;
      el.resultsGrid.replaceChildren(nodo("p", "empty", `${motivo} Presiona la lupa para intentarlo de nuevo.`));
    } else {
      el.resultsNote.textContent = motivo;
    }
  } finally {
    if (busqueda === b) el.resultsMoreBtn.disabled = false;
  }
}

function actualizarEncabezadoResultados(b) {
  const completo = b.mostrados >= b.total;
  el.resultsTitle.textContent = completo
    ? `Resultados para “${b.texto}” (${b.total})`
    : `Resultados para “${b.texto}” (mostrando ${b.mostrados} de ${b.total})`;
  el.resultsMoreWrap.hidden = completo;
  el.resultsNote.textContent = b.descartados
    ? `${b.descartados} resultado(s) no se pudieron verificar con la API.`
    : "";
}

function limpiarBusqueda() {
  cancelarEspera();
  if (busqueda) busqueda.ctrl.abort();
  busqueda = null;
  el.input.value = "";
  el.resultsSection.hidden = true;
  el.resultsGrid.replaceChildren();
  el.resultsMoreWrap.hidden = true;
  el.resultsNote.textContent = "";
  ocultarSugerencias();
}

// ============================================================
//  Popup de detalle (reutiliza la cadena y su caché)
// ============================================================
async function abrirDetalle(item) {
  const token = ++tokenDetalle;
  el.dialog.setAttribute("aria-label", `Detalle de ${nombreBonito(item.nombre)}`);

  if (!cacheCadena.has(item.id)) {
    el.detailBody.replaceChildren(nodo("p", "detalle__msg", `Cargando información de ${nombreBonito(item.nombre)}…`));
  }
  if (!el.dialog.open) el.dialog.showModal();

  try {
    const datos = await resolverCadena(item);
    if (token !== tokenDetalle) return;         // ya cerró o abrió otro Pokémon
    renderDetalle(datos);
  } catch (err) {
    if (token !== tokenDetalle) return;
    const msg = nodo("p", "detalle__msg", "No se pudo cargar la información de este Pokémon.");
    const reintento = nodo("button", "btn btn--ghost", "Reintentar");
    reintento.type = "button";
    reintento.addEventListener("click", () => abrirDetalle(item));
    msg.append(document.createElement("br"), reintento);
    el.detailBody.replaceChildren(msg);
  }
}

function crearDato(titulo, valor, ancho = false) {
  const d = nodo("div", "dato" + (ancho ? " dato--ancho" : ""));
  d.append(nodo("dt", "", titulo), nodo("dd", "", valor));
  return d;
}

function renderDetalle({ poke, especie }) {
  const nombre = nombreBonito(poke.name);
  const primerTipo = poke.types[0] && poke.types[0].type.name;
  const colorPrincipal = (TIPOS[primerTipo] || [])[1] || "#c62f38";

  // Imagen grande
  const figura = nodo("div", "detalle__img");
  const img = document.createElement("img");
  const arte = poke.sprites && poke.sprites.other && poke.sprites.other["official-artwork"];
  img.src = (arte && arte.front_default) || (poke.sprites && poke.sprites.front_default) || imgOficial(poke.id);
  img.alt = `Ilustración de ${nombre}`;
  figura.append(img);

  // Encabezado
  const info = nodo("div", "detalle__info");
  info.append(nodo("span", "detalle__num", numero(poke.id)), nodo("h2", "detalle__titulo", nombre));

  const categoria = textoIdioma(especie && especie.genera, "genus");
  if (categoria) info.append(nodo("p", "detalle__cat", categoria));

  // Tipos
  const chips = nodo("div", "chips");
  poke.types.forEach((t) => chips.append(crearChip(t.type.name)));
  if (especie && especie.is_mythical) chips.append(nodo("span", "badge badge--mitico", "Mítico"));
  else if (especie && especie.is_legendary) chips.append(nodo("span", "badge", "Legendario"));
  info.append(chips);

  // Descripción (eslabón 3: pokemon-species)
  const descripcion = textoIdioma(especie && especie.flavor_text_entries, "flavor_text").replace(/[\n\f\r\u00ad]+/g, " ");
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
    fila.append(
      nodo("span", "stat__label", ESTADISTICAS[s.stat.name] || nombreBonito(s.stat.name)),
      nodo("span", "stat__val", String(s.base_stat)),
      barra
    );
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
el.resultsMoreBtn.addEventListener("click", () => { if (busqueda) cargarLote(busqueda, false); });

// Botón "Regresar": cierra el popup y vuelve a la página principal
el.backBtn.addEventListener("click", () => el.dialog.close());
el.dialog.addEventListener("click", (e) => {
  if (e.target === el.dialog) el.dialog.close();   // clic fuera de la ventana
});
el.dialog.addEventListener("close", () => { tokenDetalle++; });

// ---------------- Inicio ----------------
cargarPagina().then(() => cargarCatalogo().catch(() => {}));

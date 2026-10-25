// Data layer: query validation, requests with timeout and cancellation, and the
// chained endpoint lookup (list -> pokemon -> species). Does not touch the DOM.
const API = "https://pokeapi.co/api/v2";
const FORM_ID_START = 10000; // ids from here on are alternate forms (megas, regionals, ...)
const MAX_ID = FORM_ID_START - 1;
const TIMEOUT_MS = 8000;
const MAX_QUERY_LENGTH = 30;
const MAX_CATALOG_SIZE = 2000;

let catalog = null;               // [{ id, name, url }] from the list endpoint
let catalogPromise = null;
const chainCache = new Map();     // id -> { poke, species }

// ---------------- Utilities ----------------
// "Mr. Mime" -> "mr-mime", "Farfetch'd" -> "farfetchd"
function normalize(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/['’.]/g, "")
    .replace(/\s+/g, "-");
}

// "https://pokeapi.co/api/v2/pokemon/25/" -> 25
const idFromUrl = (url) => Number(url.split("/").filter(Boolean).pop());
const toItem = (r) => ({ id: idFromUrl(r.url), name: r.name, url: r.url });
const isAbortError = (err) => err && err.name === "AbortError";

// ---------------- Query validation ----------------
function validateQuery(text) {
  const clean = normalize(text);

  if (!clean) {
    return { ok: false, reason: "Enter a Pokémon name or number." };
  }
  if (clean.length > MAX_QUERY_LENGTH) {
    return { ok: false, reason: `Search text is too long (maximum ${MAX_QUERY_LENGTH} characters).` };
  }
  if (!/^[a-z0-9-]+$/.test(clean)) {
    return { ok: false, reason: "Use only letters, numbers and hyphens." };
  }

  const isNumber = /^\d+$/.test(clean);
  if (isNumber && (Number(clean) < 1 || Number(clean) > MAX_ID)) {
    return { ok: false, reason: `The number must be between 1 and ${MAX_ID}.` };
  }
  return { ok: true, query: clean, isNumber };
}

// ---------------- Response validation ----------------
const isValidList = (d) => Boolean(d) && Array.isArray(d.results);

const isValidPokemon = (d) =>
  Boolean(d) &&
  Number.isInteger(d.id) &&
  typeof d.name === "string" &&
  Array.isArray(d.types) &&
  Array.isArray(d.stats) &&
  Boolean(d.species && typeof d.species.url === "string");

const isValidSpecies = (d) =>
  Boolean(d) && Array.isArray(d.flavor_text_entries) && Array.isArray(d.genera);

// ---------------- Base request ----------------
async function request(path, { signal } = {}) {
  if (signal && signal.aborted) throw new DOMException("Request aborted", "AbortError");

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  const abortFromOutside = () => controller.abort();
  if (signal) signal.addEventListener("abort", abortFromOutside, { once: true });

  try {
    const res = await fetch(API + path, { signal: controller.signal });
    if (!res.ok) {
      // fetch only rejects on network failures, so HTTP errors must be checked explicitly.
      const error = new Error(`HTTP ${res.status}`);
      error.status = res.status;
      throw error;
    }
    return await res.json();
  } catch (err) {
    if (timedOut) {
      const error = new Error("Request timed out");
      error.timeout = true;
      throw error;
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", abortFromOutside);
  }
}

// Follows a URL taken from another response, restricted to PokeAPI.
function requestUrl(url, options) {
  if (typeof url !== "string" || !url.startsWith(API + "/")) {
    throw new Error("URL not allowed");
  }
  return request(url.slice(API.length), options);
}

// ---------------- Step 1: Pokémon list ----------------
async function listPokemon(limit, offset = 0, options) {
  const l = Math.min(Math.max(parseInt(limit, 10) || 1, 1), MAX_CATALOG_SIZE);
  const o = Math.max(parseInt(offset, 10) || 0, 0);

  const data = await request(`/pokemon?limit=${l}&offset=${o}`, options);
  if (!isValidList(data)) throw new Error("Unexpected API response (list)");
  return data;
}

function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = listPokemon(MAX_CATALOG_SIZE, 0)
      .then((data) => {
        catalog = data.results.map(toItem).filter((p) => p.id < FORM_ID_START);
        return catalog;
      })
      .catch((err) => {
        catalogPromise = null;      // allow a retry later
        throw err;
      });
  }
  return catalogPromise;
}

// Prefix matches come before substring matches.
function findMatches(text, limit = Infinity) {
  const q = normalize(text);
  if (!q || !catalog) return [];

  if (/^\d+$/.test(q)) {
    const n = String(Number(q));
    const list = catalog.filter((p) => String(p.id).startsWith(n));
    list.sort((a, b) => (String(a.id) === n ? -1 : 0) - (String(b.id) === n ? -1 : 0));
    return list.slice(0, limit);
  }

  const startsWith = [];
  const contains = [];
  for (const p of catalog) {
    if (p.name.startsWith(q)) startsWith.push(p);
    else if (p.name.includes(q)) contains.push(p);
  }
  // An exact name ("mew") goes before longer ones ("mewtwo").
  const exact = startsWith.findIndex((p) => p.name === q);
  if (exact > 0) startsWith.unshift(...startsWith.splice(exact, 1));

  return [...startsWith, ...contains].slice(0, limit);
}

// ---------------- Steps 2 and 3: pokemon detail and species ----------------
async function resolveChain(item, options = {}) {
  if (chainCache.has(item.id)) return chainCache.get(item.id);

  // Step 2: if it fails, the candidate is discarded.
  const poke = await requestUrl(item.url, options);
  if (!isValidPokemon(poke)) throw new Error("Unexpected API response (pokemon)");

  // Step 3: if it fails, the Pokémon is shown without species data.
  let species = null;
  let complete = true;
  try {
    const data = await requestUrl(poke.species.url, options);
    if (isValidSpecies(data)) species = data;
  } catch (err) {
    if (isAbortError(err)) throw err;
    complete = err.status === 404;  // other failures may be transient, so they are not cached
  }

  const result = { poke, species };
  if (complete) chainCache.set(item.id, result);
  return result;
}

// Resolves matches in batches to avoid firing hundreds of requests at once.
async function searchChain(query, { from = 0, count = 12, signal } = {}) {
  await loadCatalog();
  const matches = findMatches(query);
  const batch = matches.slice(from, from + count);

  const settled = await Promise.allSettled(batch.map((item) => resolveChain(item, { signal })));
  if (signal && signal.aborted) throw new DOMException("Search aborted", "AbortError");

  const found = [];
  let discarded = 0;
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") found.push({ item: batch[i], ...r.value });
    else discarded++;
  });

  return { total: matches.length, processed: batch.length, found, discarded };
}
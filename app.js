// UI layer. Depends on api.js, which must be loaded first.
const PAGE_SIZE = 24;
const DEBOUNCE_MS = 4000;
const MAX_SUGGESTIONS = 8;
const RESULTS_BATCH_SIZE = 12;

const officialArtUrl = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const spriteUrl = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

// type -> [label, background, text color]
const TYPES = {
  normal:   ["Normal",   "#6f6f5f", "#ffffff"],
  fire:     ["Fire",     "#c4441a", "#ffffff"],
  water:    ["Water",    "#2f6fcb", "#ffffff"],
  electric: ["Electric", "#f0c419", "#2a2200"],
  grass:    ["Grass",    "#357f32", "#ffffff"],
  ice:      ["Ice",      "#7fd0de", "#0f2f36"],
  fighting: ["Fighting", "#b5322c", "#ffffff"],
  poison:   ["Poison",   "#8f3fa6", "#ffffff"],
  ground:   ["Ground",   "#94692a", "#ffffff"],
  flying:   ["Flying",   "#5568c4", "#ffffff"],
  psychic:  ["Psychic",  "#c32e69", "#ffffff"],
  bug:      ["Bug",      "#5f7d0f", "#ffffff"],
  rock:     ["Rock",     "#7d6e33", "#ffffff"],
  ghost:    ["Ghost",    "#5b4a8f", "#ffffff"],
  dragon:   ["Dragon",   "#4b3fd0", "#ffffff"],
  dark:     ["Dark",     "#4a3f3a", "#ffffff"],
  steel:    ["Steel",    "#5c7587", "#ffffff"],
  fairy:    ["Fairy",    "#eba1d2", "#3a1030"],
};

const STAT_LABELS = {
  hp: "HP",
  attack: "Attack",
  defense: "Defense",
  "special-attack": "Sp. Atk",
  "special-defense": "Sp. Def",
  speed: "Speed",
};

// ---------------- State ----------------
let offset = 0;
let shownCount = 0;
let loadingPage = false;

let suggestions = [];
let activeIndex = -1;
let currentSearch = null;   // { query, text, shown, total, discarded, controller }
let detailToken = 0;        // discards stale responses in the detail dialog

// ---------------- DOM elements ----------------
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

// ---------------- UI helpers ----------------
function createNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const prettyName = (n) => n.split("-").map(capitalize).join(" ");
const dexNumber = (id) => `#${String(id).padStart(3, "0")}`;

function createImage(id, alt, lazy = true) {
  const img = document.createElement("img");
  img.src = officialArtUrl(id);
  img.alt = alt;
  img.decoding = "async";
  if (lazy) img.loading = "lazy";
  img.addEventListener("error", () => {
    if (!img.dataset.fallback) {
      img.dataset.fallback = "1";
      img.src = spriteUrl(id);
    } else {
      img.classList.add("img--broken");
    }
  });
  return img;
}

function createTypeChip(typeName, small = false) {
  const [label, bg, fg] = TYPES[typeName] || [prettyName(typeName), "#5b6577", "#ffffff"];
  const chip = createNode("span", "chip" + (small ? " chip--sm" : ""), label);
  chip.style.setProperty("--chip-bg", bg);
  chip.style.setProperty("--chip-fg", fg);
  return chip;
}

// Returns the latest English entry (the most recent game version).
function englishText(entries, field) {
  if (!entries) return "";
  const matches = entries.filter((x) => x.language.name === "en");
  return matches.length ? matches[matches.length - 1][field] : "";
}

// ---------------- Main list (step 1, paginated) ----------------
function showStatus(text, { error = false, retry = null } = {}) {
  el.status.replaceChildren();
  el.status.classList.toggle("status--error", error);
  if (!text) return;
  el.status.append(text);
  if (retry) {
    const button = createNode("button", "btn btn--ghost", "Retry");
    button.type = "button";
    button.addEventListener("click", retry);
    el.status.append(button);
  }
}

async function loadPage() {
  if (loadingPage) return;
  loadingPage = true;
  el.moreBtn.disabled = true;
  showStatus("Loading Pokémon…");

  try {
    const data = await listPokemon(PAGE_SIZE, offset);
    const items = data.results.map(toItem);
    const valid = items.filter((p) => p.id < FORM_ID_START);

    el.grid.append(...valid.map(createCard));
    offset += PAGE_SIZE;
    shownCount += valid.length;

    el.count.textContent = `${shownCount} Pokémon`;
    el.moreWrap.hidden = !(data.next && valid.length === items.length);
    showStatus("");
  } catch (err) {
    const reason = err.timeout ? "The API took too long to respond." : "Check your internet connection.";
    showStatus(`Could not load Pokémon. ${reason}`, { error: true, retry: loadPage });
  } finally {
    loadingPage = false;
    el.moreBtn.disabled = false;
  }
}

function createCard(p) {
  const card = createNode("button", "card");
  card.type = "button";
  card.setAttribute("aria-label", `View details for ${prettyName(p.name)}`);

  const imageWrap = createNode("div", "card__img");
  imageWrap.append(createImage(p.id, ""));

  card.append(imageWrap, createNode("span", "card__num", dexNumber(p.id)), createNode("span", "card__name", prettyName(p.name)));
  card.addEventListener("click", () => openDetail(p));
  return card;
}

// Search result card: base card plus data from steps 2 and 3.
function createDetailedCard({ item, poke, species }) {
  const card = createCard(item);

  const types = createNode("div", "card__types");
  poke.types.forEach((t) => types.append(createTypeChip(t.type.name, true)));
  card.append(types);

  const genus = englishText(species && species.genera, "genus");
  if (genus) card.append(createNode("span", "card__category", genus));

  if (species && species.is_mythical) card.append(createNode("span", "badge badge--mythical", "Mythical"));
  else if (species && species.is_legendary) card.append(createNode("span", "badge", "Legendary"));

  return card;
}

function showSkeletons(container, count) {
  const cards = Array.from({ length: count }, () => {
    const card = createNode("div", "card card--skeleton");
    card.setAttribute("aria-hidden", "true");
    card.append(
      createNode("div", "card__img skeleton"),
      createNode("span", "skeleton skeleton--line"),
      createNode("span", "skeleton skeleton--line skeleton--short")
    );
    return card;
  });
  container.replaceChildren(...cards);
}

// ---------------- Suggestions (debounced) and autocomplete ----------------
function highlight(text, query) {
  const fragment = document.createDocumentFragment();
  const q = normalize(query);
  const i = q ? normalize(text).indexOf(q) : -1;
  if (i < 0) {
    fragment.append(text);
    return fragment;
  }
  const mark = createNode("mark", "", text.slice(i, i + q.length));
  fragment.append(text.slice(0, i), mark, text.slice(i + q.length));
  return fragment;
}

function openList() {
  el.suggestions.hidden = false;
  el.input.setAttribute("aria-expanded", "true");
}

function hideSuggestions() {
  el.suggestions.hidden = true;
  el.input.setAttribute("aria-expanded", "false");
  el.input.removeAttribute("aria-activedescendant");
  activeIndex = -1;
}

// Minimal fallback in case Lodash failed to load (offline or blocked CDN).
function basicDebounce(fn, ms) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

const debounce = (window._ && window._.debounce) || basicDebounce;
const debouncedShowSuggestions = debounce(showSuggestions, DEBOUNCE_MS);
const cancelPending = () => debouncedShowSuggestions.cancel();

function scheduleSuggestions() {
  suggestions = [];
  hideSuggestions();
  if (!el.input.value.trim()) {
    cancelPending();
    return;
  }
  debouncedShowSuggestions();
}

function showListMessage(text) {
  const li = createNode("li", "suggestions__empty", text);
  li.setAttribute("role", "presentation");
  el.suggestions.replaceChildren(li);
  openList();
}

async function showSuggestions() {
  const text = el.input.value;
  if (!text.trim() || document.activeElement !== el.input) return;

  try {
    await loadCatalog();
  } catch (err) {
    showListMessage("Could not load the Pokémon list.");
    return;
  }
  if (text !== el.input.value) return; // the user kept typing; a newer debounce call will handle it

  suggestions = findMatches(text, MAX_SUGGESTIONS);
  if (!suggestions.length) {
    showListMessage("No matches");
    return;
  }

  el.suggestions.replaceChildren(
    ...suggestions.map((p, i) => {
      const li = createNode("li", "suggestions__item");
      li.id = `sug-${i}`;
      li.setAttribute("role", "option");

      const sprite = document.createElement("img");
      sprite.src = spriteUrl(p.id);
      sprite.alt = "";
      sprite.loading = "lazy";

      const name = createNode("span", "suggestions__name");
      name.append(highlight(prettyName(p.name), text));

      li.append(sprite, name, createNode("span", "suggestions__num", dexNumber(p.id)));
      // mousedown instead of click so the input keeps focus.
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectSuggestion(p);
      });
      return li;
    })
  );
  openList();
  autocompleteInput(text);
}

// Completes the typed text inline and selects the suggested part.
function autocompleteInput(text) {
  const first = suggestions[0];
  const q = text.toLowerCase();
  if (!first || document.activeElement !== el.input) return;
  if (!first.name.startsWith(q) || first.name.length === q.length) return;

  el.input.value = text + first.name.slice(text.length);
  el.input.setSelectionRange(text.length, el.input.value.length);
}

function moveSelection(step) {
  if (el.suggestions.hidden || !suggestions.length) return;
  activeIndex = (activeIndex + step + suggestions.length) % suggestions.length;
  [...el.suggestions.children].forEach((li, i) => li.classList.toggle("is-active", i === activeIndex));
  el.input.setAttribute("aria-activedescendant", `sug-${activeIndex}`);
}

function selectSuggestion(p) {
  el.input.value = p.name;
  runSearch();
}

// ---------------- Search: validate -> step 1 -> steps 2 and 3 (in batches) ----------------
async function runSearch() {
  cancelPending();
  hideSuggestions();
  if (currentSearch) currentSearch.controller.abort();

  const text = el.input.value.trim();
  if (!text) {
    clearSearch();
    return;
  }

  el.resultsSection.hidden = false;
  el.resultsMoreWrap.hidden = true;
  el.resultsNote.textContent = "";

  const validation = validateQuery(text);
  if (!validation.ok) {
    currentSearch = null;
    el.resultsTitle.textContent = `Results for “${text}”`;
    el.resultsGrid.replaceChildren(createNode("p", "empty", validation.reason));
    el.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const search = { query: validation.query, text, shown: 0, total: 0, discarded: 0, controller: new AbortController() };
  currentSearch = search;
  el.resultsTitle.textContent = `Searching “${text}”…`;
  showSkeletons(el.resultsGrid, 6);
  el.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });

  await loadBatch(search, true);
}

async function loadBatch(search, isFirst) {
  el.resultsMoreBtn.disabled = true;
  try {
    const result = await searchChain(search.query, {
      from: search.shown,
      count: RESULTS_BATCH_SIZE,
      signal: search.controller.signal,
    });
    if (currentSearch !== search) return; // a newer search replaced this one

    search.total = result.total;
    search.shown += result.processed;
    search.discarded += result.discarded;
    const cards = result.found.map(createDetailedCard);

    if (isFirst) {
      if (!search.total) {
        el.resultsTitle.textContent = `Results for “${search.text}”`;
        el.resultsGrid.replaceChildren(
          createNode("p", "empty", "No Pokémon found with that name or number. Check the spelling.")
        );
        return;
      }
      el.resultsGrid.replaceChildren(
        ...(cards.length
          ? cards
          : [createNode("p", "empty", "Results could not be verified with the API. Try again in a few seconds.")])
      );
    } else {
      el.resultsGrid.append(...cards);
    }
    updateResultsHeader(search);
  } catch (err) {
    if (isAbortError(err) || currentSearch !== search) return;
    const reason = err.timeout ? "The API took too long to respond." : "Could not complete the search. Check your connection.";
    if (isFirst) {
      el.resultsTitle.textContent = `Results for “${search.text}”`;
      el.resultsGrid.replaceChildren(createNode("p", "empty", `${reason} Press the search button to try again.`));
    } else {
      el.resultsNote.textContent = reason;
    }
  } finally {
    if (currentSearch === search) el.resultsMoreBtn.disabled = false;
  }
}

function updateResultsHeader(search) {
  const complete = search.shown >= search.total;
  el.resultsTitle.textContent = complete
    ? `Results for “${search.text}” (${search.total})`
    : `Results for “${search.text}” (showing ${search.shown} of ${search.total})`;
  el.resultsMoreWrap.hidden = complete;
  el.resultsNote.textContent = search.discarded
    ? `${search.discarded} result(s) could not be verified with the API.`
    : "";
}

function clearSearch() {
  cancelPending();
  if (currentSearch) currentSearch.controller.abort();
  currentSearch = null;
  el.input.value = "";
  el.resultsSection.hidden = true;
  el.resultsGrid.replaceChildren();
  el.resultsMoreWrap.hidden = true;
  el.resultsNote.textContent = "";
  hideSuggestions();
}

// ---------------- Detail dialog (reuses the chain and its cache) ----------------
async function openDetail(item) {
  const token = ++detailToken;
  el.dialog.setAttribute("aria-label", `Details for ${prettyName(item.name)}`);

  if (!chainCache.has(item.id)) {
    el.detailBody.replaceChildren(createNode("p", "detail__msg", `Loading ${prettyName(item.name)}…`));
  }
  if (!el.dialog.open) el.dialog.showModal();

  try {
    const data = await resolveChain(item);
    if (token !== detailToken) return; // the dialog was closed or another Pokémon was opened
    renderDetail(data);
  } catch (err) {
    if (token !== detailToken) return;
    const message = createNode("p", "detail__msg", "Could not load information for this Pokémon.");
    const retry = createNode("button", "btn btn--ghost", "Retry");
    retry.type = "button";
    retry.addEventListener("click", () => openDetail(item));
    message.append(document.createElement("br"), retry);
    el.detailBody.replaceChildren(message);
  }
}

function createFact(title, value, wide = false) {
  const fact = createNode("div", "fact" + (wide ? " fact--wide" : ""));
  fact.append(createNode("dt", "", title), createNode("dd", "", value));
  return fact;
}

function renderDetail({ poke, species }) {
  const name = prettyName(poke.name);
  const mainType = poke.types[0] && poke.types[0].type.name;
  const mainColor = (TYPES[mainType] || [])[1] || "#c62f38";

  const figure = createNode("div", "detail__img");
  const img = document.createElement("img");
  const artwork = poke.sprites && poke.sprites.other && poke.sprites.other["official-artwork"];
  img.src = (artwork && artwork.front_default) || (poke.sprites && poke.sprites.front_default) || officialArtUrl(poke.id);
  img.alt = `Artwork of ${name}`;
  figure.append(img);

  const info = createNode("div", "detail__info");
  info.append(createNode("span", "detail__num", dexNumber(poke.id)), createNode("h2", "detail__title", name));

  const genus = englishText(species && species.genera, "genus");
  if (genus) info.append(createNode("p", "detail__category", genus));

  const chips = createNode("div", "chips");
  poke.types.forEach((t) => chips.append(createTypeChip(t.type.name)));
  if (species && species.is_mythical) chips.append(createNode("span", "badge badge--mythical", "Mythical"));
  else if (species && species.is_legendary) chips.append(createNode("span", "badge", "Legendary"));
  info.append(chips);

  const description = englishText(species && species.flavor_text_entries, "flavor_text").replace(/[\n\f\r\u00ad]+/g, " ");
  if (description) info.append(createNode("p", "detail__description", description));

  const facts = createNode("dl", "facts");
  facts.append(
    createFact("Height", `${(poke.height / 10).toLocaleString("en-US")} m`),
    createFact("Weight", `${(poke.weight / 10).toLocaleString("en-US")} kg`),
    createFact("Abilities", poke.abilities.map((a) => prettyName(a.ability.name)).join(", "), true)
  );
  info.append(facts);

  // 255 is the maximum possible base stat.
  info.append(createNode("h3", "", "Base stats"));
  const list = createNode("ul", "stats");
  for (const s of poke.stats) {
    const row = createNode("li", "stat");
    const bar = createNode("span", "stat__bar");
    const fill = createNode("span", "stat__fill");
    fill.style.width = `${Math.min(100, (s.base_stat / 255) * 100)}%`;
    fill.style.background = mainColor;
    bar.append(fill);
    bar.setAttribute("aria-hidden", "true");
    row.append(
      createNode("span", "stat__label", STAT_LABELS[s.stat.name] || prettyName(s.stat.name)),
      createNode("span", "stat__val", String(s.base_stat)),
      bar
    );
    list.append(row);
  }
  info.append(list);

  const content = createNode("div", "detail");
  content.append(figure, info);
  el.detailBody.replaceChildren(content);
  el.detailBody.scrollTop = 0;
}

// ---------------- Events ----------------
el.input.addEventListener("input", scheduleSuggestions);
el.input.addEventListener("blur", () => {
  cancelPending();
  hideSuggestions();
});

el.input.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); moveSelection(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); moveSelection(-1); }
  else if (e.key === "Escape") { cancelPending(); hideSuggestions(); }
  else if (e.key === "Enter" && activeIndex >= 0) {
    e.preventDefault();
    selectSuggestion(suggestions[activeIndex]);
  }
});

el.form.addEventListener("submit", (e) => {
  e.preventDefault();
  runSearch();
});

el.clearSearch.addEventListener("click", clearSearch);
el.moreBtn.addEventListener("click", loadPage);
el.resultsMoreBtn.addEventListener("click", () => { if (currentSearch) loadBatch(currentSearch, false); });

el.backBtn.addEventListener("click", () => el.dialog.close());
el.dialog.addEventListener("click", (e) => {
  if (e.target === el.dialog) el.dialog.close(); // click on the backdrop
});
el.dialog.addEventListener("close", () => { detailToken++; });

loadPage().then(() => loadCatalog().catch(() => {}));
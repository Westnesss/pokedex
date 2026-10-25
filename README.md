# Pokédex · chained requests to a third-party API with vanilla JavaScript

A web page that consumes [PokeAPI](https://pokeapi.co/) to display a Pokémon catalog, with a search bar
that **chains three endpoints**, a **debounced autocomplete**, responsive cards, and a popup with the
detailed information of each Pokémon.
Built with plain HTML, CSS, and JavaScript: **no frameworks and no custom backend**. The only third-party
library is [Lodash](https://lodash.com/) (loaded from a CDN), used for `_.debounce`.

**Live demo:** <!-- If you publish it with GitHub Pages, paste the link here: https://YOUR_USERNAME.github.io/REPO_NAME/ -->

<!-- When you have a screenshot, save it as docs/screenshot.png and remove the comment marks:
![Pokédex screenshot](docs/screenshot.png)
-->

## Features

- Paginated list of Pokémon with official artwork, number, and name (**Cargar más** / "Load more" button).
- **Search by name or number** powered by a chain of three dependent requests (see below), with
  richer results: types, category, and a *Legendario* / *Mítico* badge.
- **Autocomplete with a 4-second debounce** (Lodash). The delay is silent: nothing is shown while waiting.
  When the user stops typing, suggestions appear and the first match completes the word in the input.
  The magnifier button and Enter search immediately.
- Detail popup when clicking a card: large image, types, category, description in Spanish, height, weight,
  abilities, and base stats. It closes with the **Regresar** ("Back") button, with Escape, or by clicking outside.
- Cards scale up when the mouse hovers over them.
- Responsive design (mobile, tablet, and desktop) using CSS Grid and Flexbox.

## How the search works (chained endpoints)

Each link of the chain uses a URL that comes **inside the previous response**, like a nested join:

```
user text
   │  1. validate the input (length, allowed characters, number range)
   ▼
GET /pokemon?limit=2000          ← link 1: candidate list (name → url), cached in memory
   │  item.url
   ▼
GET {item.url}                   ← link 2: confirms the Pokémon exists (404 → discarded),
   │                               returns types, stats, sprites
   │  poke.species.url
   ▼
GET {poke.species.url}           ← link 3: category, Spanish description, legendary / mythical flag
```

### Request validation

| Where | What is validated |
|---|---|
| Before any request | Empty text, max length (30), allowed characters (`a-z`, `0-9`, `-`), Pokédex number range |
| Every request | 8-second timeout, HTTP status (`fetch` does not fail on 404/500 by itself), cancellation with `AbortController` |
| Followed URLs | Only URLs that belong to `https://pokeapi.co/api/v2/` are followed |
| Every response | Minimum expected shape (`id`, `name`, `types`, `stats`, `species.url`, …) |
| Results | Failed candidates are discarded and reported; a failed link 3 still shows the Pokémon without that extra data |

Results are fetched in **batches of 12** (button **Cargar más resultados**), completed chains are cached, and
starting a new search cancels the previous one that was still in flight.

## PokeAPI endpoints used

| Endpoint | Role in the chain |
|---|---|
| `GET /pokemon?limit=…&offset=…` | Link 1 · paginated list and candidate catalog |
| `GET /pokemon/{name}` (URL taken from link 1) | Link 2 · existence check, types, stats |
| `GET /pokemon-species/{name}` (URL taken from link 2) | Link 3 · category and description |

Base URL: `https://pokeapi.co/api/v2`. No API key required.

## Tech stack

HTML5 · CSS3 (Grid, Flexbox, CSS variables, `<dialog>`) · JavaScript (ES6+, `fetch`, `async/await`,
`AbortController`) · Lodash (`_.debounce`, via CDN)

## Project structure

```
.
├── index.html     # page and popup markup
├── styles.css     # responsive styles, hover effect, popup, skeleton loaders
├── api.js         # data layer: validation, requests, endpoint chain (no DOM access)
├── app.js         # UI: cards, debounced autocomplete, search flow, popup
└── README.md
```

## Running the project

You only need a modern browser and an internet connection.

1. **Clone the repository**

   ```bash
   git clone https://github.com/YOUR_USERNAME/REPO_NAME.git
   cd REPO_NAME
   ```

2. **Serve it with a local server**, for example:

   - In **IntelliJ / WebStorm:** open `index.html` and use the browser icons in the top-right corner of the editor.
   - In **VS Code:** *Live Server* extension → right-click `index.html` → *Open with Live Server*.
   - With **Node.js:**

     ```bash
     npx serve .
     ```

3. Open the address shown in the terminal or browser (for example `http://localhost:3000`).

## Configuration

| File | Constant | Description | Value |
|---|---|---|---|
| `app.js` | `POR_PAGINA` | Cards loaded each time in the main list | `24` |
| `app.js` | `RETRASO_MS` | Debounce delay before suggesting and autocompleting | `4000` (4 s) |
| `app.js` | `LOTE_RESULTADOS` | Search results completed per batch | `12` |
| `api.js` | `TIMEOUT_MS` | Maximum time per request | `8000` (8 s) |
| `api.js` | `MAX_CONSULTA` | Maximum length of the search text | `30` |

## Git workflow

- `main` always contains a working version. Work happens in short-lived branches named `type/short-description`
  (`feature/`, `fix/`, `docs/`, `refactor/`, `chore/`) and is merged through **Pull Requests**.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `type(scope): short imperative summary`, for example `feat(api): chain list, detail and species endpoints`.
- One logical change per commit.

## Credits

- Data and images: [PokeAPI](https://pokeapi.co/).
- Debounce: [Lodash](https://lodash.com/).
- Pokémon and their names are trademarks of Nintendo, Game Freak, and The Pokémon Company.
  This is a non-profit educational project.

## Author

**[Your name]** · [Course / University] · [Year]

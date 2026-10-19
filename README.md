# Pokédex · consuming a third-party API with vanilla JavaScript

A web page that consumes [PokeAPI](https://pokeapi.co/) to display a Pokémon catalog, with an
autocomplete search bar, responsive cards, and a popup showing detailed information for each Pokémon.
Built with plain HTML, CSS, and JavaScript: **no frameworks, no libraries, and no custom backend**.

**Live demo:** <!-- If you publish it with GitHub Pages, paste the link here: https://YOUR_USERNAME.github.io/REPO_NAME/ -->

<!-- When you have a screenshot, save it as docs/screenshot.png and remove the comment marks:
![Pokédex screenshot](docs/screenshot.png)
-->

## Features

- Paginated list of Pokémon with official artwork, number, and name (**Cargar más** / "Load more" button).
- Search by name or number, with **autocomplete that appears after 4 seconds** of inactivity
  (with a visible countdown) and instant search using the magnifier button or Enter.
- Detail popup when clicking a card: large image, types, category, description in Spanish,
  height, weight, abilities, and base stats. It closes with the **Regresar** ("Back") button,
  with Escape, or by clicking outside.
- Cards scale up when the mouse hovers over them.
- Responsive design (mobile, tablet, and desktop) using CSS Grid and Flexbox.
- Error handling: messages with a retry button and a fallback image if one fails to load.

## PokeAPI endpoints used

| Endpoint | Purpose |
|---|---|
| `GET /pokemon?limit=24&offset=0` | Paginated Pokémon list and name catalog for the search |
| `GET /pokemon/{id}` | Image, types, height, weight, abilities, and stats |
| `GET /pokemon-species/{id}` | Category and description (in Spanish) |

Base URL: `https://pokeapi.co/api/v2`. No API key required.

## Tech stack

HTML5 · CSS3 (Grid, Flexbox, CSS variables, `<dialog>`) · JavaScript (ES6+, `fetch`, `async/await`)

## Project structure

```
.
├── index.html     # page and popup markup
├── styles.css     # responsive styles, hover effect, and popup
├── app.js         # API calls, delayed search, and popup logic
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

In `app.js` you can adjust:

| Constant | Description | Value |
|---|---|---|
| `POR_PAGINA` | Cards loaded each time | `24` |
| `RETRASO_MS` | Delay before suggesting and autocompleting | `4000` (4 s) |

## Credits

- Data and images: [PokeAPI](https://pokeapi.co/).
- Pokémon and their names are trademarks of Nintendo, Game Freak, and The Pokémon Company.
  This is a non-profit educational project.


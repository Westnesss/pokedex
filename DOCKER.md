# Docker

| Image | Built from | Contents |
|---|---|---|
| `pokedex-web` | `Dockerfile` | nginx serving `index.html`, `styles.css`, `api.js`, and `app.js` |

The page calls PokeAPI directly from the browser, so the image has no backend and no environment-specific configuration:
the same image is promoted from `test` to `prod`.

## Requirements

- Docker Desktop (WSL 2 backend on Windows) with Docker Compose v2

## Run locally

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps             # wait until web is "healthy"
```

Open [http://localhost:8090](http://localhost:8090).

```bash
docker compose logs -f web    # follow the logs
docker compose down           # stop
```

If you add a new file to the site (images, fonts, another script), add it to the `COPY` line in `Dockerfile`
and to the allow-list in `.dockerignore`.

## Publish the images

```bash
docker login
export DOCKERHUB_USER=<your-user>

IMAGE_TAG=1.0.0 docker compose build
docker tag $DOCKERHUB_USER/pokedex-web:1.0.0 $DOCKERHUB_USER/pokedex-web:test
docker push $DOCKERHUB_USER/pokedex-web:1.0.0
docker push $DOCKERHUB_USER/pokedex-web:test
```

When the version is approved for production, promote the **same image** (no rebuild):

```bash
docker tag $DOCKERHUB_USER/pokedex-web:1.0.0 $DOCKERHUB_USER/pokedex-web:prod
docker push $DOCKERHUB_USER/pokedex-web:prod
```

`X.Y.Z` is immutable; `test` and `prod` move to the version running in that environment.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `port is already allocated` | Change `WEB_PORT` in `.env` |
| The page does not change after editing | `docker compose up -d --build` |
| `docker: error during connect` | Docker Desktop is not running |

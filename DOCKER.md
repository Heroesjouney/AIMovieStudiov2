# Running with Docker

If you would rather not install Python and Node yourself, Docker Compose brings up
the backend and the frontend together with one command.

**Requirements:** Docker Desktop, or Docker Engine with the Compose plugin.

```bash
# Optional, only if you use cloud models. Local ComfyUI generation works without it.
cp backend/.env.example backend/.env

docker compose up --build
```

Open **http://localhost:3000**. The API explorer is at http://localhost:8001/docs.

ComfyUI still runs on your host machine, not in a container, because it needs direct
GPU access. The backend container reaches it at `host.docker.internal:8188`, which is
already the default. If your ComfyUI listens somewhere else, set `COMFY_URL` in
`backend/.env`.

## What persists

| Host path | Holds |
| --------- | ----- |
| `backend/assets/` | Projects, generated images and video, and `settings.json` with your API keys |
| `backend/core/workflows/` | Custom ComfyUI workflows added through the UI |

Both are bind mounts, so `docker compose down` and rebuilds leave your work alone.

## A note on privacy

- Both services are published to `127.0.0.1` only, so nothing is reachable from the
  rest of your network out of the box. The comment in `docker-compose.yml` explains
  how to change that if you actually want it.
- `.dockerignore` keeps `backend/assets/` and any `.env` file out of the build
  context, so your API keys never end up baked into an image layer.
- Because keys live in `backend/assets/settings.json`, do not publish an image built
  from a running install, and do not commit that directory.

## Everyday commands

```bash
docker compose up -d          # start in the background
docker compose logs -f        # follow logs
docker compose down           # stop
docker compose up --build     # rebuild after pulling changes
```

## Troubleshooting

**The frontend loads but every request fails.** Check that the backend container is
healthy with `docker compose ps`. The frontend waits for it, so an unhealthy backend
usually means a dependency problem. Read `docker compose logs backend`.

**Generation fails with a connection error.** The backend cannot reach ComfyUI.
Confirm ComfyUI is running on the host and listening on port 8188, then check
`COMFY_URL` in `backend/.env` if you set one.

**A port is already in use.** Something else holds 3000 or 8001. Change the left
side of the mapping in `docker-compose.yml`, for example `127.0.0.1:3100:3000`.

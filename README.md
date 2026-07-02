# Microservice Lab — Fibonacci Calculator (K8s learning project)

## Architecture / data flow

```
[ browser ]
     |
     v
[ nginx ] --/-------------> serves client's built static files directly
     |                      (client/dist copied into the nginx image at build time -
     |                       there is no running client container/pod)
     |
     +----/api/*-----------> [ server (Express, port 5000) ]
                                    |         |
                                    v         v
                              [ postgres ] [ redis ] <----- publish/subscribe -----> [ worker ]
```

The client is a build-time artifact, not a runtime service — `npm run build`
produces `client/dist/`, and your nginx Dockerfile copies that into the
image (typically `/usr/share/nginx/html`). So in K8s you'll end up with 3
running Deployments (nginx, server, worker) plus postgres and redis — not 4.

1. User types a number in the **client** (served by nginx as static HTML/JS).
2. Client POSTs it to `/api/values` (nginx routes this to **server**).
3. **server**:
   - stores the raw number in **postgres** (table `values`)
   - sets a placeholder in **redis** hash `values`
   - publishes the number on the redis `insert` pub/sub channel
4. **worker** is subscribed to the `insert` channel, computes the Fibonacci
   value (deliberately with slow naive recursion — good for observing scaling
   behavior later), and writes the result back into the same redis hash.
5. Client polls `/api/values/all` (postgres — "numbers we've seen") and
   `/api/values/current` (redis — "calculated results") every 2s.

## Folder structure

```
client/   React + Vite app (talks only to /api/*, never to server directly)
          -> built with `npm run build`, output copied into the nginx image
server/   Express API (talks to postgres + redis)
worker/   Node process (subscribes to redis, computes fibonacci)
nginx/    Serves the built client static files + proxies /api -> server
```

## Environment variables the apps expect

**server**
| Var | Default | Notes |
|---|---|---|
| `PGUSER` | postgres | |
| `PGHOST` | postgres | should match your Postgres K8s Service name |
| `PGDATABASE` | postgres | |
| `PGPASSWORD` | postgres_password | put this in a K8s Secret |
| `PGPORT` | 5432 | |
| `REDIS_HOST` | redis | should match your Redis K8s Service name |
| `REDIS_PORT` | 6379 | |
| `PORT` | 5000 | |

**worker**
| Var | Default |
|---|---|
| `REDIS_HOST` | redis |
| `REDIS_PORT` | 6379 |

**client**
No env vars needed — it only ever calls relative `/api/...` paths, so nginx
handles all the service discovery. It's built once (`npm run build`) into
static files; nothing reads env vars at runtime since there is no runtime.

## Running it locally without Docker (sanity check first)

```bash
# terminal 1 - postgres & redis, easiest via docker for now
docker run -d --name postgres -e POSTGRES_PASSWORD=postgres_password -p 5432:5432 postgres
docker run -d --name redis -p 6379:6379 redis

# terminal 2
cd server && npm install && PGPASSWORD=postgres_password npm start

# terminal 3
cd worker && npm install && npm start

# terminal 4 (dev mode only - hits real vite dev server on :3000,
# unrelated to how nginx will serve it in prod)
cd client && npm install && npm run dev
```

Open the client at http://localhost:3000 and submit a number — the API calls
will fail until you also run nginx or point axios elsewhere, but this is
enough to confirm each service boots and connects.

## Your next steps (the actual learning exercise)

1. **Dockerfiles**:
   - `server` and `worker`: standard single-stage Node Dockerfiles
     (`COPY package*.json`, `npm install`, `COPY .`, `CMD ["node", "index.js"]`).
   - `nginx`: this is the interesting one — a **multi-stage build**.
     Stage 1 uses a `node` image to `npm install && npm run build` the
     `client/` folder (producing `client/dist/`). Stage 2 starts `FROM nginx`,
     `COPY`s `nginx/default.conf` into `/etc/nginx/conf.d/`, and `COPY`s
     the `dist/` output from stage 1 into `/usr/share/nginx/html`.
2. **docker-compose.yml** — wire the pieces together: nginx, server, worker,
   postgres, redis (5 services now, since client is baked into nginx) and
   confirm it works with plain Docker before touching K8s.
3. **Kubernetes manifests** — good progression:
   - `Deployment` + `Service` (ClusterIP) for server, worker, redis
   - `Deployment` + `Service` (ClusterIP) + `PersistentVolumeClaim` for postgres
   - `ConfigMap` for non-secret env vars (PGHOST, REDIS_HOST, etc.)
   - `Secret` for `PGPASSWORD`
   - `Deployment` + `Service` (NodePort or LoadBalancer) or an `Ingress` for
     nginx as your entrypoint — this is now the only externally-reachable pod
   - Try scaling `worker` replicas and watch how throughput changes —
     the naive recursive fibonacci makes this very visible
4. Later: liveness/readiness probes (there's already a `/healthz` route on
   the server to hook up), resource limits, HPA (Horizontal Pod Autoscaler)
   on the worker based on CPU.

Good luck with the lab — ping me when you're ready for help on the
Dockerfiles or the K8s manifests.

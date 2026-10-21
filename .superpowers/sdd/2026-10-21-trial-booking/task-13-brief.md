### Task 13: Docker image and the full stack

**Files:**
- Create: `Dockerfile`, `.dockerignore`
- Modify: `docker-compose.yml` (add `app` and `test`)

**Interfaces:**
- Consumes: `npm run build`, `npm test`, `src/server/main.ts`.
- Produces: `docker compose up` (the app on 3000, Mailpit on 8025) and `docker compose run --rm --build test`.

- [ ] **Step 1: Write the files**
  - **`.dockerignore`**: `node_modules`, `dist`, `.git`, `.playwright-mcp`, `.superpowers`, `docs`, `*.pdf`.
  - **`Dockerfile`**:

```dockerfile
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM deps AS test
COPY . .
CMD ["npm", "test"]

FROM node:24-alpine AS runtime
ENV NODE_ENV=production TZ=UTC
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY migrations ./migrations
COPY src/shared ./src/shared
COPY src/server ./src/server
COPY --from=build /app/dist/web ./dist/web
EXPOSE 3000
CMD ["node", "src/server/main.ts"]
```

  - **`app` service**:
    - `build: { context: ., target: runtime }`, ports `"3000:3000"`.
    - Environment: `DATABASE_URL: postgres://bookings:bookings@db:5432/bookings`, `SMTP_URL: smtp://mailpit:1025`, `APP_URL: http://localhost:3000`, `PORT: "3000"`, `TZ: UTC`, `DEMO_NOW: ${DEMO_NOW:-}`.
    - `depends_on: { db: { condition: service_healthy }, mailpit: { condition: service_started } }`.
    - `healthcheck: { test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/slots"], interval: 2s, retries: 30 }`. Busybox `wget` ships in `node:24-alpine`. This lets `docker compose up --wait` return only once the app is serving, so nothing needs a `sleep`.
  - **`test` service**:
    - `build: { context: ., target: test }`, `profiles: [test]`.
    - Environment: the same `DATABASE_URL`, plus `TZ: UTC`.
    - `depends_on: { db: { condition: service_healthy } }`.

- [ ] **Step 2: Bring the stack up from scratch**

Run: `docker compose down -v && docker compose up --build -d --wait && docker compose logs app | tail -n 5`
Expected: `listening on http://localhost:3000`.
- If the log shows a TypeScript syntax error instead, Node's type stripping failed in the image. Switch to the spec's fallback: a `tsc` build stage that emits JS for `src/server` and `src/shared`, run with `node`. Don't add another runner.

- [ ] **Step 3: Smoke-test the stack**

Run: `curl -s localhost:3000/api/slots | head -c 120; curl -s localhost:3000/ | grep -c 'id="root"'`
Expected: JSON starting `{"now":`, then `1`. Then:
1. Book through the UI at `localhost:3000`.
2. Check that both emails appear at `localhost:8025`.

- [ ] **Step 4: Run the suite in Docker**

Run: `docker compose run --rm --build test`
Expected: all tests pass, three times (UTC, Chatham and Los Angeles).

- [ ] **Step 5: Check the demo clock end to end**

Run: `docker compose down -v && DEMO_NOW=2026-10-20T12:00:00Z docker compose up -d --wait && curl -s localhost:3000/api/slots | head -c 60`
Expected: `{"now":"2026-10-20T12:00:…","demo":true`.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore docker-compose.yml
git commit -m "feat(docker): one compose up migrates, seeds and serves; add test service"
```

---


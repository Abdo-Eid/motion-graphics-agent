# Docker Crash Course (Refresher)

> **Historical reference only.** This project does not use Docker — the active sandbox runs as a local Bun process exposed over MCP/HTTP. See `docs/local-sandbox-service-design.md` for the live design. Kept here as a generic Docker primer; the "Mini Sandbox" exercise below describes the rejected container-based approach.

A fast pass over Docker concepts. Skip anything you already know.

---

## 1. Mental Model

- **Image** — a frozen snapshot (read-only). Built from a `Dockerfile`.
- **Container** — a running instance of an image (read-write layer on top).
- **Volume / Bind mount** — a way to share files between host and container.
- **Port mapping** — exposes a container port to your host machine.

```text
Dockerfile  --build-->  Image  --run-->  Container
                                         │
                                         ├── ports: -p host:container
                                         └── files: -v host:container
```

---

## 2. Dockerfile — Core Instructions

| Instruction | Purpose |
|---|---|
| `FROM` | Base image to start from |
| `WORKDIR` | Set working directory inside the image |
| `COPY` | Copy files from host into the image |
| `RUN` | Execute a command at **build time** (e.g. install deps) |
| `EXPOSE` | Document which port the container listens on |
| `CMD` | Default command at **run time** |
| `ENV` | Set environment variables |

Minimal example:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
EXPOSE 3001
CMD ["node", "server.js"]
```

Build vs run difference: `RUN` happens once when building the image. `CMD` runs every time you start a container.

---

## 3. Essential Commands

### Build

```bash
docker build -t my-image .
```

`-t` tags the image. `.` is the build context (the Dockerfile location).

### Run

```bash
docker run --rm -p 3001:3001 my-image
```

| Flag | Purpose |
|---|---|
| `--rm` | Remove container when it stops |
| `-p host:container` | Map a port |
| `-v host:container` | Mount a host directory |
| `-d` | Run detached (background) |
| `--name foo` | Name the container |
| `-e KEY=value` | Set env var |
| `-it` | Interactive terminal |

### Inspect

```bash
docker ps                        # running containers
docker ps -a                     # all containers
docker logs <name>               # container output
docker exec -it <name> sh        # shell into a running container
docker images                    # list images
docker stop <name>               # stop a running container
```

### Cleanup

```bash
docker rm <name>                 # delete a stopped container
docker rmi <image>               # delete an image
docker system prune              # remove everything unused
```

---

## 4. Volumes / Bind Mounts

This is critical for your sandbox — the workspace files live on the host, the container reads/writes them.

```bash
docker run -v C:/path/on/host:/workspace my-image
```

Inside the container, `/workspace` now mirrors the host folder. Changes persist. This is how your sandbox will share workspace files with the host for preview sync.

On Windows + PowerShell, use forward slashes or escaped paths:

```powershell
docker run -v ${PWD}/workspace:/workspace my-image
```

---

## 5. Networking Basics

- `EXPOSE 3001` — documentation only
- `-p 3001:3001` — actually maps the port
- From host: `localhost:3001` reaches the container
- Containers on the same Docker network can talk by name

For your sandbox: the MCP server inside the container listens on `:3001`, and you map it to host `:3001` so Mastra can reach it.

---

## 6. Layer Caching

Docker caches each instruction. If a layer hasn't changed, it's reused.

**Rule of thumb:** put rarely-changing things first.

```dockerfile
# Good: deps cached separately from source
COPY package.json .
RUN npm install
COPY . .

# Bad: changing any source file re-runs npm install
COPY . .
RUN npm install
```

---

## 7. Things That Trip People Up

- **Build context size** — `.` copies the whole folder. Use `.dockerignore` (same syntax as `.gitignore`) to exclude `node_modules`, `.git`, etc.
- **CMD vs ENTRYPOINT** — for now, just use `CMD`.
- **Shell form vs exec form** — prefer `CMD ["node", "server.js"]` (exec form, JSON array) over `CMD node server.js`.
- **PID 1 / signals** — Node as PID 1 doesn't handle SIGTERM cleanly. For dev, ignore. For prod, use `tini` or `node --init`.
- **File permissions on Windows** — bind mounts work but can have weird perm/case-sensitivity behavior.

---

## Practice Exercise — All-in-One Mini Sandbox

Builds: a Node container that exposes a tiny HTTP server, reads files from a mounted workspace, and lets you call it from the host. Uses `FROM`, `WORKDIR`, `COPY`, `RUN`, `EXPOSE`, `CMD`, build, run, port mapping, bind mount, exec, and cleanup.

### Setup

Create a folder anywhere:

```text
mini-sandbox/
├── Dockerfile
├── package.json
├── server.js
└── workspace/
    └── hello.txt        ("hi from the host")
```

### `package.json`

```json
{
  "name": "mini-sandbox",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {}
}
```

### `server.js`

```js
import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'

const PORT = 3001
const WORKSPACE = '/workspace'

const server = http.createServer(async (req, res) => {
  if (req.url === '/list') {
    const files = await fs.readdir(WORKSPACE)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(files))
    return
  }

  if (req.url?.startsWith('/read?')) {
    const name = new URL(req.url, 'http://x').searchParams.get('name')
    const content = await fs.readFile(path.join(WORKSPACE, name), 'utf-8')
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(content)
    return
  }

  res.writeHead(404)
  res.end('not found')
})

server.listen(PORT, () => console.log(`mini-sandbox on :${PORT}`))
```

### `Dockerfile`

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY server.js .
EXPOSE 3001
CMD ["node", "server.js"]
```

### `workspace/hello.txt`

```text
hi from the host
```

### Steps to run

1. **Build the image:**

   ```powershell
   docker build -t mini-sandbox .
   ```

2. **Run with workspace mounted and port mapped:**

   ```powershell
   docker run --rm --name mini -p 3001:3001 -v ${PWD}/workspace:/workspace mini-sandbox
   ```

3. **In another terminal, call it from the host:**

   ```powershell
   curl http://localhost:3001/list
   curl "http://localhost:3001/read?name=hello.txt"
   ```

   You should see `["hello.txt"]` and `hi from the host`.

4. **Test live mounting:** add a new file to `workspace/` on the host, then `curl /list` again. The new file appears immediately — no rebuild.

5. **Shell into the running container:**

   ```powershell
   docker exec -it mini sh
   ls /workspace
   exit
   ```

6. **Stop and clean up:**

   ```powershell
   docker stop mini
   docker rmi mini-sandbox
   ```

### What this exercise proves

- You can write a Dockerfile from scratch
- You understand build vs run
- You can mount host files into the container
- You can map ports and reach the container from the host
- You can exec into a running container to debug
- You can clean up after yourself

This is exactly the shape of the real sandbox — just swap the toy HTTP server for an MCP server, and you're ready for the next step.

---

## Next After This

When this exercise feels easy:

1. Replace the toy HTTP server with a real **MCP server** exposing one tool (`read_file`)
2. Add the rest of the tool families: write, skills, verify
3. Connect Mastra to the discovered MCP tools

See `docs/reference/docker-sandbox-historical.md` for the original (now-rejected) Docker sandbox design, and `docs/local-sandbox-service-design.md` for the active replacement.

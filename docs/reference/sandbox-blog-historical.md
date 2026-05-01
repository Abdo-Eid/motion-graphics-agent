# AI Agent Sandboxes: A Deep Dive

> **Historical reference only.** The active design uses a local Mastra MCP service running directly on the host (no Docker). See `docs/local-sandbox-service-design.md`. This document is kept for background on sandbox approaches in general.


## Outline

1. [What Is a Sandbox?](#what-is-a-sandbox) — the basic definition and why it matters for agents.
2. [Why Agents Need Sandboxes](#why-agents-need-sandboxes) — the risks of letting agents run code directly on the host.
3. [Sandboxes vs. Approval Mode](#sandboxes-vs-approval-mode) — distinguishing the *permission boundary* from the *execution boundary*.
4. [What's Inside a Sandbox](#whats-inside-a-sandbox) — file system, execution tool, and common providers (Runloop, Daytona, Modal).
5. [How the Agent Loop Works](#how-the-agent-loop-works) — the command/execute/return cycle between agent and sandbox.
6. [Beyond Safety: Performance and Scale](#beyond-safety-performance-and-scale) — remote compute and parallel sandboxes.
7. [A Concrete Example](#a-concrete-example) — per-user sandboxes in a development platform.
8. [Stateless by Default, Persistent When Needed](#stateless-by-default-persistent-when-needed) — ephemeral sandboxes vs. long-lived workspaces.
9. [Let's Build a Simplified Sandbox](#lets-build-a-simplified-sandbox) — a minimal Python + Docker toy that exposes `run_command`, `read_file`, `write_file`, plus a small agent loop.
10. [How Sandboxes Are Actually Built](#how-sandboxes-are-actually-built) — the real isolation tech: containers, microVMs, gVisor, and the trade-offs between them.

---

## What Is a Sandbox?

A sandbox is an isolated computing environment where code can run without affecting the system around it. It has its own file system, its own shell, and its own process space, all walled off from the host machine. Anything that happens inside — a script that deletes files, a package install that breaks dependencies, a server that opens ports — stays contained within that boundary. When the work is done, the sandbox can simply be thrown away.

For AI agents, this isolation is what makes autonomous code execution practical. An agent that writes and runs its own code needs somewhere to do that work safely, and a sandbox provides exactly that: a disposable environment the agent can act in freely, without putting the user's machine or data at risk.

## Why Agents Need Sandboxes

Deep agents are designed to generate and execute arbitrary code as part of solving a task. That capability is what makes them powerful — they can install packages, modify files, run scripts, and iterate on problems the same way a human developer would. But the same capability is also what makes them dangerous to run directly on a local machine. A buggy command, a hallucinated `rm -rf`, or a prompt injection attack could all cause real damage to the host system.

Sandboxes solve this by acting as remote, isolated environments where everything the agent does is contained. Instead of executing code locally, the agent connects to a sandbox and runs its commands there. Whatever it does — good, bad, or unexpected — stays inside that environment. The host machine remains untouched.

This isolation does more than just protect the user. It also unlocks behaviors that would otherwise be too risky to allow at all. Because the blast radius is limited to the sandbox, the agent can be given broad permissions to write code, run shell commands, and interact with a real file system. Even in the worst case — a misbehaving model, a malicious instruction injected into its context, or a tool call gone wrong — the sandbox absorbs the damage.

## Sandboxes vs. Approval Mode

Sandboxing is often confused with another safety mechanism that lives in the same neighborhood: **approval mode**. They sound similar, they sometimes appear together, and both are described as ways to make agents "safer." But they solve fundamentally different problems, and it's worth being precise about the difference.

### Approval Mode: Authorization

When a coding agent is not in auto-accept mode and asks before it edits a file or runs a command, that is **approval mode** — sometimes also called **permission mode**, **tool approval**, **confirmation prompts**, or **human-in-the-loop**. The terminology varies by product (Anthropic's Claude Code uses "permission modes"; GitHub Copilot documents similar approval behavior for commands and file modifications), but the underlying idea is the same:

> The coding agent is in approval mode, where file edits and command execution require user confirmation.

Approval is often policy-based rather than a simple on/off switch. Some tools let you approve a single action, approve similar actions for the rest of the session, or pre-approve specific tools or command patterns up front. Either way, the question approval mode answers is: **"Is the agent allowed to do this?"**

### Sandbox: Containment

A sandbox (or **secure sandbox**, **isolated environment**, **ephemeral environment**, **container environment**, **microVM**, **agent runtime** — again, naming varies) is an isolated execution environment where the agent's actions actually run. Instead of operating directly on your real system, the agent works inside a contained environment with restrictions like:

- limited filesystem access
- restricted or no internet access
- blocked system-level operations
- isolated environment variables and secrets
- no direct access to your host machine

The question a sandbox answers is different: **"If the agent does this, where does it run, and how much can it actually touch?"**

### Permission Boundary vs. Execution Boundary

The clearest way to keep them straight:

- **Approval mode** is a *permission boundary*. It controls **authorization** — whether an action is allowed at all. It helps prevent unwanted or surprising actions.
- **Sandbox** is an *execution boundary*. It controls **containment** — where actions run and what they can reach. It helps limit the damage or reach of actions that do happen.

A small example makes this concrete:

- Asking *"Can I run `npm test`?"* before executing it → **approval mode**.
- Running `npm test` inside an isolated container with limited access to your real machine → **sandbox**.

### They Compose

These two controls are not alternatives; they stack. An agent can ask before every action *and* run the approved action inside a sandbox. An agent can also run fully auto-accepting *and* still be confined to a sandboxed environment, so that even unsupervised actions can't escape into the host system.

In short, the terminology across products is messy, but the categories are clean:

- **Approval-related terms** all point to *user authorization*.
- **Sandbox-related terms** all point to *execution isolation*.

The rest of this post is about the second category — the execution boundary itself, and what it lets agents actually do.

## What's Inside a Sandbox

A typical agent sandbox exposes two core capabilities:

1. **A file system** — much like the one on a local machine, the agent can create, read, edit, and store files inside the sandbox. This is where source code, intermediate artifacts, and outputs live.
2. **An execution tool** — effectively a remote shell. The agent can run commands inside the sandbox: executing Python scripts, invoking build tools, starting servers, installing dependencies, and so on.

Together these two primitives are enough to support a wide range of work. The agent can clone a repository, install its dependencies with `pip`, run its tests, edit files in response to failures, and re-run them — all without ever touching the host.

Setting up a sandbox usually starts with defining the environment the agent needs: which repository to clone, which dependencies to install, which tools to make available. Once configured, the sandbox becomes a fully functional remote workspace. Common providers for hosting these environments include **Runloop**, **Daytona**, and **Modal**.

## How the Agent Loop Works

From the user's perspective, interacting with a sandboxed agent feels local. You talk to the agent on your own machine and ask it to do something — fix a bug, build a feature, run an experiment. Behind the scenes, though, the actual work happens elsewhere.

The loop looks like this:

1. The agent decides it needs to run code or a shell command.
2. Instead of executing locally, it sends the command to the sandbox.
3. The sandbox runs it in its isolated environment and captures the output.
4. The output is returned to the agent.
5. The agent reads the result and decides the next step — often issuing another command, editing a file, or reporting back to the user.

This cycle repeats as many times as the task requires. The agent gets the full benefits of dynamic code execution and iterative problem-solving, while the user's local environment stays clean and protected.

## Beyond Safety: Performance and Scale

Isolation is the headline benefit, but remote sandboxes also change what agents are capable of in terms of raw computing power.

Because the sandbox runs on a remote machine, it can be provisioned with far more CPU, memory, or GPU than the user's laptop has. Heavy or long-running tasks — large data processing jobs, training runs, expensive builds — can be offloaded entirely. The user's machine stays responsive while the real work happens elsewhere.

Sandboxes also scale horizontally. An agent can spin up many sandboxes at once and run them in parallel. This is especially useful for workflows like deep research, large-scale code analysis, or any task that decomposes into independent subtasks. Each subtask gets its own clean environment, runs concurrently, and returns its result to the orchestrating agent.

## A Concrete Example

A practical example is a development platform that gives every user their own sandbox. Inside that sandbox, the user (or an agent acting on their behalf) can write code, generate files, install dependencies, and even run live servers. Because each sandbox is fully isolated, users can interact with their applications in real time as they are being built — clicking around a web app, hitting an API, watching logs — without any risk of one user's environment affecting another's, and without exposing the underlying infrastructure.

This pattern generalizes well: anywhere you want to give an agent (or a user-driven agent) the freedom to build and run real software, a per-session sandbox is a clean way to do it.

## Stateless by Default, Persistent When Needed

By design, basic sandboxes are temporary and stateless. They are created on demand, used to complete a task, and then discarded. This is a feature, not a limitation: ephemerality is part of what keeps the model safe and predictable. There is no long-lived environment accumulating cruft, no leftover state from a previous session leaking into the next one.

For longer-lived work, more advanced setups introduce **persistence through workspaces**. A workspace lets the agent retain files across sessions, reuse tools or "skills" it has built up, and maintain continuity over time. This is useful when an agent is working on a single project across many interactions and needs to remember what it did before.

The combination of strong isolation, on-demand provisioning, parallel scalability, and optional persistence is what makes remote sandboxes such a natural foundation for agent systems. They give agents room to actually do work — write code, run it, break things, fix them — while keeping the user, the host, and the broader system safe.

## Let's Build a Simplified Sandbox

Before we look at how production sandboxes are actually built, it helps to build a tiny one ourselves. The goal here is not to be secure — it's to make the *shape* of a sandbox concrete: a process the agent talks to, that owns its own file system and shell, and that returns results back over a clean interface.

We'll use Python and Docker. The lifecycle has three stages, and they map almost one-to-one onto how real sandbox providers work:

1. **Define the environment** in a `Dockerfile` — the base OS, the language runtimes, the tools the agent will need.
2. **Build an image** from that Dockerfile — this is the reusable template.
3. **Spawn a container** from the image when a session starts, keep it alive for the whole session, and run every agent command inside it with `docker exec`. Tear it down at the end.

Provisioning the image is paid once. Spawning a container from it is fast, and the container's file system persists across commands within a session.

### Step 1: The Dockerfile

This is where we declare what the sandbox actually contains. For a real agent we'd add git, build tools, maybe Node, etc. — but the principle is the same:

```dockerfile
# Dockerfile
FROM python:3.11-slim

# Tools the agent is allowed to use inside the sandbox.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# A non-root user. The agent should not run as root inside the container.
RUN useradd --create-home --shell /bin/bash agent
USER agent
WORKDIR /work

# Keep the container alive; we'll drive it from the host with `docker exec`.
CMD ["sleep", "infinity"]
```

Three things worth noticing:

- The `RUN apt-get install` line is the agent's *toolbox*. Anything not installed here, the agent simply doesn't have access to.
- We create a non-root `agent` user and `USER agent` switches to it. Even if something inside the container goes wrong, it isn't running as root.
- `CMD ["sleep", "infinity"]` is the trick that keeps the container alive without it doing anything on its own. The agent drives all the activity from outside via `docker exec`.

### Step 2: Build the image

One command, run once:

```bash
docker build -t toy-sandbox:latest .
```

This produces a reusable image called `toy-sandbox:latest`. Every sandbox session will be a fresh container spawned from this image, so they all start from the exact same clean state.

### Step 3: The sandbox class

Now the Python class just connects to a container started from our image:

```python
# toy_sandbox.py
import base64
import docker

class ToySandbox:
    def __init__(self, image: str = "toy-sandbox:latest"):
        self.client = docker.from_env()
        # Start a container from our pre-built image and keep it alive.
        # The Dockerfile already set the user, workdir, and CMD.
        self.container = self.client.containers.run(
            image,
            detach=True,
            mem_limit="512m",
            network_disabled=True,   # toy default: no network
        )

    def run_command(self, cmd: str) -> dict:
        """Run a shell command inside the sandbox and return its output."""
        result = self.container.exec_run(
            ["sh", "-c", cmd],
            workdir="/work",
            demux=True,  # split stdout/stderr
        )
        stdout, stderr = result.output
        return {
            "exit_code": result.exit_code,
            "stdout": (stdout or b"").decode(),
            "stderr": (stderr or b"").decode(),
        }

    def write_file(self, path: str, content: str) -> None:
        """Write a file inside the sandbox."""
        encoded = base64.b64encode(content.encode()).decode()
        self.run_command(
            f"mkdir -p \"$(dirname {path})\" && "
            f"echo {encoded} | base64 -d > {path}"
        )

    def read_file(self, path: str) -> str:
        """Read a file from inside the sandbox."""
        return self.run_command(f"cat {path}")["stdout"]

    def close(self) -> None:
        self.container.kill()
        self.container.remove()
```

A few things worth pointing out, because they correspond directly to ideas from earlier sections:

- **One container, many commands.** `__init__` starts the container, `close` tears it down. Everything in between reuses the same environment. That's why `write_file` followed by `run_command("python script.py")` works — they share `/work`.
- **`/work` is the file system.** From the agent's point of view, this is the entire world. It can't see the host's files because the container has no bind mounts.
- **Network is off by default.** `network_disabled=True` is one line, but it's already a real policy decision: this sandbox can run code, but it can't phone home or `pip install` anything. We'd flip that off (or use an egress allow-list) if the task needed it.
- **Memory is capped.** `mem_limit="512m"` keeps a runaway process from eating the host's RAM. A timeout on `run_command` would be the natural next addition.
- **Files are written via base64.** A small detail, but it sidesteps quoting and binary-safety problems when piping content through a shell.

### Using it

With those three primitives — `run_command`, `write_file`, `read_file` — you can already do real work:

```python
sb = ToySandbox()
try:
    sb.write_file("/work/hello.py", "print('hello from the sandbox')\n")
    result = sb.run_command("python hello.py")
    print(result["stdout"])  # -> hello from the sandbox
finally:
    sb.close()
```

Notice how the host process never touches `hello.py` directly. It hands the content to the sandbox, and the sandbox owns the file from that point on.

### A minimal agent loop

The last piece is the loop from the earlier section, made concrete. The agent is just a function that, given the conversation so far, returns the next tool call. Here's the skeleton:

```python
TOOLS = {
    "run_command": lambda sb, args: sb.run_command(args["cmd"]),
    "write_file":  lambda sb, args: sb.write_file(args["path"], args["content"]),
    "read_file":   lambda sb, args: sb.read_file(args["path"]),
}

def agent_loop(user_task: str, sb: ToySandbox, max_steps: int = 10):
    history = [{"role": "user", "content": user_task}]

    for _ in range(max_steps):
        # 1. Ask the model what to do next.
        action = llm_decide_next_action(history)  # -> {"tool": ..., "args": {...}}

        if action["tool"] == "finish":
            return action["args"]["answer"]

        # 2. Execute the chosen tool inside the sandbox.
        tool_fn = TOOLS[action["tool"]]
        observation = tool_fn(sb, action["args"])

        # 3. Feed the result back into the model's context.
        history.append({"role": "assistant", "content": action})
        history.append({"role": "tool",      "content": observation})

    raise RuntimeError("agent did not finish in time")
```

`llm_decide_next_action` is whatever model you wire in — Claude, GPT, a local model — prompted to return a tool call as structured output. The important part is the structure of the loop, not the model:

1. Model picks a tool.
2. Tool runs **inside the sandbox**, never on the host.
3. The output goes back into the model's context.
4. Repeat until the model says it's done.

This is exactly the loop described earlier in [How the Agent Loop Works](#how-the-agent-loop-works), now backed by a real (if toy) sandbox.

### What this toy is *not*

It's worth being honest about what we just built. This sandbox:

- shares the host kernel with the container (a kernel exploit escapes it),
- has no per-command timeouts,
- has no CPU limits, only a memory cap,
- doesn't restrict syscalls (no seccomp profile),
- doesn't isolate the user namespace, so root in the container is uncomfortably close to root on the host,
- and doesn't snapshot or persist anything across sessions.

Each of those gaps is exactly what the next section is about — the real isolation technology that production sandboxes use to close them.

## How Sandboxes Are Actually Built

The toy sandbox in the previous section is built on a real container, but its isolation is thin. The container shares the host's kernel, has no syscall filter, and runs with most Linux capabilities still available. For your own trusted code that's usually fine. For arbitrary code generated by an LLM — code that might be wrong, malicious, or shaped by a prompt injection — it isn't.

Real sandbox providers close those gaps with a stack of well-known Linux primitives, plus, increasingly, virtualization. It's worth walking through the layers from weakest to strongest, because each provider picks a different point on that spectrum.

### Layer 1: The Linux primitives behind a container

A "container" isn't a single feature. It's a bundle of kernel mechanisms:

- **Namespaces** isolate what a process can *see*. There are several, and each one hides a different part of the system:
  - `pid` — the container has its own process tree; PID 1 inside is not PID 1 on the host.
  - `mount` — its own view of the file system.
  - `net` — its own network interfaces and routing table.
  - `uts` — its own hostname.
  - `ipc` — its own shared memory and message queues.
  - `user` — its own UID/GID mapping. Root inside the container can be mapped to an unprivileged user on the host.
- **cgroups** limit what a process can *consume*: CPU shares, memory, block I/O, number of PIDs. This is what `mem_limit="512m"` in the toy sandbox actually configures.
- **Capabilities** split the old all-or-nothing root privilege into ~40 fine-grained pieces (`CAP_NET_ADMIN`, `CAP_SYS_ADMIN`, etc.). Containers can drop the ones they don't need.
- **seccomp-bpf** filters which syscalls a process is even allowed to make. Docker ships a default profile that blocks dozens of dangerous ones (`kexec_load`, `mount`, `ptrace` outside the namespace, etc.).
- **LSMs** (AppArmor, SELinux) add mandatory access control on top — policy that the kernel enforces regardless of what the process tries.

A locked-down container uses all of these together: dropped capabilities, a strict seccomp profile, an AppArmor profile, a non-root user inside a user namespace, and cgroup limits. That stack is what people usually mean by "hardened container," and it's strong enough for a huge range of workloads.

### The kernel-sharing problem

But there's one thing the whole stack can't fix: every container on a host **shares the same kernel**. Namespaces, cgroups, capabilities, and seccomp are all enforced *by* that kernel. If the agent's code finds a kernel bug — a privilege escalation, a memory-corruption issue in a syscall handler — the entire isolation model collapses, because the thing doing the isolating is what just got compromised.

For an agent running arbitrary code, this is the threat that drives everything else in this section. The remaining layers exist because "trust the host kernel to defend itself against code we ourselves are running" is a weak position.

### Layer 2: gVisor — a userspace kernel

[gVisor](https://gvisor.dev/) (from Google) tackles the problem by inserting an extra kernel between the workload and the host. A user-space process called the **Sentry**, written in Go, intercepts the workload's syscalls and re-implements the Linux kernel surface itself. Only a small, carefully-restricted set of host syscalls is ever made.

The result: a kernel exploit inside the sandbox now has to defeat the Sentry first, and the Sentry exposes a much smaller attack surface than the full Linux kernel.

Trade-offs:

- Some performance overhead, especially for syscall-heavy workloads (network and file I/O).
- Some niche syscalls aren't supported, so a small fraction of programs don't run cleanly.
- Startup is still container-fast (no second kernel to boot).

Used by Google Cloud Run, GKE Sandbox, and as one of the options inside several agent platforms.

### Layer 3: microVMs (Firecracker)

The strongest mainstream answer is to stop sharing the kernel at all. **Firecracker** (AWS, written in Rust) is a minimal Virtual Machine Monitor built on top of KVM. Each Firecracker microVM is a real VM: its own kernel, its own memory, its own devices. Hardware virtualization, courtesy of the CPU, draws the boundary.

What makes microVMs different from "classic" VMs:

- Firecracker strips the device model down to the bare minimum (virtio block, virtio net, a serial console, a few more). No BIOS, no PCI bus, no USB.
- Boot time is around **125 ms** to a userspace process, with memory overhead measured in single-digit MB per VM.
- They're designed to be created and destroyed at high rates — thousands per host per second.

Now a kernel-level exploit inside the sandbox stays inside the sandbox. To reach the host, an attacker would have to break the hypervisor itself, which is a much harder target.

Firecracker is what powers AWS Lambda and Fargate. It's also the engine behind Fly.io's machines, and it (or KVM-based equivalents) is what most code-execution-focused agent sandbox providers — E2B, parts of Modal, and others — use under the hood when they advertise "secure sandboxes for arbitrary code."

### Snapshots: how cold starts get fast

A microVM that boots in 125 ms is still slow if your agent wants to start hundreds of them. The trick most providers use is **snapshots**: boot a microVM once, install all the tools, get it into the exact state you want, then snapshot the memory and devices to disk. New sandboxes are *resumed* from the snapshot instead of booted from scratch, which can drop startup to tens of milliseconds.

This is also how the "fork a sandbox" feature in some platforms works. The snapshot is the source of truth; every agent gets a fresh copy-on-write clone of it.

### Layer 4: V8 isolates and WASM (a different shape)

There's a parallel approach that doesn't try to run arbitrary Linux processes at all: run code inside a language-level sandbox.

- **V8 isolates** (Cloudflare Workers) give each tenant its own JavaScript heap inside a shared V8 process. Startup is sub-millisecond, memory overhead is tiny, but you're confined to JavaScript and a curated API surface — no `pip install`, no shell, no arbitrary binaries.
- **WebAssembly runtimes** (wasmtime, Wasmer) give a similar story for compiled languages, with a capability-based API (WASI) that's deny-by-default.

These are excellent for high-density, short-lived, *constrained* workloads. They're a poor fit for the "agent that clones a repo and runs its tests" use case, which is why most coding-agent sandboxes still pick microVMs or gVisor.

### Network and secrets: the other half of the boundary

Even with perfect process isolation, the network is its own boundary that has to be designed deliberately. An agent with unrestricted egress can:

- exfiltrate the contents of files it was asked to read (especially under prompt injection),
- pull malicious packages from a typosquat on PyPI or npm,
- talk to a command-and-control server.

Real sandboxes mitigate this with some combination of:

- **No network by default.** Network is opt-in per task or per session.
- **Egress allow-lists / proxies.** Traffic only goes to approved destinations (e.g., the package registry, the user's git host).
- **Credential injection at runtime, not in the image.** API keys and tokens never live inside the sandbox image; they're mounted in just-in-time, scoped to the task, and revoked afterwards.
- **Per-sandbox identity.** Each sandbox gets its own short-lived credentials, so a compromise of one doesn't grant access to anyone else's data.

### Resource limits and time

Finally, on top of all of the above, the same cgroup and timeout machinery from the toy sandbox still applies:

- CPU and memory caps so a runaway loop doesn't starve neighbors.
- `pids.max` to bound fork bombs.
- Disk quotas on the writable layer.
- Wall-clock timeouts on every command, plus a session-level lifetime after which the sandbox is forcibly destroyed.

These are unglamorous but load-bearing. Most production sandbox issues in practice are not exotic kernel escapes — they're a single agent burning CPU forever, or filling the disk, or spawning ten thousand processes.

### Putting it together

The choice of isolation technology is a trade-off between four things: **startup time**, **runtime overhead**, **isolation strength**, and **how much code you can actually run**.

| Approach | Startup | Overhead | Isolation | Runs arbitrary code? |
|---|---|---|---|---|
| Plain container | ms | very low | weak (shared kernel) | yes |
| Hardened container (seccomp + user ns + AppArmor) | ms | low | medium | yes |
| gVisor | ms | medium (syscall-heavy work) | strong (userspace kernel) | yes, with minor caveats |
| Firecracker microVM | ~100 ms cold, ~10 ms from snapshot | low–medium | very strong (own kernel) | yes |
| V8 isolate / WASM | sub-ms | very low | strong (language-level) | only the supported language |

For an agent running code that came out of an LLM — and especially code influenced by untrusted input — the honest minimum is gVisor, and the common production answer is Firecracker microVMs with snapshots, an egress allow-list, just-in-time credentials, and cgroup-enforced resource limits.

That stack is what makes the simple-looking loop from the start of this post — *agent issues a command, sandbox runs it, output comes back* — actually safe to run at scale. Everything in between is the engineering that earns the user the right to trust it.

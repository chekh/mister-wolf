# Development Guide

This guide covers how to set up the Mr. Wolf development environment, run checks, and use Docker for reproducible builds.

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **npm** 10+ (comes with Node.js)
- **Docker** (optional, for containerized builds)

## Local Node.js Workflow

This is the primary development workflow. Direct Node.js usage is fully supported and recommended for day-to-day development.

### Installation

```bash
git clone https://github.com/chekh/mister-wolf.git
cd mister-wolf
npm install
```

### Running Checks

The unified check command runs all verification steps in sequence:

```bash
npm run check
```

This executes:

1. `npm run format:check` — verify Prettier formatting
2. `npm run lint` — TypeScript type checking (`tsc --noEmit`)
3. `npm run test:run` — run the Vitest test suite
4. `npm run build` — compile TypeScript to `dist/`

### Individual Commands

| Command                | Description                                |
| ---------------------- | ------------------------------------------ |
| `npm run format`       | Auto-format all source files with Prettier |
| `npm run format:check` | Check formatting without modifying files   |
| `npm run lint`         | Type-check with TypeScript                 |
| `npm run test:run`     | Run all tests once                         |
| `npm run test`         | Run tests in watch mode                    |
| `npm run build`        | Compile TypeScript to `dist/`              |
| `npm run dev`          | Compile in watch mode                      |

### Running the CLI Locally

After building:

```bash
node dist/cli/index.js --help
node dist/cli/index.js validate examples/hello-world.yaml
node dist/cli/index.js run examples/hello-world.yaml
```

## Docker Workflow (Optional)

Docker is supported as a standard reproducible environment for:

- Running checks in a clean environment
- Safer shell-runner experiments (isolated from host)
- CI/CD pipelines
- Demos and onboarding

Docker is **not required** for normal development. The Node.js workflow above is the primary path.

### Build Targets

The `Dockerfile` provides multi-stage builds:

| Target    | Purpose                               | Command                                                 |
| --------- | ------------------------------------- | ------------------------------------------------------- |
| `base`    | Install dependencies and copy source  | `docker build --target base ...`                        |
| `test`    | Run `npm run check`                   | `docker build --target test -t mister-wolf:test .`      |
| `build`   | Compile the project                   | `docker build --target build ...`                       |
| `runtime` | Production image with compiled output | `docker build --target runtime -t mister-wolf:latest .` |

### Running Checks in Docker

```bash
docker build --target test -t mister-wolf:test .
docker run --rm mister-wolf:test
```

### Running the CLI from Docker

```bash
docker build --target runtime -t mister-wolf:latest .
docker run --rm mister-wolf:latest run examples/hello-world.yaml
```

### Docker Compose

For development convenience:

```bash
# Run all checks in a container with your local source mounted
docker compose run --rm wolf

# Open an interactive shell in the container
docker compose run --rm shell
```

The `shell` service mounts your local directory, so you can iterate without rebuilding the image.

## Context Resolver

The Context Resolver (MVP2) builds a structured context bundle from project files and case memory. It is used to provide agents with relevant project context.

### Commands

```bash
# Dry-run scan — shows metadata without writing files
node dist/cli/index.js context scan [--scenario <id>] [--json]

# Full build — scans, resolves, and writes bundle + markdown
node dist/cli/index.js context build [--scenario <id>] [--json]
```

### Pipeline

1. **Scanner** — discovers project files using `include`/`exclude` globs from `wolf.yaml`
2. **CaseMemoryReader** — reads historical case data from `.wolf/state/cases/`
3. **Resolver** — classifies files into groups (files, docs, rules, configs) and applies scenario overrides
4. **BundleBuilder** — assembles the final `ContextBundle` JSON structure
5. **MdGenerator** — renders a human-readable markdown summary

### Configuration

Add a `context` section to `wolf.yaml`:

```yaml
context:
  include:
    - src/**/*
    - tests/**/*
    - docs/**/*.md
    - README.md
  exclude:
    - node_modules/**
    - dist/**
    - .git/**
  limits:
    max_files: 100
    max_bytes: 10485760
    max_file_bytes: 1048576
    max_cases: 10
  scenarios:
    - id: dev
      match:
        keywords: [develop, debug]
      context:
        include:
          - src/**/*.ts
        limits:
          max_files: 50
```

### Output

- `.wolf/context/context-bundle.json` — structured JSON bundle
- `.wolf/context/context.md` — human-readable markdown summary

## CI

GitHub Actions runs on every PR and push to `main` / `dev`:

- **Node.js checks**: `npm run check` on Ubuntu with Node.js 20
- **Docker checks**: build test image and run `npm run check` inside it

See [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) for details.

## Troubleshooting

### `better-sqlite3` build fails

Native compilation requires Python, make, and a C++ compiler. These are installed automatically in Docker. Locally:

- **macOS**: Install Xcode Command Line Tools (`xcode-select --install`)
- **Linux**: Install `build-essential` and `python3`
- **Windows**: Use WSL2 or Docker

### Prettier formatting issues

Run `npm run format` before committing. If CI fails on formatting, it means some files were not formatted.

### Tests fail in Docker but pass locally

Some tests (e.g., shell runner timeout) rely on process signal behavior that may differ between host OS and Docker. The project is configured to handle these differences. If you encounter issues:

1. Check that your Docker version supports `detached: true` for process groups
2. Ensure the Docker daemon has sufficient resources (RAM/CPU)
3. Run `docker compose run --rm wolf` to test in the standard environment

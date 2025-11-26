# Tabaqat Development Setup

## Prerequisites

- Node 18 (via nvm)
- Python 3.12 (via uv)
- Docker & Docker Compose
- Yarn (via corepack)

## Quick Start

### 1. Start Backend Services

```bash
cd docker
docker-compose -f docker-compose-dev.yaml up -d
```

This starts:
- wren-engine (port 8080)
- ibis-server (port 8000)
- qdrant (ports 6333-6334)
- wren-ai-service (port 5555)

### 2. Setup Node Environment

```bash
cd ../wren-ui

# Install Node 18
nvm install 18
nvm use 18

# Enable Yarn
corepack enable
```

### 3. Install Python 3.12 (for native modules)

```bash
uv python install 3.12
```

### 4. Install Dependencies

```bash
yarn install
```

### 5. Setup Database

```bash
yarn migrate
```

### 6. Start Development Server

```bash
export OTHER_SERVICE_USING_DOCKER=true
export EXPERIMENTAL_ENGINE_RUST_VERSION=false
yarn dev
```

Open: http://localhost:3000

## Stop Services

```bash
# Stop UI dev server: Ctrl+C

# Stop Docker services
cd docker
docker-compose -f docker-compose-dev.yaml down
```

## Troubleshooting

**Native module build fails?**
```bash
yarn rebuild better-sqlite3
```

**Database errors?**
```bash
yarn migrate
```

**Port conflicts?**
Check `.env` file in docker directory and update ports.

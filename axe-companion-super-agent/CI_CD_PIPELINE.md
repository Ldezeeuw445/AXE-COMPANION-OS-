# AXE Companion - CI/CD Pipeline
## Complete DevOps Configuration

> **Version**: 1.0.0 | **Platforms**: GitHub Actions + GitLab CI | **Date**: 2026-06-23

---

## Pipeline Overview

```
Push/PR → Lint → Unit Tests → Integration Tests → Build Image → Deploy
```

| Stage | Purpose | Duration |
|-------|---------|----------|
| **Lint** | Code quality (ruff, black, mypy) | ~30s |
| **Unit Tests** | Fast tests with mocked dependencies | ~2min |
| **Integration Tests** | Tests with real database | ~5min |
| **Build** | Docker image creation | ~3min |
| **Deploy** | Production deployment | ~2min |

---

## GitHub Actions Configuration

### Main CI/CD Pipeline

```yaml
# .github/workflows/main.yml
name: AXE Companion CI/CD

on:
  push:
    branches: [main, develop]
    tags: ['v*']
  pull_request:
    branches: [main]

env:
  PYTHON_VERSION: "3.12"
  REGISTRY: ghcr.io

permissions:
  contents: read
  packages: write

jobs:
  # ==========================================
  # STAGE 1: Lint & Code Quality
  # ==========================================
  lint:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}

      - name: Install linting tools
        run: |
          pip install ruff black mypy

      - name: Run Ruff (linting)
        run: ruff check .

      - name: Run Ruff (format check)
        run: ruff format --check .

      - name: Run Black (format check)
        run: black --check .

      - name: Run MyPy (type checking)
        run: mypy lib/ config/ --ignore-missing-imports

  # ==========================================
  # STAGE 2: Unit Tests
  # ==========================================
  unit-tests:
    runs-on: ubuntu-22.04
    needs: lint
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
          cache: pip

      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install -r requirements-dev.txt

      - name: Run unit tests
        run: pytest tests/unit -v --cov=lib --cov-report=xml --cov-report=html

      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: |
            coverage.xml
            htmlcov/

      - name: Upload to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage.xml
          fail_ci_if_error: false

  # ==========================================
  # STAGE 3: Integration Tests
  # ==========================================
  integration-tests:
    runs-on: ubuntu-22.04
    needs: unit-tests
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: testdb
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
          cache: pip

      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install -r requirements-dev.txt

      - name: Apply database migrations
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/testdb
        run: |
          psql $DATABASE_URL -f supabase/migrations/001_create_users.sql
          psql $DATABASE_URL -f supabase/migrations/002_create_trades.sql
          psql $DATABASE_URL -f supabase/migrations/003_create_learning_arcs.sql
          psql $DATABASE_URL -f supabase/migrations/004_create_dark_pool.sql
          psql $DATABASE_URL -f supabase/migrations/005_create_options_flow.sql
          psql $DATABASE_URL -f supabase/migrations/006_create_policy_flow.sql
          psql $DATABASE_URL -f supabase/migrations/007_create_knowledge_embeddings.sql

      - name: Run integration tests
        env:
          SUPABASE_URL: http://localhost:54321
          SUPABASE_ANON_KEY: test-key
          SUPABASE_SERVICE_ROLE_KEY: test-service-key
          DATABASE_URL: postgresql://test:test@localhost:5432/testdb
          REDIS_URL: redis://localhost:6379
        run: pytest tests/integration -v

  # ==========================================
  # STAGE 4: Build Docker Image
  # ==========================================
  build:
    runs-on: ubuntu-22.04
    needs: [unit-tests, integration-tests]
    if: github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v')
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ github.repository }}
          tags: |
            type=ref,event=branch
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=sha,prefix=,suffix=,format=short

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          platforms: linux/amd64,linux/arm64

  # ==========================================
  # STAGE 5: Deploy to Production
  # ==========================================
  deploy:
    runs-on: ubuntu-22.04
    needs: build
    if: github.ref == 'refs/heads/main'
    environment:
      name: production
      url: https://api.axecompanion.com
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Production
        run: |
          echo "Deploying to production..."
          # Add your deployment commands here
          # Example: SSH into server, pull image, restart

      - name: Health check
        run: |
          sleep 10
          curl -f https://api.axecompanion.com/health || exit 1

      - name: Notify Slack
        if: always()
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          channel: '#deployments'
          text: 'AXE Companion deployment: ${{ job.status }}'
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

## GitLab CI Configuration

```yaml
# .gitlab-ci.yml
stages:
  - lint
  - test
  - build
  - deploy

variables:
  PYTHON_VERSION: "3.12"
  PIP_CACHE_DIR: "$CI_PROJECT_DIR/.pip_cache"
  DOCKER_DRIVER: overlay2
  DOCKER_TLS_CERTDIR: "/certs"

default:
  image: python:${PYTHON_VERSION}-slim

# ==========================================
# Cache Configuration
# ==========================================
cache:
  key: ${CI_COMMIT_REF_SLUG}
  paths:
    - .pip_cache/

# ==========================================
# STAGE 1: Lint
# ==========================================
lint:
  stage: lint
  before_script:
    - pip install ruff black mypy
  script:
    - ruff check .
    - ruff format --check .
    - black --check .
    - mypy lib/ config/ --ignore-missing-imports
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == "main"

# ==========================================
# STAGE 2: Unit Tests
# ==========================================
unit-tests:
  stage: test
  before_script:
    - pip install -r requirements.txt
    - pip install -r requirements-dev.txt
  script:
    - pytest tests/unit -v --cov=lib --cov-report=xml --cov-report=term
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage.xml
    paths:
      - coverage.xml
  coverage: '/TOTAL.*\s+(\d+%)$/'
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == "main"

# ==========================================
# STAGE 3: Integration Tests
# ==========================================
integration-tests:
  stage: test
  needs: [unit-tests]
  services:
    - name: pgvector/pgvector:pg16
      alias: postgres
    - name: redis:7-alpine
      alias: redis
  variables:
    POSTGRES_USER: test
    POSTGRES_PASSWORD: test
    POSTGRES_DB: testdb
    DATABASE_URL: postgresql://test:test@postgres:5432/testdb
    REDIS_URL: redis://redis:6379
    SUPABASE_URL: http://postgres:5432
    SUPABASE_ANON_KEY: test-key
    SUPABASE_SERVICE_ROLE_KEY: test-key
  before_script:
    - pip install -r requirements.txt
    - pip install -r requirements-dev.txt
    - apt-get update && apt-get install -y postgresql-client
    - psql $DATABASE_URL -f supabase/migrations/*.sql
  script:
    - pytest tests/integration -v
  rules:
    - if: $CI_COMMIT_BRANCH == "main"

# ==========================================
# STAGE 4: Build Docker Image
# ==========================================
build-image:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  needs: [unit-tests, integration-tests]
  before_script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
  script:
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker build -t $CI_REGISTRY_IMAGE:latest .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
    - docker push $CI_REGISTRY_IMAGE:latest
  rules:
    - if: $CI_COMMIT_BRANCH == "main"

# ==========================================
# STAGE 5: Deploy
# ==========================================
deploy-production:
  stage: deploy
  needs: [build-image]
  image: alpine/k8s:latest
  before_script:
    - kubectl config use-context production
  script:
    - kubectl set image deployment/axe-companion
        app=$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
        -n production
    - kubectl rollout status deployment/axe-companion -n production
  environment:
    name: production
    url: https://api.axecompanion.com
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
      when: manual
```

---

## Dockerfile

```dockerfile
# Dockerfile
FROM python:3.12-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt requirements-dev.txt ./
RUN pip install --no-cache-dir --user -r requirements.txt

# Production image
FROM python:3.12-slim

WORKDIR /app

# Create non-root user
RUN groupadd -r appgroup && useradd -r -g appgroup appuser

# Copy dependencies from builder
COPY --from=builder /root/.local /home/appuser/.local

# Copy application
COPY --chown=appuser:appgroup . .

# Set environment
ENV PATH=/home/appuser/.local/bin:$PATH
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Switch to non-root user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import aiohttp; print('healthy')" || exit 1

# Expose port
EXPOSE 8000

# Run application
CMD ["python", "ai_trading_assistant_complete.py"]
```

---

## Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    container_name: axe-companion
    restart: unless-stopped
    env_file: .env
    ports:
      - "8000:8000"
    depends_on:
      - redis
      - scheduler
    volumes:
      - ./logs:/app/logs
    healthcheck:
      test: ["CMD", "python", "-c", "import aiohttp; print('healthy')"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  scheduler:
    build: .
    container_name: axe-scheduler
    restart: unless-stopped
    env_file: .env
    command: >
      sh -c "sleep 30 &&
             python -c 'from lib.scheduler.daily_learning_pipeline import DailyLearningPipeline; import asyncio; import os; p = DailyLearningPipeline(os.getenv(\"SUPABASE_URL\"), os.getenv(\"SUPABASE_SERVICE_ROLE_KEY\")); p.start_scheduler(); asyncio.get_event_loop().run_forever()'"
    depends_on:
      - redis
    volumes:
      - ./logs:/app/logs

  redis:
    image: redis:7-alpine
    container_name: axe-redis
    restart: unless-stopped
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru

volumes:
  redis_data:
```

---

## Environment Protection Rules

### GitHub Actions

```yaml
# Require approval for production deployments
# Set in: Settings > Environments > production

environment: production
  # Configure protection rules:
  # 1. Required reviewers: 1 person minimum
  # 2. Wait timer: 0 minutes
  # 3. Deployment branches: main only
```

### GitLab CI

```yaml
# Manual deployment gate
deploy:
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
      when: manual  # Requires button click
```

---

## Security Checklist

- [ ] No secrets in repository (use GitHub Secrets / GitLab Variables)
- [ ] Docker image runs as non-root user
- [ ] Health checks configured
- [ ] Dependency scanning enabled (Dependabot)
- [ ] Container registry access restricted
- [ ] Production deployments require approval
- [ ] Network policies restrict inter-service communication
- [ ] Secrets rotated quarterly

---

## Monitoring & Alerts

### Health Endpoint

```python
# Add to api/main.py
from fastapi import FastAPI
from datetime import datetime

app = FastAPI()

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0",
        "services": {
            "database": "connected",
            "redis": "connected",
            "scheduler": "running"
        }
    }
```

---

**Document Status**: Complete | **Last Updated**: 2026-06-23

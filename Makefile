SHELL := /bin/bash
PY ?= .venv/bin/python
PIP ?= .venv/bin/pip
COMPOSE ?= docker compose
API_URL ?= http://localhost:8000

.DEFAULT_GOAL := help
.PHONY: help install up down logs ps migrate revision seed dev-api dev-web test lint typecheck webtest build smoke reset-db

help: ## Show available targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Create .venv and install Python + web dependencies
	python3.12 -m venv .venv || python3 -m venv .venv
	$(PIP) install -U pip
	$(PIP) install -e ".[dev]"
	cd apps/web && npm install

.env:
	cp .env.example .env

up: .env ## Start the whole stack (api, worker, beat, mcp, web, postgres, redis)
	$(COMPOSE) up -d --build
	@echo "dashboard http://localhost:3000 · api http://localhost:8000/v1/docs"

down: ## Stop the stack (volumes kept)
	$(COMPOSE) down

logs: ## Tail logs
	$(COMPOSE) logs -f --tail=120

ps: ## Show service health
	$(COMPOSE) ps

migrate: .env ## Apply migrations against the compose database
	$(COMPOSE) run --rm api alembic -c apps/api/alembic.ini upgrade head

revision: ## Autogenerate a migration: make revision m="add table"
	PYTHONPATH=apps/api $(PY) -m alembic -c apps/api/alembic.ini revision --autogenerate -m "$(m)"

seed: .env ## Seed a demo tenant, leads, campaign and reply
	$(COMPOSE) run --rm api python scripts/seed.py

dev-api: ## Run the API locally (needs postgres + redis)
	PYTHONPATH=apps/api $(PY) -m uvicorn letmelead.main:app --reload --port 8000

dev-web: ## Run the dashboard locally
	cd apps/web && npm run dev

test: ## Python tests
	$(PY) -m pytest -q

lint: ## Ruff
	$(PY) -m ruff check apps packages scripts

typecheck: ## TypeScript
	cd apps/web && npm run typecheck

webtest: ## Dashboard unit tests (vitest)
	cd apps/web && npm run test

build: ## Build the dashboard
	cd apps/web && npm run build

smoke: ## End-to-end API smoke test against a running API
	$(PY) scripts/smoke_api.py --base-url $(API_URL)

reset-db: ## Drop the database volume (destructive)
	$(COMPOSE) down -v

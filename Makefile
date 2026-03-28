.PHONY: install build dev clean test typecheck lint seed deploy publish help

# --- Config ---
PNPM := pnpm
CF_PROJECT := safeskill
CF_BRANCH := $(shell git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# --- Development ---
install: ## Install all dependencies
	$(PNPM) install

build: ## Build all packages
	$(PNPM) build

dev: ## Start web dev server
	$(PNPM) --filter @safeskill/web dev

clean: ## Clean all build outputs
	$(PNPM) clean
	rm -rf apps/web/.next packages/*/dist

test: ## Run all tests
	$(PNPM) test

typecheck: ## Type-check all packages
	$(PNPM) typecheck

lint: ## Lint all packages
	$(PNPM) lint

# --- Data ---
seed: ## Crawl all marketplaces and build index (10K+ entries)
	$(PNPM) exec tsx scripts/seed.ts

seed-quick: ## Quick crawl (500 entries, for testing)
	$(PNPM) exec tsx scripts/seed.ts --limit 500

seed-npm: ## Crawl only npm
	$(PNPM) exec tsx scripts/seed.ts --source npm

seed-smithery: ## Crawl only Smithery
	$(PNPM) exec tsx scripts/seed.ts --source smithery

# --- Deploy ---
deploy: build ## Deploy web app to Cloudflare Pages
	cd apps/web && npx wrangler pages deploy .next --project-name $(CF_PROJECT) --branch $(CF_BRANCH)

deploy-prod: build ## Deploy to Cloudflare Pages (production)
	cd apps/web && npx wrangler pages deploy .next --project-name $(CF_PROJECT) --branch main

cf-init: ## Initialize Cloudflare Pages project
	cd apps/web && npx wrangler pages project create $(CF_PROJECT) --production-branch main

# --- CLI Publish ---
publish-dry: build ## Dry-run npm publish of the CLI
	cd packages/cli && npm publish --dry-run

publish: build ## Publish CLI to npm as 'safeskill'
	cd packages/cli && npm publish --access public

# --- Scan ---
scan: ## Scan a package (usage: make scan PKG=chalk)
	node packages/cli/dist/bin/safeskill.js scan $(PKG)

scan-json: ## Scan with JSON output (usage: make scan-json PKG=chalk)
	node packages/cli/dist/bin/safeskill.js scan $(PKG) --json

# --- All-in-one ---
setup: install build seed ## Full setup: install, build, crawl 10K+ skills

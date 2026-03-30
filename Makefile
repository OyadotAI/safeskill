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

sitemap: ## Generate sitemap with all 10K+ package URLs
	$(PNPM) exec tsx scripts/generate-sitemap.ts

seed-quick: ## Quick crawl (500 entries, for testing)
	$(PNPM) exec tsx scripts/seed.ts --limit 500

seed-npm: ## Crawl only npm
	$(PNPM) exec tsx scripts/seed.ts --source npm

seed-smithery: ## Crawl only Smithery
	$(PNPM) exec tsx scripts/seed.ts --source smithery

# --- Deploy ---
deploy: build ## Deploy static site to Cloudflare Pages
	cd apps/web && npx next build && cp out/scan.html out/scan/_scan-fallback.html && npx wrangler pages deploy out --project-name $(CF_PROJECT) --branch $(CF_BRANCH) --commit-dirty=true

deploy-prod: build ## Deploy to Cloudflare Pages (production)
	cd apps/web && npx next build && cp out/scan.html out/scan/_scan-fallback.html && npx wrangler pages deploy out --project-name $(CF_PROJECT) --branch main --commit-dirty=true

deploy-api: ## Deploy API worker to Cloudflare
	cd apps/api-worker && npx wrangler deploy

deploy-scanner: ## Build and deploy scanner to Cloud Run
	gcloud builds submit --config apps/scanner-worker/cloudbuild.yaml .

deploy-discovery: ## Build and deploy discovery job to Cloud Run Jobs
	gcloud builds submit --config apps/discovery-job/cloudbuild.yaml .

run-discovery: ## Run the discovery job now
	gcloud run jobs execute safeskill-discovery --region us-central1 --wait

migrate-gcs: ## Migrate scan-results.json to GCS + Firestore
	$(PNPM) exec tsx scripts/migrate-to-gcs.ts

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

scan-all: build ## Batch-scan default packages and save to data/scan-results.json
	$(PNPM) exec tsx scripts/scan-packages.ts
	cp data/scan-results.json apps/web/src/data/scan-results.json

scan-all-resume: build ## Resume batch scan (skip already-scanned)
	$(PNPM) exec tsx scripts/scan-packages.ts --resume
	cp data/scan-results.json apps/web/src/data/scan-results.json

scan-top: build ## Scan top N from marketplace index (usage: make scan-top N=100)
	$(PNPM) exec tsx scripts/scan-packages.ts --from-index $(N)
	cp data/scan-results.json apps/web/src/data/scan-results.json

# --- All-in-one ---
setup: install build seed ## Full setup: install, build, crawl 10K+ skills

release: build ## Build, deploy everything, and publish CLI to npm
	@echo "\n\033[36m▸ Deploying API worker...\033[0m"
	cd apps/api-worker && npx wrangler deploy
	@echo "\n\033[36m▸ Deploying web to Cloudflare Pages...\033[0m"
	cd apps/web && npx next build && cp out/scan.html out/scan/_scan-fallback.html && npx wrangler pages deploy out --project-name $(CF_PROJECT) --branch main --commit-dirty=true
	@echo "\n\033[36m▸ Deploying scanner to Cloud Run...\033[0m"
	gcloud builds submit --config apps/scanner-worker/cloudbuild.yaml .
	@echo "\n\033[36m▸ Deploying discovery job to Cloud Run...\033[0m"
	gcloud builds submit --config apps/discovery-job/cloudbuild.yaml .
	@echo "\n\033[36m▸ Publishing CLI to npm...\033[0m"
	cd packages/cli && npm publish --access public
	@echo "\n\033[32m✔ Release complete.\033[0m"

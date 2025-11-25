.PHONY: help up down restart logs shell db-create db-drop db-migrate db-reset test install start stop adminer clean

# Colors
COLOR_RESET = \033[0m
COLOR_INFO = \033[32m
COLOR_COMMENT = \033[33m

## Help
help:
	@echo "$(COLOR_COMMENT)Usage:$(COLOR_RESET)"
	@echo " make [target]"
	@echo ""
	@echo "$(COLOR_COMMENT)Available targets:$(COLOR_RESET)"
	@grep -E '(^[a-zA-Z_-]+:.*?##.*$$)|(^##)' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(COLOR_INFO)%-20s$(COLOR_RESET) %s\n", $$1, $$2}' | sed -e 's/\[32m##/[33m/'

## Docker
up: ## Start Docker containers
	@echo "$(COLOR_INFO)Starting Docker containers...$(COLOR_RESET)"
	docker compose up -d
	@echo "$(COLOR_INFO)✓ Containers started!$(COLOR_RESET)"
	@echo "$(COLOR_COMMENT)Adminer: http://localhost:8080$(COLOR_RESET)"
	@echo "$(COLOR_COMMENT)Database: localhost:5432$(COLOR_RESET)"

down: ## Stop Docker containers
	@echo "$(COLOR_INFO)Stopping Docker containers...$(COLOR_RESET)"
	docker compose down
	@echo "$(COLOR_INFO)✓ Containers stopped!$(COLOR_RESET)"

restart: down up ## Restart Docker containers

logs: ## Show Docker logs
	docker compose logs -f

shell: ## Access database container shell
	docker compose exec database sh

## Installation
install: up ## Install dependencies and setup project
	@echo "$(COLOR_INFO)Installing Composer dependencies...$(COLOR_RESET)"
	composer install
	@echo "$(COLOR_INFO)Waiting for database to be ready...$(COLOR_RESET)"
	@sleep 5
	@echo "$(COLOR_INFO)Creating database...$(COLOR_RESET)"
	php bin/console doctrine:database:create --if-not-exists
	@echo "$(COLOR_INFO)Running migrations...$(COLOR_RESET)"
	php bin/console doctrine:migrations:migrate --no-interaction
	@echo "$(COLOR_INFO)Clearing cache...$(COLOR_RESET)"
	php bin/console cache:clear
	@echo "$(COLOR_INFO)Validating schema...$(COLOR_RESET)"
	php bin/console doctrine:schema:validate
	@echo "$(COLOR_INFO)✓ Installation complete!$(COLOR_RESET)"

install-fresh: up ## Fresh installation (regenerate migrations for current DB)
	@echo "$(COLOR_INFO)Installing Composer dependencies...$(COLOR_RESET)"
	composer install
	@echo "$(COLOR_INFO)Waiting for database to be ready...$(COLOR_RESET)"
	@sleep 5
	@echo "$(COLOR_INFO)Creating database...$(COLOR_RESET)"
	php bin/console doctrine:database:create --if-not-exists
	@echo "$(COLOR_INFO)Removing old migrations...$(COLOR_RESET)"
	rm -f migrations/Version*.php
	@echo "$(COLOR_INFO)Generating new migration...$(COLOR_RESET)"
	php bin/console doctrine:migrations:diff
	@echo "$(COLOR_INFO)Running migrations...$(COLOR_RESET)"
	php bin/console doctrine:migrations:migrate --no-interaction
	@echo "$(COLOR_INFO)Clearing cache...$(COLOR_RESET)"
	php bin/console cache:clear
	@echo "$(COLOR_INFO)Validating schema...$(COLOR_RESET)"
	php bin/console doctrine:schema:validate
	@echo "$(COLOR_INFO)✓ Fresh installation complete!$(COLOR_RESET)"

## Database
db-create: ## Create database
	php bin/console doctrine:database:create --if-not-exists

db-drop: ## Drop database
	php bin/console doctrine:database:drop --force --if-exists

db-migrate: ## Run migrations
	php bin/console doctrine:migrations:migrate --no-interaction

db-reset: db-drop db-create db-migrate ## Reset database (drop, create, migrate)
	@echo "$(COLOR_INFO)✓ Database reset complete!$(COLOR_RESET)"

db-status: ## Show migration status
	php bin/console doctrine:migrations:status

## Server
start: up ## Start development server
	@echo "$(COLOR_INFO)Starting Symfony server...$(COLOR_RESET)"
	@echo "$(COLOR_COMMENT)Server will be available at: http://localhost:8000$(COLOR_RESET)"
	@echo "$(COLOR_COMMENT)Adminer: http://localhost:8080$(COLOR_RESET)"
	@echo "$(COLOR_COMMENT)Press Ctrl+C to stop$(COLOR_RESET)"
	@php -S localhost:8000 -t public

start-bg: up ## Start development server in background
	@echo "$(COLOR_INFO)Starting Symfony server in background...$(COLOR_RESET)"
	@nohup php -S localhost:8000 -t public > /dev/null 2>&1 &
	@echo "$(COLOR_INFO)✓ Server started at http://localhost:8000$(COLOR_RESET)"

stop: ## Stop development server
	@echo "$(COLOR_INFO)Stopping Symfony server...$(COLOR_RESET)"
	@pkill -f "php -S localhost:8000" || true
	@echo "$(COLOR_INFO)✓ Server stopped!$(COLOR_RESET)"

## Adminer
adminer: ## Open Adminer in browser
	@echo "$(COLOR_INFO)Opening Adminer...$(COLOR_RESET)"
	@echo "$(COLOR_COMMENT)URL: http://localhost:8080$(COLOR_RESET)"
	@echo "$(COLOR_COMMENT)Server: database$(COLOR_RESET)"
	@echo "$(COLOR_COMMENT)Username: app$(COLOR_RESET)"
	@echo "$(COLOR_COMMENT)Password: !ChangeMe!$(COLOR_RESET)"
	@echo "$(COLOR_COMMENT)Database: app$(COLOR_RESET)"

## Utilities
cache-clear: ## Clear Symfony cache
	php bin/console cache:clear

routes: ## Show all routes
	php bin/console debug:router

clean: down ## Clean project (stop containers, remove cache)
	@echo "$(COLOR_INFO)Cleaning project...$(COLOR_RESET)"
	rm -rf var/cache/* var/log/*
	@echo "$(COLOR_INFO)✓ Project cleaned!$(COLOR_RESET)"

test-register: ## Test registration endpoint
	@echo "$(COLOR_INFO)Testing registration endpoint...$(COLOR_RESET)"
	@curl -X POST http://localhost:8000/auth/register \
		-H "Content-Type: application/json" \
		-d '{"email":"john.doe@example.com","password":"TestPassword123","name":"Test User"}' \
		| python3 -m json.tool

test-login: ## Test login endpoint
	@echo "$(COLOR_INFO)Testing login endpoint...$(COLOR_RESET)"
	@curl -X POST http://localhost:8000/auth/login \
		-H "Content-Type: application/json" \
		-d '{"email":"john.doe@example.com","password":"TestPassword123"}' \
		| python3 -m json.tool

#!/bin/bash

echo "🚀 Démarrage environnement BetterAuth"
echo ""

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Vérifier si PostgreSQL tourne
echo -e "${BLUE}📊 Vérification PostgreSQL...${NC}"
if docker ps | grep -q postgres-betterauth; then
    echo -e "${GREEN}✓ PostgreSQL est déjà en cours d'exécution${NC}"
else
    echo -e "${YELLOW}⚠ Démarrage de PostgreSQL...${NC}"
    docker run -d --name postgres-betterauth \
        -e POSTGRES_DB=app \
        -e POSTGRES_USER=app \
        -e POSTGRES_PASSWORD='!ChangeMe!' \
        -p 5432:5432 \
        postgres:16

    echo -e "${YELLOW}⏳ Attente de PostgreSQL (5 secondes)...${NC}"
    sleep 5
    echo -e "${GREEN}✓ PostgreSQL démarré${NC}"
fi

# Vérifier si Mailpit tourne
echo ""
echo -e "${BLUE}📧 Vérification Mailpit...${NC}"
if docker ps | grep -q mailpit; then
    echo -e "${GREEN}✓ Mailpit est déjà en cours d'exécution${NC}"
else
    echo -e "${YELLOW}⚠ Démarrage de Mailpit...${NC}"
    docker run -d --name mailpit \
        -p 1025:1025 \
        -p 8025:8025 \
        axllent/mailpit
    echo -e "${GREEN}✓ Mailpit démarré${NC}"
fi

# Créer les tables si nécessaire
echo ""
echo -e "${BLUE}🗄️  Vérification base de données...${NC}"
php bin/console doctrine:schema:update --force 2>/dev/null || \
php bin/console doctrine:schema:create 2>/dev/null
echo -e "${GREEN}✓ Base de données prête${NC}"

# Démarrer le serveur Symfony
echo ""
echo -e "${GREEN}✨ Tout est prêt!${NC}"
echo ""
echo -e "📍 URLs importantes:"
echo -e "   ${BLUE}Frontend de test:${NC} http://localhost:8000/test-auth.html"
echo -e "   ${BLUE}Interface Mailpit:${NC} http://localhost:8025"
echo -e "   ${BLUE}API Docs:${NC} http://localhost:8000/api/docs"
echo ""
echo -e "${YELLOW}🔥 Démarrage du serveur Symfony...${NC}"
echo ""

# Démarrer le serveur
php -S localhost:8000 -t public/

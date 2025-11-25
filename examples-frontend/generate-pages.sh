#!/bin/bash

# Script pour générer toutes les pages manquantes
# Usage: bash generate-pages.sh

echo "Génération des pages BetterAuth..."

mkdir -p src/pages

echo "✅ Pages déjà créées:"
echo "  - Login.tsx"

echo ""
echo "📝 Pages à créer manuellement (voir PAGES_GUIDE.md):"
echo "  - Register.tsx"
echo "  - Dashboard.tsx"
echo "  - Sessions.tsx"
echo "  - TwoFactorSetup.tsx"
echo "  - TwoFactorValidate.tsx"
echo "  - EmailVerification.tsx"
echo "  - ForgotPassword.tsx"
echo "  - ResetPassword.tsx"
echo "  - MagicLink.tsx"
echo "  - MagicLinkCallback.tsx"
echo ""
echo "Voir PAGES_GUIDE.md pour les templates complets"

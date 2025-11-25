# 🔐 BetterAuth - Boilerplate Symfony

Boilerplate d'authentification complet avec Symfony et BetterAuth.

## ✨ Fonctionnalités

- ✅ **Inscription / Connexion** classique
- ✅ **Magic Link** (connexion sans mot de passe)
- ✅ **Vérification d'email**
- ✅ **Réinitialisation de mot de passe**
- ✅ **Two-Factor Authentication (2FA/TOTP)**
- ✅ **Gestion des sessions**
- ✅ **OAuth 2.0** (Google, GitHub, Facebook, etc.)
- ✅ **Interface de test** incluse

## 🚀 Démarrage Rapide

### Option 1: Script automatique (recommandé)

```bash
./start-dev.sh
```

### Option 2: Docker Compose

```bash
# Démarrer les services (PostgreSQL + Mailpit)
docker-compose up -d

# Créer les tables
php bin/console doctrine:schema:create

# Démarrer le serveur
symfony server:start
# OU
php -S localhost:8000 -t public/
```

## 🌐 URLs

- **Frontend de test**: http://localhost:8000/test-auth.html
- **Mailpit (emails)**: http://localhost:8025
- **API Docs**: http://localhost:8000/api/docs

## 📚 Documentation

Consultez [TEST_GUIDE.md](./TEST_GUIDE.md) pour les scénarios de test détaillés.

## 📋 Identifiants par défaut

Les formulaires de test sont pré-remplis avec:
- **Email**: `john.doe@example.com`
- **Password**: `SecurePassword123!`
- **Name**: `Test User`

## 🧪 Tests

Ouvrez http://localhost:8000/test-auth.html pour accéder à l'interface de test interactive.

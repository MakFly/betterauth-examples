<?php

declare(strict_types=1);

namespace App\Controller;

use BetterAuth\Core\AuthManager;
use BetterAuth\Providers\OAuthProvider\OAuthManager;
use BetterAuth\Providers\TotpProvider\TotpProvider;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/auth', name: 'auth_')]
class AuthController extends AbstractController
{
    public function __construct(
        private readonly AuthManager $authManager,
        private readonly OAuthManager $oauthManager,
        private readonly TotpProvider $totpProvider,
        private readonly LoggerInterface $logger
    ) {
    }

    #[Route('/register', name: 'register', methods: ['POST'])]
    public function register(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        if (!isset($data['email'], $data['password'])) {
            $this->logger->warning('Registration failed: Missing required fields', [
                'ip_address' => $request->getClientIp(),
            ]);
            return $this->json(['error' => 'Email and password are required'], 400);
        }

        try {
            $additionalData = isset($data['name']) ? ['name' => $data['name']] : [];

            $user = $this->authManager->signUp(
                $data['email'],
                $data['password'],
                $additionalData
            );

            return $this->json([
                'user' => $this->formatUser($user),
            ], 201);
        } catch (\Exception $e) {
            $this->logger->error('Registration failed', [
                'email' => $data['email'] ?? null,
                'ip_address' => $request->getClientIp(),
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            return $this->json(['error' => $e->getMessage()], 400);
        }
    }

    #[Route('/login', name: 'login', methods: ['POST'])]
    public function login(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        if (!isset($data['email'], $data['password'])) {
            $this->logger->warning('Login failed: Missing required fields', [
                'ip_address' => $request->getClientIp(),
            ]);
            return $this->json(['error' => 'Email and password are required'], 400);
        }

        try {
            $result = $this->authManager->signIn(
                $data['email'],
                $data['password'],
                $request->getClientIp() ?? '127.0.0.1',
                $request->headers->get('User-Agent') ?? 'Unknown'
            );

            $user = $result['user'];

            // Check if 2FA is enabled and required (once per day)
            $requires2fa = $this->totpProvider->requires2fa($user->getId());

            if ($requires2fa) {
                // Return a response indicating 2FA is required
                return $this->json([
                    'requires2fa' => true,
                    'message' => 'Two-factor authentication required',
                    'user' => $this->formatUser($user),
                ], 200);
            }

            // Normalize response format for frontend compatibility
            // In session mode: result = ['user' => User, 'session' => Session]
            // In API mode: result = ['user' => User, 'access_token' => string, 'refresh_token' => string, ...]
            if (isset($result['session']) && !isset($result['access_token'])) {
                // Session mode: convert to token-like format for frontend compatibility
                $session = $result['session'];

                return $this->json([
                    'access_token' => $session->getToken(),
                    'refresh_token' => $session->getToken(), // Use session token as both
                    'expires_in' => 604800, // 7 days default
                    'token_type' => 'Bearer',
                    'user' => $this->formatUser($user),
                ]);
            }

            // API mode: normalize user object to array for JSON serialization
            return $this->json([
                'access_token' => $result['access_token'],
                'refresh_token' => $result['refresh_token'],
                'expires_in' => $result['expires_in'] ?? 3600,
                'token_type' => $result['token_type'] ?? 'Bearer',
                'user' => $this->formatUser($user),
            ]);
        } catch (\Exception $e) {
            $this->logger->error('Login failed', [
                'email' => $data['email'] ?? null,
                'ip_address' => $request->getClientIp(),
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            return $this->json(['error' => $e->getMessage()], 401);
        }
    }

    #[Route('/me', name: 'me', methods: ['GET'])]
    public function me(Request $request): JsonResponse
    {
        try {
            // Support hybrid mode: Bearer token OR cookie
            $token = $this->getAuthToken($request);
            if (!$token) {
                $this->logger->warning('Get current user failed: No token provided', [
                    'ip_address' => $request->getClientIp(),
                ]);
                return $this->json(['error' => 'No token provided'], 401);
            }

            $user = $this->authManager->getCurrentUser($token);
            if (!$user) {
                $this->logger->warning('Get current user failed: Invalid token', [
                    'ip_address' => $request->getClientIp(),
                    'token' => substr($token, 0, 10) . '...',
                ]);
                return $this->json(['error' => 'Invalid token'], 401);
            }

            return $this->json($this->formatUser($user));
        } catch (\Exception $e) {
            $this->logger->error('Get current user failed', [
                'ip_address' => $request->getClientIp(),
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            return $this->json(['error' => $e->getMessage()], 401);
        }
    }

    #[Route('/refresh', name: 'refresh', methods: ['POST'])]
    public function refresh(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        if (!isset($data['refreshToken'])) {
            $this->logger->warning('Token refresh failed: Missing refresh token', [
                'ip_address' => $request->getClientIp(),
            ]);
            return $this->json(['error' => 'Refresh token is required'], 400);
        }

        try {
            $result = $this->authManager->refresh($data['refreshToken']);
            return $this->json($result);
        } catch (\Exception $e) {
            $this->logger->error('Token refresh failed', [
                'ip_address' => $request->getClientIp(),
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            return $this->json(['error' => $e->getMessage()], 401);
        }
    }

    #[Route('/login/2fa', name: 'login_2fa', methods: ['POST'])]
    public function login2fa(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        if (!isset($data['email'], $data['password'], $data['code'])) {
            return $this->json(['error' => 'Email, password and 2FA code are required'], 400);
        }

        try {
            // First verify credentials (password) - this will throw if invalid
            $tempResult = $this->authManager->signIn(
                $data['email'],
                $data['password'],
                $request->getClientIp() ?? '127.0.0.1',
                $request->headers->get('User-Agent') ?? 'Unknown'
            );

            $user = $tempResult['user'] ?? null;
            if (!$user) {
                return $this->json(['error' => 'Invalid credentials'], 401);
            }

            // Verify 2FA code
            $verified = $this->totpProvider->verify($user->getId(), $data['code']);
            if (!$verified) {
                // Sign out the temporary session if created
                if (isset($tempResult['session'])) {
                    $this->authManager->signOut($tempResult['session']->getToken());
                } elseif (isset($tempResult['access_token'])) {
                    // In API mode, we can't revoke the access token immediately
                    // But we can revoke the refresh token if it exists
                    try {
                        $this->authManager->revokeAllTokens($user->getId());
                    } catch (\Exception $e) {
                        // Ignore if not in API mode
                    }
                }
                return $this->json(['error' => 'Invalid 2FA code'], 401);
            }

            // 2FA verified, return the session/token
            if (isset($tempResult['session']) && !isset($tempResult['access_token'])) {
                $session = $tempResult['session'];
                return $this->json([
                    'access_token' => $session->getToken(),
                    'refresh_token' => $session->getToken(),
                    'expires_in' => 604800,
                    'token_type' => 'Bearer',
                    'user' => $this->formatUser($user),
                ]);
            }

            return $this->json($tempResult);
        } catch (\Exception $e) {
            $this->logger->error('2FA login failed', [
                'email' => $data['email'] ?? null,
                'error' => $e->getMessage(),
            ]);
            return $this->json(['error' => $e->getMessage()], 401);
        }
    }

    #[Route('/logout', name: 'logout', methods: ['POST'])]
    public function logout(Request $request): JsonResponse
    {
        try {
            $token = $this->getBearerToken($request);
            if (!$token) {
                return $this->json(['error' => 'No token provided'], 401);
            }

            $this->authManager->signOut($token);

            return $this->json(['message' => 'Logged out successfully']);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        }
    }

    #[Route('/revoke-all', name: 'revoke_all', methods: ['POST'])]
    public function revokeAll(Request $request): JsonResponse
    {
        try {
            $token = $this->getBearerToken($request);
            if (!$token) {
                return $this->json(['error' => 'No token provided'], 401);
            }

            $user = $this->authManager->getCurrentUser($token);
            if (!$user) {
                return $this->json(['error' => 'Invalid token'], 401);
            }

            $count = $this->authManager->revokeAllTokens($user->getId());

            return $this->json([
                'message' => 'All sessions revoked successfully',
                'count' => $count,
            ]);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        }
    }

    #[Route('/oauth/{provider}', name: 'oauth_redirect', methods: ['GET'])]
    public function oauthRedirect(string $provider): JsonResponse
    {
        try {
            $result = $this->oauthManager->getAuthorizationUrl($provider);

            return $this->json([
                'url' => $result['url'],
                'state' => $result['state'] ?? null,
            ]);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        }
    }

    #[Route('/oauth/{provider}/callback', name: 'oauth_callback', methods: ['GET'])]
    public function oauthCallback(string $provider, Request $request): JsonResponse
    {
        $code = $request->query->get('code');
        if (!$code) {
            return $this->json(['error' => 'Authorization code is required'], 400);
        }

        try {
            $redirectUri = $request->getSchemeAndHttpHost() . $request->getPathInfo();

            $result = $this->oauthManager->handleCallback(
                providerName: $provider,
                code: $code,
                redirectUri: $redirectUri,
                ipAddress: $request->getClientIp() ?? '127.0.0.1',
                userAgent: $request->headers->get('User-Agent') ?? 'Unknown'
            );

            // Check if 2FA is enabled and required (once per day) for SSO login
            if (isset($result['user'])) {
                $user = $result['user'];
                $userId = $user->getId();
                
                if ($userId) {
                    $requires2fa = $this->totpProvider->requires2fa($userId);
                    
                    if ($requires2fa) {
                        // Sign out the temporary session
                        if (isset($result['session'])) {
                            $this->authManager->signOut($result['session']->getToken());
                        }
                        
                        return $this->json([
                            'requires2fa' => true,
                            'message' => 'Two-factor authentication required',
                            'user' => $this->formatUser($user),
                        ], 200);
                    }
                }
            }

            return $this->json($result);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        }
    }

    #[Route('/sessions', name: 'sessions', methods: ['GET'])]
    public function sessions(Request $request): JsonResponse
    {
        try {
            $token = $this->getBearerToken($request);
            if (!$token) {
                return $this->json(['error' => 'No token provided'], 401);
            }

            $user = $this->authManager->getCurrentUser($token);
            if (!$user) {
                return $this->json(['error' => 'Invalid token'], 401);
            }

            $sessions = $this->authManager->getUserSessions($user->getId());

            return $this->json([
                'sessions' => array_map(function ($session) {
                    return [
                        'id' => $session->getToken(),
                        'device' => $session->getMetadata()['device'] ?? 'Unknown',
                        'browser' => $session->getMetadata()['browser'] ?? 'Unknown',
                        'os' => $session->getMetadata()['os'] ?? 'Unknown',
                        'ip' => $session->getIpAddress(),
                        'location' => $session->getMetadata()['location'] ?? 'Unknown',
                        'current' => $session->getMetadata()['isCurrent'] ?? false,
                        'createdAt' => $session->getCreatedAt()->format('Y-m-d H:i:s'),
                        'lastActiveAt' => $session->getUpdatedAt()->format('Y-m-d H:i:s'),
                        'expiresAt' => $session->getExpiresAt()->format('Y-m-d H:i:s'),
                    ];
                }, $sessions),
            ]);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        }
    }

    #[Route('/sessions/{sessionId}', name: 'revoke_session', methods: ['DELETE'])]
    public function revokeSession(string $sessionId, Request $request): JsonResponse
    {
        try {
            $token = $this->getBearerToken($request);
            if (!$token) {
                return $this->json(['error' => 'No token provided'], 401);
            }

            $user = $this->authManager->getCurrentUser($token);
            if (!$user) {
                return $this->json(['error' => 'Invalid token'], 401);
            }

            $this->authManager->revokeSession($user->getId(), $sessionId);

            return $this->json([
                'message' => 'Session revoked successfully',
            ]);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        }
    }

    /**
     * Format user object for JSON response with consistent structure
     */
    private function formatUser(\BetterAuth\Core\Entities\User $user): array
    {
        return [
            'id' => $user->getId(),
            'email' => $user->getEmail(),
            'name' => $user->getName(),
            'emailVerified' => $user->isEmailVerified(),
            'createdAt' => $user->getCreatedAt()->format(\DateTimeInterface::ATOM),
            'updatedAt' => $user->getUpdatedAt()?->format(\DateTimeInterface::ATOM),
        ];
    }

    private function getBearerToken(Request $request): ?string
    {
        $authHeader = $request->headers->get('Authorization');
        if (!$authHeader || !str_starts_with($authHeader, 'Bearer ')) {
            return null;
        }

        return substr($authHeader, 7);
    }

    /**
     * Get authentication token from either Bearer header or Cookie (hybrid mode support)
     */
    private function getAuthToken(Request $request): ?string
    {
        // 1. Try Bearer token (API mode)
        $token = $this->getBearerToken($request);
        if ($token) {
            return $token;
        }

        // 2. Try access_token cookie (Session/Hybrid mode)
        $token = $request->cookies->get('access_token');
        if ($token) {
            return $token;
        }

        return null;
    }
}

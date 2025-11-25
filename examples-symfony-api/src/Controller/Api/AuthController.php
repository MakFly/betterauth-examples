<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Controller\Api\Trait\ApiResponseTrait;
use BetterAuth\Core\AuthManager;
use BetterAuth\Core\Entities\User;
use BetterAuth\Core\Exceptions\AuthException;
use BetterAuth\Providers\TotpProvider\TotpProvider;
use BetterAuth\Symfony\Security\Attribute\CurrentUser;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Custom Authentication Controller.
 *
 * This controller is completely independent from the bundle's default controllers.
 * It uses BetterAuth services directly with custom response formatting.
 */
#[Route('/auth', name: 'api_v1_auth_')]
class AuthController extends AbstractController
{
    use ApiResponseTrait;

    public function __construct(
        private readonly AuthManager $authManager,
        private readonly TotpProvider $totpProvider,
        private readonly ?LoggerInterface $logger = null,
    ) {
    }

    // =========================================================================
    // AUTHENTICATION ENDPOINTS
    // =========================================================================

    /**
     * Register a new user.
     *
     * POST /api/v1/auth/register
     * Body: { "email": "...", "password": "...", "name": "..." }
     */
    #[Route('/register', name: 'register', methods: ['POST'])]
    public function register(Request $request): JsonResponse
    {
        $data = $request->toArray();

        // Validation
        $errors = $this->validateRegistration($data);
        if (!empty($errors)) {
            return $this->json(
                $this->formatErrorResponse('validation_error', 'Invalid input data', 422, $errors),
                422
            );
        }

        try {
            // Create user
            $additionalData = [];
            if (!empty($data['name'])) {
                $additionalData['name'] = $data['name'];
            }

            $user = $this->authManager->signUp(
                email: $data['email'],
                password: $data['password'],
                additionalData: $additionalData,
            );

            $this->logger?->info('User registered', [
                'userId' => $user->getId(),
                'email' => $user->getEmail(),
            ]);

            // Auto sign-in after registration
            $loginResult = $this->authManager->signIn(
                email: $data['email'],
                password: $data['password'],
                ipAddress: $request->getClientIp() ?? '127.0.0.1',
                userAgent: $request->headers->get('User-Agent') ?? 'Unknown',
            );

            return $this->json(
                $this->formatAuthResponse($loginResult, $user, ['isNewUser' => true]),
                201
            );
        } catch (AuthException $e) {
            $this->logger?->warning('Registration failed', [
                'email' => $data['email'],
                'error' => $e->getMessage(),
            ]);

            return $this->json(
                $this->formatErrorResponse('registration_failed', $e->getMessage(), 400),
                400
            );
        }
    }

    /**
     * Login with email and password.
     *
     * POST /api/v1/auth/login
     * Body: { "email": "...", "password": "..." }
     */
    #[Route('/login', name: 'login', methods: ['POST'])]
    public function login(Request $request): JsonResponse
    {
        $data = $request->toArray();

        // Validation
        if (empty($data['email']) || empty($data['password'])) {
            return $this->json(
                $this->formatErrorResponse('validation_error', 'Email and password are required', 422),
                422
            );
        }

        try {
            $result = $this->authManager->signIn(
                email: $data['email'],
                password: $data['password'],
                ipAddress: $request->getClientIp() ?? '127.0.0.1',
                userAgent: $request->headers->get('User-Agent') ?? 'Unknown',
            );

            $user = $result['user'];

            // Check if 2FA is required
            if ($this->totpProvider->requires2fa($user->getId())) {
                // Revoke the session - user needs to complete 2FA
                if (isset($result['session'])) {
                    $this->authManager->signOut($result['session']->getToken());
                }

                $this->logger?->info('2FA required for login', [
                    'userId' => $user->getId(),
                ]);

                return $this->json([
                    'success' => true,
                    'data' => [
                        'requires2FA' => true,
                        'user' => [
                            'id' => $user->getId(),
                            'email' => $user->getEmail(),
                        ],
                    ],
                    'meta' => [
                        'timestamp' => date('c'),
                        'version' => 'v1',
                    ],
                ]);
            }

            $this->logger?->info('User logged in', [
                'userId' => $user->getId(),
                'ip' => $request->getClientIp(),
            ]);

            return $this->json($this->formatAuthResponse($result, $user));
        } catch (AuthException $e) {
            $this->logger?->warning('Login failed', [
                'email' => $data['email'],
                'ip' => $request->getClientIp(),
                'error' => $e->getMessage(),
            ]);

            return $this->json(
                $this->formatErrorResponse('authentication_failed', 'Invalid email or password', 401),
                401
            );
        }
    }

    /**
     * Complete login with 2FA code.
     *
     * POST /api/v1/auth/login/2fa
     * Body: { "email": "...", "password": "...", "code": "123456" }
     */
    #[Route('/login/2fa', name: 'login_2fa', methods: ['POST'])]
    public function login2fa(Request $request): JsonResponse
    {
        $data = $request->toArray();

        // Validation
        if (empty($data['email']) || empty($data['password']) || empty($data['code'])) {
            return $this->json(
                $this->formatErrorResponse('validation_error', 'Email, password and 2FA code are required', 422),
                422
            );
        }

        try {
            // First verify credentials
            $result = $this->authManager->signIn(
                email: $data['email'],
                password: $data['password'],
                ipAddress: $request->getClientIp() ?? '127.0.0.1',
                userAgent: $request->headers->get('User-Agent') ?? 'Unknown',
            );

            $user = $result['user'];

            // Verify 2FA code
            $verified = $this->totpProvider->verify($user->getId(), $data['code']);

            if (!$verified) {
                // Revoke the session if verification fails
                if (isset($result['session'])) {
                    $this->authManager->signOut($result['session']->getToken());
                }

                return $this->json(
                    $this->formatErrorResponse('invalid_2fa_code', 'Invalid verification code', 401),
                    401
                );
            }

            $this->logger?->info('User logged in with 2FA', [
                'userId' => $user->getId(),
            ]);

            $userData = $this->formatUser($user);
            $userData['status']['has2FA'] = true;

            $response = $this->formatAuthResponse($result, $user);
            $response['data']['user'] = $userData;

            return $this->json($response);
        } catch (AuthException $e) {
            return $this->json(
                $this->formatErrorResponse('authentication_failed', 'Invalid credentials', 401),
                401
            );
        }
    }

    // =========================================================================
    // TOKEN ENDPOINTS
    // =========================================================================

    /**
     * Get current authenticated user.
     *
     * GET /api/v1/auth/me
     * Header: Authorization: Bearer <token>
     */
    #[Route('/me', name: 'me', methods: ['GET'])]
    public function me(#[CurrentUser] User $user): JsonResponse
    {
        $has2FA = $this->totpProvider->requires2fa($user->getId());

        $userData = $this->formatUser($user);
        $userData['status']['has2FA'] = $has2FA;

        return $this->json([
            'success' => true,
            'data' => [
                'user' => $userData,
            ],
            'meta' => [
                'timestamp' => date('c'),
                'version' => 'v1',
            ],
        ]);
    }

    /**
     * Refresh access token.
     *
     * POST /api/v1/auth/refresh
     * Body: { "refreshToken": "..." }
     */
    #[Route('/refresh', name: 'refresh', methods: ['POST'])]
    public function refresh(Request $request): JsonResponse
    {
        $data = $request->toArray();

        if (empty($data['refreshToken'])) {
            return $this->json(
                $this->formatErrorResponse('validation_error', 'Refresh token is required', 422),
                422
            );
        }

        try {
            $result = $this->authManager->refresh($data['refreshToken']);

            return $this->json([
                'success' => true,
                'data' => [
                    'auth' => [
                        'accessToken' => $result['access_token'],
                        'refreshToken' => $result['refresh_token'],
                        'tokenType' => 'Bearer',
                        'expiresIn' => $result['expires_in'] ?? 3600,
                        'expiresAt' => date('c', time() + ($result['expires_in'] ?? 3600)),
                    ],
                ],
                'meta' => [
                    'timestamp' => date('c'),
                    'version' => 'v1',
                ],
            ]);
        } catch (AuthException $e) {
            return $this->json(
                $this->formatErrorResponse('invalid_token', 'Invalid or expired refresh token', 401),
                401
            );
        }
    }

    /**
     * Logout (revoke current session).
     *
     * POST /api/v1/auth/logout
     * Header: Authorization: Bearer <token>
     */
    #[Route('/logout', name: 'logout', methods: ['POST'])]
    public function logout(Request $request): JsonResponse
    {
        $token = $this->extractBearerToken($request);

        if ($token) {
            try {
                $this->authManager->signOut($token);

                $this->logger?->info('User logged out', [
                    'ip' => $request->getClientIp(),
                ]);
            } catch (\Exception $e) {
                // Ignore errors - token might already be invalid
            }
        }

        return $this->json($this->formatSuccessResponse('Successfully logged out'));
    }

    /**
     * Revoke all sessions.
     *
     * POST /api/v1/auth/revoke-all
     * Header: Authorization: Bearer <token>
     */
    #[Route('/revoke-all', name: 'revoke_all', methods: ['POST'])]
    public function revokeAll(#[CurrentUser] User $user): JsonResponse
    {
        $count = $this->authManager->revokeAllTokens($user->getId());

        $this->logger?->info('All sessions revoked', [
            'userId' => $user->getId(),
            'count' => $count,
        ]);

        return $this->json($this->formatSuccessResponse(
            'All sessions have been revoked',
            ['revokedCount' => $count]
        ));
    }

    // =========================================================================
    // 2FA ENDPOINTS
    // =========================================================================

    /**
     * Setup 2FA - generate secret and QR code.
     *
     * POST /api/v1/auth/2fa/setup
     * Header: Authorization: Bearer <token>
     */
    #[Route('/2fa/setup', name: '2fa_setup', methods: ['POST'])]
    public function setup2fa(#[CurrentUser] User $user): JsonResponse
    {
        $result = $this->totpProvider->generateSecret($user->getId(), $user->getEmail());

        return $this->json([
            'success' => true,
            'data' => [
                'secret' => $result['secret'],
                'qrCode' => $result['qrCode'],
                'manualEntryKey' => $result['manualEntryKey'] ?? $result['secret'],
                'backupCodes' => $result['backupCodes'],
            ],
            'meta' => [
                'timestamp' => date('c'),
                'version' => 'v1',
                'note' => 'Scan QR code with your authenticator app, then verify with /2fa/verify',
            ],
        ]);
    }

    /**
     * Verify and enable 2FA.
     *
     * POST /api/v1/auth/2fa/verify
     * Body: { "code": "123456" }
     * Header: Authorization: Bearer <token>
     */
    #[Route('/2fa/verify', name: '2fa_verify', methods: ['POST'])]
    public function verify2fa(#[CurrentUser] User $user, Request $request): JsonResponse
    {
        $data = $request->toArray();

        if (empty($data['code'])) {
            return $this->json(
                $this->formatErrorResponse('validation_error', '2FA code is required', 422),
                422
            );
        }

        $verified = $this->totpProvider->verifyAndEnable($user->getId(), $data['code']);

        if (!$verified) {
            return $this->json(
                $this->formatErrorResponse('invalid_code', 'Invalid verification code', 400),
                400
            );
        }

        $this->logger?->info('2FA enabled', [
            'userId' => $user->getId(),
        ]);

        return $this->json($this->formatSuccessResponse(
            'Two-factor authentication has been enabled',
            ['enabled' => true]
        ));
    }

    /**
     * Disable 2FA.
     *
     * POST /api/v1/auth/2fa/disable
     * Body: { "backupCode": "..." }
     * Header: Authorization: Bearer <token>
     */
    #[Route('/2fa/disable', name: '2fa_disable', methods: ['POST'])]
    public function disable2fa(#[CurrentUser] User $user, Request $request): JsonResponse
    {
        $data = $request->toArray();

        if (empty($data['backupCode'])) {
            return $this->json(
                $this->formatErrorResponse('validation_error', 'Backup code is required to disable 2FA', 422),
                422
            );
        }

        $disabled = $this->totpProvider->disable($user->getId(), $data['backupCode']);

        if (!$disabled) {
            return $this->json(
                $this->formatErrorResponse('invalid_backup_code', 'Invalid backup code', 400),
                400
            );
        }

        $this->logger?->info('2FA disabled', [
            'userId' => $user->getId(),
        ]);

        return $this->json($this->formatSuccessResponse(
            'Two-factor authentication has been disabled',
            ['enabled' => false]
        ));
    }

    /**
     * Get 2FA status.
     *
     * GET /api/v1/auth/2fa/status
     * Header: Authorization: Bearer <token>
     */
    #[Route('/2fa/status', name: '2fa_status', methods: ['GET'])]
    public function status2fa(#[CurrentUser] User $user): JsonResponse
    {
        $status = $this->totpProvider->getStatus($user->getId());

        return $this->json([
            'success' => true,
            'data' => [
                'enabled' => $status['enabled'],
                'backupCodesRemaining' => $status['backupCodesRemaining'] ?? 0,
            ],
            'meta' => [
                'timestamp' => date('c'),
                'version' => 'v1',
            ],
        ]);
    }

    // =========================================================================
    // HELPER METHODS
    // =========================================================================

    /**
     * Validate registration data.
     */
    private function validateRegistration(array $data): array
    {
        $errors = [];

        if (empty($data['email'])) {
            $errors['email'] = 'Email is required';
        } elseif (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = 'Invalid email format';
        }

        if (empty($data['password'])) {
            $errors['password'] = 'Password is required';
        } elseif (strlen($data['password']) < 8) {
            $errors['password'] = 'Password must be at least 8 characters';
        }

        return $errors;
    }

    /**
     * Extract Bearer token from request.
     */
    private function extractBearerToken(Request $request): ?string
    {
        $authHeader = $request->headers->get('Authorization');

        if ($authHeader && str_starts_with($authHeader, 'Bearer ')) {
            return substr($authHeader, 7);
        }

        return $request->cookies->get('access_token');
    }
}

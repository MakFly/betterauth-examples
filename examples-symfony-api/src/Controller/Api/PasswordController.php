<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Controller\Api\Trait\ApiResponseTrait;
use BetterAuth\Providers\PasswordResetProvider\PasswordResetProvider;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Custom Password Reset Controller.
 */
#[Route('/auth/password', name: 'api_v1_auth_password_')]
class PasswordController extends AbstractController
{
    use ApiResponseTrait;

    public function __construct(
        private readonly PasswordResetProvider $passwordResetProvider,
        private readonly ?LoggerInterface $logger = null,
        #[Autowire(env: 'FRONTEND_URL')]
        private readonly string $frontendUrl = 'http://localhost:5173',
    ) {
    }

    /**
     * Request password reset.
     *
     * POST /api/v1/auth/password/forgot
     * Body: { "email": "..." }
     */
    #[Route('/forgot', name: 'forgot', methods: ['POST'])]
    public function forgot(Request $request): JsonResponse
    {
        $data = $request->toArray();

        if (empty($data['email'])) {
            return $this->json(
                $this->formatErrorResponse('validation_error', 'Email is required', 422),
                422
            );
        }

        $callbackUrl = $data['callbackUrl'] ?? rtrim($this->frontendUrl, '/') . '/auth/reset-password';

        try {
            $this->passwordResetProvider->sendResetEmail($data['email'], $callbackUrl);

            $this->logger?->info('Password reset email sent', [
                'email' => $data['email'],
            ]);

            // Always return success to prevent email enumeration
            return $this->json($this->formatSuccessResponse(
                'If an account exists with this email, you will receive a password reset link',
                ['emailSent' => true]
            ));
        } catch (\Exception $e) {
            $this->logger?->warning('Password reset failed', [
                'email' => $data['email'],
                'error' => $e->getMessage(),
            ]);

            // Still return success to prevent email enumeration
            return $this->json($this->formatSuccessResponse(
                'If an account exists with this email, you will receive a password reset link',
                ['emailSent' => true]
            ));
        }
    }

    /**
     * Reset password with token.
     *
     * POST /api/v1/auth/password/reset
     * Body: { "token": "...", "password": "..." }
     */
    #[Route('/reset', name: 'reset', methods: ['POST'])]
    public function reset(Request $request): JsonResponse
    {
        $data = $request->toArray();

        // Validation
        $errors = [];
        if (empty($data['token'])) {
            $errors['token'] = 'Reset token is required';
        }
        if (empty($data['password'])) {
            $errors['password'] = 'New password is required';
        } elseif (strlen($data['password']) < 8) {
            $errors['password'] = 'Password must be at least 8 characters';
        }

        if (!empty($errors)) {
            return $this->json(
                $this->formatErrorResponse('validation_error', 'Invalid input data', 422, $errors),
                422
            );
        }

        try {
            $result = $this->passwordResetProvider->resetPassword($data['token'], $data['password']);

            if (!$result['success']) {
                return $this->json(
                    $this->formatErrorResponse('reset_failed', $result['error'] ?? 'Password reset failed', 400),
                    400
                );
            }

            $this->logger?->info('Password reset successful');

            return $this->json($this->formatSuccessResponse(
                'Password has been reset successfully. You can now login with your new password.',
                ['reset' => true]
            ));
        } catch (\Exception $e) {
            $this->logger?->error('Password reset error', [
                'error' => $e->getMessage(),
            ]);

            return $this->json(
                $this->formatErrorResponse('reset_failed', 'Invalid or expired reset token', 400),
                400
            );
        }
    }

    /**
     * Verify reset token is valid.
     *
     * POST /api/v1/auth/password/verify-token
     * Body: { "token": "..." }
     */
    #[Route('/verify-token', name: 'verify_token', methods: ['POST'])]
    public function verifyToken(Request $request): JsonResponse
    {
        $data = $request->toArray();

        if (empty($data['token'])) {
            return $this->json(
                $this->formatErrorResponse('validation_error', 'Token is required', 422),
                422
            );
        }

        try {
            $result = $this->passwordResetProvider->verifyToken($data['token']);

            return $this->json([
                'success' => true,
                'data' => [
                    'valid' => $result['valid'] ?? false,
                    'email' => $result['email'] ?? null,
                    'expiresAt' => isset($result['expiresAt']) ? date('c', $result['expiresAt']) : null,
                ],
                'meta' => [
                    'timestamp' => date('c'),
                    'version' => 'v1',
                ],
            ]);
        } catch (\Exception $e) {
            return $this->json([
                'success' => true,
                'data' => [
                    'valid' => false,
                ],
                'meta' => [
                    'timestamp' => date('c'),
                    'version' => 'v1',
                ],
            ]);
        }
    }
}

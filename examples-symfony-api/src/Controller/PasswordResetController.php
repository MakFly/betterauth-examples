<?php

declare(strict_types=1);

namespace App\Controller;

use BetterAuth\Providers\PasswordResetProvider\PasswordResetProvider;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/auth/password', name: 'auth_password_')]
class PasswordResetController extends AbstractController
{
    public function __construct(
        private readonly PasswordResetProvider $passwordResetProvider,
        #[Autowire('%env(FRONTEND_URL)%')]
        private readonly string $frontendUrl
    ) {
    }

    #[Route('/forgot', name: 'forgot', methods: ['POST'])]
    public function forgotPassword(Request $request): JsonResponse
    {
        try {
            $data = json_decode($request->getContent(), true);

            if (!isset($data['email'])) {
                return $this->json(['error' => 'Email is required'], 400);
            }

            // Send password reset email with callback URL
            $callbackUrl = rtrim($this->frontendUrl, '/') . '/reset-password';
            $result = $this->passwordResetProvider->sendResetEmail($data['email'], $callbackUrl);

            // Always return success to prevent email enumeration
            return $this->json([
                'message' => 'If an account exists with this email, a password reset link has been sent',
                'expiresIn' => 3600, // 1 hour
            ]);
        } catch (\Exception $e) {
            // Don't expose internal errors for security
            return $this->json([
                'message' => 'If an account exists with this email, a password reset link has been sent',
            ]);
        }
    }

    #[Route('/reset', name: 'reset', methods: ['POST'])]
    public function resetPassword(Request $request): JsonResponse
    {
        try {
            $data = json_decode($request->getContent(), true);

            if (!isset($data['token'], $data['newPassword'])) {
                return $this->json(['error' => 'Token and new password are required'], 400);
            }

            // Validate password strength
            if (strlen($data['newPassword']) < 8) {
                return $this->json(['error' => 'Password must be at least 8 characters long'], 400);
            }

            // Reset password with token
            $result = $this->passwordResetProvider->resetPassword(
                $data['token'],
                $data['newPassword']
            );

            if (!$result['success']) {
                return $this->json([
                    'error' => $result['error'] ?? 'Invalid or expired reset token',
                ], 400);
            }

            return $this->json([
                'message' => 'Password reset successfully',
                'success' => true,
            ]);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        }
    }

    #[Route('/verify-token', name: 'verify_token', methods: ['POST'])]
    public function verifyResetToken(Request $request): JsonResponse
    {
        try {
            $data = json_decode($request->getContent(), true);

            if (!isset($data['token'])) {
                return $this->json(['error' => 'Token is required'], 400);
            }

            // Verify if token is valid (without resetting password)
            $result = $this->passwordResetProvider->verifyResetToken($data['token']);

            if (!$result['valid']) {
                return $this->json([
                    'valid' => false,
                    'error' => 'Invalid or expired token',
                ], 400);
            }

            return $this->json([
                'valid' => true,
                'email' => $result['email'] ?? null,
            ]);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        }
    }
}

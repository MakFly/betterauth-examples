<?php

declare(strict_types=1);

namespace App\Controller;

use BetterAuth\Core\AuthManager;
use BetterAuth\Providers\EmailVerificationProvider\EmailVerificationProvider;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/auth/email', name: 'auth_email_')]
class EmailVerificationController extends AbstractController
{
    public function __construct(
        private readonly AuthManager $authManager,
        private readonly EmailVerificationProvider $emailVerificationProvider,
        private readonly ?LoggerInterface $logger = null
    ) {
    }

    #[Route('/send-verification', name: 'send_verification', methods: ['POST'])]
    public function sendVerification(Request $request): JsonResponse
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

            if ($user->isEmailVerified()) {
                return $this->json(['error' => 'Email already verified'], 400);
            }

            // Build callback URL for verification link
            $data = json_decode($request->getContent(), true) ?? [];
            $callbackUrl = $data['callbackUrl'] ?? null;

            if (!$callbackUrl) {
                // Always use FRONTEND_URL from env - never hardcode localhost
                // This ensures it works in Docker, different ports, etc.
                $frontendUrl = $_ENV['FRONTEND_URL'] ?? null;
                if (!$frontendUrl) {
                    // Try to get from container parameter
                    try {
                        $frontendUrl = $this->getParameter('env(FRONTEND_URL)');
                    } catch (\Exception $e) {
                        // Last resort: use Origin header from request (for CORS scenarios)
                        $origin = $request->headers->get('Origin');
                        if ($origin) {
                            $frontendUrl = $origin;
                        } else {
                            throw new \RuntimeException('FRONTEND_URL environment variable is required for email verification. Please set it in your .env file.');
                        }
                    }
                }
                $callbackUrl = rtrim($frontendUrl, '/') . '/auth/email/verify';
            }

            $this->logger?->info('Sending verification email', [
                'userId' => $user->getId(),
                'email' => $user->getEmail(),
                'callbackUrl' => $callbackUrl,
            ]);

            // Send verification email
            $result = $this->emailVerificationProvider->sendVerificationEmail(
                $user->getId(),
                $user->getEmail(),
                $callbackUrl
            );

            $this->logger?->info('Verification email sent', [
                'userId' => $user->getId(),
                'email' => $user->getEmail(),
                'expiresIn' => $result['expiresIn'] ?? 3600,
            ]);

            return $this->json([
                'message' => 'Verification email sent successfully',
                'expiresIn' => $result['expiresIn'] ?? 3600,
            ]);
        } catch (\Exception $e) {
            $this->logger?->error('Failed to send verification email', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            return $this->json(['error' => $e->getMessage()], 400);
        }
    }

    #[Route('/verify', name: 'verify', methods: ['POST'])]
    public function verify(Request $request): JsonResponse
    {
        try {
            $data = json_decode($request->getContent(), true);

            if (!isset($data['token'])) {
                return $this->json(['error' => 'Verification token is required'], 400);
            }

            // Verify email with token
            $result = $this->emailVerificationProvider->verifyEmail($data['token']);

            if (!$result['success']) {
                return $this->json(['error' => $result['error'] ?? 'Invalid or expired token'], 400);
            }

            return $this->json([
                'message' => 'Email verified successfully',
                'verified' => true,
            ]);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        }
    }

    #[Route('/verification-status', name: 'verification_status', methods: ['GET'])]
    public function verificationStatus(Request $request): JsonResponse
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

            return $this->json([
                'verified' => $user->emailVerified,
                'email' => $user->email,
            ]);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        }
    }

    private function getBearerToken(Request $request): ?string
    {
        $authHeader = $request->headers->get('Authorization');
        if (!$authHeader || !str_starts_with($authHeader, 'Bearer ')) {
            return null;
        }

        return substr($authHeader, 7);
    }
}

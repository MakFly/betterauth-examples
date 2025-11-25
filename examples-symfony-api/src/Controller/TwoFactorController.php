<?php

declare(strict_types=1);

namespace App\Controller;

use BetterAuth\Core\AuthManager;
use BetterAuth\Providers\TotpProvider\TotpProvider;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/auth/2fa', name: 'auth_2fa_')]
class TwoFactorController extends AbstractController
{
    public function __construct(
        private readonly AuthManager $authManager,
        private readonly TotpProvider $totpProvider
    ) {
    }

    #[Route('/setup', name: 'setup', methods: ['POST'])]
    public function setup(Request $request): JsonResponse
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

            // Generate TOTP secret and QR code - use email for QR code display
            $result = $this->totpProvider->generateSecret($user->getId(), $user->getEmail());

            return $this->json([
                'secret' => $result['secret'],
                'qrCode' => $result['qrCode'],
                'manualEntryKey' => $result['manualEntryKey'] ?? $result['secret'],
                'backupCodes' => $result['backupCodes'] ?? [],
            ]);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        }
    }

    #[Route('/validate', name: 'validate', methods: ['POST'])]
    public function validate(Request $request): JsonResponse
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

            $data = json_decode($request->getContent(), true);
            if (!isset($data['code'])) {
                return $this->json(['error' => 'Verification code is required'], 400);
            }

            // Validate TOTP code after setup and enable 2FA
            $verified = $this->totpProvider->verifyAndEnable($user->getId(), $data['code']);

            if (!$verified) {
                return $this->json(['error' => 'Invalid verification code'], 400);
            }

            return $this->json([
                'message' => 'Two-factor authentication enabled successfully',
                'enabled' => true,
            ]);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        }
    }

    #[Route('/verify', name: 'verify', methods: ['POST'])]
    public function verify(Request $request): JsonResponse
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

            $data = json_decode($request->getContent(), true);
            if (!isset($data['code'])) {
                return $this->json(['error' => 'Verification code is required'], 400);
            }

            // Just verify the TOTP code (during login for example)
            $verified = $this->totpProvider->verify($user->getId(), $data['code']);

            if (!$verified) {
                return $this->json(['error' => 'Invalid verification code'], 400);
            }

            return $this->json([
                'message' => 'Code verified successfully',
                'success' => true,
            ]);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        }
    }

    #[Route('/disable', name: 'disable', methods: ['POST'])]
    public function disable(Request $request): JsonResponse
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

            $data = json_decode($request->getContent(), true);
            if (!isset($data['backupCode'])) {
                return $this->json(['error' => 'Backup code is required to disable 2FA'], 400);
            }

            // Verify backup code before disabling (now requires backup code, not TOTP code)
            $disabled = $this->totpProvider->disable($user->getId(), $data['backupCode']);

            if (!$disabled) {
                return $this->json(['error' => 'Invalid backup code'], 400);
            }

            return $this->json([
                'message' => 'Two-factor authentication disabled successfully',
                'enabled' => false,
            ]);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        }
    }

    #[Route('/backup-codes/regenerate', name: 'regenerate_backup_codes', methods: ['POST'])]
    public function regenerateBackupCodes(Request $request): JsonResponse
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

            $data = json_decode($request->getContent(), true);
            if (!isset($data['code'])) {
                return $this->json(['error' => 'Verification code is required'], 400);
            }

            // Verify TOTP code before regenerating backup codes
            $result = $this->totpProvider->regenerateBackupCodes($user->getId(), $data['code']);

            if (!$result['success']) {
                return $this->json(['error' => 'Invalid verification code'], 400);
            }

            return $this->json([
                'message' => 'Backup codes regenerated successfully',
                'backupCodes' => $result['backupCodes'],
            ]);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        }
    }

    #[Route('/status', name: 'status', methods: ['GET'])]
    public function status(Request $request): JsonResponse
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

            $status = $this->totpProvider->getStatus($user->getId());

            return $this->json([
                'enabled' => $status['enabled'],
                'backupCodesRemaining' => $status['backupCodesRemaining'] ?? 0,
                'requires2fa' => $status['requires2fa'] ?? false,
                'last2faVerifiedAt' => $status['last2faVerifiedAt'] ?? null,
            ]);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        }
    }

    #[Route('/reset', name: 'reset', methods: ['POST'])]
    public function reset(Request $request): JsonResponse
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

            $data = json_decode($request->getContent(), true);
            if (!isset($data['backupCode'])) {
                return $this->json(['error' => 'Backup code is required to reset 2FA'], 400);
            }

            // Reset 2FA with backup code (when 2FA is broken) - use email for QR code display
            $result = $this->totpProvider->resetWithBackupCode($user->getId(), $data['backupCode'], $user->getEmail());

            if (!$result['success']) {
                return $this->json(['error' => $result['error'] ?? 'Failed to reset 2FA'], 400);
            }

            return $this->json([
                'message' => '2FA reset successfully. Please validate the new setup.',
                'secret' => $result['secret'],
                'qrCode' => $result['qrCode'],
                'manualEntryKey' => $result['manualEntryKey'],
                'backupCodes' => $result['backupCodes'],
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

<?php

declare(strict_types=1);

namespace App\Controller;

use BetterAuth\Core\AuthManager;
use BetterAuth\Providers\GuestSessionProvider\GuestSessionProvider;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/auth/guest', name: 'auth_guest_')]
class GuestSessionController extends AbstractController
{
    public function __construct(
        private readonly GuestSessionProvider $guestSessionProvider,
        private readonly AuthManager $authManager,
    ) {
    }

    #[Route('/create', name: 'create', methods: ['POST'])]
    public function createGuestSession(Request $request): JsonResponse
    {
        try {
            $data = json_decode($request->getContent(), true) ?? [];

            $guestSession = $this->guestSessionProvider->createGuestSession(
                $data['deviceInfo'] ?? $request->headers->get('User-Agent'),
                $request->getClientIp() ?? '127.0.0.1',
                $data['metadata'] ?? null,
            );

            return $this->json([
                'guest_token' => $guestSession->token,
                'expires_at' => $guestSession->expiresAt,
                'created_at' => $guestSession->createdAt,
            ], 201);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    #[Route('/{token}', name: 'get', methods: ['GET'])]
    public function getGuestSession(string $token): JsonResponse
    {
        try {
            $guestSession = $this->guestSessionProvider->getGuestSession($token);

            if ($guestSession === null) {
                return $this->json(['error' => 'Guest session not found'], 404);
            }

            $expiresAt = new \DateTimeImmutable($guestSession->expiresAt);
            if ($expiresAt < new \DateTimeImmutable()) {
                return $this->json(['error' => 'Guest session has expired'], 410);
            }

            return $this->json([
                'id' => $guestSession->id,
                'token' => $guestSession->token,
                'device_info' => $guestSession->deviceInfo,
                'ip_address' => $guestSession->ipAddress,
                'created_at' => $guestSession->createdAt,
                'expires_at' => $guestSession->expiresAt,
                'metadata' => $guestSession->metadata,
            ]);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    #[Route('/convert', name: 'convert', methods: ['POST'])]
    public function convertToUser(Request $request): JsonResponse
    {
        try {
            $data = json_decode($request->getContent(), true);

            if (!isset($data['guest_token'])) {
                return $this->json(['error' => 'guest_token is required'], 400);
            }

            if (!isset($data['email'])) {
                return $this->json(['error' => 'email is required'], 400);
            }

            $userData = [
                'email' => $data['email'],
                'name' => $data['name'] ?? null,
                'password_hash' => isset($data['password'])
                    ? password_hash($data['password'], PASSWORD_ARGON2ID)
                    : null,
            ];

            $user = $this->guestSessionProvider->convertToUser($data['guest_token'], $userData);

            // Generate tokens for the new user
            $tokens = $this->authManager->signUp(
                $data['email'],
                $data['password'] ?? bin2hex(random_bytes(16)),
                $data['name'] ?? null,
            );

            return $this->json([
                'message' => 'Guest session converted to user successfully',
                'user' => [
                    'id' => $user->getId(),
                    'email' => $user->getEmail(),
                    'name' => $user->getName(),
                ],
                'access_token' => $tokens['access_token'] ?? null,
                'refresh_token' => $tokens['refresh_token'] ?? null,
                'expires_in' => $tokens['expires_in'] ?? 3600,
                'token_type' => 'Bearer',
            ], 201);
        } catch (\RuntimeException $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }

    #[Route('/{token}', name: 'delete', methods: ['DELETE'])]
    public function deleteGuestSession(string $token): JsonResponse
    {
        try {
            $guestSession = $this->guestSessionProvider->getGuestSession($token);

            if ($guestSession === null) {
                return $this->json(['error' => 'Guest session not found'], 404);
            }

            $deleted = $this->guestSessionProvider->deleteGuestSession($guestSession->id);

            if (!$deleted) {
                return $this->json(['error' => 'Failed to delete guest session'], 500);
            }

            return $this->json(['message' => 'Guest session deleted successfully']);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 500);
        }
    }
}

<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Controller\Api\Trait\ApiResponseTrait;
use BetterAuth\Core\Entities\User;
use BetterAuth\Core\Interfaces\SessionRepositoryInterface;
use BetterAuth\Symfony\Security\Attribute\CurrentUser;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Custom Sessions Controller.
 */
#[Route('/auth/sessions', name: 'api_v1_auth_sessions_')]
class SessionsController extends AbstractController
{
    use ApiResponseTrait;

    public function __construct(
        private readonly SessionRepositoryInterface $sessionRepository,
        private readonly ?LoggerInterface $logger = null,
    ) {
    }

    /**
     * List all active sessions for current user.
     *
     * GET /api/v1/auth/sessions
     * Header: Authorization: Bearer <token>
     */
    #[Route('', name: 'list', methods: ['GET'])]
    public function list(#[CurrentUser] User $user, Request $request): JsonResponse
    {
        $sessions = $this->sessionRepository->findByUserId($user->getId());
        $currentToken = $this->extractBearerToken($request);

        $formattedSessions = [];
        foreach ($sessions as $session) {
            $metadata = $session->getMetadata() ?? [];
            $isCurrent = $session->getToken() === $currentToken;

            $formattedSessions[] = [
                'id' => $session->getToken(),
                'device' => [
                    'type' => $metadata['device'] ?? 'Unknown',
                    'browser' => $metadata['browser'] ?? 'Unknown',
                    'os' => $metadata['os'] ?? 'Unknown',
                ],
                'location' => [
                    'ip' => $session->getIpAddress(),
                    'city' => $metadata['location'] ?? 'Unknown',
                ],
                'isCurrent' => $isCurrent,
                'timestamps' => [
                    'createdAt' => $session->getCreatedAt()->format('c'),
                    'lastActiveAt' => $session->getUpdatedAt()->format('c'),
                    'expiresAt' => $session->getExpiresAt()->format('c'),
                ],
            ];
        }

        // Sort by last active, current session first
        usort($formattedSessions, function ($a, $b) {
            if ($a['isCurrent'] !== $b['isCurrent']) {
                return $a['isCurrent'] ? -1 : 1;
            }
            return strcmp($b['timestamps']['lastActiveAt'], $a['timestamps']['lastActiveAt']);
        });

        return $this->json([
            'success' => true,
            'data' => [
                'sessions' => $formattedSessions,
                'count' => count($formattedSessions),
            ],
            'meta' => [
                'timestamp' => date('c'),
                'version' => 'v1',
            ],
        ]);
    }

    /**
     * Revoke a specific session.
     *
     * DELETE /api/v1/auth/sessions/{sessionId}
     * Header: Authorization: Bearer <token>
     */
    #[Route('/{sessionId}', name: 'revoke', methods: ['DELETE'])]
    public function revoke(
        string $sessionId,
        #[CurrentUser] User $user,
        Request $request
    ): JsonResponse {
        // Find the session
        $session = $this->sessionRepository->findByToken($sessionId);

        if (!$session) {
            return $this->json(
                $this->formatErrorResponse('session_not_found', 'Session not found', 404),
                404
            );
        }

        // Verify session belongs to user
        if ($session->getUserId() !== $user->getId()) {
            return $this->json(
                $this->formatErrorResponse('access_denied', 'Session does not belong to you', 403),
                403
            );
        }

        // Check if trying to revoke current session
        $currentToken = $this->extractBearerToken($request);
        if ($session->getToken() === $currentToken) {
            return $this->json(
                $this->formatErrorResponse(
                    'cannot_revoke_current',
                    'Cannot revoke current session. Use /logout instead.',
                    400
                ),
                400
            );
        }

        // Revoke the session
        $this->sessionRepository->delete($sessionId);

        $this->logger?->info('Session revoked', [
            'userId' => $user->getId(),
            'sessionId' => $sessionId,
        ]);

        return $this->json($this->formatSuccessResponse(
            'Session has been revoked',
            ['revokedSessionId' => $sessionId]
        ));
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

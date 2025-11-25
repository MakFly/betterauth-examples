<?php

declare(strict_types=1);

namespace App\Controller\Api\Trait;

use BetterAuth\Core\Entities\User;

/**
 * Custom API response formatting trait.
 *
 * Provides consistent response structure across all API endpoints.
 */
trait ApiResponseTrait
{
    /**
     * Format user data for API response.
     */
    protected function formatUser(User $user): array
    {
        return [
            'id' => $user->getId(),
            'email' => $user->getEmail(),
            'profile' => [
                'name' => $user->getName(),
                'avatar' => $user->getAvatar(),
                'initials' => $this->getInitials($user->getName()),
            ],
            'status' => [
                'emailVerified' => $user->isEmailVerified(),
                'has2FA' => false, // Will be set by controller if needed
            ],
            'timestamps' => [
                'createdAt' => $user->getCreatedAt()->format('c'),
                'updatedAt' => $user->getUpdatedAt()->format('c'),
            ],
        ];
    }

    /**
     * Format successful authentication response.
     */
    protected function formatAuthResponse(array $result, User $user, array $extra = []): array
    {
        $expiresIn = $result['expires_in'] ?? 3600;

        $response = [
            'success' => true,
            'data' => [
                'auth' => [
                    'accessToken' => $result['access_token'],
                    'refreshToken' => $result['refresh_token'],
                    'tokenType' => 'Bearer',
                    'expiresIn' => $expiresIn,
                    'expiresAt' => date('c', time() + $expiresIn),
                ],
                'user' => $this->formatUser($user),
            ],
            'meta' => [
                'timestamp' => date('c'),
                'version' => 'v1',
            ],
        ];

        // Merge extra data
        if (!empty($extra)) {
            $response['data'] = array_merge($response['data'], $extra);
        }

        return $response;
    }

    /**
     * Format error response.
     */
    protected function formatErrorResponse(
        string $error,
        string $message,
        int $statusCode = 400,
        array $details = []
    ): array {
        $response = [
            'success' => false,
            'error' => [
                'code' => $error,
                'message' => $message,
                'status' => $statusCode,
            ],
            'meta' => [
                'timestamp' => date('c'),
                'version' => 'v1',
            ],
        ];

        if (!empty($details)) {
            $response['error']['details'] = $details;
        }

        return $response;
    }

    /**
     * Format success response without auth data.
     */
    protected function formatSuccessResponse(string $message, array $data = []): array
    {
        return [
            'success' => true,
            'message' => $message,
            'data' => $data,
            'meta' => [
                'timestamp' => date('c'),
                'version' => 'v1',
            ],
        ];
    }

    /**
     * Get user initials from name.
     */
    private function getInitials(?string $name): string
    {
        if (empty($name)) {
            return '??';
        }

        $parts = explode(' ', trim($name));
        $initials = '';

        foreach (array_slice($parts, 0, 2) as $part) {
            if (!empty($part)) {
                $initials .= mb_strtoupper(mb_substr($part, 0, 1));
            }
        }

        return $initials ?: '??';
    }
}

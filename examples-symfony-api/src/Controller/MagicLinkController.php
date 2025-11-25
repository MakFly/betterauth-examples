<?php

declare(strict_types=1);

namespace App\Controller;

use BetterAuth\Core\Exceptions\RateLimitException;
use BetterAuth\Providers\MagicLinkProvider\MagicLinkProvider;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\ParameterBag\ParameterBagInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Mailer\Exception\TransportExceptionInterface;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/auth/magic-link', name: 'auth_magic_link_')]
class MagicLinkController extends AbstractController
{
    public function __construct(
        private readonly MagicLinkProvider $magicLinkProvider,
        private readonly ParameterBagInterface $params
    ) {
    }

    #[Route('/send', name: 'send', methods: ['POST'])]
    public function sendMagicLink(Request $request): JsonResponse
    {
        try {
            $data = json_decode($request->getContent(), true);

            if (!isset($data['email'])) {
                return $this->json(['error' => 'Email is required'], 400);
            }

            // Build callback URL for magic link (use frontend URL from env or request data)
            $frontendUrl = $this->params->get('env(FRONTEND_URL)');
            $callbackUrl = $data['callbackUrl'] ?? $frontendUrl . '/auth/magic-link/verify';

            error_log("[DEBUG] MagicLink - Email: {$data['email']}, CallbackURL: {$callbackUrl}");

            // Send magic link to email
            $result = $this->magicLinkProvider->sendMagicLink(
                $data['email'],
                $request->getClientIp() ?? '127.0.0.1',
                $request->headers->get('User-Agent') ?? 'Unknown',
                $callbackUrl
            );

            error_log("[DEBUG] MagicLink - Result: " . json_encode($result));

            return $this->json([
                'message' => 'Magic link sent successfully',
                'expiresIn' => $result['expiresIn'] ?? 900, // 15 minutes
            ]);
        } catch (RateLimitException $e) {
            return $this->json([
                'error' => 'Too many requests. Please try again later.',
                'retryAfter' => $e->getRetryAfter(),
            ], 429);
        } catch (TransportExceptionInterface $e) {
            error_log("[ERROR] MagicLink - Mailer error: " . $e->getMessage());
            return $this->json([
                'error' => 'Failed to send email. Please check mailer configuration.',
                'message' => 'Unable to connect to mail server. Please contact support if the problem persists.',
            ], 500);
        } catch (\Exception $e) {
            error_log("[ERROR] MagicLink - Unexpected error: " . $e->getMessage());
            return $this->json([
                'error' => 'An error occurred while sending the magic link.',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    #[Route('/verify', name: 'verify', methods: ['POST'])]
    public function verifyMagicLink(Request $request): JsonResponse
    {
        try {
            $data = json_decode($request->getContent(), true);

            if (!isset($data['token'])) {
                return $this->json(['error' => 'Magic link token is required'], 400);
            }

            // Verify magic link and complete authentication
            $result = $this->magicLinkProvider->verifyMagicLink(
                $data['token'],
                $request->getClientIp() ?? '127.0.0.1',
                $request->headers->get('User-Agent') ?? 'Unknown'
            );

            if (!$result['success']) {
                return $this->json([
                    'error' => $result['error'] ?? 'Invalid or expired magic link',
                ], 400);
            }

            return $this->json([
                'access_token' => $result['access_token'],
                'refresh_token' => $result['refresh_token'],
                'expires_in' => $result['expires_in'],
                'token_type' => 'Bearer',
                'user' => $result['user'],
            ]);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        }
    }

    #[Route('/verify/{token}', name: 'verify_get', methods: ['GET'])]
    public function verifyMagicLinkGet(string $token, Request $request): JsonResponse
    {
        try {
            // Verify magic link via GET (for email link clicks)
            $result = $this->magicLinkProvider->verifyMagicLink(
                $token,
                $request->getClientIp() ?? '127.0.0.1',
                $request->headers->get('User-Agent') ?? 'Unknown'
            );

            if (!$result['success']) {
                return $this->json([
                    'error' => $result['error'] ?? 'Invalid or expired magic link',
                ], 400);
            }

            return $this->json([
                'access_token' => $result['access_token'],
                'refresh_token' => $result['refresh_token'],
                'expires_in' => $result['expires_in'],
                'token_type' => 'Bearer',
                'user' => $result['user'],
            ]);
        } catch (\Exception $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        }
    }
}

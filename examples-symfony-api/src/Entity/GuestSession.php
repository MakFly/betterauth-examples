<?php

declare(strict_types=1);

namespace App\Entity;

use BetterAuth\Symfony\Model\GuestSession as BaseGuestSession;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'guest_sessions')]
#[ORM\Index(columns: ['token'], name: 'idx_guest_sessions_token')]
#[ORM\Index(columns: ['expires_at'], name: 'idx_guest_sessions_expires_at')]
class GuestSession extends BaseGuestSession
{
}

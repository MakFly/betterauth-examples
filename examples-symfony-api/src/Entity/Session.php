<?php

declare(strict_types=1);

namespace App\Entity;

use BetterAuth\Core\Entities\Session as BaseSession;
use Doctrine\ORM\Mapping as ORM;

/**
 * Session entity - Extends BetterAuth base Session.
 * 
 * Manages user sessions. Required for authentication.
 */
#[ORM\Entity]
#[ORM\Table(name: 'sessions')]
class Session extends BaseSession
{
    // Add custom fields here if needed
}

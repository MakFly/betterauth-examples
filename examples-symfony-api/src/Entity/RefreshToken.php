<?php

declare(strict_types=1);

namespace App\Entity;

use BetterAuth\Core\Entities\RefreshToken as BaseRefreshToken;
use Doctrine\ORM\Mapping as ORM;

/**
 * RefreshToken entity - Extends BetterAuth base RefreshToken.
 * 
 * Required for JWT refresh token functionality.
 */
#[ORM\Entity]
#[ORM\Table(name: 'refresh_tokens')]
class RefreshToken extends BaseRefreshToken
{
    // Add custom fields here if needed
}

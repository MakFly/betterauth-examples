<?php

declare(strict_types=1);

namespace App\Entity;

use BetterAuth\Core\Entities\User as BaseUser;
use Doctrine\ORM\Mapping as ORM;

/**
 * User entity - Extends BetterAuth base User.
 * 
 * This is the core authentication entity. Add custom fields as needed.
 */
#[ORM\Entity]
#[ORM\Table(name: 'users')]
class User extends BaseUser
{
    // Add custom fields here
    // Example:
    // #[ORM\Column(type: 'string', nullable: true)]
    // private ?string $phone = null;
}

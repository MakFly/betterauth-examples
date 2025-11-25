<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20251124214500 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create guest_sessions table for guest session support';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE guest_sessions (
            id VARCHAR(36) NOT NULL,
            token VARCHAR(64) NOT NULL,
            device_info TEXT DEFAULT NULL,
            ip_address VARCHAR(45) DEFAULT NULL,
            created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
            expires_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
            metadata JSON DEFAULT NULL,
            PRIMARY KEY(id)
        )');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_GUEST_SESSIONS_TOKEN ON guest_sessions (token)');
        $this->addSql('CREATE INDEX idx_guest_sessions_token ON guest_sessions (token)');
        $this->addSql('CREATE INDEX idx_guest_sessions_expires_at ON guest_sessions (expires_at)');
        $this->addSql('COMMENT ON COLUMN guest_sessions.created_at IS \'(DC2Type:datetime_immutable)\'');
        $this->addSql('COMMENT ON COLUMN guest_sessions.expires_at IS \'(DC2Type:datetime_immutable)\'');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE guest_sessions');
    }
}

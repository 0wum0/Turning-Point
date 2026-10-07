'use strict';
/**
 * Versionierte Migrationen. Neue Änderungen NUR als neuer Eintrag unten anhängen.
 * Sie laufen beim Start automatisch – so bleiben Updates/Redeploys ohne Handarbeit möglich.
 */
const MIGRATIONS = [
  {
    id: '001_core',
    up: [
      `CREATE TABLE IF NOT EXISTS settings (
        \`key\` VARCHAR(100) NOT NULL PRIMARY KEY,
        value LONGTEXT NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS users (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(190) NOT NULL,
        username VARCHAR(40) NOT NULL,
        password_hash VARCHAR(100) NOT NULL,
        role ENUM('player','admin') NOT NULL DEFAULT 'player',
        email_verified TINYINT(1) NOT NULL DEFAULT 0,
        verify_token CHAR(64) NULL,
        reset_token CHAR(64) NULL,
        reset_expires DATETIME NULL,
        banned TINYINT(1) NOT NULL DEFAULT 0,
        ban_reason VARCHAR(255) NULL,
        coins INT NOT NULL DEFAULT 0,
        efs_pool INT NOT NULL DEFAULT 0,
        meta LONGTEXT NULL,
        efs_accrued_at BIGINT NOT NULL DEFAULT 0,
        efs_carry DOUBLE NOT NULL DEFAULT 0,
        login_bonus_date VARCHAR(10) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_login_at DATETIME NULL,
        last_seen_at DATETIME NULL,
        UNIQUE KEY uq_users_email (email),
        UNIQUE KEY uq_users_username (username)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS sessions (
        sid VARCHAR(128) NOT NULL PRIMARY KEY,
        data MEDIUMTEXT NOT NULL,
        expires BIGINT NOT NULL,
        KEY idx_sessions_expires (expires)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS cities (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(60) NOT NULL,
        name VARCHAR(80) NOT NULL,
        state VARCHAR(60) NOT NULL DEFAULT '',
        lat DOUBLE NOT NULL,
        lon DOUBLE NOT NULL,
        size_tier TINYINT NOT NULL DEFAULT 2,
        price_factor DOUBLE NOT NULL DEFAULT 1,
        image VARCHAR(255) NULL,
        description TEXT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        UNIQUE KEY uq_cities_slug (slug)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS professions (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        pkey VARCHAR(40) NOT NULL,
        name VARCHAR(80) NOT NULL,
        category VARCHAR(40) NOT NULL DEFAULT 'handwerk',
        icon VARCHAR(40) NOT NULL DEFAULT 'hammer',
        era_from SMALLINT NOT NULL DEFAULT 1945,
        era_to SMALLINT NOT NULL DEFAULT 2999,
        base_wage INT NOT NULL DEFAULT 500,
        training_days INT NOT NULL DEFAULT 730,
        tuition_day INT NOT NULL DEFAULT 0,
        academic TINYINT(1) NOT NULL DEFAULT 0,
        replaces VARCHAR(40) NULL,
        lodging TINYINT(1) NOT NULL DEFAULT 0,
        unlocks VARCHAR(120) NULL,
        description TEXT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        UNIQUE KEY uq_professions_pkey (pkey)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS characters (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        parent_id INT UNSIGNED NULL,
        cycle INT NOT NULL DEFAULT 1,
        generation INT NOT NULL DEFAULT 1,
        status ENUM('alive','dead','gameover') NOT NULL DEFAULT 'alive',
        name VARCHAR(120) NOT NULL DEFAULT '',
        state LONGTEXT NOT NULL,
        game_day INT NOT NULL DEFAULT 0,
        money BIGINT NOT NULL DEFAULT 0,
        end_reason VARCHAR(80) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        ended_at DATETIME NULL,
        KEY idx_chars_user (user_id, status),
        CONSTRAINT fk_chars_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS media (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        original VARCHAR(255) NOT NULL,
        mime VARCHAR(60) NOT NULL,
        size INT NOT NULL,
        kind VARCHAR(30) NOT NULL DEFAULT 'misc',
        created_by INT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_media_filename (filename)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS audit_log (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NULL,
        action VARCHAR(60) NOT NULL,
        detail TEXT NULL,
        ip VARCHAR(64) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_audit_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS ad_claims (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        token CHAR(32) NOT NULL,
        purpose VARCHAR(60) NOT NULL DEFAULT 'coins',
        started_at BIGINT NOT NULL,
        claimed_at BIGINT NULL,
        reward INT NOT NULL DEFAULT 0,
        KEY idx_ads_user (user_id, started_at),
        UNIQUE KEY uq_ads_token (token)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS purchases (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        package_id VARCHAR(40) NOT NULL,
        coins INT NOT NULL DEFAULT 0,
        efs INT NOT NULL DEFAULT 0,
        money BIGINT NOT NULL DEFAULT 0,
        price_cents INT NOT NULL DEFAULT 0,
        provider VARCHAR(30) NOT NULL DEFAULT 'test',
        status VARCHAR(20) NOT NULL DEFAULT 'completed',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_purchases_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ],
  },
  {
    id: '002_payments',
    up: [
      'ALTER TABLE users ADD COLUMN sub_until BIGINT NULL, ADD COLUMN stripe_sub VARCHAR(80) NULL, ADD COLUMN stripe_customer VARCHAR(80) NULL',
      'ALTER TABLE purchases ADD COLUMN provider_ref VARCHAR(120) NULL, ADD UNIQUE KEY uq_purchases_ref (provider_ref)',
      `CREATE TABLE IF NOT EXISTS offer_events (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        txid VARCHAR(120) NOT NULL,
        user_id INT UNSIGNED NOT NULL,
        coins INT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_offer_txid (txid)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ],
  },
];

async function ensureTable(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(60) NOT NULL PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

/** @param db {query}-Objekt (db.js oder tx) */
async function migrate(db, log = () => {}) {
  await ensureTable(db);
  const done = new Set((await db.query('SELECT id FROM schema_migrations')).map((r) => r.id));
  let applied = 0;
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    log(`Migration ${m.id} …`);
    for (const sql of m.up) await db.query(sql);
    await db.query('INSERT INTO schema_migrations (id) VALUES (?)', [m.id]);
    applied++;
  }
  return applied;
}

module.exports = { migrate, MIGRATIONS };

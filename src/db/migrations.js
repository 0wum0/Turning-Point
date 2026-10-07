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
  { id: '003_city_aerial', up: ['ALTER TABLE cities ADD COLUMN aerial VARCHAR(255) NULL'] },
  {
    id: '004_anticheat_stats',
    up: [
      `CREATE TABLE IF NOT EXISTS cheat_flags (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        rule VARCHAR(40) NOT NULL,
        weight INT NOT NULL DEFAULT 10,
        detail TEXT NULL,
        count INT NOT NULL DEFAULT 1,
        status ENUM('open','dismissed','confirmed') NOT NULL DEFAULT 'open',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_cf_user (user_id, status),
        KEY idx_cf_created (created_at),
        KEY idx_cf_rule (rule),
        CONSTRAINT fk_cf_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS user_ips (
        user_id INT UNSIGNED NOT NULL,
        ip VARCHAR(64) NOT NULL,
        first_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        hits INT NOT NULL DEFAULT 1,
        PRIMARY KEY (user_id, ip),
        KEY idx_ui_ip (ip, last_seen),
        CONSTRAINT fk_ui_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS user_snap (
        user_id INT UNSIGNED NOT NULL PRIMARY KEY,
        coins INT NOT NULL DEFAULT 0,
        at BIGINT NOT NULL DEFAULT 0,
        CONSTRAINT fk_us_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS daily_stats (
        day DATE NOT NULL PRIMARY KEY,
        users_total INT NOT NULL DEFAULT 0,
        new_users INT NOT NULL DEFAULT 0,
        active_users INT NOT NULL DEFAULT 0,
        online_peak INT NOT NULL DEFAULT 0,
        chars_alive INT NOT NULL DEFAULT 0,
        coins_total BIGINT NOT NULL DEFAULT 0,
        efs_total BIGINT NOT NULL DEFAULT 0,
        money_total BIGINT NOT NULL DEFAULT 0,
        revenue_cents INT NOT NULL DEFAULT 0,
        ad_claims INT NOT NULL DEFAULT 0,
        flags INT NOT NULL DEFAULT 0,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ],
  },
  {
    id: '005_social',
    up: [
      'ALTER TABLE users ADD COLUMN social_public TINYINT(1) NOT NULL DEFAULT 1, ADD COLUMN bio VARCHAR(240) NULL, ADD COLUMN mute_until BIGINT NULL',
      `CREATE TABLE IF NOT EXISTS player_stats (
        user_id INT UNSIGNED NOT NULL PRIMARY KEY,
        char_id INT UNSIGNED NOT NULL,
        username VARCHAR(40) NOT NULL,
        name VARCHAR(120) NOT NULL,
        city_id INT UNSIGNED NULL,
        year SMALLINT NOT NULL DEFAULT 1945,
        status VARCHAR(10) NOT NULL DEFAULT 'alive',
        wealth BIGINT NOT NULL DEFAULT 0,
        biz_value BIGINT NOT NULL DEFAULT 0,
        companies INT NOT NULL DEFAULT 0,
        properties INT NOT NULL DEFAULT 0,
        children INT NOT NULL DEFAULT 0,
        generation INT NOT NULL DEFAULT 1,
        cycle INT NOT NULL DEFAULT 1,
        influence INT NOT NULL DEFAULT 0,
        office VARCHAR(40) NULL,
        days INT NOT NULL DEFAULT 0,
        occupation VARCHAR(80) NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_ps_wealth (wealth), KEY idx_ps_city (city_id),
        CONSTRAINT fk_ps_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS player_firms (
        user_id INT UNSIGNED NOT NULL,
        company_id INT NOT NULL,
        city_id INT UNSIGNED NOT NULL,
        name VARCHAR(120) NOT NULL,
        pkey VARCHAR(40) NOT NULL,
        tier TINYINT NOT NULL DEFAULT 0,
        rooms INT NOT NULL DEFAULT 1,
        PRIMARY KEY (user_id, company_id),
        KEY idx_pf_city (city_id),
        CONSTRAINT fk_pf_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS friendships (
        user_a INT UNSIGNED NOT NULL,
        user_b INT UNSIGNED NOT NULL,
        requester INT UNSIGNED NOT NULL,
        status ENUM('pending','accepted','blocked') NOT NULL DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_a, user_b),
        KEY idx_fr_b (user_b),
        CONSTRAINT fk_fr_a FOREIGN KEY (user_a) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_fr_b FOREIGN KEY (user_b) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS messages (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        from_user INT UNSIGNED NULL,
        to_user INT UNSIGNED NOT NULL,
        kind VARCHAR(12) NOT NULL DEFAULT 'letter',
        subject VARCHAR(120) NOT NULL DEFAULT '',
        body TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        read_at DATETIME NULL,
        del_from TINYINT(1) NOT NULL DEFAULT 0,
        del_to TINYINT(1) NOT NULL DEFAULT 0,
        reported TINYINT(1) NOT NULL DEFAULT 0,
        KEY idx_msg_to (to_user, del_to, id),
        KEY idx_msg_from (from_user, del_from, id),
        CONSTRAINT fk_msg_to FOREIGN KEY (to_user) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS chat_messages (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        city_id INT UNSIGNED NOT NULL,
        user_id INT UNSIGNED NOT NULL,
        name VARCHAR(80) NOT NULL,
        text VARCHAR(400) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted TINYINT(1) NOT NULL DEFAULT 0,
        KEY idx_chat_city (city_id, id),
        CONSTRAINT fk_chat_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS public_news (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        city_id INT UNSIGNED NOT NULL,
        user_id INT UNSIGNED NOT NULL,
        section VARCHAR(30) NOT NULL DEFAULT 'Lokales',
        title VARCHAR(200) NOT NULL,
        text TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_pn_city (city_id, id),
        CONSTRAINT fk_pn_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS social_log (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        kind VARCHAR(12) NOT NULL,
        from_user INT UNSIGNED NOT NULL,
        to_user INT UNSIGNED NOT NULL,
        amount BIGINT NOT NULL DEFAULT 0,
        ref VARCHAR(60) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_sl_from (from_user, kind, created_at),
        KEY idx_sl_to (to_user, kind, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS reports (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        reporter INT UNSIGNED NOT NULL,
        target_user INT UNSIGNED NULL,
        kind VARCHAR(12) NOT NULL,
        ref_id INT UNSIGNED NULL,
        reason VARCHAR(300) NOT NULL DEFAULT '',
        status ENUM('open','done') NOT NULL DEFAULT 'open',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_rep_status (status, id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ],
  },
  {
    id: '006_bonds',
    up: [
      'ALTER TABLE player_stats ADD COLUMN pkey VARCHAR(40) NULL',
      `CREATE TABLE IF NOT EXISTS player_jobs (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        owner_id INT UNSIGNED NOT NULL,
        company_id INT NOT NULL,
        city_id INT UNSIGNED NOT NULL,
        title VARCHAR(80) NOT NULL,
        role ENUM('staff','manager') NOT NULL DEFAULT 'staff',
        wage INT NOT NULL,
        slots INT NOT NULL DEFAULT 1,
        text VARCHAR(300) NOT NULL DEFAULT '',
        status ENUM('open','closed') NOT NULL DEFAULT 'open',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_pj_city (city_id, status), KEY idx_pj_owner (owner_id),
        CONSTRAINT fk_pj_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS job_apps (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        offer_id INT UNSIGNED NOT NULL,
        user_id INT UNSIGNED NOT NULL,
        kind ENUM('apply','invite') NOT NULL DEFAULT 'apply',
        message VARCHAR(300) NOT NULL DEFAULT '',
        status ENUM('pending','accepted','rejected','withdrawn') NOT NULL DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_ja (offer_id, user_id),
        CONSTRAINT fk_ja_offer FOREIGN KEY (offer_id) REFERENCES player_jobs(id) ON DELETE CASCADE,
        CONSTRAINT fk_ja_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS employments (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        owner_id INT UNSIGNED NOT NULL,
        employee_id INT UNSIGNED NOT NULL,
        company_id INT NOT NULL,
        city_id INT UNSIGNED NOT NULL,
        offer_id INT UNSIGNED NULL,
        role ENUM('staff','manager') NOT NULL DEFAULT 'staff',
        wage INT NOT NULL,
        status ENUM('active','ended') NOT NULL DEFAULT 'active',
        synced TINYINT(1) NOT NULL DEFAULT 0,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME NULL,
        reason VARCHAR(60) NULL,
        KEY idx_em_owner (owner_id, status), KEY idx_em_emp (employee_id, status),
        CONSTRAINT fk_em_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_em_emp FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS pending_credits (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        real_amount DOUBLE NOT NULL,
        reason VARCHAR(40) NOT NULL DEFAULT '',
        text VARCHAR(200) NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_pc_user (user_id),
        CONSTRAINT fk_pc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS couples (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_a INT UNSIGNED NOT NULL,
        user_b INT UNSIGNED NOT NULL,
        initiator INT UNSIGNED NOT NULL,
        status ENUM('request','dating','engaged','married','ended') NOT NULL DEFAULT 'request',
        engaged_by INT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        married_at DATETIME NULL,
        ended_at DATETIME NULL,
        ended_by INT UNSIGNED NULL,
        end_reason VARCHAR(30) NULL,
        KEY idx_cp_a (user_a, status), KEY idx_cp_b (user_b, status),
        CONSTRAINT fk_cp_a FOREIGN KEY (user_a) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_cp_b FOREIGN KEY (user_b) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ],
  },
  { id: '007_partnered', up: ['ALTER TABLE player_stats ADD COLUMN partnered TINYINT(1) NOT NULL DEFAULT 0'] },
  {
    // Berufswelt nach Epochen: neue Berufe 1945–2100 (INSERT IGNORE aus den Seed-Daten, damit nichts auseinanderläuft)
    id: '009_professions_era',
    up: [async (db) => {
      const { ERA_PROFESSIONS } = require('./seed-data');
      for (const p of ERA_PROFESSIONS) {
        await db.query(
          'INSERT IGNORE INTO professions (pkey, name, category, icon, era_from, era_to, base_wage, training_days, tuition_day, academic, replaces, lodging, unlocks, description) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', p,
        );
      }
    }],
  },
  { id: '010_roles', up: ["ALTER TABLE users MODIFY role ENUM('player','moderator','coadmin','admin') NOT NULL DEFAULT 'player'"] },
  { id: '011_places', up: ['ALTER TABLE cities ADD COLUMN pop INT NOT NULL DEFAULT 0', 'ALTER TABLE cities ADD COLUMN since SMALLINT NOT NULL DEFAULT 1945', async (db) => { const n = (await db.query('SELECT COUNT(*) n FROM cities'))[0].n; if (n > 0) await require('./places').seed(db); }] },
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
    for (const sql of m.up) { if (typeof sql === 'function') await sql(db); else await db.query(sql); }
    await db.query('INSERT INTO schema_migrations (id) VALUES (?)', [m.id]);
    applied++;
  }
  return applied;
}

module.exports = { migrate, MIGRATIONS };

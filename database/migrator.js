const fs = require('fs').promises;
const path = require('path');
const db = require('./db');

const QUIET = process.env.NODE_ENV === 'test' && process.env.LOG_VERBOSE !== '1';

class Migrator {
  constructor() {
    this.migrationsPath = path.join(__dirname, 'migrations');
  }

  async ensureMigrationsTable() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS _sqlx_migrations (
        version bigint NOT NULL,
        description text NOT NULL,
        installed_on timestamp with time zone NOT NULL DEFAULT now(),
        success boolean NOT NULL,
        checksum bytea NOT NULL,
        execution_time bigint NOT NULL,
        CONSTRAINT _sqlx_migrations_pkey PRIMARY KEY (version)
      )
    `);
  }

  async getAppliedMigrations() {
    const result = await db.query(
      'SELECT version FROM _sqlx_migrations WHERE success = true ORDER BY version'
    );
    return result.rows.map(row => parseInt(row.version));
  }

  async getMigrationFiles() {
    try {
      const files = await fs.readdir(this.migrationsPath);
      return files
        .filter(file => file.endsWith('.sql'))
        .map(file => {
          const match = file.match(/^(\d+)_(.+)\.sql$/);
          if (!match) return null;
          return {
            version: parseInt(match[1]),
            description: match[2].replace(/_/g, ' '),
            filename: file,
            filepath: path.join(this.migrationsPath, file)
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.version - b.version);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.info('Creating migrations directory...');
        await fs.mkdir(this.migrationsPath, { recursive: true });
        return [];
      }
      throw error;
    }
  }

  async applyMigration(migration) {
    const startTime = Date.now();
    console.info(`Applying migration ${migration.version}: ${migration.description}`);

    try {
      const sql = await fs.readFile(migration.filepath, 'utf8');
      const checksum = Buffer.from(require('crypto').createHash('sha256').update(sql).digest('hex'), 'hex');

      await db.transaction(async (client) => {
        // Execute the migration
        await client.query(sql);

        // Record the migration. UPSERT so a prior failed attempt (which leaves
        // a success=false row for this version) doesn't wedge the retry with a
        // duplicate-key error on the primary key.
        const executionTime = Date.now() - startTime;
        await client.query(`
          INSERT INTO _sqlx_migrations (version, description, installed_on, success, checksum, execution_time)
          VALUES ($1, $2, NOW(), true, $3, $4)
          ON CONFLICT (version) DO UPDATE SET
            description = EXCLUDED.description,
            installed_on = EXCLUDED.installed_on,
            success = EXCLUDED.success,
            checksum = EXCLUDED.checksum,
            execution_time = EXCLUDED.execution_time
        `, [migration.version, migration.description, checksum, executionTime]);
      });

      console.info(`Migration ${migration.version} applied successfully (${Date.now() - startTime}ms)`);
      return true;
    } catch (error) {
      console.error(`Migration ${migration.version} failed:`, error.message);

      // Record failed migration
      try {
        const executionTime = Date.now() - startTime;
        await db.query(`
          INSERT INTO _sqlx_migrations (version, description, installed_on, success, checksum, execution_time)
          VALUES ($1, $2, NOW(), false, $3, $4)
          ON CONFLICT (version) DO UPDATE SET
            description = EXCLUDED.description,
            installed_on = EXCLUDED.installed_on,
            success = EXCLUDED.success,
            checksum = EXCLUDED.checksum,
            execution_time = EXCLUDED.execution_time
        `, [migration.version, migration.description, Buffer.alloc(0), executionTime]);
      } catch (recordError) {
        console.error('Failed to record migration failure:', recordError.message);
      }

      throw error;
    }
  }

  async migrate() {
    await this.ensureMigrationsTable();

    const appliedMigrations = await this.getAppliedMigrations();
    const migrationFiles = await this.getMigrationFiles();

    const pendingMigrations = migrationFiles.filter(
      migration => !appliedMigrations.includes(migration.version)
    );

    if (pendingMigrations.length === 0) {
      if (!QUIET) console.info('Database is up to date');
      return;
    }

    console.info(`Applying ${pendingMigrations.length} pending migration(s)`);
    for (const migration of pendingMigrations) {
      await this.applyMigration(migration);
    }
    console.info('All migrations completed successfully');
  }

  async status() {
    await this.ensureMigrationsTable();

    const appliedMigrations = await this.getAppliedMigrations();
    const migrationFiles = await this.getMigrationFiles();

    console.info('\nMigration Status:');
    console.info('==================');

    if (migrationFiles.length === 0) {
      console.info('No migration files found');
      return;
    }

    for (const migration of migrationFiles) {
      const status = appliedMigrations.includes(migration.version) ? 'Applied' : 'Pending';
      console.info(`${status} - ${migration.version}_${migration.description}`);
    }

    const pendingCount = migrationFiles.filter(m => !appliedMigrations.includes(m.version)).length;
    console.info(`\nTotal: ${migrationFiles.length} migrations, ${pendingCount} pending\n`);
  }
}

module.exports = new Migrator();
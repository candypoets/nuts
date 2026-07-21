import { env } from '$env/dynamic/private';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

let instance: Database.Database | undefined;

export function appDatabase() {
	if (instance) return instance;

	const path = resolve(env.APP_DATABASE_PATH || '.data/nuts.db');
	mkdirSync(dirname(path), { recursive: true });
	instance = new Database(path);
	instance.pragma('journal_mode = WAL');
	instance.pragma('foreign_keys = ON');
	instance.pragma('busy_timeout = 5000');
	instance.exec(`
		CREATE TABLE IF NOT EXISTS community_stripe_accounts (
			community TEXT PRIMARY KEY,
			stripe_account_id TEXT NOT NULL UNIQUE,
			created_by TEXT NOT NULL,
			created_at TEXT NOT NULL
		)
	`);

	return instance;
}

import { env } from '$env/dynamic/private';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { appDatabase } from './database';
import Stripe from 'stripe';

export type CommunityStripeConnection = {
	accountId: string;
	community: string;
	createdAt: string;
	createdBy: string;
};

type StripeState = { communities: Record<string, CommunityStripeConnection> };

let client: Stripe | undefined;
let legacyImport: Promise<void> | undefined;

export function stripeClient() {
	if (!env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not configured');
	client ||= new Stripe(env.STRIPE_SECRET_KEY);
	return client;
}

export function stripePublishableKey() {
	return env.PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
}

async function importLegacyState() {
	legacyImport ||= (async () => {
		try {
			const path = resolve(env.STRIPE_STATE_PATH || '.data/stripe-connect.json');
			const state = JSON.parse(await readFile(path, 'utf8')) as StripeState;
			const insert = appDatabase().prepare(`
				INSERT OR IGNORE INTO community_stripe_accounts
					(community, stripe_account_id, created_by, created_at)
				VALUES (@community, @accountId, @createdBy, @createdAt)
			`);
			const importConnections = appDatabase().transaction(
				(connections: CommunityStripeConnection[]) => {
					for (const connection of connections) insert.run(connection);
				}
			);
			importConnections(Object.values(state.communities || {}));
		} catch (cause) {
			if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
		}
	})();
	await legacyImport;
}

export async function getStripeConnection(community: string) {
	await importLegacyState();
	const row = appDatabase()
		.prepare(
			`SELECT community, stripe_account_id, created_by, created_at
			 FROM community_stripe_accounts WHERE community = ?`
		)
		.get(community) as
		| { community: string; stripe_account_id: string; created_by: string; created_at: string }
		| undefined;
	if (!row) return undefined;
	return {
		accountId: row.stripe_account_id,
		community: row.community,
		createdBy: row.created_by,
		createdAt: row.created_at
	};
}

export async function saveStripeConnection(connection: CommunityStripeConnection) {
	await importLegacyState();
	appDatabase()
		.prepare(
			`INSERT INTO community_stripe_accounts
				(community, stripe_account_id, created_by, created_at)
			 VALUES (@community, @accountId, @createdBy, @createdAt)
			 ON CONFLICT(community) DO UPDATE SET
				stripe_account_id = excluded.stripe_account_id,
				created_by = excluded.created_by,
				created_at = excluded.created_at`
		)
		.run(connection);
}

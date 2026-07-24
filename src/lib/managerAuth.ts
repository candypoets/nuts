import { getManager } from '@candypoets/nipworker';

export type ManagerAuthDetail = {
	pubkey?: string | null;
	hasSigner?: boolean;
	secretKey?: unknown;
};

type SignerPayload = string | { url: string; clientSecret: string } | undefined;

function waitForAuth(
	expectedPubkey: string,
	requestAuth: () => void,
	timeoutMs = 10_000
): Promise<ManagerAuthDetail> {
	const manager = getManager();

	return new Promise((resolve, reject) => {
		const timeout = window.setTimeout(() => {
			manager.removeEventListener('auth', handleAuth);
			reject(new Error('Timed out while waiting for the account signer'));
		}, timeoutMs);

		function finish() {
			window.clearTimeout(timeout);
			manager.removeEventListener('auth', handleAuth);
		}

		function handleAuth(event: Event) {
			const detail = (event as CustomEvent<ManagerAuthDetail>).detail;
			if (!detail.pubkey) {
				finish();
				reject(new Error('The account signer could not be selected'));
				return;
			}
			if (detail.pubkey !== expectedPubkey) return;

			finish();
			resolve(detail);
		}

		manager.addEventListener('auth', handleAuth);
		try {
			requestAuth();
		} catch (error) {
			finish();
			reject(error);
		}
	});
}

export function setSignerAndWait(
	type: string,
	payload: SignerPayload,
	expectedPubkey: string
): Promise<ManagerAuthDetail> {
	const manager = getManager();
	return waitForAuth(expectedPubkey, () => manager.setSigner(type, payload));
}

export function switchAccountAndWait(pubkey: string): Promise<ManagerAuthDetail> {
	const manager = getManager();
	return waitForAuth(pubkey, () => manager.switchAccount(pubkey));
}

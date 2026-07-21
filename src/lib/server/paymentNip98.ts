import { env } from '$env/dynamic/private';
import { finalizeEvent } from 'nostr-tools/pure';
import { createHash } from 'node:crypto';

function paymentSecretKey() {
	const value = env.NUTS_PAYMENT_SERVICE_SECRET_KEY || '';
	if (!/^[a-f0-9]{64}$/i.test(value)) {
		throw new Error('NUTS_PAYMENT_SERVICE_SECRET_KEY is not configured');
	}
	return Uint8Array.from(Buffer.from(value, 'hex'));
}

export function paymentServiceAuthorization(url: string, body: string) {
	const event = finalizeEvent(
		{
			kind: 27235,
			created_at: Math.floor(Date.now() / 1000),
			content: '',
			tags: [
				['u', url],
				['method', 'POST'],
				['payload', createHash('sha256').update(body).digest('hex')]
			]
		},
		paymentSecretKey()
	);
	return `Nostr ${Buffer.from(JSON.stringify(event)).toString('base64url')}`;
}

const PAYMENT_SERVICE_BASE_URL = (
	import.meta.env.VITE_PAYMENT_SERVICE_URL || 'https://payments.nuts.cash'
).replace(/\/$/, '');

export function paymentServiceUrl(path: string) {
	return new URL(path, `${PAYMENT_SERVICE_BASE_URL}/`).toString();
}

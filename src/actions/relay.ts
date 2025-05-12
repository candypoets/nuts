export const checkNostrRelay = (url: string): Promise<boolean> => {
	return new Promise((resolve) => {
		const ws = new WebSocket(url);

		ws.onopen = () => {
			const subscriptionMessage = JSON.stringify([
				'REQ',
				'test_subscription',
				{
					kinds: [1],
					limit: 1
				}
			]);

			ws.send(subscriptionMessage);
		};

		ws.onmessage = (event) => {
			try {
				const message = JSON.parse(event.data);
				if (Array.isArray(message) && message[0] === 'EVENT') {
					resolve(true);
				} else {
					resolve(false);
				}
			} catch {
				resolve(false);
			}
			ws.close();
		};

		ws.onerror = () => {
			resolve(false);
		};

		setTimeout(() => {
			ws.close();
			resolve(false);
		}, 5000);
	});
};

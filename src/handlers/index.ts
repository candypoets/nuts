import { nostrDb, refreshCache as refreshCacheFromDb } from 'src/db';
import type { ParsedEvent } from 'src/workers/nipworker';

export type WorkerMessageKind =
	| 'CACHED_EVENTS'
	| 'FETCH_EVENTS'
	| 'EOSE'
	| 'ERROR'
	| 'UNSUBSCRIBED';

export type WorkerMessage<T> = {
	type: WorkerMessageKind;
	error?: string;
	data?: T[];
	eose?: boolean;
};

export async function* handler<T, R = ParsedEvent<T>>(
	worker: Worker,
	refreshCache: boolean = true,
	parse?: (e: ParsedEvent<T>) => R
): AsyncGenerator<R, void, unknown> {
	const parser = parse || ((e) => e as unknown as R);
	const messageQueue: R[] = [];
	let waitingResolve: ((value: IteratorResult<R>) => void) | null = null;

	// Create a promise that resolves when the next message arrives
	const nextMessagePromise = () =>
		new Promise<IteratorResult<R>>((resolve) => {
			if (messageQueue.length > 0) {
				// If we already have messages queued, resolve immediately
				const nextEvent = messageQueue.shift()!;
				resolve({ done: false, value: nextEvent });
			} else {
				// Otherwise, save the resolver to be called when a message arrives
				waitingResolve = resolve;
			}
		});

	worker.onmessage = (e: MessageEvent<WorkerMessage<ParsedEvent<T>>>) => {
		const { type, data = [], error } = e.data;

		if (error) {
			console.error(error);
			return;
		}

		switch (type) {
			case 'CACHED_EVENTS':
				// Process initial events from cache
				for (const event of data) {
					try {
						handleNewEvent({ type, ...parser(event) });
					} catch (e) {
						console.warn('Invalid data', e);
					}
				}
				break;

			case 'FETCH_EVENTS':
				// Process batch of new events
				for (const event of data) {
					try {
						handleNewEvent({ type, ...parser(event) });
					} catch (e) {
						console.warn('Invalid data', e);
					}
				}
				break;

			case 'EOSE':
				// handleNewEvent({ type } as R);
				// refresh db cache
				if (refreshCache) {
					nostrDb.then((db) => db && refreshCacheFromDb(db));
				}
				handleNewEvent({ type });
				// Update UI to show we've received all stored events
				break;
		}
	};
	function handleNewEvent(parsedEvent: R) {
		if (waitingResolve) {
			// If someone is waiting for the next event, resolve their promise
			waitingResolve({ done: false, value: parsedEvent });
			waitingResolve = null;
		} else {
			// Otherwise, add to queue for future retrieval
			messageQueue.push(parsedEvent);
		}
	}

	// Yield events as they come in
	try {
		while (true) {
			const result = await nextMessagePromise();
			yield result.value as ParsedEvent<T>;
		}
	} finally {
		// Clean up when the generator is terminated
		worker.onmessage = null;
	}
}

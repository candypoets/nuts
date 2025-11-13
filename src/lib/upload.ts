import { finalizeEvent, type EventTemplate } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';
import { key } from 'src/controller/key';
import { get } from 'svelte/store';
import { useSignEvent } from '@candypoets/nipworker/hooks';

export async function uploadFile(file: File): Promise<string> {
	return new Promise(async (resolve, reject) => {
		try {
			// Create the file hash for the payload tag
			const fileBuffer = await file.arrayBuffer();
			const fileHash = await crypto.subtle.digest('SHA-256', fileBuffer);
			const fileHashHex = Array.from(new Uint8Array(fileHash))
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('');

			// Create the NIP-98 authorization event
			const authEvent: EventTemplate = {
				kind: 27235,
				content: '',
				created_at: Math.floor(Date.now() / 1000),
				tags: [
					['u', 'https://nostr.build/api/v2/nip96/upload'],
					['method', 'POST'],
					['payload', fileHashHex]
				]
			};

			useSignEvent(authEvent, async (signedAuthEvent) => {
				try {
					// Create the Authorization header
					const authHeader = 'Nostr ' + btoa(JSON.stringify(signedAuthEvent));

					// Create FormData for upload
					const formData = new FormData();
					formData.append('file', file);

					// Upload to nostr.build with authorization
					const response = await fetch('https://nostr.build/api/v2/nip96/upload', {
						method: 'POST',
						headers: {
							Authorization: authHeader
						},
						body: formData
					});

					if (!response.ok) {
						throw new Error(`Upload failed: ${response.status}`);
					}

					const result = await response.json();
					const imageUrl =
						result.nip94_event?.tags?.find((tag) => tag[0] === 'url')?.[1] || result.url;

					console.log(imageUrl);
					resolve(imageUrl);
				} catch (error) {
					reject(error);
				}
			});
		} catch (error) {
			reject(error);
		}
	});
}

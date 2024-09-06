interface Contact {
	pubkey: string;
	name?: string;
	picture?: string;
	about?: string;
	nip05?: string;
	createdAt?: number; // unix timestamp
}

export type { Contact };

interface Contact {
	pubkey: string;
	name: string;
	picture?: string;
	about?: string;
	createdAt: number; // unix timestamp
}

export type { Contact };

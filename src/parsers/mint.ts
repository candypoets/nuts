type Nut4Method = {
	method: string;
	unit: string;
	min_amount: number;
	max_amount: number;
	description?: boolean;
};

type Nut5Method = {
	method: string;
	unit: string;
	min_amount: number;
	max_amount: number;
};

type Nut17Method = {
	method: string;
	unit: string;
	commands: string[];
};

type Nut19Endpoint = {
	method: string;
	path: string;
};

type MintInfoNuts = {
	'4'?: {
		methods: Nut4Method[];
		disabled: boolean;
	};
	'5'?: {
		methods: Nut5Method[];
		disabled: boolean;
	};
	'7'?: {
		supported: boolean;
	};
	'8'?: {
		supported: boolean;
	};
	'9'?: {
		supported: boolean;
	};
	'10'?: {
		supported: boolean;
	};
	'11'?: {
		supported: boolean;
	};
	'12'?: {
		supported: boolean;
	};
	'14'?: {
		supported: boolean;
	};
	'17'?: {
		supported: Nut17Method[];
	};
	'19'?: {
		cached_endpoints: Nut19Endpoint[];
		ttl: number;
	};
	'20'?: {
		supported: boolean;
	};
	[key: string]: any;
};

type MintInfo = {
	name: string;
	pubkey: string;
	version: string;
	description: string;
	description_long: string | null;
	contact: any[];
	motd: string | null;
	icon_url: string;
	time: number;
	nuts: MintInfoNuts;
};

export type Mint = {
	id: number;
	url: string;
	info: string;
	parsedInfo: MintInfo;
	name: string;
	balance: number;
	sum_donations: number;
	updated_at: string;
	next_update: string;
	state: string;
	n_errors: number;
	n_mints: number;
	n_melts: number;
};

// Zero-dependency random name generator utilities.
// Works in browser (crypto.getRandomValues) and Node 18+ (globalThis.crypto).
// Falls back to Math.random when crypto isn't available.

const hasCrypto = typeof globalThis !== 'undefined' && !!globalThis.crypto?.getRandomValues;

function randomUint32(): number {
	if (hasCrypto) {
		const arr = new Uint32Array(1);
		globalThis.crypto.getRandomValues(arr);
		return arr[0]!;
	}
	// Fallback (not cryptographically secure)
	return Math.floor(Math.random() * 0xffffffff);
}

// Unbiased integer in [0, max)
function randomInt(max: number): number {
	if (max <= 0) throw new Error('max must be > 0');
	const limit = Math.floor(0x100000000 / max) * max; // 2^32 rounded down to multiple of max
	let x = randomUint32();
	while (x >= limit) x = randomUint32();
	return x % max;
}

function pick<T>(arr: T[]): T {
	return arr[randomInt(arr.length)];
}

function pad(n: number, digits = 4) {
	return n.toString().padStart(digits, '0');
}

// Small default dictionaries (extend as you like)
const ADJECTIVES = [
	'brave',
	'calm',
	'clever',
	'eager',
	'fancy',
	'gentle',
	'happy',
	'jolly',
	'kind',
	'lucky',
	'merry',
	'noble',
	'proud',
	'quick',
	'royal',
	'smart',
	'sunny',
	'swift',
	'tidy',
	'vivid',
	'witty',
	'zany',
	'bold',
	'chill',
	'cosmic',
	'dapper',
	'fuzzy',
	'glossy',
	'lucid',
	'plucky',
	'snappy',
	'spry'
];

const ANIMALS = [
	'otter',
	'lynx',
	'falcon',
	'panda',
	'cougar',
	'badger',
	'eagle',
	'tiger',
	'walrus',
	'yak',
	'koala',
	'lemur',
	'orca',
	'phoenix',
	'quokka',
	'raven',
	'seal',
	'viper',
	'whale',
	'yeti',
	'zebra',
	'bison',
	'crane',
	'ibis',
	'mamba',
	'newt',
	'owl',
	'puffin',
	'shrike',
	'stoat',
	'tern',
	'urchin'
];

const FIRST_NAMES = [
	'Ava',
	'Liam',
	'Mia',
	'Noah',
	'Emma',
	'Oliver',
	'Sophia',
	'Elijah',
	'Isabella',
	'Lucas',
	'Amelia',
	'Mateo',
	'Harper',
	'Levi',
	'Evelyn',
	'Ethan',
	'Luna',
	'James',
	'Aria',
	'Benjamin',
	'Nora',
	'Logan',
	'Scarlett'
];

const LAST_NAMES = [
	'Smith',
	'Johnson',
	'Taylor',
	'Brown',
	'Davis',
	'Miller',
	'Wilson',
	'Moore',
	'Anderson',
	'Thomas',
	'Jackson',
	'White',
	'Harris',
	'Martin',
	'Thompson',
	'Garcia',
	'Martinez',
	'Robinson',
	'Clark',
	'Rodriguez'
];

export type HaikuOptions = {
	separator?: string;
	withNumber?: boolean | number; // true => 4 digits, number => digits count
	words1?: string[];
	words2?: string[];
	capitalize?: boolean;
};

export function haikuName(opts: HaikuOptions = {}): string {
	const {
		separator = '-',
		withNumber = false,
		words1 = ADJECTIVES,
		words2 = ANIMALS,
		capitalize = false
	} = opts;

	let a = pick(words1);
	let b = pick(words2);
	if (capitalize) {
		a = a.charAt(0).toUpperCase() + a.slice(1);
		b = b.charAt(0).toUpperCase() + b.slice(1);
	}

	let out = [a, b].join(separator);
	if (withNumber) {
		const digits = typeof withNumber === 'number' ? withNumber : 4;
		out += separator + pad(randomInt(10 ** digits), digits);
	}
	return out;
}

export type HumanNameOptions = {
	firstNames?: string[];
	lastNames?: string[];
	separator?: string;
};

export function humanName(opts: HumanNameOptions = {}): string {
	const { firstNames = FIRST_NAMES, lastNames = LAST_NAMES, separator = ' ' } = opts;
	return [pick(firstNames), pick(lastNames)].join(separator);
}

export type SlugNameOptions = {
	separator?: string;
	entropy?: number; // number of base-36 chars
	adjectives?: string[];
	nouns?: string[];
};

export function slugName(opts: SlugNameOptions = {}): string {
	const { separator = '-', entropy = 5, adjectives = ADJECTIVES, nouns = ANIMALS } = opts;
	const base = [pick(adjectives), pick(nouns)].join(separator);
	// base36 entropy segment
	let e = '';
	for (let i = 0; i < entropy; i++) {
		e += randomInt(36).toString(36);
	}
	return `${base}${separator}${e}`;
}

export type PronounceableOptions = {
	min?: number;
	max?: number;
	startWithVowel?: boolean;
};

const CONSONANTS = 'bcdfghjklmnpqrstvwxyz'.split('');
const VOWELS = 'aeiou'.split('');

// Simple pronounceable generator using alternating consonant/vowel patterns.
export function pronounceable(opts: PronounceableOptions = {}): string {
	const { min = 5, max = 8, startWithVowel = false } = opts;
	const len = min === max ? min : min + randomInt(max - min + 1);
	let useVowel = startWithVowel;
	let out = '';
	for (let i = 0; i < len; i++) {
		const pool = useVowel ? VOWELS : CONSONANTS;
		out += pick(pool);
		useVowel = !useVowel;
	}
	// Capitalize for a nicer proper-noun feel
	return out.charAt(0).toUpperCase() + out.slice(1);
}

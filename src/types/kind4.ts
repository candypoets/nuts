import type { ContentBlock } from 'src/workers/utils';

export type Kind4Parsed = {
	parsedContent?: ContentBlock[];
	decryptedContent?: string;
	chatID: string;
	recipient: string;
};

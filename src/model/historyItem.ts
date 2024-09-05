interface HistoryItem<HistoryData> {
	type: HistoryItemType;
	date: number;
	amount: number;
	data: HistoryData;
}

enum HistoryItemType {
	SEND,
	RECEIVE,
	RECEIVE_NOSTR,
	MINT,
	MELT,
	RECEIVE_OFFLINE,
	CHANGE
}

export type { HistoryItem };

export { HistoryItemType };

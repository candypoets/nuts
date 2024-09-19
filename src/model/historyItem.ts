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
	CHANGE,
	RECEIVE_NUTZAP,
	SEND_NUTZAP
}

export type { HistoryItem };

export { HistoryItemType };

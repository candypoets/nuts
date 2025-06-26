import { isKind1, type AnyKind, isKind7, isKind6 } from 'src/types';
import type { Request } from 'src/model/nostr-main';
import type { ParsedEvent } from 'src/types';
import { formatDistanceToNow } from 'date-fns';

export function formatTime(timestamp: number): string {
	return formatDistanceToNow(new Date(timestamp * 1000), { addSuffix: true });
}

// Define interfaces for notification group structure
interface NotificationGroup {
	type: 'reply' | 'reaction' | 'repost' | 'mention';
	referencedPostId: string;
	timestamp: number;
	events: ParsedEvent<AnyKind>[];
	context: ParsedEvent<AnyKind>[];
	requests: Request[];
}

export interface ProcessedNotification extends ParsedEvent<any> {
	id: string;
	type: 'reply' | 'reaction' | 'repost' | 'mention';
	kind: 383838;
	tags: [];
	content: '';
	timestamp: number;
	parsed: NotificationGroup;
}

export function processNotifications(
	feed: [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][]
): [ProcessedNotification, ParsedEvent<AnyKind>[]][] {
	// Clone feed to avoid mutation issues
	const processedFeed = [...feed];

	// Group by notification types and referenced posts
	const notificationGroups: Record<string, NotificationGroup> = {};
	for (const [event, context] of processedFeed) {
		if (!event) continue;

		// Determine notification type and referenced post id
		let notificationType: 'reply' | 'reaction' | 'repost' | 'mention' | undefined;
		let referencedPostId: string | undefined;
		if ('type' in event && event.kind === 383838 && (event as any).parsed?.type) {
			// This is already a ProcessedNotification, just add it directly to the result
			// Don't reprocess it to avoid nesting

			// Extract the referencedPostId for grouping
			const processedNotification = event as ProcessedNotification;
			const key = `${processedNotification.type}-${processedNotification.parsed.referencedPostId}`;

			// If this group already exists, merge the events and context
			if (notificationGroups[key]) {
				// Merge events
				notificationGroups[key].events = [
					...notificationGroups[key].events,
					...processedNotification.parsed.events
				];

				// Merge context
				notificationGroups[key].context = [...notificationGroups[key].context, ...context];

				// Update timestamp if needed
				if (processedNotification.timestamp > notificationGroups[key].timestamp) {
					notificationGroups[key].timestamp = processedNotification.timestamp;
				}
			} else {
				// Create a new group with the processed data
				notificationGroups[key] = {
					type: processedNotification.type,
					referencedPostId: processedNotification.parsed.referencedPostId,
					timestamp: processedNotification.timestamp,
					events: [...processedNotification.parsed.events],
					requests: processedNotification.parsed.requests,
					context: [...context]
				};
			}

			// Skip the rest of the processing for this item
			continue;
		} else if (isKind1(event) && event.parsed?.reply?.id) {
			if (event.parsed?.quotes?.length) {
				notificationType = 'mention';
				referencedPostId = 'mention-' + event.id;
			} else {
				// This is a reply
				notificationType = 'reply';
				referencedPostId = event.parsed.reply.id;
			}
		} else if (isKind7(event)) {
			// This is a reaction
			notificationType = 'reaction';
			referencedPostId = event.parsed?.eventId;
		} else if (isKind6(event)) {
			// This is a repost
			notificationType = 'repost';
			referencedPostId = event.parsed?.[0]?.id;
		} else if (isKind1(event) && event.parsed?.content?.includes($key?.pub)) {
			// This is a mention
			notificationType = 'mention';
			referencedPostId = 'mention-' + event.id;
		}

		if (notificationType && referencedPostId) {
			// Create a group key
			const groupKey = `${notificationType}-${referencedPostId}`;

			if (!notificationGroups[groupKey]) {
				notificationGroups[groupKey] = {
					type: notificationType,
					referencedPostId: referencedPostId,
					timestamp: event.created_at,
					events: [],
					context: context,
					requests: event.requests || []
				};
			}

			// Keep track of most recent timestamp
			if (event.created_at > notificationGroups[groupKey].timestamp) {
				notificationGroups[groupKey].timestamp = event.created_at;
			}

			// Add event to the group
			notificationGroups[groupKey].events.push(event);

			// Add context for this notification
			if (context && context.length) {
				notificationGroups[groupKey].context = [
					...notificationGroups[groupKey].context,
					...context
				];
			}

			// Add requests for this notification
			if (event.requests && event.requests.length) {
				notificationGroups[groupKey].requests = [
					...(notificationGroups[groupKey].requests || []),
					...event.requests
				];
			}

			// Find the original post this notification refers to
			// if (!notificationGroups[groupKey].originalPost) {
			// 	if (notificationType === 'mention') {
			// 		notificationGroups[groupKey].originalPost = event;
			// 	} else {
			// 		const originalPost = context.find((c) => c.id === referencedPostId);
			// 		if (originalPost) {
			// 			notificationGroups[groupKey].originalPost = originalPost;
			// 		}
			// 	}
			// }
		}
	}

	// Convert groups to array and sort by timestamp (newest first)
	return Object.values(notificationGroups)
		.sort((a, b) => b.timestamp - a.timestamp)
		.map((group, index): [ProcessedNotification, ParsedEvent<AnyKind>[]] => {
			// Create a ProcessedNotification object that satisfies the interface
			const processedNotification: ProcessedNotification = {
				id: `notification-${index}`,
				type: group.type,
				pubkey: '', // Required by ParsedEvent
				sig: '', // Required by ParsedEvent
				created_at: group.timestamp,
				kind: 383838, // Custom kind for notifications
				tags: [],
				content: '',
				timestamp: group.timestamp,
				parsed: {
					type: group.type,
					referencedPostId: group.referencedPostId,
					timestamp: group.timestamp,
					events: group.events,
					context: group.context,
					requests: group.requests || []
				}
			};

			return [processedNotification, group.context];
		});
}

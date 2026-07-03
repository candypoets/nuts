import {
	Kind1Parsed,
	Kind6Parsed,
	ParsedData,
	type ParsedEvent,
	type RequestObject
} from '@candypoets/nipworker';
import { asKind1, asKind6, asKind7, fbArray } from '@candypoets/nipworker/utils';
import { formatDistanceToNow } from 'date-fns';
import { key } from 'src/controller';
import { toRequestObject } from 'src/lib/request';
import { get } from 'svelte/store';

export function formatTime(timestamp: number): string {
	return formatDistanceToNow(new Date(timestamp * 1000), { addSuffix: true });
}

// Define interfaces for notification group structure
interface NotificationGroup {
	type: 'reply' | 'reaction' | 'repost' | 'mention';
	referencedPostId: string;
	timestamp: number;
	events: ParsedEvent[];
	context: ParsedEvent[];
	requests: RequestObject[];
}

export interface ProcessedNotification {
	id: () => { fnv1aHash: () => string };
	type: 'reply' | 'reaction' | 'repost' | 'mention';
	parsedType: () => 100;
	kind: () => 383838;
	createdAt: () => number;
	tags: [];
	content: '';
	timestamp: number;
	parsed: NotificationGroup;
}

export function processNotifications(feed: ParsedEvent[]): ProcessedNotification[] {
	// Clone feed to avoid mutation issues
	const processedFeed = [...feed];

	// Group by notification types and referenced posts
	const notificationGroups: Record<string, NotificationGroup> = {};
	for (const event of processedFeed) {
		if (!event) continue;

		// Determine notification type and referenced post id
		let notificationType: 'reply' | 'reaction' | 'repost' | 'mention' | undefined;
		let referencedPostId: string | undefined;
		if ('type' in event && event.kind() === 383838 && (event as any).parsed?.type) {
			// This is already a ProcessedNotification, just add it directly to the result
			// Don't reprocess it to avoid nesting

			// Extract the referencedPostId for grouping
			const processedNotification = event as unknown as ProcessedNotification;
			const key = `${processedNotification.type}-${processedNotification.parsed.referencedPostId}`;

			// If this group already exists, merge the events and context
			if (notificationGroups[key]) {
				// Merge events
				notificationGroups[key].events = [
					...notificationGroups[key].events,
					...processedNotification.parsed.events
				];

				// Merge context
				notificationGroups[key].context = [...notificationGroups[key].context];

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
					context: []
				};
			}

			// Skip the rest of the processing for this item
			continue;
		} else {
			switch (event.parsedType()) {
				case ParsedData.Kind1Parsed:
					const kind1 = asKind1(event) as Kind1Parsed;
					// Check for mention first (highest priority - it's about the user's own content)
					const isMention = fbArray(kind1, 'profileMentions')?.some(
						(m) => m.publicKey() == get(key)?.pub
					);
					if (isMention) {
						notificationType = 'mention';
						referencedPostId = 'mention-' + event.id?.();
						break; // Break early - mention is the primary type
					}
					// Check for reply (with quote detection)
					const replyId = kind1.reply()?.id();
					if (replyId) {
						if (kind1?.eventRefsLength()) {
							notificationType = 'mention';
							referencedPostId = 'mention-' + event.id?.();
						} else {
							// This is a reply - use the replied-to post as reference
							notificationType = 'reply';
							referencedPostId = replyId;
						}
					}
					break;
				case ParsedData.Kind7Parsed:
					const kind7 = asKind7(event);
					notificationType = 'reaction';
					referencedPostId = kind7?.eventId() || undefined;
					break;
				case ParsedData.Kind6Parsed:
					const kind6 = asKind6(event) as Kind6Parsed;
					notificationType = 'repost';
					referencedPostId = kind6.repostedEvent()?.id() || undefined;
					break;
			}
		}

		if (notificationType && referencedPostId) {
			// Create a group key
			const groupKey = `${notificationType}-${referencedPostId}`;

			if (!notificationGroups[groupKey]) {
				notificationGroups[groupKey] = {
					type: notificationType,
					referencedPostId: referencedPostId,
					timestamp: event.createdAt(),
					events: [],
					context: [],
					requests: fbArray(event, 'requests').map(toRequestObject) || []
				};
			}

			// Keep track of most recent timestamp
			if (event.createdAt() > notificationGroups[groupKey].timestamp) {
				notificationGroups[groupKey].timestamp = event.createdAt();
			}

			// Add event to the group
			notificationGroups[groupKey].events.push(event);

			// // Add context for this notification
			// if (context && context.length) {
			// 	notificationGroups[groupKey].context = [
			// 		...notificationGroups[groupKey].context,
			// 		...context
			// 	];
			// }

			// Add requests for this notification
			if (event.requests && event.requests.length) {
				notificationGroups[groupKey].requests = [
					...(notificationGroups[groupKey].requests || []),
					...fbArray(event, 'requests').map(toRequestObject)
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
	return Object.entries(notificationGroups)
		.sort(([, a], [, b]) => b.timestamp - a.timestamp)
		.map(([groupKey, group]): ProcessedNotification => {
			// Create a ProcessedNotification object that satisfies the interface
			const processedNotification: ProcessedNotification = {
				// Use stable identity based on type + referenced post id.
				id: () => ({ fnv1aHash: () => `notification-${groupKey}` }),
				type: group.type,
				createdAt: () => group.timestamp,
				kind: () => 383838, // Custom kind for notifications
				parsedType: () => 100,
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

			return processedNotification;
		});
}

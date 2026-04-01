<script lang="ts">
	import { asKind1111, fbArray } from '@candypoets/nipworker/utils';
	import type { ParsedEvent, Kind1111Parsed } from '@candypoets/nipworker';
	import User from 'src/routes/explore/user.svelte';
	import Avatar from 'src/routes/explore/avatar.svelte';

	interface CommentNode {
		event: ParsedEvent;
		children: CommentNode[];
		depth: number;
	}

	export let node: CommentNode;

	$: kind1111 = asKind1111(node.event) as Kind1111Parsed | null;
	$: pubkey = node.event.pubkey();
	$: content = kind1111 ? fbArray(kind1111, 'parsedContent') : [];

	function formatTime(timestamp: number): string {
		const date = new Date(timestamp * 1000);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'just now';
		if (diffMins < 60) return `${diffMins}m`;
		if (diffHours < 24) return `${diffHours}h`;
		if (diffDays < 7) return `${diffDays}d`;
		return date.toLocaleDateString();
	}

	// Helper to render content blocks as simple text
	function renderContentBlock(block: any): string {
		if (!block) return '';
		const text = block.text?.() || '';
		const dataType = block.dataType?.();
		
		// For text blocks, return the text
		if (block.type?.() === 'text' || !dataType) {
			return text;
		}
		// For other types (links, mentions, etc), return the raw text
		return text;
	}
</script>

<div class="flex gap-2 items-start" style="margin-left: {node.depth * 24}px">
	<Avatar {pubkey} size="sm" />
	<div class="flex-1 min-w-0">
		<div class="flex items-center gap-2 mb-1">
			<User {pubkey} link={false} />
			<span class="text-xs text-base-content/50">
				{formatTime(node.event.createdAt())}
			</span>
		</div>
		{#if content && content.length > 0}
			<div class="text-sm break-words text-base-content">
				{#each content as block}
					{renderContentBlock(block)}
				{/each}
			</div>
		{/if}
	</div>
</div>

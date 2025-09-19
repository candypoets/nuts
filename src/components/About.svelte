<script lang="ts">
	import type { ContentBlock } from 'src/lib';

	import User from 'src/routes/explore/user.svelte';

	export let content: ContentBlock[];
	export let depth = 0;
</script>

<div class={'text-sm text-wrap whitespace-normal break-words relative' + ($$props.class || '')}>
	{#each content as parsed, index}
		{#if parsed.type == 'text'}
			{@const text = parsed.text || ''}
			<!-- {#if !isImageUrl(part.content)} -->
			<span class="break-words text-white"
				>{@html (index == 0
					? text?.trimStart()
					: index == content.length - 1
						? text?.trimEnd()
						: text
				).replace(/\n/g, '<br>')}</span
			>
		{:else if parsed.type == 'link'}
			{@const preview = parsed.data}
			<a
				class="text-accent hover:underline"
				on:click|stopPropagation
				href={preview?.href || ''}
				target="_blank"
				rel="noopener noreferrer"
			>
				{parsed.text}
			</a>
		{:else if parsed.type == 'hashtag'}
			{@const hashtag = parsed.text}
			<a class="font-semibold text-primary" href={'/search/' + hashtag}>{parsed.text}</a>
		{:else if parsed.type == 'nprofile' || parsed.type == 'npub' || parsed.type == 'naddr'}
			{@const p = parsed.data?.decoded}
			{#if p.pubkey}
				<User pubkey={p.pubkey} />
			{/if}
		{/if}
	{/each}

	<!-- <div class="w-full" on:click={(e) => e.stopPropagation()">
		{#each previews.filter((p) => p?.images?.length) as preview}

		{/each}
	</div> -->
</div>

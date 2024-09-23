<script lang="ts">
	import { type Note } from 'src/stores/db';
	import Header from './header.svelte';
	import Content from './content.svelte';
	import Footer from './footer.svelte';

	export let selectedReply: Note;

	export let note: Note;

	export let full: boolean = false;
	export let visible: boolean = false;
</script>

{#if full}
	<div>
		<div class="px-2">
			<Header {note} oneline={false} />
			<Content content={note.content} />
		</div>
		<Footer {note} visible />
		<div class="border-b">
			<div class="text-gray-500 mb-2 text-lg mt-4 text-right px-4">
				{new Date(note.created_at * 1000).toLocaleString()}
			</div>
		</div>
	</div>
{:else}
	<div>
		<Header {note} />
		<div class="flex gap-2">
			<div class="min-w-8" />
			<div class="flex-grow">
				<div
					class="flex gap-2"
					on:click={() => {
						console.log('reply clicked');
						selectedReply = note;
					}}
				>
					<!-- <div class="min-w-8" /> -->
					<div class="text-sm break-words overflow-hidden">
						<Content content={note.content} />
					</div>
				</div>
				<Footer {note} {visible} />
			</div>
		</div>
	</div>
{/if}

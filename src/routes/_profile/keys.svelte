<script lang="ts">
	import Icon from '@iconify/svelte';
	import { db } from 'src/stores/db';
	import { nostrPrivKey, nostrPubKey, profile } from 'src/stores/nostr';
	import { eventMap } from 'src/stores/nuts';
	export let subopen: boolean = false;
	import { Drawer } from 'vaul-svelte';

	let copied = '';

	function copyToClipboard(value: string) {
		navigator.clipboard.writeText(value).then(() => {
			copied = value;
			setTimeout(() => (copied = ''), 2000); // Reset after 2 seconds
		});
	}
</script>

<Drawer.NestedRoot bind:open={subopen}>
	<!-- <Drawer.Trigger /> -->
	<Drawer.Portal>
		<Drawer.Overlay class="absolute inset-0 bg-black/40" />
		<Drawer.Content
			class="pb-8 pt-3 bg-basic absolute top-4 left-0 right-0 p-4 h-screen"
			style="height: 95vh;"
		>
			<div class="flex justify-between mb-12">
				<div class="w-1/4" on:click={() => (subopen = false)}>
					<Icon icon="iconamoon:arrow-down-2-light" class="w-6 h-6" />
				</div>
				<h2 class="font-bold text-xl">Keys</h2>
				<div class="w-1/4"></div>
			</div>
			<div class="">Your public key</div>
			<div class="flex p-4 bg-base-200 my-4 rounded-lg items-center">
				<div class="w-1/5">
					<img src={$profile.picture || '/ns-naked.svg'} class="w-10 h-10 border-2 rounded-full" />
				</div>
				<div class="text-wrap whitespace-normal break-words w-4/5 text-xs">{$nostrPubKey}</div>
			</div>
			<button class="btn btn-primary w-full" on:click={() => copyToClipboard($nostrPubKey)}>
				{#if copied != $nostrPubKey}
					<Icon icon="clarity:paste-line" />Copy public key
				{:else}
					<Icon icon="clarity:check-line" />Copied
				{/if}
			</button>
			<div class="text-xs mt-4">
				Anyone on Nostr can find you via your public key. Feel free to share it with others.
			</div>
			<div class="mt-8">Your private key</div>
			<div class="flex p-4 bg-base-200 my-4 rounded-lg items-center">
				<div class="w-1/5">
					<Icon icon="mdi:key-variant" class="w-10 h-10 text-warning" />
				</div>
				<div class="text-wrap whitespace-normal break-words w-4/5 text-xs">
					{'•'.repeat($nostrPrivKey.length)}
				</div>
			</div>
			<button class="btn btn-warning w-full" on:click={() => copyToClipboard($nostrPrivKey)}>
				{#if copied != $nostrPrivKey}
					<Icon icon="clarity:paste-line" />Copy private key
				{:else}
					<Icon icon="clarity:check-line" />Copied
				{/if}
			</button>
			<div class="text-xs mt-4 text-warning">
				Warning: Keep your private key secret. Anyone with your private key can access your account.
			</div>
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.NestedRoot>

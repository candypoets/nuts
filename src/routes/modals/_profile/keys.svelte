<script lang="ts">
	import Icon from '@iconify/svelte';
	import { getContext } from 'svelte';
	import { key, kind0 } from 'src/controller';
	export let subopen: boolean = false;

	let animator = getContext('animator');
	let copied = '';

	function copyToClipboard(value: string) {
		navigator.clipboard.writeText(value).then(() => {
			copied = value;
			setTimeout(() => (copied = ''), 2000); // Reset after 2 seconds
		});
	}
</script>

<div class="h-full bg-base-300 bg-opacity-85 pt-4">
	<div class="flex justify-between mb-12 px-4">
		<div class="w-1/4" on:click={animator.goBack}>
			<Icon icon="iconamoon:arrow-down-2-light" class="w-6 h-6" />
		</div>
		<h2 class="font-bold text-xl">Keys</h2>
		<div class="w-1/4"></div>
	</div>
	<div class="px-4">
		<div class="">Your public key</div>
		<div class="flex p-4 bg-base-200 my-4 rounded-lg items-center">
			<div class="w-1/5">
				<img
					src={$kind0?.parsed?.picture || '/ns-naked.svg'}
					class="w-10 h-10 border-2 rounded-full"
				/>
			</div>
			<div class="text-wrap whitespace-normal break-words w-4/5 text-xs">{$key?.pub || ''}</div>
		</div>
		<button class="btn btn-primary w-full" on:click={() => copyToClipboard($key?.pub || '')}>
			{#if copied != $key?.pub}
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
				{'•'.repeat($key?.priv?.length || 0)}
			</div>
		</div>
		<button class="btn btn-warning w-full" on:click={() => copyToClipboard($key?.nsec || '')}>
			{#if copied != $key?.nsec}
				<Icon icon="clarity:paste-line" />Copy private key
			{:else}
				<Icon icon="clarity:check-line" />Copied
			{/if}
		</button>
		<div class="text-xs mt-4 text-warning">
			Warning: Keep your private key secret. Anyone with your private key can access your account.
		</div>
	</div>
</div>

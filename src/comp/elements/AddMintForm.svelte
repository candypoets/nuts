<script lang="ts">
	import { addMint } from 'src/actions/mint';

	let mintURL = '';
	let isLoading = false;
</script>

<form on:submit|preventDefault={addMint}>
	<div class="flex join">
		<input
			autofocus
			id="mint-url-input"
			type="text"
			placeholder="mint URL..."
			bind:value={mintURL}
			class=" join-item input w-full input-primary col-span-4"
		/>

		{#if isLoading}
			<button class="w-32 btn join-item btn-disabled h-full z-20 flex gap-2 items-center">
				<div class="loading"></div>
			</button>
		{:else}
			<input
				type="submit"
				class="w-32 z-0 btn join-item {mintURL
					? 'btn-primary'
					: 'btn-disabled'} h-full z-20 flex gap-2 items-center"
				value="Add mint"
			/>
		{/if}
	</div>
</form>

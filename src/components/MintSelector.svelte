<script lang="ts">
	import Icon from '@iconify/svelte';
	import { mints, balanceByMint, activeMintUrl, mint } from 'src/controller/wallet';
	import Mintcard from 'src/routes/home/components/mintcard.svelte';
</script>

<button class="dropdown dropdown-bottom w-full my-2">
	<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
	<!-- svelte-ignore a11y-label-has-associated-control -->
	<label tabindex="0" class="join-item w-full">
		{#await $mint then m}
			<div class="flex items-center gap-1 w-full px-4">
				<!-- <div> -->
				<Icon icon="mdi:chevron-down" class="w-6 h-6 text-gray-400" />
				<!-- </div> -->
				<Mintcard mint={m} size="sm" />
				<!-- <p class="max-w-xs text-xs flex-grow">
					{m?.name ?? '----'}
				</p> -->
			</div>
		{/await}
	</label>

	<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
	<ul
		tabindex="0"
		class="z-10 dropdown-content menu py-2 shadow bg-base-100 rounded-box md:w-72 max-h-56 overflow-scroll flex-row scrollbar-hide w-full"
	>
		{#await $mints then mintsArray}
			{#each mintsArray as m}
				<li on:click={() => ($activeMintUrl = m.url)} class="rounded-xl w-full">
					<div class="flex gap-1 items-center w-full">
						{#if m.url === $activeMintUrl}
							<div class="rounded-full bg-success w-4 h-4 p-0.5">
								<Icon class="text-white" icon="mdi:check" width="100%" height="100%"></Icon>
							</div>
						{:else}
							<div class="w-4 h-4" />
						{/if}
						<a class="flex-grow text-xs">{m.name}</a>
						<div class="flex gap-1 items-center w-20 justify-end">
							<p class="font-bold">
								{$balanceByMint[m.url] || 0}
							</p>
						</div>
					</div>
				</li>
			{/each}
		{/await}
	</ul>
</button>

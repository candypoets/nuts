<script lang="ts">
	import Icon from '@iconify/svelte';
	import { isMobile, key, kind10019, kind17375 } from 'src/controller';
	import { nutsWallet } from 'src/controller/proofs';
	import { activeMintUrl } from 'src/controller/wallet';
	import { normalizeMintURL } from 'src/lib/utils';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import User from 'src/routes/explore/user.svelte';
	import Mintcard from 'src/routes/home/components/mintcard.svelte';

	export let pubkey: string = '';
	export let chevron = 'left';

	export let mints: string[] = [];
	export let activeMint;

	$: console.log('activeMint', activeMint);
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<!-- svelte-ignore a11y-label-has-associated-control -->
<div class="flex items-center gap-1 w-full md:px-4">
	<!-- <div> -->
	<!-- {#if chevron == 'left'}
				<Icon icon="mdi:chevron-down" class="w-6 h-6 text-gray-400 hidden md:block" />
			{/if} -->
	<!-- </div> -->
	<button class="dropdown dropdown-bottom my-auto mx-auto h-16">
		<label tabindex="0" class="join-item w-full">
			<Mintcard
				mintUrl={activeMint}
				size={$isMobile ? 'xs' : 'sm'}
				showBalance={pubkey == $key?.pub}
				{pubkey}
			/>
			<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
			<ul
				tabindex="0"
				class="z-10 dropdown-content mt-2 w-full py-2 rounded-box max-h-56 overflow-scroll flex-row scrollbar-hide"
			>
				{#each mints || [] as m}
					{@const mintUrl = normalizeMintURL(m)}
					<li class="mb-1 cursor-pointer" on:click={(_) => (activeMint = mintUrl)}>
						<Mintcard size={'xs'} showBalance={pubkey == $key?.pub} {mintUrl} />
					</li>
				{/each}
			</ul>
		</label>
	</button>
</div>

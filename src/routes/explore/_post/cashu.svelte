<script lang="ts">
	import { getDecodedToken, type Token } from '@cashu/cashu-ts';

	export let cashu: string;

	let token: Token = getDecodedToken(cashu);
</script>

{#each token.token.filter((t) => t.proofs.length) as t}
	<div class="bg-base-200 bg-opacity-50 rounded-lg mb-2 p-2 block">
		<strong class="text-lg">🥜</strong>
		<strong class="text-lg">{t.proofs.reduce((acc, p) => (acc += p.amount), 0)} Sats</strong>
		<p class="text-xs">{t.mint}</p>
	</div>
{/each}

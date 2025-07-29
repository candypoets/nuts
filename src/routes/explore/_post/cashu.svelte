<script lang="ts">
	import { getDecodedToken, type Token } from '@cashu/cashu-ts';

	export let cashu: string;

	let token: Token;
	try {
		token = getDecodedToken(cashu);
	} catch (e) {}
</script>

{#if token}
	<div class="bg-base-200 bg-opacity-50 rounded-lg mb-2 p-2 block">
		<strong class="text-lg">🥜</strong>
		<strong class="text-lg">{token?.proofs.reduce((acc, p) => (acc += p.amount), 0)} Sats</strong>
		<p class="text-xs">{token?.mint}</p>
	</div>
{/if}

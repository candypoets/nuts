<script lang="ts">
	import { viewport } from 'src/lib';
	import Ecash from 'src/routes/modals/ecash.svelte';
	import Lightning from 'src/routes/modals/lightning.svelte';
	import Melt from 'src/routes/modals/melt.svelte';
	import QR from 'src/routes/modals/qr.svelte';
	import Profile from 'src/routes/modals/_profile/index.svelte';
	import Send from 'src/routes/modals/send.svelte';
	import Tapcash from 'src/routes/modals/tapcash.svelte';
	import Topup from 'src/routes/modals/topup.svelte';
	import Minting from 'src/routes/modals/minting.svelte';
	import Scan from 'src/routes/modals/scan.svelte';
	import Keys from 'src/routes/modals/_profile/keys.svelte';
	import Zaps from 'src/routes/modals/_profile/zaps.svelte';
	import Wallet from 'src/routes/modals/_profile/wallet.svelte';
	import Relays from 'src/routes/modals/_profile/relays.svelte';
	import Logout from 'src/routes/modals/_profile/logout.svelte';

	import { cubicOut, elasticOut } from 'svelte/easing';
	import { tweened } from 'svelte/motion';
	import { fly } from 'svelte/transition';
	import { goBack } from './modal';

	export let path: string;
	export let visible: boolean;
	export let depth: number = 0;

	let element: HTMLElement;

	// Create a tweened store for the depth-based translation
	const depthTranslation = tweened(0, {
		duration: 400,
		easing: cubicOut
	});

	const depthScale = tweened(1, {
		duration: 400,
		easing: cubicOut
	});

	const depthOpacity = tweened(1, {
		duration: 400,
		easing: cubicOut
	});

	// Update the tweened value when depth changes
	$: depthTranslation.set(depth * 30); // 10px per depth level (adjust as needed)
	$: depthScale.set(Math.max(0.85, 1 - depth * 0.05)); // Reduce scale by 5% per depth level, min 85%
	$: depthOpacity.set(Math.max(0.3, 1 - depth * 0.3)); // Reduce opacity by 20% per depth level, min 50%
</script>

<div
	class="absolute right-0 top-0 h-screen z-20"
	bind:this={element}
	on:click|stopPropagation={goBack}
	style="width: {$viewport.vw * 100}px;"
	in:fly={{ y: $viewport.vh * 100, duration: 400, opacity: 1, easing: cubicOut }}
	out:fly={{ y: $viewport.vh * 100, duration: 300, opacity: 1, easing: cubicOut }}
>
	<div
		class="m-auto relative overflow-hidden w-feed h-full"
		style="transform: translateY({-$depthTranslation}px) scale({$depthScale});"
		on:click|stopPropagation
	>
		{#if path.includes('receive')}
			<Topup {visible} />
		{:else if path.includes('send')}
			<Send {visible} />
		{:else if path.includes('scan')}
			<Scan {visible} />
		{:else if path.includes('qr')}
			<QR {visible} />
		{:else if path.includes('ecash')}
			<Ecash pubkey={path.split(':')?.[1]} {visible} />
		{:else if path.includes('lightning')}
			<Lightning invoice={path.split(':')?.[1]} {visible} />
		{:else if path.includes('minting')}
			<Minting {visible} />
		{:else if path.includes('melt')}
			<Melt invoice={path.split(':')?.[1]} {visible} />
		{:else if path.includes('tapcash')}
			<Tapcash {visible} />
		{:else if path.includes('profile')}
			<Profile {visible} />
		{:else if path.includes('zaps')}
			<Zaps {visible} />
		{:else if path.includes('keys')}
			<Keys {visible} />
		{:else if path.includes('wallet')}
			<Wallet {visible} />
		{:else if path.includes('relays')}
			<Relays {visible} />
		{:else if path.includes('logout')}
			<Logout {visible} />
		{/if}
	</div>
</div>

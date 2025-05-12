<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Icon from '@iconify/svelte';
	import { writable, type Writable } from 'svelte/store';

	let showMenu = false;
	let scrollY: Writable<number> = writable(0);

	// onMount(() => {
	// 	const unsubscribe = scrollY.subscribe((value) => {
	// 		if (value > 50) {
	// 			document.body.classList.add('scrolled');
	// 		} else {
	// 			document.body.classList.remove('scrolled');
	// 		}
	// 	});

	// 	return unsubscribe;
	// });

	function toggleMenu() {
		showMenu = !showMenu;
	}

	let progress = 0;

	// let items: HistoryItem<HistoryData>[] = [
	// 	{
	// 		type: HistoryItemType.SEND,
	// 		date: Math.floor(Date.now() / 1000) - 86400,
	// 		amount: 50,
	// 		data: { to: '49c3f0ee826a80010c75a66a3e2fb75324302a6969ad62f1e557a6b6dc667777' }
	// 	},
	// 	{
	// 		type: HistoryItemType.SEND,
	// 		date: Math.floor(Date.now() / 1000) - 86400,
	// 		amount: 50,
	// 		data: { to: '49c3f0ee826a80010c75a66a3e2fb75324302a6969ad62f1e557a6b6dc667777' }
	// 	},
	// 	{
	// 		type: HistoryItemType.RECEIVE_NOSTR,
	// 		date: new Date().setDate(new Date().getDate() - 1) / 1000,
	// 		amount: 50,
	// 		data: { from: '6a72db8ef3f3b9ee5ecd808ed6d0631d1e4dda5c5dadf07887104d33957eba48' }
	// 	}
	// ];
</script>

<svelte:window bind:scrollY={$scrollY} />

<main class="bg-white text-gray-800 min-h-screen">
	<!-- Header -->
	<header
		class="fixed w-full z-50 transition-all duration-300"
		class:bg-white={$scrollY > 50}
		class:shadow-md={$scrollY > 50}
	>
		<div class="w-4/5 mx-auto px-4 py-4 flex justify-center items-center mt-4">
			<!-- <p class="font-semibold">Nuts.cash</p> -->
			<img src="/label.svg" alt="Nuts.cash" class="h-20" />
			<!-- <button on:click={toggleMenu} class="md:hidden">
				<svg
					class="w-6 h-6"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 6h16M4 12h16m-7 6h7"
					></path>
				</svg>
			</button> -->
		</div>
	</header>

	<!-- Hero Section -->

	<section class="pt-32 pb-20 w-4/5 m-auto">
		<div
			class="w-full flex gap-8 lg:flex-row lg:h-full items-center justify-between flex-col-reverse"
		>
			<div class="flex flex-col items-start w-full gap-1">
				<h1 class="text-4xl md:text-6xl font-bold mb-2 text-primary">
					Your nuts are
					<p class="break-normal">in the Nostr.</p>
					<p></p>
				</h1>
				<p class="text-xl md:text-lg my-8 text-gray-600 lg:w-1/2 w-full">
					Nuts.Cash is an ecash wallet that saves your proofs in the Nostr Relays.
					<br /><br />
					Send ecash to your friends or zap notes and much more.
					<br /><br />
					If you have a Nostr account, you can use it to login to Nuts.Cash and access your nuts.
				</p>
				<!-- <div class="flex space-x-4"> -->
				<a href="/home" class="btn btn-primary lg:btn-wide w-full"> Open App </a>
				<!-- </div> -->
			</div>
			<div class="w-1/2 h-screen fixed right-0 top-0 bg-primary-content hidden lg:block" />
			<div
				class="border-4 border-black bg-basic py-4 px-2 lg:mt-36 overflow-visible lg:h-auto
			lg:w-auto w-64 m-auto"
				style="border-radius: 2.5rem; transform: skewX({-30 *
					Math.max(0, 1 - 8 * progress)}deg) skewY({30 *
					Math.max(0, 1 - 8 * progress)}deg) rotateX({-30 *
					Math.max(0, 1 - 8 * progress)}deg) rotateY({30 * Math.max(0, 1 - 8 * progress)}deg)
			translateX(-{100 * Math.min(0, 1 - 8 * progress)}px)"
			>
				<div class="bg-black rounded-full h-5 w-2/5 mx-auto" />

				<div class="w-5/6 p-4 bg-primary-content rounded-xl py-4 mt-2">
					<div class="flex w-full justify-between items-center">
						<div class="text-lg font-semibold">Dr Calle</div>
						<div>
							<Icon icon="mdi:reload" class="text-2xl " />
						</div>
					</div>

					<strong class="text-2xl"> 5038 Sats </strong>
				</div>

				<div class="center-content">
					<div class="w-full">
						<div class="flex flex-col h-full">
							<div class="w-full" style="transform: translate(-100px, -50px);">
								<strong class="text-sm px-4 pt-4">Today</strong>
								<div class="mx-4 mt-2 rounded-lg border mb-4">
									<table class="table w-64">
										<tbody class="max-h-1 overflow-y-scroll scrollbar-hide bg-basic">
											<!-- {#each items.slice(0, -1) as item}
												<Row {item} />
											{/each} -->
											<!-- svelte-ignore a11y-click-events-have-key-events -->
										</tbody>
									</table>
								</div>
								<div style="transform: translate(-100px, 0);">
									<strong class="text-sm px-4 pt-4">Yesterday</strong>
									<div class="mx-4 mt-2 rounded-lg border mb-4">
										<table class="table w-64">
											<tbody class="max-h-1 overflow-y-scroll scrollbar-hide bg-basic">
												<!-- {#each items.slice(-1) as item}
													<Row {item} />
												{/each} -->
											</tbody>
										</table>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
				<div style="transform: translate(-00px, 0);">
					<div class="btm-nav rounded-lg bg-transparent backdrop-blur-xl" id="footer">
						<a
							class:text-primary={$page.route?.id?.startsWith('/home')}
							href={'/home'}
							on:click|preventDefault={() => goto('/home')}
						>
							<Icon icon="mdi:home" class="text-3xl" />
							<span class="btm-nav-label text-xs">Home</span>
						</a>
						<a
							class:text-primary={$page.route?.id?.startsWith('/explore')}
							href={'/explore'}
							on:click|preventDefault={() => goto('/explore')}
						>
							<Icon icon="mdi:map-outline" class="text-3xl" />
							<span class="btm-nav-label text-xs">Explore</span>
						</a>
						<!-- <a
						class:text-primary={$page.route?.id?.startsWith('/earn')}
						href={'/earn'}
						on:click|preventDefault={() => goto('/earn')}
					>
						<Icon icon="mdi:chart-line" class="text-3xl" />
						<span class="btm-nav-label text-xs">Earn</span>
					</a> -->
						<a
							class:text-primary={$page.route?.id?.startsWith('/chat')}
							href={'/chat'}
							on:click|preventDefault={() => goto('/chat')}
						>
							<Icon icon="material-symbols:chat-outline" class="text-3xl" />
							<span class="btm-nav-label text-xs">Chat</span>
						</a>
					</div>
				</div>
				<div class="h-1 rounded-full bg-black w-1/4 m-auto mt-0" />
			</div>
		</div>
	</section>
</main>

<style>
	/* Any additional custom styles can go here */
</style>

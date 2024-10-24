<script lang="ts">
	import Icon from '@iconify/svelte';
	import Row from 'src/routes/home/transactions/Row.svelte';
	import { type HistoryData } from 'src/model/data/HistoryData';
	import { type HistoryItem, HistoryItemType } from 'src/model/historyItem';
	import { writable, type Writable } from 'svelte/store';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

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

	let items: HistoryItem<HistoryData>[] = [
		{
			type: HistoryItemType.SEND,
			date: Math.floor(Date.now() / 1000) - 86400,
			amount: 50,
			data: { to: '49c3f0ee826a80010c75a66a3e2fb75324302a6969ad62f1e557a6b6dc667777' }
		},
		{
			type: HistoryItemType.SEND,
			date: Math.floor(Date.now() / 1000) - 86400,
			amount: 50,
			data: { to: '49c3f0ee826a80010c75a66a3e2fb75324302a6969ad62f1e557a6b6dc667777' }
		},
		{
			type: HistoryItemType.RECEIVE_NOSTR,
			date: new Date().setDate(new Date().getDate() - 1) / 1000,
			amount: 50,
			data: { from: '6a72db8ef3f3b9ee5ecd808ed6d0631d1e4dda5c5dadf07887104d33957eba48' }
		}
	];
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
											{#each items.slice(0, -1) as item}
												<Row {item} />
											{/each}
											<!-- svelte-ignore a11y-click-events-have-key-events -->
										</tbody>
									</table>
								</div>
								<div style="transform: translate(-100px, 0);">
									<strong class="text-sm px-4 pt-4">Yesterday</strong>
									<div class="mx-4 mt-2 rounded-lg border mb-4">
										<table class="table w-64">
											<tbody class="max-h-1 overflow-y-scroll scrollbar-hide bg-basic">
												{#each items.slice(-1) as item}
													<Row {item} />
												{/each}
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

	<!-- Mission Section -->

	<!-- <section id="mission" class="py-20 px-4">
		<div class="flex flex-col w-full md:flex-row gap-16 px-8 md:px-32 pb-16">
			<div class="flex flex-col gap-4 w-full h-full bg-gray-100 rounded-lg px-4 py-4">
				<p>
					1. Send Sats to anyone you are friend with on Nostr. Search for a name and send in
					milliseconds.
				</p>
				<div class="w-full h-full rounded-lg bg-white overflow-hidden">
					<img class="object-cover" src="/screenshot_nuts.png" alt="screen1" />
				</div>
			</div>
			<div class="flex flex-col gap-4 w-full h-full bg-gray-100 rounded-lg px-4 py-4">
				<p>
					2. Share a QR code or a @username and get paid on a restaurant bill or anything else in a
					breeze.
				</p>
				<div class="w-full h-full rounded-lg bg-white overflow-hidden">
					<img class="object-cover" src="/screenshot_nuts.png" alt="screen1" />
				</div>
			</div>
			<div class="flex flex-col gap-4 w-full h-full bg-gray-100 rounded-lg px-4 py-4">
				<p>
					3. Add Sats to your wallet from any lightning wallet in milliseconds and without any
					wallet address.
				</p>
				<div class="w-full h-full rounded-lg bg-white overflow-hidden">
					<img class="object-cover" src="/screenshot_nuts.png" alt="screen1" />
				</div>
			</div>
		</div>
		<div class="container h-screen mx-auto place-content-center">
			<h2 class="text-xl md:text-5xl font-bold mb-8 text-center text-teal-800">Our Mission</h2>
			<p class="text-md max-w-3xl mx-auto text-center text-gray-600">
				We believe in a world where people and small businesses can trade freely, with
				micro-payments without unnecessary restrictions or surveillance.
			</p>
		</div>
	</section> -->

	<!-- Features Section -->
	<!-- <section id="features" class="py-20 px-4 bg-teal-50">
		<div class="container mx-auto">
			<h2 class="text-3xl md:text-5xl font-bold mb-12 text-center text-teal-800">Key Features</h2>
			<div class="grid grid-cols-1 md:grid-cols-3 gap-8">
				<div class="text-center">
					<svg
						class="w-10 h-10 mx-auto mb-4 text-teal-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
						></path>
					</svg>
					<h3 class="text-xl font-semibold mb-2 text-gray-800">Privacy First</h3>
					<p class="text-gray-600">Your data stays on your device, encrypted and secure.</p>
				</div>
				<div class="text-center">
					<svg
						class="w-10 h-10 mx-auto mb-4 text-teal-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
						></path>
					</svg>
					<h3 class="text-xl font-semibold mb-2 text-gray-800">Peer-to-Peer</h3>
					<p class="text-gray-600">Connect directly with other users, no intermediaries.</p>
				</div>
				<div class="text-center">
					<svg
						class="w-10 h-10 mx-auto mb-4 text-teal-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
						></path>
					</svg>
					<h3 class="text-xl font-semibold mb-2 text-gray-800">Free to Use</h3>
					<p class="text-gray-600">No fees, no commissions. Trade freely without costs.</p>
				</div>
			</div>
		</div>
	</section> -->

	<!-- Download Section -->

	<!-- <section id="download" class="py-20 px-4 bg-white items-center">
		<div class="container mx-auto text-center">
			<h2 class="text-lg md:text-2xl font-bold mb-8 text-teal-900">Join the free world.</h2>
			<p class="text-lg w-full">
				Start paying and being paid in Sats in a wallet you control not a wallet that controls you.
				We are operating on top of Nostr with feeds you control that can never be shut. And it works
				with any Nostr client across the web.
			</p>
		</div>
	</section> -->

	<!-- Footer -->
	<!-- <footer class="bg-white py-4">
		<div class="container mx-auto px-4 text-center text-gray-300">
			<p>&copy; 2024 Cash Nuts. All rights reserved.</p>
		</div>
	</footer> -->
</main>

<style>
	/* Any additional custom styles can go here */
</style>

<script lang="ts">
	import { onMount } from 'svelte';
	import { writable, type Writable } from 'svelte/store';
	import screenshot from '/Users/abdoughariani/Nuts/nuts-cash/assets/screenshot_nuts.png';

	let showMenu = false;
	let scrollY: Writable<number> = writable(0);

	onMount(() => {
		const unsubscribe = scrollY.subscribe((value) => {
			if (value > 50) {
				document.body.classList.add('scrolled');
			} else {
				document.body.classList.remove('scrolled');
			}
		});

		return unsubscribe;
	});

	function toggleMenu() {
		showMenu = !showMenu;
	}
</script>

<svelte:window bind:scrollY={$scrollY} />

<main class="bg-white text-gray-800 min-h-screen">
	<!-- Header -->
	<header
		class="fixed w-full z-50 transition-all duration-300"
		class:bg-white={$scrollY > 50}
		class:shadow-md={$scrollY > 50}
	>
		<div class="container mx-auto px-4 py-4 flex justify-between items-center">
			<p class="font-semibold">CashNuts</p>
			<button on:click={toggleMenu} class="md:hidden">
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
			</button>
			<nav class="hidden md:flex space-x-8 text-sm">
				<a href="#mission" class="text-gray-600 hover:text-gray-900">Mission</a>
				<a href="#features" class="text-gray-600 hover:text-gray-900">Features</a>
				<a href="#download" class="text-gray-600 hover:text-gray-900">Download</a>
			</nav>
			<div class="flex space-x-4">
				<a
					href="#"
					class="bg-teal-500 text-white py-3 px-8 rounded-full font-bold hover:bg-blue-700 transition duration-300"
				>
					Open App
				</a>
			</div>
		</div>
	</header>

	<!-- Mobile Menu -->
	{#if showMenu}
		<div class="fixed inset-0 bg-white z-40 p-4">
			<div class="flex justify-end">
				<button on:click={toggleMenu} class="text-gray-800">
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
							d="M6 18L18 6M6 6l12 12"
						></path>
					</svg>
				</button>
			</div>
			<nav class="flex flex-col items-center space-y-4 mt-8">
				<a href="#mission" class="text-2xl text-gray-800" on:click={toggleMenu}>Mission</a>
				<a href="#features" class="text-2xl text-gray-800" on:click={toggleMenu}>Features</a>
				<a href="#download" class="text-2xl text-gray-800" on:click={toggleMenu}>Download</a>
			</nav>
		</div>
	{/if}

	<!-- Hero Section -->

	<section class="w-full pt-32 pb-20 px-8 md:px-32">
		<div class="w-full flex flex-col gap-8 lg:flex-row lg:h-full items-center justify-between">
			<div class="flex flex-col items-start w-full gap-1">
				<h1 class="text-4xl md:text-6xl font-bold mb-2 text-teal-500">
					Your nuts are
					<p class="break-normal">in the Nostr.</p>
					<p></p>
				</h1>
				<p class="text-xl md:text-lg mb-8 max-w-xl text-gray-600">
					Your Nostr wallet to send, receive and pay friends with Sats in total privacy.
				</p>
				<div class="flex space-x-4">
					<a
						href="#"
						class="bg-teal-500 text-white py-3 px-8 rounded-full font-bold hover:bg-blue-700 transition duration-300"
					>
						Open App
					</a>
				</div>
			</div>
			<div class="w-full rounded-lg bg-blue-50">
				<img class="w-full h-full object-cover" src={screenshot} alt="screen1" />
			</div>
		</div>
	</section>

	<!-- Mission Section -->

	<section id="mission" class="py-20 px-4">
		<div class="flex flex-col w-full md:flex-row gap-16 px-8 md:px-32 pb-16">
			<div class="flex flex-col gap-4 w-full h-full bg-gray-100 rounded-lg px-4 py-4">
				<p>
					1. Send Sats to anyone you are friend with on Nostr. Search for a name and send in
					milliseconds.
				</p>
				<div class="w-full h-full rounded-lg bg-white overflow-hidden">
					<img class="object-cover" src={screenshot} alt="screen1" />
				</div>
			</div>
			<div class="flex flex-col gap-4 w-full h-full bg-gray-100 rounded-lg px-4 py-4">
				<p>
					2. Share a QR code or a @username and get paid on a restaurant bill or anything else in a
					breeze.
				</p>
				<div class="w-full h-full rounded-lg bg-white overflow-hidden">
					<img class="object-cover" src={screenshot} alt="screen1" />
				</div>
			</div>
			<div class="flex flex-col gap-4 w-full h-full bg-gray-100 rounded-lg px-4 py-4">
				<p>
					3. Add Sats to your wallet from any lightning wallet in milliseconds and without any
					wallet address.
				</p>
				<div class="w-full h-full rounded-lg bg-white overflow-hidden">
					<img class="object-cover" src={screenshot} alt="screen1" />
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
	</section>

	<!-- Features Section -->
	<section id="features" class="py-20 px-4 bg-teal-50">
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
	</section>

	<!-- Download Section -->

	<section id="download" class="py-20 px-4 bg-white items-center">
		<div class="container mx-auto text-center">
			<h2 class="text-lg md:text-2xl font-bold mb-8 text-teal-900">Join the free world.</h2>
			<p class="text-lg w-full">
				Start paying and being paid in Sats in a wallet you control not a wallet that controls you.
				We are operating on top of Nostr with feeds you control that can never be shut. And it works
				with any Nostr client across the web.
			</p>
		</div>
	</section>

	<!-- Footer -->
	<footer class="bg-white py-4">
		<div class="container mx-auto px-4 text-center text-gray-300">
			<p>&copy; 2024 Cash Nuts. All rights reserved.</p>
		</div>
	</footer>
</main>

<style>
	/* Any additional custom styles can go here */
</style>

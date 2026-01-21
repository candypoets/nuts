<script lang="ts">
	import { goto } from '$app/navigation';
	import LoginForm from 'src/components/LoginForm.svelte';
	import Nutscash from 'src/components/Nutscash.svelte';

	let extensionError = false;

	$: {
		if (extensionError) {
			setTimeout(() => {
				extensionError = false;
			}, 5000);
		}
	}
</script>

<main class="h-screen overflow-hidden bg-black bg-opacity-65 text-white flex flex-col pt-safe">
	<!-- Header -->
	<header class="flex items-center justify-between px-4 md:px-8 py-4 border-b border-white/10 flex-shrink-0">
		<div class="flex items-center gap-2">
			<Nutscash class="h-8 w-8 text-white" />
			<span class="font-semibold tracking-wide text-sm md:text-base hidden sm:inline">Nuts</span>
		</div>

		<div class="flex items-center gap-2 md:gap-3">
			<a
				href="#code"
				class="btn btn-link text-accent px-2 md:px-3 text-lg md:text-xl h-10 md:h-12 min-w-10"
				aria-label="Source code"
			>
				{'<>'}
			</a>

			<button
				on:click={() => goto('/explore')}
				class="btn btn-accent px-4 md:px-6 py-2 md:py-3 text-sm md:text-base font-medium"
			>
				Open App
			</button>
		</div>
	</header>

	<!-- Content Grid -->
	<section class="flex-1 overflow-hidden px-4 md:px-8 py-6 md:py-8">
		<div class="grid md:grid-cols-2 gap-8 md:gap-12 h-full">
			<!-- Logo & Tagline (Left) -->
			<div class="flex flex-col items-center md:items-start justify-center">
				<Nutscash class="text-white h-48 w-48 md:h-72 md:w-72" />
				<p class="mt-6 text-white/70 max-w-sm text-center md:text-left text-sm md:text-base leading-relaxed hidden sm:block">
					Private, fast, and simple. Your cash, on your terms.
				</p>
			</div>

			<!-- Login Form (Right) -->
			<div class="flex items-center justify-center h-full">
				<div class="w-full max-w-md rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-8 md:p-10">
					<h2 class="text-2xl md:text-3xl font-bold text-white mb-6">Get Started</h2>
					<LoginForm inline={true} redirect />
				</div>
			</div>
		</div>
	</section>
</main>

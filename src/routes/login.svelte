<script lang="ts">
	import { goto } from '$app/navigation';
	import LoginForm from 'src/components/LoginForm.svelte';
	import Nutscash from 'src/components/Nutscash.svelte';
	import Icon from '@iconify/svelte';

	let extensionError = false;

	$: {
		if (extensionError) {
			setTimeout(() => {
				extensionError = false;
			}, 5000);
		}
	}
</script>

<main
	class="min-h-screen bg-gradient-to-br from-black via-neutral-900 to-black text-white flex flex-col relative overflow-hidden"
>
	<!-- Animated background pattern -->
	<div class="absolute inset-0 opacity-[0.03] pointer-events-none">
		<div
			class="absolute inset-0"
			style="background-image: url('/nutscash.svg'); background-size: 120px; background-repeat: repeat; transform: rotate(-5deg) scale(1.1);"
		></div>
	</div>

	<!-- Gradient orbs for visual interest -->
	<div
		class="absolute top-20 left-10 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"
	></div>
	<div
		class="absolute bottom-20 right-10 w-80 h-80 bg-accent/10 rounded-full blur-3xl pointer-events-none"
	></div>

	<!-- Header -->
	<header
		class="relative z-10 flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4 border-b border-white/5"
	>
		<div class="flex items-center gap-3">
			<div class="relative">
				<Nutscash class="h-8 w-8 text-white" />
				<div class="absolute inset-0 bg-accent/20 blur-lg rounded-full"></div>
			</div>
			<span class="font-semibold tracking-wide text-sm sm:text-base">Nuts</span>
		</div>

		<div class="flex items-center gap-2 sm:gap-3">
			<a
				href="https://github.com/cashubtc/nuts"
				target="_blank"
				rel="noopener noreferrer"
				class="btn btn-ghost btn-sm sm:btn-md text-white/60 hover:text-white hover:bg-white/5"
				aria-label="Source code"
			>
				<Icon icon="ri:github-fill" class="text-lg sm:text-xl" />
			</a>

			<button
				on:click={() => goto('/explore')}
				class="btn btn-accent btn-sm sm:btn-md px-3 sm:px-6"
			>
				<span class="hidden sm:inline">Open App</span>
				<span class="sm:hidden">Explore</span>
			</button>
		</div>
	</header>

	<!-- Main Content -->
	<section
		class="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-8 sm:py-12"
	>
		<div class="w-full max-w-6xl mx-auto">
			<div class="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">
				<!-- Left: Logo & Tagline -->
				<div
					class="flex flex-col items-center lg:items-start text-center lg:text-left space-y-6 sm:space-y-8"
				>
					<div class="relative">
						<!-- Glow effect behind logo -->
						<div
							class="absolute inset-0 bg-gradient-to-r from-purple-600/30 via-accent/30 to-purple-600/30 blur-3xl scale-150"
						></div>
						<Nutscash
							class="relative text-white h-40 w-40 sm:h-56 sm:w-56 lg:h-72 lg:w-72 drop-shadow-2xl"
						/>
					</div>

					<div class="space-y-3 sm:space-y-4">
						<h1
							class="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight"
							style="font-family: 'Permanent Marker', cursive;"
						>
							<span
								class="bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent"
								>Nuts</span
							>
							<span class="bg-gradient-to-r from-accent to-purple-400 bg-clip-text text-transparent"
								>Cash</span
							>
						</h1>

						<p
							class="text-white/50 max-w-md mx-auto lg:mx-0 text-sm sm:text-base leading-relaxed"
							style="font-family: 'Rock Salt', cursive;"
						>
							Speak your mind.<br class="hidden sm:block" />
							Spend your way.
						</p>
					</div>

					<!-- Feature badges -->
					<div class="hidden sm:flex flex-wrap justify-center lg:justify-start gap-2 sm:gap-3 pt-2">
						<span class="badge badge-outline badge-sm border-white/10 text-white/50 gap-1">
							<Icon icon="ri:shield-check-line" />
							Private
						</span>
						<span class="badge badge-outline badge-sm border-white/10 text-white/50 gap-1">
							<Icon icon="ri:flashlight-fill" />
							Fast
						</span>
						<span class="badge badge-outline badge-sm border-white/10 text-white/50 gap-1">
							<Icon icon="ri:bitcoin-fill" />
							Ecash
						</span>
					</div>
				</div>

				<!-- Right: Login Form Card -->
				<div class="w-full max-w-md mx-auto lg:max-w-none">
					<div class="relative group">
						<!-- Card glow effect -->
						<div
							class="absolute -inset-0.5 bg-gradient-to-r from-accent/50 to-purple-600/50 rounded-2xl blur opacity-20 group-hover:opacity-30 transition duration-500"
						></div>

						<div
							class="relative rounded-2xl bg-white/[0.03] border border-white/10 p-6 sm:p-8 lg:p-10 shadow-2xl"
						>
							<div class="flex items-center gap-3 mb-6 sm:mb-8">
								<div class="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
									<Icon icon="ri:user-smile-line" class="text-xl text-accent" />
								</div>
								<div>
									<h2 class="text-xl sm:text-2xl font-bold text-white">Welcome Back</h2>
									<p class="text-white/40 text-xs sm:text-sm">Sign in with your Nostr key</p>
								</div>
							</div>

							<LoginForm inline={true} redirect />
						</div>
					</div>

					<!-- Quick links -->
					<div class="flex flex-wrap justify-center gap-4 mt-6 text-xs sm:text-sm text-white/40">
						<a href="/explore" class="hover:text-accent transition-colors flex items-center gap-1">
							<Icon icon="ri:compass-3-line" />
							Explore
						</a>
						<span class="text-white/10">|</span>
						<a
							href="https://nostr.com"
							target="_blank"
							rel="noopener noreferrer"
							class="hover:text-accent transition-colors flex items-center gap-1"
						>
							<Icon icon="ri:question-line" />
							What's Nostr?
						</a>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Footer -->
	<footer class="relative z-10 py-4 sm:py-6 border-t border-white/5">
		<div
			class="px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/30"
		>
			<div class="flex items-center gap-2">
				<Nutscash class="h-4 w-4" />
				<span>Powered by Nostr & Cashu</span>
			</div>
			<div class="flex items-center gap-4">
				<a
					href="https://github.com/cashubtc/nuts"
					target="_blank"
					rel="noopener noreferrer"
					class="hover:text-white/50 transition-colors"
				>
					<Icon icon="ri:github-fill" class="text-sm" />
				</a>
				<a
					href="https://twitter.com/cashubtc"
					target="_blank"
					rel="noopener noreferrer"
					class="hover:text-white/50 transition-colors"
				>
					<Icon icon="ri:twitter-x-fill" class="text-sm" />
				</a>
			</div>
		</div>
	</footer>
</main>

<style>
	/* Custom animations */
	@keyframes float {
		0%,
		100% {
			transform: translateY(0px);
		}
		50% {
			transform: translateY(-10px);
		}
	}

	@keyframes pulse-glow {
		0%,
		100% {
			opacity: 0.1;
		}
		50% {
			opacity: 0.2;
		}
	}

	/* Ensure full height on mobile browsers */
	:global(body) {
		min-height: 100vh;
		min-height: 100dvh;
	}
</style>

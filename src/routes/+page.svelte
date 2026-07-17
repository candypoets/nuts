<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { animate, motionValue, transform } from 'motion';
	import { resolve } from 'src/lib/paths';
	import NeighborhoodStory from 'src/components/NeighborhoodStory.svelte';
	import Nutscash from 'src/components/Nutscash.svelte';

	function openApp() {
		goto(resolve('/create'));
	}

	let heroWorld: HTMLElement;
	let bgLayer: HTMLElement;
	let midLayer: HTMLElement;
	let fgLayer: HTMLElement;

	onMount(() => {
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reducedMotion || !heroWorld) return;

		// ── Pointer parallax ──────────────────────────────────────────────
		const px = motionValue(0.5);
		const py = motionValue(0.5);

		const layers = [
			{ el: bgLayer, depth: 1 },
			{ el: midLayer, depth: 2.2 },
			{ el: fgLayer, depth: 3.8 }
		];

		const unsubscribers: (() => void)[] = [];

		layers.forEach(({ el, depth }) => {
			if (!el) return;
			unsubscribers.push(
				px.on('change', (v) => {
					el.style.setProperty('--px', `${transform(v, [0, 1], [10 * depth, -10 * depth]).toFixed(2)}px`);
				}),
				py.on('change', (v) => {
					el.style.setProperty('--py', `${transform(v, [0, 1], [5 * depth, -5 * depth]).toFixed(2)}px`);
				})
			);
		});

		function onPointerMove(e: PointerEvent) {
			const rect = heroWorld.getBoundingClientRect();
			const nx = (e.clientX - rect.left) / rect.width;
			const ny = (e.clientY - rect.top) / rect.height;
			animate(px, nx, { type: 'spring', stiffness: 45, damping: 18 });
			animate(py, ny, { type: 'spring', stiffness: 45, damping: 18 });
		}

		heroWorld.addEventListener('pointermove', onPointerMove);
		heroWorld.addEventListener('pointerleave', () => {
			animate(px, 0.5, { type: 'spring', stiffness: 45, damping: 18 });
			animate(py, 0.5, { type: 'spring', stiffness: 45, damping: 18 });
		});

		return () => {
			heroWorld?.removeEventListener('pointermove', onPointerMove);
			unsubscribers.forEach((u) => u());
		};
	});
</script>

<svelte:head>
	<title>Nuts - The social network for communities.</title>
	<meta
		name="description"
		content="Nuts helps people reconnect with sports clubs, churches, villages, coworkings, schools, associations, events and local communities."
	/>
</svelte:head>

<main class="min-h-screen bg-[#f2ebdd] font-sans text-[#1c201b]">
	<section class="hero-scene relative isolate min-h-[100dvh] overflow-hidden bg-[#f2ebdd]">
		<div class="paper-grain pointer-events-none absolute inset-0 z-20 opacity-25"></div>
		<nav
			class="absolute inset-x-0 top-0 z-30 mx-auto flex max-w-[1500px] items-center justify-between px-5 py-6 sm:px-8 lg:px-12 xl:px-16"
			aria-label="Primary navigation"
		>
			<a class="inline-flex items-center no-underline" href={resolve('/')} aria-label="Nuts home">
				<span class="inline-flex h-12 w-12 items-center justify-center">
					<Nutscash class="h-12 w-12" title="Nuts" />
				</span>
			</a>
			<div
				class="absolute left-1/2 hidden -translate-x-1/2 items-center gap-9 text-base font-semibold text-[#15372c] md:flex"
			>
				<a class="border-b-2 border-[#15372c] no-underline" href={resolve('/')}>Home</a>
				<a class="no-underline transition hover:text-[#df725c]" href="#home">Communities</a>
				<a class="no-underline transition hover:text-[#df725c]" href={resolve('/explore')}
					>Explore</a
				>
				<a class="no-underline transition hover:text-[#df725c]" href="#local">About</a>
			</div>
			<div class="hidden items-center gap-4 md:flex">
				<button
					class="inline-flex min-h-[46px] items-center justify-center rounded-full bg-[#15372c] px-6 py-2 text-base font-bold text-[#f2ebdd] shadow-[0_8px_0_#d7a72b] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_0_#d7a72b] focus:outline-none focus:ring-2 focus:ring-[#15372c]/35 active:translate-y-1 active:shadow-[0_3px_0_#d7a72b]"
					type="button"
					on:click={openApp}
				>
					Create your community
				</button>
			</div>
		</nav>

		<div
			class="relative z-10 mx-auto grid min-h-[100dvh] max-w-[1500px] items-center px-5 pb-16 pt-32 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12 lg:px-12 lg:pb-10 lg:pt-28 xl:gap-16 xl:px-16"
		>
			<div class="hero-copy relative z-20 max-w-[690px] py-12 lg:py-0">
				<p class="mb-7 flex items-center gap-3 text-sm font-bold tracking-[0.14em] text-[#15372c]">
					<span class="h-2.5 w-2.5 rounded-full bg-[#df725c]"></span>
					THE SOCIAL NETWORK FOR REAL COMMUNITIES
				</p>
				<h1
					class="max-w-[720px] text-[clamp(4rem,6.4vw,7.4rem)] font-black leading-[0.84] tracking-[-0.075em] text-[#15372c]"
				>
					Your people,<br /><span class="relative inline-block text-[#df725c]"
						>one place.<span
							class="headline-scribble absolute -bottom-4 left-1 h-3 w-[94%] bg-[#e7b638]"
						></span></span
					>
				</h1>
				<p
					class="mt-10 max-w-[570px] text-xl font-medium leading-8 text-[#33473f] sm:text-2xl sm:leading-9"
				>
					A social home for clubs, neighborhoods, schools, teams and everyone who makes them matter.
				</p>
				<div class="mt-10 flex flex-wrap items-center gap-6" aria-label="Primary actions">
					<button
						class="inline-flex min-h-[58px] items-center justify-center rounded-full bg-[#15372c] px-8 py-4 text-lg font-bold text-[#f2ebdd] shadow-[0_9px_0_#d7a72b] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_11px_0_#d7a72b] focus:outline-none focus:ring-2 focus:ring-[#15372c]/35 active:translate-y-1 active:shadow-[0_3px_0_#d7a72b]"
						type="button"
						on:click={openApp}
					>
						Create your community
					</button>
					<a
						class="group inline-flex min-h-[52px] items-center gap-3 border-b-2 border-[#15372c] text-lg font-bold text-[#15372c] no-underline transition hover:gap-5 focus:outline-none focus:ring-2 focus:ring-[#15372c]/30"
						href="#home"
					>
						See how it works <span aria-hidden="true">↓</span>
					</a>
				</div>
			</div>

			<!-- 2.5D parallax hero -->
			<div
				class="hero-world relative min-h-[390px] self-end sm:min-h-[520px] lg:min-h-[78dvh]"
				bind:this={heroWorld}
			>
				<div
					class="hero-arch absolute -inset-x-10 bottom-0 top-0 overflow-hidden rounded-t-[12rem] lg:left-0 lg:right-[-6rem]"
				>
					<div class="hero-layer hero-bg" bind:this={bgLayer}>
						<img
							class="hero-img"
							src={resolve('/landing-2.5d/hero-background.webp')}
							alt=""
							fetchpriority="high"
						/>
					</div>
					<div class="hero-layer hero-mid" bind:this={midLayer}>
						<img
							class="hero-img"
							src={resolve('/landing-2.5d/hero-midground.webp')}
							alt="Community hall surrounded by trees and houses"
							fetchpriority="high"
						/>
					</div>
					<div class="hero-layer hero-fg" bind:this={fgLayer}>
						<img
							class="hero-img"
							src={resolve('/landing-2.5d/hero-foreground.webp')}
							alt="Neighbors walking and talking together"
							fetchpriority="high"
						/>
					</div>
				</div>

				<div
					class="float-note absolute right-[4%] top-[8%] rotate-3 bg-[#e7b638] px-5 py-3 text-base font-black text-[#15372c] shadow-[6px_7px_0_#15372c]"
				>
					Made for belonging
				</div>
				<div
					class="float-note float-note-delayed absolute bottom-[8%] left-[3%] -rotate-3 bg-[#f2ebdd] px-5 py-3 text-base font-black text-[#15372c] shadow-[6px_7px_0_#df725c]"
				>
					People, not followers
				</div>
			</div>
		</div>
	</section>

	<NeighborhoodStory onCreate={openApp} />
</main>

<style>
	.paper-grain {
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.34'/%3E%3C/svg%3E");
		mix-blend-mode: multiply;
	}

	.headline-scribble {
		clip-path: polygon(
			0 35%,
			21% 12%,
			47% 30%,
			72% 0,
			100% 25%,
			98% 72%,
			70% 62%,
			45% 100%,
			18% 68%,
			1% 84%
		);
		z-index: -1;
	}

	.hero-copy {
		animation: copy-in 800ms cubic-bezier(0.22, 1, 0.36, 1) both;
	}

	.float-note {
		animation: note-float 5s ease-in-out infinite;
	}

	.float-note-delayed {
		animation-delay: -2.4s;
	}

	/* ── 2.5D layers ─────────────────────────────────────────── */
	.hero-arch {
		isolation: isolate;
	}

	.hero-layer {
		position: absolute;
		inset: 0;
		opacity: 0;
		transform: translate(var(--px, 0px), var(--py, 0px));
		will-change: transform, opacity;
		animation: layer-in 900ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
	}

	.hero-bg {
		animation-delay: 100ms;
	}

	.hero-mid {
		animation-delay: 250ms;
	}

	.hero-fg {
		animation-delay: 400ms;
	}

	@keyframes layer-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.hero-img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center;
	}

	.hero-bg .hero-img {
		animation: layer-drift 20s ease-in-out infinite alternate;
	}

	.hero-mid .hero-img {
		animation: layer-breathe 8s ease-in-out infinite alternate;
	}

	.hero-fg .hero-img {
		animation: layer-breathe 6s ease-in-out infinite alternate;
	}

	@keyframes layer-drift {
		from {
			transform: translateX(-6px) scale(1.01);
		}
		to {
			transform: translateX(6px) scale(1.02);
		}
	}

	@keyframes layer-breathe {
		from {
			transform: translateY(0);
		}
		to {
			transform: translateY(-8px);
		}
	}

	@keyframes copy-in {
		from {
			opacity: 0;
			transform: translateY(28px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes note-float {
		0%,
		100% {
			translate: 0 0;
		}
		50% {
			translate: 0 -8px;
		}
	}

	@media (max-width: 767px) {
		.hero-img {
			object-position: 62% center;
		}
		.float-note {
			font-size: 0.75rem;
			padding: 0.55rem 0.75rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.hero-copy,
		.float-note,
		.hero-bg .hero-img,
		.hero-mid .hero-img,
		.hero-fg .hero-img {
			animation: none !important;
		}
		.hero-layer {
			opacity: 1 !important;
			transform: none !important;
		}
	}
</style>

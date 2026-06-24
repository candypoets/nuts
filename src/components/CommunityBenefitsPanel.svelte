<script lang="ts">
	import {
		Building2,
		CircleHelp,
		ExternalLink,
		Globe2,
		Lock,
		Rocket,
		Ticket,
		TrendingUp,
		TreePine,
		UsersRound
	} from 'lucide-svelte';

	const orbitItems = [
		{ label: 'Organization', icon: Building2, className: 'left-1/2 top-[3%] -translate-x-1/2' },
		{ label: 'Startup', icon: Rocket, className: 'right-[3%] top-[35%] -translate-y-1/2' },
		{ label: 'Event', icon: Ticket, className: 'bottom-[6%] right-[18%]' },
		{ label: 'Village', icon: TreePine, className: 'bottom-[6%] left-[18%]' },
		{ label: 'Sports', icon: UsersRound, className: 'left-[3%] top-[35%] -translate-y-1/2' }
	];

	const benefits = [
		{
			title: 'You own your community',
			description: 'Full control. No ads. No algorithms.',
			icon: UsersRound
		},
		{
			title: 'Discoverable by everyone',
			description: 'Get found by people who care about what you do.',
			icon: Globe2
		},
		{
			title: 'Privacy by default',
			description: 'Your community, your rules. Invite-only or open.',
			icon: Lock
		},
		{
			title: 'Built for the long run',
			description: 'Events, members, history. Everything in one place.',
			icon: TrendingUp
		}
	];
</script>

<aside
	class="relative hidden w-[340px] shrink-0 overflow-hidden bg-[#101820] px-7 py-12 text-white xl:block 2xl:min-h-[calc(100vh-84px)] 2xl:w-[380px]"
	aria-label="Community benefits"
>
	<div
		class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(60,190,127,0.18),transparent_30%),radial-gradient(circle_at_50%_70%,rgba(255,255,255,0.08),transparent_35%)]"
	></div>
	<div
		class="pointer-events-none absolute inset-0 opacity-25 [background-image:radial-gradient(circle,rgba(255,255,255,0.55)_1.4px,transparent_1.6px)] [background-position:18px_28px] [background-size:88px_88px]"
	></div>

	<div class="relative">
		<p class="text-sm font-black uppercase tracking-normal text-[#16c47f]">Communities are</p>
		<h2 class="mt-5 text-2xl font-black tracking-normal">First-class citizens.</h2>
		<p class="mt-4 max-w-sm text-base font-semibold leading-7 text-white/65">
			On Nuts, communities are discoverable, independent and built to last.
		</p>

		<div class="relative mx-auto my-8 aspect-square w-full max-w-[300px]">
			<svg
				class="absolute inset-0 h-full w-full"
				viewBox="0 0 360 360"
				fill="none"
				aria-hidden="true"
			>
				<line
					x1="180"
					y1="72"
					x2="180"
					y2="180"
					stroke="#69c895"
					stroke-width="1.5"
					stroke-dasharray="4 4"
					opacity="0.55"
				/>
				<line
					x1="84"
					y1="126"
					x2="180"
					y2="180"
					stroke="#69c895"
					stroke-width="1.5"
					stroke-dasharray="4 4"
					opacity="0.55"
				/>
				<line
					x1="276"
					y1="126"
					x2="180"
					y2="180"
					stroke="#69c895"
					stroke-width="1.5"
					stroke-dasharray="4 4"
					opacity="0.55"
				/>
				<line
					x1="132"
					y1="286"
					x2="180"
					y2="180"
					stroke="#69c895"
					stroke-width="1.5"
					stroke-dasharray="4 4"
					opacity="0.55"
				/>
				<line
					x1="228"
					y1="286"
					x2="180"
					y2="180"
					stroke="#69c895"
					stroke-width="1.5"
					stroke-dasharray="4 4"
					opacity="0.55"
				/>
			</svg>

			{#each orbitItems as item (item.label)}
				<div class={`absolute ${item.className}`}>
					<div
						class="grid h-14 w-14 place-items-center rounded-full border border-white/35 bg-white/[0.04] text-white/90 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_0_30px_rgba(255,255,255,0.06)] backdrop-blur 2xl:h-16 2xl:w-16"
						title={item.label}
					>
						<svelte:component this={item.icon} size={22} />
					</div>
				</div>
			{/each}

			<div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[38%]">
				<div
					class="grid h-20 w-20 place-items-center rounded-full bg-[#16c47f] text-[#102018] shadow-[0_0_70px_rgba(22,196,127,0.42)]"
				>
					<UsersRound size={32} />
				</div>
			</div>
		</div>

		<div class="h-px bg-white/12"></div>

		<ul class="grid divide-y divide-white/10">
			{#each benefits as benefit (benefit.title)}
				<li class="flex gap-4 py-5">
					<span
						class="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#8be3aa] text-[#102018] shadow-[0_0_26px_rgba(139,227,170,0.22)]"
					>
						<svelte:component this={benefit.icon} size={22} />
					</span>
					<span>
						<strong class="block text-lg font-black tracking-normal">{benefit.title}</strong>
						<span class="mt-1 block text-sm font-semibold leading-6 text-white/60">
							{benefit.description}
						</span>
					</span>
				</li>
			{/each}
		</ul>

		<a
			href="https://github.com/cashubtc/nuts"
			target="_blank"
			rel="noopener noreferrer"
			class="mt-7 flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.06] p-5 text-white no-underline shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
		>
			<span
				class="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/35 text-white/80"
			>
				<CircleHelp size={22} />
			</span>
			<span class="min-w-0 flex-1">
				<strong class="block text-lg font-black">Need help?</strong>
				<span class="mt-1 block text-sm font-semibold text-white/60"
					>Learn more about communities</span
				>
			</span>
			<ExternalLink class="shrink-0 text-white/70" size={22} />
		</a>
	</div>
</aside>

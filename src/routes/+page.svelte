<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	const scatteredTools = [
		'WhatsApp',
		'Instagram',
		'Email',
		'Google Sheets',
		'Stripe',
		'Eventbrite'
	];

	const communityExamples = [
		'Your family',
		'Your sports club',
		'Your church',
		'Your village',
		'Your coworking',
		'Your school',
		'Your events'
	];

	const relationshipLevels = [
		{
			name: 'Follow',
			line: 'Stay informed.',
			examples: 'Formula 1. PSG. Harvard.',
			actions: 'Read updates. Follow discussions. No membership required.'
		},
		{
			name: 'Join',
			line: 'Become a participant.',
			examples: 'FC Avenir. Startup House. Startup Summit.',
			actions: 'Comment. Post. Attend events. Contribute.'
		},
		{
			name: 'Belong',
			line: 'Membership means something.',
			examples: 'Coach. Volunteer. Founder. Resident. Moderator.',
			actions: 'You are recognized. You have a role.'
		}
	];

	const contributors = [
		'The coach',
		'The mechanic',
		'The volunteer',
		'The organizer',
		'The founder'
	];

	function openApp() {
		goto(resolve('/create'));
	}
</script>

<svelte:head>
	<title>Nuts - The social network for communities.</title>
	<meta
		name="description"
		content="Nuts helps people reconnect with sports clubs, churches, villages, coworkings, schools, associations, events and local communities."
	/>
</svelte:head>

<main class="min-h-screen bg-[#f7f5ef] font-sans text-[#151411]">
	<section
		class="relative grid min-h-screen overflow-hidden bg-[#10100e] text-[#fff8ea] md:grid-cols-[minmax(0,0.62fr)_minmax(360px,1fr)]"
	>
		<div
			class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_60%,rgba(242,211,95,0.2),transparent_34%),radial-gradient(circle_at_96%_14%,rgba(83,184,106,0.16),transparent_30%),linear-gradient(135deg,#020403_0%,#07110b_38%,#17140d_72%,#050505_100%)]"
		></div>
		<div
			class="relative z-10 flex min-h-screen flex-col justify-between px-5 pb-9 pt-16 sm:px-8 lg:px-12 xl:px-16"
		>
			<div>
				<p class="text-sm font-black text-[#f2bd3c]">Nuts</p>
				<h1
					class="mt-5 max-w-3xl text-6xl font-black leading-[0.95] tracking-normal sm:text-7xl lg:text-8xl"
				>
					Connecting Communities.
				</h1>
				<p class="mt-7 max-w-2xl text-xl font-medium leading-9 text-[#fff8ea]/70 sm:text-2xl">
					Nuts is a social network built around communities, not individuals.
				</p>
				<div class="mt-9 flex flex-wrap gap-3" aria-label="Primary actions">
					<button
						class="inline-flex min-h-[52px] items-center justify-center rounded-xl bg-[#8be3aa] px-6 py-4 font-black text-[#102018] shadow-lg shadow-[#8be3aa]/20 transition hover:bg-[#9eeab8] focus:outline-none focus:ring-2 focus:ring-[#8be3aa]/40 active:scale-[0.98]"
						type="button"
						on:click={openApp}
					>
						Create your community
					</button>
					<a
						class="inline-flex min-h-[52px] items-center justify-center rounded-xl border border-white/20 bg-white/[0.06] px-6 py-4 font-black text-[#fff8ea] no-underline shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:bg-white/[0.1] focus:outline-none focus:ring-2 focus:ring-white/25 active:scale-[0.98]"
						href={resolve('/explore')}
					>
						Start exploring
					</a>
				</div>
			</div>
			<div
				class="relative mt-14 max-w-md border-l border-[#f2bd3c]/50 pl-5 font-semibold leading-7 text-[#f2bd3c]"
			>
				<div class="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-3">
					<span>
						<p class="whitespace-nowrap">To the neighbors.</p>
						<p class="whitespace-nowrap">To the newcomers.</p>
						<p class="whitespace-nowrap">To the organizers.</p>
					</span>
					<span>
						<p class="whitespace-nowrap">To the thinkers.</p>
						<p class="whitespace-nowrap">To the builders.</p>
						<p class="whitespace-nowrap">To the merchants.</p>
					</span>
					<span>
						<p class="whitespace-nowrap">To the players.</p>
						<p class="whitespace-nowrap">To the faithful.</p>
						<p class="whitespace-nowrap">To the introverts.</p>
					</span>
				</div>
				<p class="mt-4 whitespace-nowrap">To the crazy ones.</p>
				<p class="mt-4 whitespace-nowrap">To your community.</p>
			</div>
		</div>
		<div class="relative z-0 hidden min-h-screen overflow-visible md:block">
			<img
				class="absolute bottom-0 right-0 block h-[75vh] w-[68vw] max-w-none object-fill drop-shadow-[0_34px_110px_rgba(0,0,0,0.34)]"
				src={resolve('/hero-communities.png')}
				alt="Illustrated collage of different communities gathered around Nuts"
			/>
		</div>
	</section>

	<section
		class="grid items-center gap-12 bg-[#e4ead7] px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)] lg:px-16 lg:py-32 xl:px-24"
		id="home"
	>
		<div>
			<p class="text-sm font-black text-[#716341]">The organizer pain</p>
			<h2
				class="mt-4 max-w-5xl text-5xl font-black leading-[0.95] tracking-normal sm:text-6xl lg:text-7xl"
			>
				Your Community Deserves a Home.
			</h2>
			<div class="mt-8 grid max-w-2xl gap-3 text-lg font-medium leading-8 text-[#4f493d]">
				<p>Most communities live across six different tools.</p>
				<p>One for chat. One for events. One for payments. One for announcements.</p>
				<p>One for members. One for sponsors.</p>
				<p>Nuts brings everything together. One community. One home.</p>
			</div>
		</div>
		<div class="grid gap-5" aria-label="Disconnected tools moving into Nuts">
			<div class="flex flex-wrap gap-3">
				{#each scatteredTools as tool (tool)}
					<span
						class="rounded-xl border border-[#151411]/15 bg-white/65 px-4 py-3 font-black shadow-sm shadow-stone-950/5"
						>{tool}</span
					>
				{/each}
			</div>
			<div class="text-5xl font-black leading-none text-[#151411]" aria-hidden="true">↓</div>
			<div
				class="grid min-h-44 place-items-center rounded-2xl bg-[#151411] text-5xl font-black text-[#fff8ea] shadow-xl shadow-stone-950/15 sm:text-6xl"
			>
				Nuts
			</div>
		</div>
	</section>

	<section
		class="grid items-center gap-12 bg-[#f7f5ef] px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)] lg:px-16 lg:py-32 xl:px-24"
	>
		<div>
			<p class="text-sm font-black text-[#716341]">The feed</p>
			<h2
				class="mt-4 max-w-5xl text-5xl font-black leading-[0.95] tracking-normal sm:text-6xl lg:text-7xl"
			>
				Communities are the algorithm.
			</h2>
			<div class="mt-8 grid max-w-2xl gap-3 text-lg font-medium leading-8 text-[#4f493d]">
				<p>Your feed isn't built by engagement metrics.</p>
				<p>It's built by the communities you care about.</p>
			</div>
			<div class="my-8 flex max-w-3xl flex-wrap gap-3">
				{#each communityExamples as community (community)}
					<span
						class="rounded-xl border border-[#151411]/15 bg-white px-4 py-3 font-black shadow-sm shadow-stone-950/5"
						>{community}</span
					>
				{/each}
			</div>
			<p class="max-w-2xl text-lg font-medium leading-8 text-[#4f493d]">
				No endless scrolling. No rage bait. Just what's happening in your world.
			</p>
		</div>
		<div
			class="relative min-h-[520px] overflow-hidden rounded-3xl border border-stone-200 bg-white p-5 shadow-2xl shadow-stone-950/10"
			aria-label="Community feed mockup"
		>
			<div class="flex items-center justify-between">
				<span class="text-sm font-black text-stone-500">Community feed</span>
				<span class="h-3 w-3 rounded-full bg-emerald-600"></span>
			</div>
			<div class="mt-5 flex gap-2 overflow-hidden">
				{#each communityExamples.slice(1, 5) as community (community)}
					<span class="shrink-0 rounded-lg bg-[#e4ead7] px-3 py-2 text-xs font-black"
						>{community}</span
					>
				{/each}
			</div>
			<div class="mt-6 grid gap-4">
				<article class="rounded-2xl bg-[#f7f5ef] p-4">
					<p class="text-sm font-black">FC Avenir</p>
					<p class="mt-2 text-lg font-black leading-6">Training moved to court 2 tonight.</p>
					<p class="mt-3 text-sm font-semibold text-stone-500">Parents, coaches, players</p>
				</article>
				<article class="rounded-2xl bg-emerald-950 p-4 text-white">
					<p class="text-sm font-black text-white/60">Startup House</p>
					<p class="mt-2 text-lg font-black leading-6">Demo table signups are open.</p>
					<p class="mt-3 text-sm font-semibold text-white/60">Founders, mentors, guests</p>
				</article>
				<article class="rounded-2xl bg-[#f7f5ef] p-4">
					<p class="text-sm font-black">Village market</p>
					<p class="mt-2 text-lg font-black leading-6">Saturday stalls close at 18:30.</p>
					<p class="mt-3 text-sm font-semibold text-stone-500">Neighbors and merchants</p>
				</article>
			</div>
		</div>
	</section>

	<section
		class="grid items-center gap-12 bg-[#4a5541] px-5 py-20 text-[#fff8ea] sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.58fr)] lg:px-16 lg:py-32 xl:px-24"
	>
		<div>
			<p class="text-sm font-black text-[#f2d35f]">Trust</p>
			<h2
				class="mt-4 max-w-5xl text-5xl font-black leading-[0.95] tracking-normal sm:text-6xl lg:text-7xl"
			>
				Real People. Real Communities.
			</h2>
			<div class="mt-8 grid max-w-2xl gap-3 text-lg font-medium leading-8 text-[#fff8ea]/75">
				<p>Most social networks spend billions fighting bots.</p>
				<p>Nuts starts somewhere else.</p>
				<p>Communities grow through relationships.</p>
				<p>Invite someone. Share a QR code. Print a flyer. Meet at an event.</p>
				<p>Join through people you trust.</p>
				<p>
					A sports club knows its members. A church knows its congregation. A village knows its
					residents.
				</p>
				<p>Trust emerges naturally.</p>
			</div>
		</div>
		<div
			class="relative grid min-h-[480px] content-end overflow-hidden rounded-3xl border border-white/15 bg-white/[0.06] p-6 shadow-2xl shadow-black/10"
			aria-label="Real-world invites"
		>
			<div
				class="absolute left-7 top-7 rounded-lg bg-[#fff8ea] px-3 py-2 text-xs font-black text-[#151411]"
			>
				Invite card
			</div>
			<div
				class="absolute right-8 top-20 grid h-32 w-32 place-items-center rounded-2xl bg-[#fff8ea] p-4 shadow-xl shadow-black/20"
			>
				<div class="grid h-full w-full grid-cols-5 gap-1">
					{#each Array(25) as _, index (index)}
						<span class={index % 3 === 0 ? 'bg-[#151411]' : 'bg-[#151411]/20'}></span>
					{/each}
				</div>
			</div>
			<div class="rounded-2xl bg-[#fff8ea] p-5 text-[#151411] shadow-xl shadow-black/15">
				<p class="text-sm font-black text-stone-500">Join through someone you trust</p>
				<h3 class="mt-3 text-3xl font-black leading-none">Real-world invites</h3>
				<p class="mt-4 text-base font-semibold leading-7 text-stone-600">
					Stickers, QR codes, notice boards, club entrances, and people joining in person.
				</p>
			</div>
		</div>
	</section>

	<section
		class="overflow-hidden bg-[#fff8ea] px-5 py-20 sm:px-8 lg:px-16 lg:py-32 xl:px-24"
		id="belong"
	>
		<div class="grid gap-12 lg:grid-cols-[minmax(280px,0.48fr)_minmax(0,1fr)] lg:items-start">
			<div class="lg:sticky lg:top-10">
				<p class="text-sm font-black text-[#716341]">The social graph</p>
				<h2 class="mt-4 text-5xl font-black leading-[0.95] tracking-normal sm:text-6xl lg:text-7xl">
					Follow. Join. Belong.
				</h2>
				<p class="mt-6 max-w-xl text-lg font-medium leading-8 text-[#4f493d]">
					Not every relationship is the same.
				</p>
			</div>

			<div class="relative">
				<div
					class="pointer-events-none absolute left-6 top-8 hidden h-[calc(100%-4rem)] w-px bg-gradient-to-b from-[#151411]/15 via-[#151411]/40 to-[#8be3aa] lg:block"
				></div>
				<div class="grid gap-5">
					{#each relationshipLevels as level, index (level.name)}
						<article
							class={`relative grid min-h-64 overflow-hidden rounded-2xl border p-6 shadow-xl ${
								index === 0 ? 'lg:mr-20' : index === 1 ? 'lg:ml-10 lg:mr-10' : 'lg:ml-20'
							} ${
								index === 0
									? 'border-[#151411]/10 bg-white shadow-stone-950/5'
									: index === 1
										? 'border-[#151411]/10 bg-[#e4ead7] shadow-stone-950/10'
										: 'border-[#151411] bg-[#151411] text-[#fff8ea] shadow-stone-950/20'
							}`}
						>
							<div
								class={`absolute left-5 top-6 hidden h-4 w-4 rounded-full border-4 lg:block ${
									index === 2 ? 'border-[#8be3aa] bg-[#151411]' : 'border-[#151411] bg-[#fff8ea]'
								}`}
							></div>
							<div class="grid gap-8 lg:grid-cols-[150px_minmax(0,1fr)] lg:pl-9">
								<div>
									<span
										class={`inline-flex rounded-lg px-3 py-2 text-sm font-black ${
											index === 2 ? 'bg-[#8be3aa] text-[#102018]' : 'bg-[#151411] text-[#fff8ea]'
										}`}>{level.name}</span
									>
									<p
										class={`mt-5 text-sm font-black ${index === 2 ? 'text-white/45' : 'text-[#716341]'}`}
									>
										0{index + 1}
									</p>
								</div>
								<div>
									<h3 class="max-w-xl text-4xl font-black leading-none tracking-normal sm:text-5xl">
										{level.line}
									</h3>
									<div
										class={`mt-6 grid gap-4 border-t pt-5 ${
											index === 2 ? 'border-white/15' : 'border-[#151411]/10'
										}`}
									>
										<p class="text-lg font-semibold leading-8 opacity-75">{level.examples}</p>
										<strong class="block text-lg leading-8 opacity-90">{level.actions}</strong>
									</div>
								</div>
							</div>
						</article>
					{/each}
				</div>
			</div>
		</div>
	</section>

	<section
		class="grid items-center gap-12 bg-[#e4ead7] px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)] lg:px-16 lg:py-32 xl:px-24"
	>
		<div>
			<p class="text-sm font-black text-[#716341]">Discovery</p>
			<h2
				class="mt-4 max-w-5xl text-5xl font-black leading-[0.95] tracking-normal sm:text-6xl lg:text-7xl"
			>
				Discover People Through Communities.
			</h2>
			<div class="mt-8 grid max-w-2xl gap-3 text-lg font-medium leading-8 text-[#4f493d]">
				<p>Most social networks reward people who already have an audience.</p>
				<p>Nuts helps people get discovered through contribution.</p>
			</div>
			<div class="my-8 flex max-w-3xl flex-wrap gap-3">
				{#each contributors as contributor (contributor)}
					<span
						class="rounded-xl border border-[#151411]/15 bg-white/65 px-4 py-3 font-black shadow-sm shadow-stone-950/5"
						>{contributor}</span
					>
				{/each}
			</div>
			<p class="max-w-2xl text-lg font-medium leading-8 text-[#4f493d]">
				Communities make people discoverable. Not algorithms.
			</p>
		</div>
		<div
			class="relative min-h-[500px] overflow-hidden rounded-3xl border border-[#151411]/10 bg-[#f7f5ef] p-6 shadow-2xl shadow-stone-950/10"
			aria-label="Community to person to idea example"
		>
			<div class="rounded-2xl bg-[#151411] p-5 text-[#fff8ea]">
				<p class="text-sm font-black text-[#8be3aa]">Formula 1 community</p>
				<h3 class="mt-3 text-3xl font-black leading-none">A useful post spreads.</h3>
			</div>
			<div class="relative mt-6 grid gap-4">
				<div class="ml-8 rounded-2xl bg-white p-5 shadow-lg shadow-stone-950/10">
					<p class="text-sm font-black text-stone-500">Ferrari mechanic</p>
					<p class="mt-2 text-lg font-black leading-6">Brake cooling notes from testing day.</p>
				</div>
				<div class="mr-8 rounded-2xl bg-[#e4ead7] p-5 shadow-lg shadow-stone-950/10">
					<p class="text-sm font-black text-stone-500">Shared by members</p>
					<p class="mt-2 text-lg font-black leading-6">Engineers, fans, and local clubs find it.</p>
				</div>
				<div class="ml-16 rounded-2xl bg-white p-5 shadow-lg shadow-stone-950/10">
					<p class="text-sm font-black text-stone-500">Discovered through contribution</p>
					<p class="mt-2 text-lg font-black leading-6">
						The person matters because the work matters.
					</p>
				</div>
			</div>
		</div>
	</section>

	<section
		class="grid gap-20 bg-[#10100e] px-5 py-20 text-[#fff8ea] sm:px-8 lg:px-16 lg:py-32 xl:px-24"
		id="join"
	>
		<div>
			<p class="text-sm font-black text-[#f2d35f]">The movement</p>
			<h2
				class="mt-4 max-w-5xl text-5xl font-black leading-[0.95] tracking-normal sm:text-6xl lg:text-7xl"
			>
				A Better Internet Starts Locally.
			</h2>
			<div class="mt-8 grid max-w-3xl gap-3 text-lg font-medium leading-8 text-[#fff8ea]/75">
				<p>We have never been more connected.</p>
				<p>Yet social networks have never felt more lonely.</p>
				<p>
					Followers aren't friends. Audiences aren't communities. Algorithms don't create belonging.
				</p>
				<p>People do.</p>
				<p>Nuts helps communities reconnect, grow and thrive.</p>
				<p>
					Because the future of social networks isn't more followers. It's stronger communities.
				</p>
			</div>
			<div class="mt-9 flex flex-wrap gap-3" aria-label="Final actions">
				<button
					class="inline-flex min-h-[52px] items-center justify-center rounded-xl bg-[#8be3aa] px-6 py-4 font-black text-[#102018] shadow-lg shadow-[#8be3aa]/20 transition hover:bg-[#9eeab8] focus:outline-none focus:ring-2 focus:ring-[#8be3aa]/40 active:scale-[0.98]"
					type="button"
					on:click={openApp}
				>
					Create your community
				</button>
				<a
					class="inline-flex min-h-[52px] items-center justify-center rounded-xl border border-white/20 bg-white/[0.06] px-6 py-4 font-black text-[#fff8ea] no-underline shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:bg-white/[0.1] focus:outline-none focus:ring-2 focus:ring-white/25 active:scale-[0.98]"
					href={resolve('/explore')}
				>
					Start exploring
				</a>
			</div>
		</div>
		<footer
			class="flex flex-col justify-between gap-4 border-t border-[#fff8ea]/20 pt-6 text-[#fff8ea]/60 sm:flex-row"
		>
			<strong class="text-[#fff8ea]">Nuts</strong>
			<span>The social network for communities.</span>
		</footer>
	</section>
</main>

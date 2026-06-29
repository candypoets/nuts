<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Icon from '@iconify/svelte';
	import {
		BadgeCheck,
		CalendarDays,
		Church,
		CreditCard,
		GraduationCap,
		House,
		Laptop,
		Megaphone,
		MessageCircle,
		Trophy,
		UsersRound
	} from 'lucide-svelte';

	const scatteredTools = [
		{ name: 'WhatsApp', icon: 'logos:whatsapp-icon' },
		{ name: 'Instagram', icon: 'skill-icons:instagram' },
		{ name: 'Email', icon: 'logos:google-gmail' },
		{ name: 'Google Sheets', icon: 'simple-icons:googlesheets', color: '#34a853' },
		{ name: 'Stripe', icon: 'logos:stripe' },
		{ name: 'Eventbrite', icon: 'simple-icons:eventbrite', color: '#f05537' }
	];

	const communityTools = [
		{ name: 'Chat', icon: MessageCircle },
		{ name: 'Events', icon: CalendarDays },
		{ name: 'Payments', icon: CreditCard },
		{ name: 'Announcements', icon: Megaphone },
		{ name: 'Members', icon: UsersRound },
		{ name: 'Sponsors', icon: BadgeCheck }
	];

	const algorithmCommunities = [
		{ name: 'Your family', icon: UsersRound },
		{ name: 'Your sports club', icon: Trophy },
		{ name: 'Your church', icon: Church },
		{ name: 'Your village', icon: House },
		{ name: 'Your coworking', icon: Laptop },
		{ name: 'Your school', icon: GraduationCap }
	];

	const trustPoints = [
		{
			icon: '10_left_icon_bot.png',
			text: 'Most social networks spend billions fighting bots.'
		},
		{ icon: '11_left_icon_leaf.png', text: 'Nuts starts somewhere else.' },
		{ icon: '12_left_icon_people.png', text: 'Communities grow through relationships.' },
		{
			icon: '13_left_icon_ticket.png',
			text: 'Invite someone. Share a QR code. Print a flyer. Meet at an event.'
		},
		{ icon: '14_left_icon_handshake.png', text: 'Join through people you trust.' },
		{
			icon: '15_left_icon_clubhouse.png',
			text: 'A sports club knows its members. A church knows its congregation. A village knows its residents.'
		},
		{ icon: '16_left_icon_heart.png', text: 'Trust emerges naturally.' }
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
		class="grid min-h-screen items-center gap-12 overflow-hidden bg-[#dfe6d2] px-5 py-20 sm:px-8 lg:grid-cols-[minmax(380px,0.86fr)_minmax(560px,1fr)] lg:px-16 lg:py-24 xl:px-24"
		id="home"
	>
		<div class="max-w-[620px]">
			<p class="text-base font-black text-[#514a32] sm:text-lg">The organizer pain</p>
			<h2
				class="mt-6 max-w-[600px] text-6xl font-black leading-[0.92] tracking-normal text-black sm:text-7xl lg:text-[6rem] xl:text-[6.55rem]"
			>
				Your Community Deserves a Home.
			</h2>
			<div class="mt-14 grid max-w-2xl gap-4 text-xl font-semibold leading-8 text-[#383526]">
				<p class="text-2xl font-black">Most communities live across six different tools.</p>
				<div class="grid gap-2.5">
					{#each communityTools as item (item.name)}
						<div class="grid grid-cols-[54px_minmax(0,1fr)] items-center gap-5">
							<span
								class="grid h-11 w-11 place-items-center rounded-lg bg-[#fffdf5]/70 shadow-sm shadow-stone-950/5"
							>
								<svelte:component this={item.icon} class="h-5 w-5 text-[#334a2e]" strokeWidth={2.4} />
							</span>
							<span>One for {item.name.toLowerCase()}.</span>
						</div>
					{/each}
				</div>
				<p class="mt-4 text-2xl font-black">
					Nuts brings everything together. One community. One home.
				</p>
			</div>
		</div>

		<div class="relative mx-auto w-full max-w-[740px] py-8" aria-label="Disconnected tools moving into Nuts">
			<div class="grid grid-cols-3 gap-5 sm:gap-6">
				{#each scatteredTools as tool (tool)}
					<div
						class="grid min-h-[118px] place-items-center rounded-xl bg-[#fffdf5]/88 px-4 py-5 text-center shadow-[0_16px_36px_rgba(45,52,34,0.16)]"
					>
						<Icon icon={tool.icon} class="h-12 w-12" style={tool.color ? `color: ${tool.color}` : ''} />
						<p class="mt-3 text-lg font-black text-black">{tool.name}</p>
					</div>
				{/each}
			</div>

			<div class="mx-auto h-28 max-w-[560px]" aria-hidden="true">
				<svg class="h-full w-full overflow-visible" viewBox="0 0 560 112">
					<path
						d="M70 0 C70 45 105 58 166 58 H394 C455 58 490 45 490 0"
						fill="none"
						stroke="#405635"
						stroke-width="4"
						stroke-linecap="round"
						stroke-dasharray="1 10"
					/>
					<path
						d="M280 58 V94"
						fill="none"
						stroke="#405635"
						stroke-width="4"
						stroke-linecap="round"
						stroke-dasharray="1 10"
					/>
					<path
						d="M258 84 280 106 302 84"
						fill="none"
						stroke="#243f17"
						stroke-width="5"
						stroke-linecap="square"
						stroke-linejoin="miter"
					/>
				</svg>
			</div>

			<div
				class="relative mx-auto grid min-h-[184px] max-w-[620px] grid-cols-[0.92fr_1fr] items-center overflow-hidden rounded-2xl bg-[#304c25] px-8 text-[#fff8ea] shadow-[0_22px_45px_rgba(29,43,22,0.28)]"
			>
				<div class="flex h-36 items-center">
					<svg
						class="h-36 w-full max-w-[230px]"
						viewBox="0 0 230 150"
						role="img"
						aria-label="Community home illustration"
					>
						<path d="M35 76 115 18l80 58" fill="none" stroke="#fff0c4" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" />
						<path d="M55 71 115 28l60 43v53H55V71Z" fill="#fff0c4" />
						<path d="M55 124h120v-20c-16 11-36 17-60 17H55v3Z" fill="#eadca8" opacity="0.55" />
						<circle cx="115" cy="62" r="10" fill="#12350f" />
						<circle cx="80" cy="96" r="15" fill="#12350f" />
						<circle cx="115" cy="96" r="15" fill="#6f844e" />
						<circle cx="150" cy="96" r="15" fill="#12350f" />
						<path d="M45 132c5-19 19-31 35-31s30 12 35 31H45Z" fill="#12350f" />
						<path d="M80 132c5-20 19-32 35-32s30 12 35 32H80Z" fill="#6f844e" />
						<path d="M115 132c5-19 19-31 35-31s30 12 35 31H115Z" fill="#12350f" />
					</svg>
				</div>
				<div>
					<p class="text-7xl font-black leading-none text-[#fff8ea] drop-shadow-lg">Nuts</p>
					<p class="mt-5 text-2xl font-black leading-8 text-[#fff8ea]">
						One community.<br />One home.
					</p>
				</div>
			</div>

			<div class="mx-auto mt-2 grid h-12 w-full max-w-[680px] grid-cols-6" aria-hidden="true">
				{#each communityTools as item, index (item.name)}
					<div class="relative">
						<div
							class={`absolute top-6 border-t-2 border-[#8b9a75] ${
								index === 0 ? 'left-1/2 right-0' : index === communityTools.length - 1 ? 'left-0 right-1/2' : 'inset-x-0'
							}`}
						></div>
						<div class="absolute left-1/2 top-6 h-5 -translate-x-1/2 border-l-2 border-[#8b9a75]"></div>
					</div>
				{/each}
			</div>

			<div class="mx-auto grid w-full max-w-[680px] grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-6">
				{#each communityTools as item (item.name)}
					<div class="grid justify-items-center gap-2 text-center">
						<span
							class="grid h-14 w-14 place-items-center rounded-full bg-[#fffdf5]/76 shadow-[0_12px_24px_rgba(45,52,34,0.14)]"
						>
							<svelte:component this={item.icon} class="h-6 w-6 text-[#334a2e]" strokeWidth={2.5} />
						</span>
						<span class="text-sm font-black text-black">{item.name}</span>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<section
		class="grid min-h-screen items-center gap-12 overflow-hidden bg-[#f3f0e9] px-5 py-20 sm:px-8 lg:grid-cols-[minmax(340px,0.46fr)_minmax(620px,1fr)] lg:px-14 lg:py-24 xl:px-16"
	>
		<div class="relative z-10 max-w-[520px]">
			<p class="text-base font-black text-[#5f6f43]">The feed</p>
			<div class="mt-4 h-px w-20 bg-[#5f6f43]"></div>
			<h2
				class="mt-10 max-w-[500px] text-6xl font-black leading-[1.03] tracking-normal text-[#171717] sm:text-[4.7rem] xl:text-[5.15rem]"
			>
				Communities are the algorithm.
			</h2>
			<div class="mt-10 grid gap-3 text-xl font-medium leading-8 text-[#242421]">
				<p>Your feed isn't built by engagement metrics.</p>
				<p>It's built by the communities you care about.</p>
			</div>
			<div class="my-12 grid max-w-[540px] grid-cols-2 gap-4 sm:grid-cols-3">
				{#each algorithmCommunities as community (community.name)}
					<div
						class="flex h-14 items-center gap-3 rounded-2xl bg-white px-4 text-sm font-black text-[#151511] shadow-[0_10px_24px_rgba(64,64,48,0.12)] ring-1 ring-black/5"
					>
						<span class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eef1e2]">
							<svelte:component this={community.icon} class="h-5 w-5 text-[#69784b]" strokeWidth={2.6} />
						</span>
						<span>{community.name}</span>
					</div>
				{/each}
			</div>
			<p class="max-w-[520px] text-xl font-medium leading-9 text-[#242421]">
				No endless scrolling. No rage bait. Just what's happening in your world.
			</p>
		</div>

		<div class="relative min-h-[620px] lg:min-h-[760px]" aria-label="Community algorithm illustration">
			<img
				class="absolute right-[-1rem] top-1/2 w-[min(920px,108vw)] max-w-none -translate-y-1/2 object-contain lg:w-[min(920px,60vw)] xl:right-0"
				src={resolve('/community_algorithm_right_illustration.png')}
				alt="Illustrated map of communities connected by paths with feed cards"
			/>
		</div>
	</section>

	<section
		class="grid min-h-screen items-center gap-12 overflow-hidden bg-[#f4efe8] px-5 py-20 sm:px-8 lg:grid-cols-[minmax(520px,0.62fr)_minmax(680px,1fr)] lg:px-16 lg:py-24 xl:px-20"
	>
		<div class="relative z-10 max-w-[620px]">
			<p class="text-base font-black text-[#5f6f43]">Trust</p>
			<div class="mt-4 h-px w-16 bg-[#5f6f43]"></div>
			<h2
				class="mt-9 max-w-[640px] text-6xl font-black leading-[1.02] tracking-normal text-[#171717] sm:text-[3rem] xl:text-[3.45rem]"
			>
				Real People.<br />Real Communities.
			</h2>
			<div class="mt-12 grid max-w-[540px] gap-6 text-xl font-medium leading-8 text-[#242421]">
				{#each trustPoints as point (point.icon)}
					<div class="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-6">
						<span class="grid h-14 w-14 place-items-center rounded-full bg-[#e3e9d0]">
							<img
								class="h-8 w-8 object-contain"
								src={resolve(`/real_people_communities/${point.icon}`)}
								alt=""
								aria-hidden="true"
							/>
						</span>
						<p class="leading-7">{point.text}</p>
					</div>
				{/each}
			</div>
		</div>

		<div class="relative min-h-[660px] lg:min-h-[780px]" aria-label="Real-world community invites">
			<img
				class="absolute left-1/2 top-1/2 w-[min(860px,112vw)] max-w-none -translate-x-1/2 -translate-y-1/2 object-contain lg:w-[min(850px,56vw)]"
				src={resolve('/real_people_communities/01_right_visual_complete.png')}
				alt="Real-world invite scene with QR notice board and invite methods"
			/>
		</div>
	</section>

	<section
		class="grid min-h-screen items-center overflow-hidden bg-[#f2ede5] px-5 py-20 sm:px-8 lg:grid-cols-[minmax(360px,0.54fr)_minmax(760px,1fr)] lg:gap-10 lg:px-16 lg:py-24 xl:px-20"
		id="belong"
	>
		<div class="relative z-10">
			<p class="text-base font-black text-[#5f6f43]">The social graph</p>
			<div class="mt-4 h-px w-20 bg-[#5f6f43]"></div>
			<h2
				class="mt-9 max-w-[560px] text-6xl font-black leading-[0.96] tracking-normal text-[#171717] sm:text-7xl xl:text-[5.6rem]"
			>
				Follow. Join. Belong.
			</h2>
			<p class="mt-8 max-w-xl text-xl font-medium leading-8 text-[#30302c]">
				Not every relationship is the same.
			</p>
			<img
				class="mt-12 w-full max-w-[540px]"
				src={resolve('/follow_join_belong/01_social_graph_assembled.png')}
				alt="People and community tools connected in a social graph"
			/>
		</div>

		<div class="relative mt-12 lg:mt-0">
			<img
				class="w-full max-w-[935px]"
				src={resolve('/follow_join_belong/02_right_process_stack.png')}
				alt="Follow, join, and belong relationship steps"
			/>
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

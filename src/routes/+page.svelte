<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from 'src/lib/paths';
	import Icon from '@iconify/svelte';
	import Nutscash from 'src/components/Nutscash.svelte';
	import {
		BadgeCheck,
		CalendarDays,
		CreditCard,
		Megaphone,
		MessageCircle,
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
		{ name: 'Your family', asset: 'community-pill-family.png' },
		{ name: 'Your sports club', asset: 'community-pill-sports-club.png' },
		{ name: 'Your church', asset: 'community-pill-church.png' },
		{ name: 'Your village', asset: 'community-pill-village.png' },
		{ name: 'Your coworking', asset: 'community-pill-coworking.png' },
		{ name: 'Your school', asset: 'community-pill-school.png' }
	];

	const trustPoints = [
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
	<section class="relative min-h-screen overflow-hidden bg-[#10100e] text-[#fff8ea] md:flex">
		<div
			class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_60%,rgba(242,211,95,0.2),transparent_34%),radial-gradient(circle_at_96%_14%,rgba(83,184,106,0.16),transparent_30%),linear-gradient(135deg,#020403_0%,#07110b_38%,#17140d_72%,#050505_100%)]"
		></div>
		<nav
			class="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-7 sm:px-8 lg:px-12 xl:px-16"
			aria-label="Primary navigation"
		>
			<a class="inline-flex items-center gap-3 text-3xl font-black text-[#fff8ea] no-underline" href={resolve('/')}>
				<span class="inline-flex h-9 w-9 items-center justify-center text-[#f2bd3c]" style="--icon-fill: #f2bd3c">
					<Nutscash class="h-9 w-9" title="Nuts" />
				</span>
				<span>Nuts</span>
			</a>
			<div
				class="absolute left-1/2 hidden -translate-x-1/2 items-center gap-10 text-lg font-semibold text-[#fff8ea] md:flex"
			>
				<a class="no-underline transition hover:text-[#8be3aa]" href={resolve('/')}>Home</a>
				<a class="no-underline transition hover:text-[#8be3aa]" href="#home">Communities</a>
				<a class="no-underline transition hover:text-[#8be3aa]" href={resolve('/explore')}>Explore</a>
				<a class="no-underline transition hover:text-[#8be3aa]" href="#join">About</a>
			</div>
			<div class="hidden items-center gap-5 md:flex">
				<a
					class="inline-flex min-h-[46px] items-center justify-center rounded-xl border border-white/20 bg-white/[0.03] px-5 py-2 text-base font-semibold text-[#fff8ea] no-underline transition hover:bg-white/[0.08] focus:outline-none focus:ring-2 focus:ring-white/25 active:scale-[0.98]"
					href={resolve('/explore/signup')}
				>
					Join Nuts
				</a>
				<button
					class="inline-flex min-h-[46px] items-center justify-center rounded-xl bg-[#8be3aa] px-5 py-2 text-base font-black text-[#102018] shadow-lg shadow-[#8be3aa]/20 transition hover:bg-[#9eeab8] focus:outline-none focus:ring-2 focus:ring-[#8be3aa]/40 active:scale-[0.98]"
					type="button"
					on:click={openApp}
				>
					Create your community
				</button>
			</div>
		</nav>
		<div
			class="relative z-10 flex min-h-screen flex-col justify-between px-5 pb-9 pt-44 sm:px-8 md:basis-[45%] md:shrink-0 lg:px-12 lg:pt-52 xl:px-16"
		>
			<div>
				<h1
					class="mt-5 max-w-3xl text-5xl font-black leading-[0.97] tracking-normal sm:text-6xl lg:text-7xl xl:text-8xl"
				>
					Connecting Communities<span class="text-[#8be3aa]">.</span>
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
		<div class="relative z-0 hidden min-h-screen flex-1 overflow-visible md:block">
			<img
				class="absolute bottom-0 right-0 block h-[75vh] w-[68vw] max-w-none object-fill drop-shadow-[0_34px_110px_rgba(0,0,0,0.34)]"
				src={resolve('/hero-communities.png')}
				alt="Illustrated collage of different communities gathered around Nuts"
			/>
		</div>
	</section>

	<section
		class="min-h-[92dvh] items-center overflow-hidden bg-[#dfe6d2] px-5 py-20 sm:px-8 lg:flex lg:justify-between lg:px-16 lg:py-24 xl:px-24"
		id="home"
	>
		<div class="max-w-[620px] lg:basis-[45%] lg:shrink-0">
			<p class="text-base font-black text-[#514a32] sm:text-lg">The organizer pain</p>
			<h2
				class="mt-6 max-w-[600px] text-5xl font-black leading-[0.96] tracking-normal text-black sm:text-6xl lg:text-[5.25rem] xl:text-[5.8rem]"
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
								<svelte:component
									this={item.icon}
									class="h-5 w-5 text-[#334a2e]"
									strokeWidth={2.4}
								/>
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

		<div
			class="relative mx-auto w-full max-w-[650px] py-8 lg:mx-0 lg:basis-[48%] lg:shrink-0"
			aria-label="Disconnected tools moving into Nuts"
		>
			<div class="grid grid-cols-3 gap-5 sm:gap-6">
				{#each scatteredTools as tool (tool)}
					<div
						class="grid min-h-[98px] place-items-center rounded-xl bg-[#fffdf5]/88 px-4 py-4 text-center shadow-[0_14px_30px_rgba(45,52,34,0.14)]"
					>
						<Icon
							icon={tool.icon}
							class="h-10 w-10"
							style={tool.color ? `color: ${tool.color}` : ''}
						/>
						<p class="mt-2 text-base font-black text-black">{tool.name}</p>
					</div>
				{/each}
			</div>

			<div class="mx-auto h-20 max-w-[500px]" aria-hidden="true">
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
				class="relative mx-auto grid min-h-[158px] max-w-[560px] grid-cols-[0.86fr_1fr] items-center overflow-hidden rounded-2xl bg-[#304c25] px-7 text-[#fff8ea] shadow-[0_20px_40px_rgba(29,43,22,0.24)]"
			>
				<div class="flex h-32 items-center">
					<svg
						class="h-32 w-full max-w-[205px]"
						viewBox="0 0 230 150"
						role="img"
						aria-label="Community home illustration"
					>
						<path
							d="M35 76 115 18l80 58"
							fill="none"
							stroke="#fff0c4"
							stroke-width="18"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
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
					<p class="text-6xl font-black leading-none text-[#fff8ea] drop-shadow-lg">Nuts</p>
					<p class="mt-4 text-xl font-black leading-7 text-[#fff8ea]">
						One community.<br />One home.
					</p>
				</div>
			</div>

			<div class="mx-auto mt-2 grid h-12 w-full max-w-[680px] grid-cols-6" aria-hidden="true">
				{#each communityTools as item, index (item.name)}
					<div class="relative">
						<div
							class={`absolute top-6 border-t-2 border-[#8b9a75] ${
								index === 0
									? 'left-1/2 right-0'
									: index === communityTools.length - 1
										? 'left-0 right-1/2'
										: 'inset-x-0'
							}`}
						></div>
						<div
							class="absolute left-1/2 top-6 h-5 -translate-x-1/2 border-l-2 border-[#8b9a75]"
						></div>
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
		class="min-h-[92dvh] overflow-hidden bg-[#f4f0e8] px-5 py-16 sm:px-8 lg:flex lg:items-center lg:justify-between lg:px-14 lg:py-20 xl:px-20"
	>
		<div class="relative z-10 max-w-[600px] lg:basis-[43%] lg:shrink-0">
			<p class="text-base font-black text-[#56643b]">The feed</p>
			<div class="mt-5 h-px w-24 bg-[#56643b]"></div>
			<h2
				class="mt-10 max-w-[560px] text-5xl font-black leading-[1.04] tracking-normal text-black sm:text-[4rem] lg:text-[4.5rem] xl:text-[5rem]"
			>
				Communities are the algorithm.
			</h2>
			<div class="mt-10 grid gap-3 text-xl font-medium leading-8 text-[#151511] sm:text-2xl">
				<p>Your feed isn't built by engagement metrics.</p>
				<p>It's built by the communities you care about.</p>
			</div>
			<div class="my-12 grid max-w-[640px] grid-cols-2 gap-4 sm:grid-cols-3">
				{#each algorithmCommunities as community (community.name)}
					<img
						class="h-16 w-full rounded-2xl object-contain drop-shadow-[0_10px_20px_rgba(46,45,36,0.11)]"
						src={resolve(`/community_feed_static_assets/components/png/${community.asset}`)}
						alt={community.name}
					/>
				{/each}
			</div>
			<div class="grid gap-3 text-xl font-medium leading-8 text-[#151511] sm:text-2xl">
				<p>No endless scrolling. No rage bait.</p>
				<p>Just what's happening in your world.</p>
			</div>
		</div>

		<div
			class="relative mt-14 min-h-[430px] sm:min-h-[560px] lg:mt-0 lg:min-h-[660px] lg:basis-[53%] lg:shrink-0"
			aria-label="Community algorithm illustration"
		>
			<img
				class="absolute left-[-11%] top-1/2 hidden h-[min(680px,70dvh)] w-auto max-w-none -translate-y-1/2 object-contain lg:block xl:left-[-16%]"
				src={resolve('/community_feed_static_assets/components/png/signal-lines.png')}
				alt=""
				aria-hidden="true"
			/>
			<img
				class="absolute right-1/2 top-1/2 w-[min(690px,96vw)] max-w-none -translate-y-1/2 translate-x-1/2 rounded-[28px] object-contain shadow-[0_24px_55px_rgba(42,39,32,0.15)] lg:right-0 lg:h-[min(820px,84dvh)] lg:w-auto lg:translate-x-0 xl:h-[min(840px,86dvh)]"
				src={resolve('/community_feed_static_assets/components/png/feed-panel.png')}
				alt="Your feed panel with updates from FC Avenir, Village market, Your school, Your church, and Your coworking"
			/>
		</div>
	</section>

	<section
		class="min-h-[92dvh] items-center overflow-hidden bg-[#f4efe8] px-5 py-20 sm:px-8 lg:flex lg:justify-between lg:px-16 lg:py-24 xl:px-20"
	>
		<div class="relative z-10 max-w-[620px] lg:order-2 lg:ml-0 lg:basis-[45%] lg:shrink-0">
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

		<div
			class="relative min-h-[440px] lg:order-1 lg:min-h-[620px] lg:basis-[50%] lg:shrink-0"
			aria-label="Real-world community invites"
		>
			<img
				class="absolute left-1/2 top-1/2 w-[min(680px,94vw)] max-w-none -translate-x-1/2 -translate-y-1/2 object-contain lg:w-[min(700px,46vw)]"
				src={resolve('/real_people_communities/01_right_visual_complete.png')}
				alt="Real-world invite scene with QR notice board and invite methods"
			/>
		</div>
	</section>

	<section
		class="min-h-[92dvh] items-center overflow-hidden bg-[#f2ede5] px-5 py-20 sm:px-8 lg:flex lg:justify-between lg:px-16 lg:py-24 xl:px-20"
		id="belong"
	>
		<div class="relative z-10 lg:basis-[44%] lg:shrink-0">
			<p class="text-base font-black text-[#5f6f43]">The social graph</p>
			<div class="mt-4 h-px w-20 bg-[#5f6f43]"></div>
			<h2
				class="mt-9 max-w-[560px] text-5xl font-black leading-[0.98] tracking-normal text-[#171717] sm:text-6xl xl:text-[5rem]"
			>
				Follow. Join. Belong.
			</h2>
			<p class="mt-8 max-w-xl text-xl font-medium leading-8 text-[#30302c]">
				Not every relationship is the same.
			</p>
			<img
				class="mt-12 w-full max-w-[460px]"
				src={resolve('/follow_join_belong/01_social_graph_assembled.png')}
				alt="People and community tools connected in a social graph"
			/>
		</div>

		<div class="relative mt-12 lg:mt-0 lg:basis-[50%] lg:shrink-0">
			<img
				class="w-full max-w-[720px]"
				src={resolve('/follow_join_belong/02_right_process_stack.png')}
				alt="Follow, join, and belong relationship steps"
			/>
		</div>
	</section>

	<section
		class="min-h-[92dvh] items-center overflow-hidden bg-[#e4e6d7] px-5 py-20 sm:px-8 lg:flex lg:justify-between lg:px-16 lg:py-24 xl:px-20"
	>
		<div class="relative z-10 max-w-[650px] lg:order-2 lg:ml-0 lg:basis-[45%] lg:shrink-0">
			<p class="text-base font-black text-[#314f28]">Discover</p>
			<div class="mt-4 h-px w-16 bg-[#314f28]"></div>
			<h2
				class="mt-12 max-w-[650px] text-5xl font-black leading-[1.06] tracking-normal text-[#111] sm:text-[3.7rem] xl:text-[4.1rem]"
			>
				Discover People Through Communities.
			</h2>
			<div class="mt-12 grid max-w-[640px] gap-5 text-xl font-medium leading-8 text-[#111]">
				<p>Most social networks reward people who already have an audience.</p>
				<p>Nuts helps people get discovered through contribution.</p>
			</div>
			<img
				class="my-12 w-full max-w-[520px]"
				src={resolve('/discover_people_communities/03_role_pills_group.png')}
				alt="The coach, the mechanic, the volunteer, the organizer, and the founder"
			/>
			<p class="max-w-[650px] text-xl font-medium leading-9 text-[#111]">
				Communities make people discoverable. <span class="text-[#314f28]">Not algorithms.</span>
			</p>
		</div>

		<div
			class="relative min-h-[440px] lg:order-1 lg:min-h-[640px] lg:basis-[50%] lg:shrink-0"
			aria-label="Contribution discovery process"
		>
			<img
				class="absolute left-1/2 top-1/2 w-[min(640px,94vw)] max-w-none -translate-x-1/2 -translate-y-1/2 object-contain lg:w-[min(650px,44vw)]"
				src={resolve('/discover_people_communities/02_right_side_full_composite.png')}
				alt="Useful contribution travels through communities and makes a person known"
			/>
		</div>
	</section>

	<section
		class="relative isolate min-h-screen overflow-hidden bg-[#030504] px-5 py-20 text-[#fff8ea] sm:px-8 lg:flex lg:flex-col lg:px-16 lg:py-24 xl:px-20"
		id="join"
	>
		<div
			class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_55%,rgba(139,227,170,0.16),transparent_28%),radial-gradient(circle_at_24%_28%,rgba(242,211,95,0.08),transparent_24%)]"
		></div>

		<div class="relative z-10 lg:flex lg:flex-1 lg:items-center lg:justify-between">
			<div class="max-w-[720px] lg:basis-[47%] lg:shrink-0">
				<p class="text-sm font-black text-[#f2d35f]">The movement</p>
				<h2
					class="mt-7 max-w-[720px] text-5xl font-black leading-[0.96] tracking-normal sm:text-6xl lg:text-7xl xl:text-[5rem]"
				>
					A Better Internet Starts Locally.
				</h2>
				<div class="mt-12 grid max-w-[620px] gap-4 text-lg font-medium leading-8 text-[#fff8ea]/72 sm:text-xl">
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
				<div class="mt-12 flex flex-wrap gap-4" aria-label="Final actions">
					<button
						class="inline-flex min-h-[58px] items-center justify-center rounded-xl bg-[#8be3aa] px-7 py-4 text-lg font-black text-[#102018] shadow-lg shadow-[#8be3aa]/20 transition hover:bg-[#9eeab8] focus:outline-none focus:ring-2 focus:ring-[#8be3aa]/40 active:scale-[0.98]"
						type="button"
						on:click={openApp}
					>
						Create your community
					</button>
					<a
						class="inline-flex min-h-[58px] items-center justify-center rounded-xl border border-white/20 bg-white/[0.03] px-7 py-4 text-lg font-black text-[#fff8ea] no-underline shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:bg-white/[0.08] focus:outline-none focus:ring-2 focus:ring-white/25 active:scale-[0.98]"
						href={resolve('/explore')}
					>
						Explore communities
					</a>
				</div>
			</div>
			<div
				class="relative mt-16 min-h-[430px] lg:mt-0 lg:min-h-[640px] lg:basis-[52%] lg:shrink-0"
				aria-label="Local communities connected around your community"
			>
				<img
					class="absolute left-1/2 top-1/2 w-[min(720px,104vw)] max-w-none -translate-x-1/2 -translate-y-1/2 object-contain opacity-95 lg:w-[min(780px,51vw)]"
					src={resolve('/better_internet_starts_locally/right_constellation_full_transparent.png')}
					alt="Network of local communities including family, school, sports club, church, local events, and local business connected to your community"
				/>
			</div>
		</div>
		<footer
			class="sr-only"
		>
			<strong class="text-[#fff8ea]">Nuts</strong>
			<span>The social network for communities.</span>
		</footer>
	</section>
</main>

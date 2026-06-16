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

<main class="nuts-page">
	<section class="hero flex items-center">
		<div class="hero-copy p-8 flex flex-col justify-between h-[90vh]">
			<div class="pt-16 ml-12">
				<h1 class="!leading-[1.02]">Connecting Communities.</h1>
				<p class="!text-2xl !text-neutral-400">
					Nuts is a social network built around communities, not individuals.
				</p>
				<div class="actions flex" aria-label="Primary actions">
					<button type="button" on:click={openApp}>Create your community</button>
					<a href={resolve('/explore')}>Start exploring</a>
				</div>
			</div>
			<div class="hero-manifesto relative pt-4 text-base ml-16">
				<!-- <div class="flex gap-4 justify-between"> -->
				<span>
					<p>To the neighbors.</p>
					<p>To the newcomers.</p>
					<p>To the organizers.</p>
				</span>
				<span>
					<p>To the thinkers.</p>
					<p>To the builders.</p>
					<p>To the merchants.</p>
				</span>
				<span>
					<p>To the players.</p>
					<p>To the faithful.</p>
					<p>To the introverts.</p>
				</span>
				<!-- </div> -->
				<br />
				<p>To the crazy ones.</p>
				<br />
				<p>To your community.</p>
			</div>
		</div>
		<!-- <div class="flex items-end pt-16">
			<img class="w-[70vw]" src={resolve('/hero-communities.png')} alt="" />
		</div> -->
		<div class="relative flex-1 self-stretch overflow-visible pt-16">
			<img
				class="absolute bottom-0 right-0 block h-[75vh] w-[65vw] max-w-none object-fill"
				src={resolve('/hero-communities.png')}
				alt=""
			/>
		</div>
	</section>

	<section class="home-slide" id="home">
		<div>
			<p class="small">The organizer pain</p>
			<h2>Your Community Deserves a Home.</h2>
			<div class="prose">
				<p>Most communities live across six different tools.</p>
				<p>One for chat. One for events. One for payments. One for announcements.</p>
				<p>One for members. One for sponsors.</p>
				<p>Nuts brings everything together. One community. One home.</p>
			</div>
		</div>
		<div class="tool-visual" aria-label="Disconnected tools moving into Nuts">
			<div class="tool-stack">
				{#each scatteredTools as tool (tool)}
					<span>{tool}</span>
				{/each}
			</div>
			<div class="arrow" aria-hidden="true">↓</div>
			<div class="nuts-home">Nuts</div>
		</div>
	</section>

	<section class="algorithm-slide">
		<div>
			<p class="small">The feed</p>
			<h2>Communities are the algorithm.</h2>
			<div class="prose">
				<p>Your feed isn't built by engagement metrics.</p>
				<p>It's built by the communities you care about.</p>
			</div>
			<div class="community-list">
				{#each communityExamples as community (community)}
					<span>{community}</span>
				{/each}
			</div>
			<p class="closing-line">
				No endless scrolling. No rage bait. Just what's happening in your world.
			</p>
		</div>
		<div class="visual-slot">
			<span>Visual placeholder</span>
			<strong>Community feed mockup</strong>
			<p>Phone screenshot with community chips and community-tagged posts.</p>
		</div>
	</section>

	<section class="trust-slide">
		<div>
			<p class="small">Trust</p>
			<h2>Real People. Real Communities.</h2>
		</div>
		<div class="prose">
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
		<div class="visual-slot dark-slot">
			<span>Visual placeholder</span>
			<strong>Real-world invites</strong>
			<p>Stickers, QR codes, notice boards, club entrances, and people joining in person.</p>
		</div>
	</section>

	<section class="belong-slide" id="belong">
		<div class="section-head">
			<p class="small">The social graph</p>
			<h2>Follow. Join. Belong.</h2>
			<p>Not every relationship is the same.</p>
		</div>
		<div class="level-grid">
			{#each relationshipLevels as level (level.name)}
				<article>
					<span>{level.name}</span>
					<h3>{level.line}</h3>
					<p>{level.examples}</p>
					<strong>{level.actions}</strong>
				</article>
			{/each}
		</div>
		<div class="callout">
			<p>Most social networks ask: <strong>Who do you follow?</strong></p>
			<p>Nuts asks: <strong>What are you part of?</strong></p>
		</div>
	</section>

	<section class="discovery-slide">
		<div>
			<p class="small">Discovery</p>
			<h2>Discover People Through Communities.</h2>
			<div class="prose">
				<p>Most social networks reward people who already have an audience.</p>
				<p>Nuts helps people get discovered through contribution.</p>
			</div>
			<div class="contributor-list">
				{#each contributors as contributor (contributor)}
					<span>{contributor}</span>
				{/each}
			</div>
			<p class="closing-line">Communities make people discoverable. Not algorithms.</p>
		</div>
		<div class="visual-slot">
			<span>Visual placeholder</span>
			<strong>Community → Person → Idea</strong>
			<p>Example card: Formula 1 community, Ferrari mechanic, and a useful post that spreads.</p>
		</div>
	</section>

	<section class="final" id="join">
		<div>
			<p class="small">The movement</p>
			<h2>A Better Internet Starts Locally.</h2>
			<div class="final-copy">
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
			<div class="actions final-actions" aria-label="Final actions">
				<button type="button" on:click={openApp}>Create your community</button>
				<a href={resolve('/explore')}>Start exploring</a>
			</div>
		</div>
		<footer>
			<strong>Nuts</strong>
			<span>The social network for communities.</span>
		</footer>
	</section>
</main>

<style>
	:global(body) {
		margin: 0;
		background: #f3eadc;
	}

	.nuts-page {
		min-height: 100vh;
		background: #f3eadc;
		color: #151411;
		font-family: "Suisse Int'l", Inter, ui-sans-serif, system-ui, sans-serif;
	}

	.hero,
	.final {
		background: #10100e;
		color: #fff8ea;
	}

	.hero {
		position: relative;
		height: 100vh;
		height: 100svh;
		max-height: 100vh;
		max-height: 100svh;
		overflow: hidden;
		background:
			radial-gradient(circle at 78% 60%, rgba(242, 211, 95, 0.2), transparent 34%),
			radial-gradient(circle at 96% 14%, rgba(83, 184, 106, 0.16), transparent 30%),
			linear-gradient(135deg, #020403 0%, #07110b 38%, #17140d 72%, #050505 100%);
	}

	.actions a {
		color: inherit;
		text-decoration: none;
	}

	.home-slide,
	.algorithm-slide,
	.trust-slide,
	.discovery-slide {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(300px, 0.72fr);
		gap: clamp(34px, 7vw, 92px);
		align-items: center;
		padding: clamp(72px, 11vw, 150px) clamp(18px, 7vw, 96px);
	}

	.hero-grid {
		position: relative;
		z-index: 1;
		display: grid;
		grid-template-columns: minmax(500px, 0.58fr) minmax(620px, 1fr);
		grid-template-rows: auto minmax(0, 1fr);
		column-gap: clamp(72px, 8vw, 150px);
		box-sizing: border-box;
		height: 100%;
		padding: clamp(44px, 6vw, 76px) clamp(16px, 2.6vw, 34px);
	}

	.hero-copy {
		position: relative;
		z-index: 2;
		text-align: left;
	}

	.home-slide,
	.discovery-slide {
		background: #dfe7c4;
	}

	.algorithm-slide {
		background: #f3eadc;
	}

	.trust-slide {
		grid-template-columns: minmax(0, 0.9fr) minmax(260px, 0.72fr) minmax(280px, 0.58fr);
		background: #4a5541;
		color: #fff8ea;
	}

	.belong-slide,
	.final {
		padding: clamp(72px, 11vw, 150px) clamp(18px, 7vw, 96px);
	}

	.belong-slide {
		background: #fff8ea;
	}

	.small {
		margin: 0;
		font-weight: 900;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.trust-slide .small,
	.final .small {
		color: #f2d35f;
	}

	.small {
		color: #716341;
		font-size: 0.82rem;
	}

	h1,
	h2,
	h3,
	p {
		letter-spacing: 0;
	}

	h1 {
		max-width: 720px;
		margin: 0 0 24px;
		font-size: clamp(3.6rem, 7.2vw, 7.4rem);
		line-height: 0.9;
	}

	h2 {
		max-width: 1080px;
		margin: 16px 0 0;
		font-size: clamp(2.7rem, 7vw, 7rem);
		line-height: 0.9;
	}

	.hero-copy > p,
	.prose p,
	.section-head p,
	.closing-line,
	.final-copy p {
		max-width: 760px;
		color: #4f493d;
		font-size: clamp(1.08rem, 1.8vw, 1.35rem);
		line-height: 1.55;
	}

	.hero-copy > p,
	.trust-slide .prose p,
	.final-copy p {
		color: rgba(255, 248, 234, 0.8);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		margin-top: 34px;
	}

	button,
	.actions a {
		border: 0;
		border-radius: 0;
		font: inherit;
		font-weight: 900;
		cursor: pointer;
	}

	button {
		background: #53b86a;
		color: #151411;
		padding: 15px 20px;
	}

	.actions a {
		border: 1px solid currentColor;
		padding: 14px 20px;
	}

	.hero-manifesto {
		z-index: 2;
		color: #f2bd3c;
		font-family: 'Bradley Hand', 'Segoe Print', 'Comic Sans MS', cursive;
		/*font-size: clamp(1rem, 1.35vw, 1.32rem);*/
		font-weight: 600;
		line-height: 1.45;
	}

	.hero-manifesto p {
		margin: 0;
		color: inherit;
		font: inherit;
		line-height: inherit;
	}

	.hero-manifesto br {
		display: block;
		content: '';
		margin-top: 12px;
	}

	.hero-manifesto::before {
		content: '↘';
		position: absolute;
		top: 8px;
		left: -1.5rem;
		color: #f2bd3c;
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
		font-size: 1.5rem;
		font-weight: 400;
		transform: rotate(18deg);
	}

	/*.hero-illustration {
		position: relative;
		grid-column: 2;
		grid-row: 1 / 3;
		align-self: end;
		justify-self: end;
		z-index: 1;
		width: 100%;
		height: min(68vh, 680px);
		overflow: hidden;
		opacity: 1;
		pointer-events: none;
	}*/

	/*.hero-illustration img {
		position: absolute;
		right: clamp(18px, 2.4vw, 42px);
		bottom: clamp(12px, 2vw, 28px);
		display: block;
		width: auto;
		max-width: none;
		height: min(68vh, 680px);
		object-fit: contain;
		filter: drop-shadow(0 34px 110px rgba(0, 0, 0, 0.34));
	}*/

	.visual-slot {
		position: relative;
		display: flex;
		min-height: clamp(320px, 44vw, 640px);
		flex-direction: column;
		justify-content: flex-end;
		overflow: hidden;
		border: 1px dashed rgba(21, 20, 17, 0.32);
		background:
			linear-gradient(135deg, rgba(83, 184, 106, 0.14), transparent 45%),
			repeating-linear-gradient(
				-45deg,
				rgba(21, 20, 17, 0.055) 0,
				rgba(21, 20, 17, 0.055) 1px,
				transparent 1px,
				transparent 16px
			);
		padding: clamp(20px, 3vw, 34px);
		color: #151411;
	}

	.dark-slot {
		border-color: rgba(255, 248, 234, 0.34);
		background:
			linear-gradient(135deg, rgba(83, 184, 106, 0.2), transparent 50%),
			repeating-linear-gradient(
				-45deg,
				rgba(255, 248, 234, 0.07) 0,
				rgba(255, 248, 234, 0.07) 1px,
				transparent 1px,
				transparent 16px
			);
		color: #fff8ea;
	}

	.visual-slot span {
		position: absolute;
		top: 22px;
		left: 22px;
		background: #151411;
		color: #fff8ea;
		padding: 8px 10px;
		font-size: 0.72rem;
		font-weight: 900;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.dark-slot span {
		background: #fff8ea;
		color: #151411;
	}

	.visual-slot strong {
		max-width: 440px;
		font-size: clamp(1.8rem, 4vw, 4rem);
		line-height: 0.94;
	}

	.visual-slot p {
		max-width: 420px;
		margin: 16px 0 0;
		color: currentColor;
		font-size: 1rem;
		line-height: 1.45;
		opacity: 0.72;
	}

	.tool-visual {
		display: grid;
		gap: 18px;
	}

	.tool-stack,
	.community-list,
	.contributor-list {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.tool-stack span,
	.community-list span,
	.contributor-list span {
		border: 1px solid rgba(21, 20, 17, 0.24);
		padding: 12px 14px;
		font-weight: 900;
	}

	.arrow {
		font-size: 3rem;
		font-weight: 900;
		line-height: 1;
	}

	.nuts-home {
		display: grid;
		min-height: 180px;
		place-items: center;
		background: #151411;
		color: #fff8ea;
		font-size: clamp(2.4rem, 7vw, 6rem);
		font-weight: 900;
	}

	.community-list,
	.contributor-list {
		max-width: 820px;
		margin: 34px 0 28px;
	}

	.trust-slide .prose {
		display: grid;
		gap: 12px;
	}

	.trust-slide .prose p {
		margin: 0;
	}

	.section-head {
		max-width: 1080px;
	}

	.level-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1px;
		margin-top: 46px;
		background: rgba(21, 20, 17, 0.22);
	}

	.level-grid article {
		display: grid;
		min-height: 320px;
		align-content: space-between;
		background: #fff8ea;
		padding: clamp(22px, 3vw, 34px);
	}

	.level-grid article:nth-child(2) {
		background: #dfe7c4;
	}

	.level-grid article:nth-child(3) {
		background: #151411;
		color: #fff8ea;
	}

	.level-grid span {
		color: #716341;
		font-size: 0.82rem;
		font-weight: 900;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.level-grid article:nth-child(3) span {
		color: #53b86a;
	}

	.level-grid h3 {
		margin: 28px 0 12px;
		font-size: clamp(2rem, 4vw, 4.2rem);
		line-height: 0.94;
	}

	.level-grid p,
	.level-grid strong {
		color: inherit;
		line-height: 1.45;
		opacity: 0.78;
	}

	.callout {
		display: grid;
		gap: 8px;
		margin-top: 34px;
		font-size: clamp(1.4rem, 3vw, 3rem);
		font-weight: 900;
		line-height: 1;
	}

	.callout p {
		margin: 0;
	}

	.final {
		display: grid;
		gap: clamp(72px, 10vw, 130px);
	}

	.final-copy {
		display: grid;
		gap: 10px;
		margin-top: 32px;
	}

	.final-copy p {
		margin: 0;
	}

	.final-actions a {
		border-color: rgba(255, 248, 234, 0.34);
	}

	.final footer {
		display: flex;
		justify-content: space-between;
		gap: 18px;
		border-top: 1px solid rgba(255, 248, 234, 0.2);
		padding-top: 22px;
		color: rgba(255, 248, 234, 0.64);
	}

	.final footer strong {
		color: #fff8ea;
	}

	@media (max-width: 900px) {
		.hero-grid,
		.home-slide,
		.algorithm-slide,
		.trust-slide,
		.discovery-slide {
			grid-template-columns: 1fr;
		}

		.hero-grid {
			padding-top: clamp(64px, 14vw, 110px);
		}

		.hero-copy,
		.hero-manifesto {
			grid-column: 1;
			grid-row: auto;
		}

		.hero-manifesto {
			max-width: 520px;
			margin: 42px 0 0 42px;
		}

		.hero-illustration {
			display: none;
		}

		.level-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 560px) {
		h1 {
			font-size: clamp(3.6rem, 17vw, 5.7rem);
		}

		h2 {
			font-size: clamp(2.45rem, 14vw, 4.6rem);
		}

		.actions,
		.final footer {
			flex-direction: column;
		}

		.actions a,
		button {
			text-align: center;
		}
	}
</style>

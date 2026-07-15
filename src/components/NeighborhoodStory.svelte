<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from 'src/lib/paths';

	export let onCreate: () => void;

	const chapters = [
		{
			id: 'gather',
			eyebrow: '01 — Gather',
			title: 'Already alive. Just scattered.',
			body: 'Chat in one app. Events in another. Payments somewhere else. Your community deserves one shared place.'
		},
		{
			id: 'feed',
			eyebrow: '02 — Hear what matters',
			title: 'Communities are the algorithm.',
			body: 'Your feed follows the places and people you care about—not whatever keeps strangers scrolling.'
		},
		{
			id: 'invite',
			eyebrow: '03 — Meet for real',
			title: 'Turn a post into a gathering.',
			body: 'Create an event, share its QR code, and bring your community together at the match, the market, or the hall.'
		},
		{
			id: 'belong',
			eyebrow: '04 — Belong',
			title: 'Follow. Join. Lead.',
			body: 'Follow a community to stay in the loop. Join as a member to take part. Step up as an admin to help lead it.'
		},
		{
			id: 'contribute',
			eyebrow: '05 — Be known',
			title: 'Contribution makes people visible.',
			body: 'The coach, the volunteer, the organizer and the maker become known through what they do—not their follower count.'
		},
		{
			id: 'local',
			eyebrow: '06 — Grow outward',
			title: 'A better internet starts locally.',
			body: 'Strong communities connect to other strong communities. The network grows from trust, not attention.'
		}
	];

	const chapterPalettes = [
		{ background: '#f2ebdd', accent: '#c7533f' },
		{ background: '#df725c', accent: '#052f26' },
		{ background: '#e7b638', accent: '#7b2f25' },
		{ background: '#b8cec0', accent: '#c7533f' },
		{ background: '#e5c9aa', accent: '#a33f32' },
		{ background: '#f2ebdd', accent: '#c7533f' }
	];

	const sceneObjects = [
		...[
			[1, 8, 12, 28, -70, -45, -7],
			[2, 37, 8, 26, 0, -80, 4],
			[3, 68, 13, 25, 75, -35, 7],
			[4, 10, 52, 24, -80, 25, -5],
			[5, 39, 48, 25, 0, 80, 3],
			[6, 70, 49, 23, 80, 30, 8],
			[7, 39, 72, 23, 0, 80, -4]
		].map(([id, x, y, width, fromX, fromY, rotate], index) => ({
			name: `tool-${id}`,
			src: `/neighborhood-story/objects/tool-${id}.svg`,
			chapters: [0],
			x,
			y,
			width,
			fromX,
			fromY,
			rotate,
			delay: index * 65
		})),
		...[
			['older', 2, 43, 23, -90, 35, -4],
			['parent', 17, 31, 25, -55, -65, 3],
			['player', 34, 43, 22, -15, 80, -2],
			['vendor', 49, 33, 24, 15, -80, 2],
			['cyclist', 64, 42, 25, 60, 70, -3],
			['musician', 78, 32, 22, 95, -45, 4]
		].map(([role, x, y, width, fromX, fromY, rotate], index) => ({
			name: `neighbor-${role}`,
			src: `/neighborhood-story/objects/neighbor-${role}.svg`,
			chapters: [1, 3],
			x,
			y,
			width,
			fromX,
			fromY,
			rotate,
			delay: index * 65
		})),
		{
			name: 'invite-flyer',
			src: '/neighborhood-story/objects/invitation-1.svg',
			chapters: [2],
			x: 4,
			y: 17,
			width: 55,
			fromX: -100,
			fromY: -25,
			rotate: -5,
			delay: 0
		},
		{
			name: 'invite-qr',
			src: '/neighborhood-story/objects/invitation-2.svg',
			chapters: [2],
			x: 48,
			y: 16,
			width: 48,
			fromX: 100,
			fromY: 25,
			rotate: 5,
			delay: 120
		},
		{
			name: 'coach',
			src: '/neighborhood-story/objects/contributor-coach.svg',
			chapters: [4],
			x: 3,
			y: 31,
			width: 29,
			fromX: -90,
			fromY: 30,
			rotate: -5,
			delay: 0
		},
		{
			name: 'volunteer',
			src: '/neighborhood-story/objects/contributor-volunteer.svg',
			chapters: [4],
			x: 25,
			y: 29,
			width: 28,
			fromX: -25,
			fromY: -80,
			rotate: 3,
			delay: 80
		},
		{
			name: 'organizer',
			src: '/neighborhood-story/objects/contributor-organizer.svg',
			chapters: [4],
			x: 48,
			y: 29,
			width: 28,
			fromX: 25,
			fromY: -80,
			rotate: -3,
			delay: 160
		},
		{
			name: 'repair',
			src: '/neighborhood-story/objects/contributor-repair.svg',
			chapters: [4],
			x: 69,
			y: 31,
			width: 29,
			fromX: 90,
			fromY: 30,
			rotate: 5,
			delay: 240
		},
		{
			name: 'sports',
			src: '/neighborhood-story/objects/landmark-1.svg',
			chapters: [5],
			x: 7,
			y: 56,
			width: 22,
			fromX: 300,
			fromY: -20,
			rotate: -5,
			delay: 260
		},
		{
			name: 'school',
			src: '/neighborhood-story/objects/landmark-2.svg',
			chapters: [5],
			x: 9,
			y: 13,
			width: 21,
			fromX: 280,
			fromY: 210,
			rotate: -4,
			delay: 120
		},
		{
			name: 'market',
			src: '/neighborhood-story/objects/landmark-3.svg',
			chapters: [5],
			x: 27,
			y: 60,
			width: 21,
			fromX: 145,
			fromY: -55,
			rotate: 2,
			delay: 320
		},
		{
			name: 'hall',
			src: '/neighborhood-story/objects/landmark-4.svg',
			chapters: [5],
			x: 39,
			y: 34,
			width: 24,
			fromX: 0,
			fromY: 24,
			rotate: 0,
			delay: 0
		},
		{
			name: 'events',
			src: '/neighborhood-story/objects/landmark-5.svg',
			chapters: [5],
			x: 70,
			y: 12,
			width: 22,
			fromX: -210,
			fromY: 215,
			rotate: 4,
			delay: 180
		},
		{
			name: 'workshop',
			src: '/neighborhood-story/objects/landmark-6.svg',
			chapters: [5],
			x: 70,
			y: 57,
			width: 22,
			fromX: -205,
			fromY: -45,
			rotate: 5,
			delay: 380
		}
	];

	let storyElement: HTMLElement;
	let activeChapter = 0;

	onMount(() => {
		const elements = Array.from(storyElement.querySelectorAll<HTMLElement>('[data-story-chapter]'));
		const motionObjects = Array.from(
			storyElement.querySelectorAll<HTMLElement>('[data-motion-object]')
		);
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
		let frame = 0;
		let previousProgress = 0;

		const updateMotion = () => {
			frame = 0;
			const viewportCenter = window.scrollY + window.innerHeight * 0.5;
			const centers = elements.map(
				(element) =>
					element.getBoundingClientRect().top + window.scrollY + element.offsetHeight * 0.5
			);
			let progress = 0;
			for (let index = 0; index < centers.length - 1; index += 1) {
				if (viewportCenter >= centers[index]) {
					progress =
						index +
						Math.min(1, (viewportCenter - centers[index]) / (centers[index + 1] - centers[index]));
				}
			}
			progress = Math.max(0, Math.min(chapters.length - 1, progress));
			const nextChapter = Math.round(progress);
			if (nextChapter !== activeChapter) activeChapter = nextChapter;
			storyElement.style.setProperty('--story-progress', progress.toFixed(3));
			const movingForward = progress >= previousProgress;
			storyElement.dataset.scrollDirection = movingForward ? 'forward' : 'backward';
			previousProgress = progress;

			if (!reducedMotion.matches) {
				motionObjects.forEach((element) => {
					const objectChapters = (element.dataset.chapters || '').split(',').map(Number);
					const distance = objectChapters.reduce(
						(closest, chapter) =>
							Math.abs(progress - chapter) < Math.abs(closest) ? progress - chapter : closest,
						99
					);
					const isEntering = movingForward ? distance <= 0 : distance >= 0;
					const revealRange = isEntering ? 0.72 : 0.5;
					const rawReveal = Math.max(0, Math.min(1, 1 - Math.abs(distance) / revealRange));
					const stagger = Math.min(0.46, Number(element.dataset.delay || 0) / 900);
					const reveal = Math.max(0, Math.min(1, (rawReveal - stagger) / (1 - stagger)));
					const exitDirection = distance > 0 ? -0.72 : 1;
					element.style.setProperty('--motion-opacity', reveal.toFixed(3));
					element.style.setProperty(
						'--motion-x',
						`${(Number(element.dataset.fromX) * (1 - reveal) * exitDirection).toFixed(2)}px`
					);
					element.style.setProperty(
						'--motion-y',
						`${(Number(element.dataset.fromY) * (1 - reveal) * exitDirection).toFixed(2)}px`
					);
					element.style.setProperty('--motion-scale', (0.72 + reveal * 0.28).toFixed(3));
					element.style.setProperty(
						'--motion-rotate',
						`${(Number(element.dataset.rotate) * (1 - reveal) * exitDirection).toFixed(2)}deg`
					);
				});
			}
		};
		const requestUpdate = () => {
			if (!frame) frame = requestAnimationFrame(updateMotion);
		};
		updateMotion();
		window.addEventListener('scroll', requestUpdate, { passive: true });
		window.addEventListener('resize', requestUpdate);
		return () => {
			window.removeEventListener('scroll', requestUpdate);
			window.removeEventListener('resize', requestUpdate);
			if (frame) cancelAnimationFrame(frame);
		};
	});
</script>

<section
	bind:this={storyElement}
	class="neighborhood-story relative text-[#052f26]"
	id="home"
	style={`--chapter-bg:${chapterPalettes[activeChapter].background};--chapter-accent:${chapterPalettes[activeChapter].accent}`}
>
	<div
		class="relative mx-auto grid max-w-[1500px] lg:grid-cols-[0.78fr_1.22fr] lg:gap-10 lg:px-12 xl:px-16"
	>
		<div class="relative z-10 px-5 sm:px-8 lg:px-0">
			{#each chapters as chapter, index (chapter.id)}
				<article
					class="story-chapter flex min-h-[88dvh] flex-col justify-center py-24 lg:min-h-[100dvh] lg:py-32"
					data-story-chapter={index}
					id={chapter.id}
				>
					<div class:chapter-active={activeChapter === index} class="chapter-copy max-w-[620px]">
						<p class="chapter-eyebrow text-sm font-black tracking-[0.16em]">{chapter.eyebrow}</p>
						<h2
							class="mt-7 text-[clamp(3.4rem,5.7vw,6.8rem)] font-black leading-[0.88] tracking-[-0.065em]"
						>
							{chapter.title}
						</h2>
						<p
							class="chapter-body mt-9 max-w-[560px] text-xl font-medium leading-8 sm:text-2xl sm:leading-9"
						>
							{chapter.body}
						</p>
						{#if index === chapters.length - 1}
							<div class="mt-10 flex flex-wrap gap-5">
								<button
									class="rounded-full bg-[#e7b638] px-7 py-4 text-lg font-black text-[#15372c] shadow-[0_8px_0_#df725c] transition hover:-translate-y-1"
									type="button"
									on:click={onCreate}>Create your community</button
								>
								<a
									class="border-b-2 border-[#052f26] py-3 text-lg font-black text-[#052f26] no-underline"
									href={resolve('/explore')}>Explore communities →</a
								>
							</div>
						{/if}
					</div>

					<div
						class={`scene scene-state-${index} relative mt-12 h-[22rem] overflow-hidden lg:hidden`}
						aria-label={`Illustration for ${chapter.title}`}
					>
						{#each sceneObjects as object (object.name)}
							<div
								class={`scene-object motion-object-${object.name} ${object.chapters.map((chapter) => `object-chapter-${chapter}`).join(' ')}`}
								style={`--x:${object.x}%;--y:${object.y}%;--width:${object.width}%;--from-x:${object.fromX}px;--from-y:${object.fromY}px;--rotate:${object.rotate}deg;--delay:${object.delay}ms`}
							>
								<img
									class={`motion-art motion-${object.name}`}
									src={resolve(object.src)}
									alt=""
									loading="lazy"
								/>
							</div>
						{/each}
						<div class="scene-layer layer-belonging" aria-hidden="true">
							<span class="orbit orbit-one"></span><span class="orbit orbit-two"></span>
							<b>FOLLOWER</b><b>MEMBER</b><b>ADMIN</b>
						</div>
						<div class="scene-layer network-labels" aria-hidden="true">
							<b>School</b><b>Sports</b><b>Market</b><b>Community hall</b><b>Events</b><b
								>Workshop</b
							>
						</div>
					</div>
				</article>
			{/each}
		</div>

		<aside
			class="sticky top-0 hidden h-[100dvh] items-center justify-center overflow-hidden lg:flex"
			aria-live="polite"
		>
			<div
				class={`scene scene-state-${activeChapter} stage-shell relative h-[100dvh] w-full overflow-hidden`}
			>
				{#each sceneObjects as object (object.name)}
					<div
						class={`scene-object motion-object-${object.name} ${object.chapters.map((chapter) => `object-chapter-${chapter}`).join(' ')}`}
						data-motion-object
						data-chapters={object.chapters.join(',')}
						data-from-x={object.fromX}
						data-from-y={object.fromY}
						data-rotate={object.rotate}
						data-delay={object.delay}
						style={`--x:${object.x}%;--y:${object.y}%;--width:${object.width}%;--from-x:${object.fromX}px;--from-y:${object.fromY}px;--rotate:${object.rotate}deg;--delay:${object.delay}ms`}
					>
						<img class={`motion-art motion-${object.name}`} src={resolve(object.src)} alt="" />
					</div>
				{/each}
				<div class="scene-layer layer-belonging" aria-hidden="true">
					<span class="orbit orbit-one"></span><span class="orbit orbit-two"></span>
					<b>FOLLOWER</b><b>MEMBER</b><b>ADMIN</b>
				</div>
				<div class="scene-layer network-labels" aria-hidden="true">
					<b>School</b><b>Sports</b><b>Market</b><b>Community hall</b><b>Events</b><b>Workshop</b>
				</div>

				<div
					class="absolute bottom-7 left-1/2 flex -translate-x-1/2 gap-2"
					aria-label={`Chapter ${activeChapter + 1} of ${chapters.length}`}
				>
					{#each chapters as chapter, index (chapter.id)}
						<span
							class={`block rounded-full transition-all duration-500 ${activeChapter === index ? 'h-3 w-8 bg-[#15372c]' : 'h-2 w-2 bg-[#15372c]/25'}`}
						></span>
					{/each}
				</div>
			</div>
		</aside>
	</div>
</section>

<style>
	.neighborhood-story {
		background: var(--chapter-bg);
		transition: background-color 900ms cubic-bezier(0.22, 1, 0.36, 1);
	}
	.chapter-eyebrow {
		color: var(--chapter-accent);
		transition: color 700ms ease;
	}
	.chapter-body {
		color: rgba(5, 47, 38, 0.72);
	}
	.chapter-copy {
		opacity: 0.42;
		transform: translateY(26px);
		transition:
			opacity 500ms ease,
			transform 700ms cubic-bezier(0.22, 1, 0.36, 1);
	}
	.chapter-copy.chapter-active {
		opacity: 1;
		transform: translateY(0);
	}
	.scene-layer {
		position: absolute;
		inset: 0;
		height: 100%;
		width: 100%;
	}
	.scene-object {
		position: absolute;
		left: var(--x);
		top: var(--y);
		z-index: 4;
		width: var(--width);
		height: auto;
		object-fit: contain;
		opacity: var(--motion-opacity, 0);
		transform: translate(var(--motion-x, var(--from-x)), var(--motion-y, var(--from-y)))
			rotate(var(--motion-rotate, var(--rotate))) scale(var(--motion-scale, 0.72));
		will-change: transform, opacity;
	}
	.scene-object::after {
		position: absolute;
		pointer-events: none;
		content: '';
	}
	.motion-object-tool-2::after {
		left: 78%;
		top: 38%;
		height: 22%;
		width: 22%;
		border: 3px solid #df725c;
		border-left: 0;
		border-radius: 0 999px 999px 0;
		animation: signal-wave 1.6s ease-out infinite;
	}
	.motion-object-invite-qr::after {
		right: 5%;
		top: 4%;
		height: 28%;
		width: 28%;
		border: 3px solid #e7b638;
		border-radius: 0.4rem;
		animation: qr-focus 2s ease-in-out infinite;
	}
	.motion-object-neighbor-cyclist::after,
	.motion-object-repair::after {
		left: 32%;
		bottom: 2%;
		height: 32%;
		width: 32%;
		border: 3px dashed rgba(223, 114, 92, 0.8);
		border-radius: 50%;
		animation: wheel-spin 4s linear infinite;
	}
	.motion-object-hall::after {
		left: 50%;
		top: 55%;
		height: 18px;
		width: 18px;
		transform: translate(-50%, -50%);
		border: 4px solid #e7b638;
		border-radius: 50%;
		animation: hub-pulse 1.8s ease-out infinite;
	}
	.motion-art {
		display: block;
		width: 100%;
		height: auto;
		transform-origin: 50% 82%;
		animation: character-breathe 3.2s ease-in-out infinite alternate;
		animation-delay: calc(var(--delay) * -1);
		animation-play-state: paused;
		will-change: transform;
	}
	.motion-tool-1,
	.motion-tool-3,
	.motion-tool-5,
	.motion-tool-7 {
		animation-name: object-float-left;
	}
	.motion-tool-2,
	.motion-tool-4,
	.motion-tool-6 {
		animation-name: object-float-right;
	}
	.motion-invite-flyer {
		animation-name: flyer-sway;
		transform-origin: 65% 55%;
	}
	.motion-invite-qr {
		animation-name: phone-check;
	}
	.motion-neighbor-player,
	.motion-neighbor-cyclist,
	.motion-repair {
		animation-name: active-bob;
		animation-duration: 1.8s;
	}
	.motion-neighbor-musician {
		animation-name: musician-groove;
		animation-duration: 2.1s;
	}
	.motion-coach,
	.motion-volunteer,
	.motion-organizer {
		animation-name: contributor-proud;
		animation-duration: 2.8s;
	}
	.motion-sports,
	.motion-school,
	.motion-market,
	.motion-hall,
	.motion-events,
	.motion-workshop {
		animation-name: node-breathe;
		animation-duration: 2.6s;
	}
	.scene-state-0 .object-chapter-0 .motion-art,
	.scene-state-1 .object-chapter-1 .motion-art,
	.scene-state-2 .object-chapter-2 .motion-art,
	.scene-state-3 .object-chapter-3 .motion-art,
	.scene-state-4 .object-chapter-4 .motion-art,
	.scene-state-5 .object-chapter-5 .motion-art {
		animation-play-state: running;
	}
	.scene-layer {
		pointer-events: none;
		opacity: 0;
		transition: opacity 260ms ease;
	}
	.network-labels {
		z-index: 8;
		color: #15372c;
	}
	.network-labels b {
		position: absolute;
		border: 2px solid #15372c;
		background: #f2ebdd;
		padding: 0.35rem 0.65rem;
		font-size: 0.65rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		box-shadow: 3px 4px 0 #e7b638;
		opacity: 0;
		transform: translateY(10px) scale(0.8) rotate(-3deg);
		transition:
			opacity 300ms ease,
			transform 600ms cubic-bezier(0.16, 1, 0.3, 1);
	}
	.network-labels b:nth-child(1) {
		left: 8%;
		top: 8%;
	}
	.network-labels b:nth-child(2) {
		left: 7%;
		top: 49%;
	}
	.network-labels b:nth-child(3) {
		left: 28%;
		top: 78%;
	}
	.network-labels b:nth-child(4) {
		left: 43%;
		top: 27%;
	}
	.network-labels b:nth-child(5) {
		right: 8%;
		top: 8%;
	}
	.network-labels b:nth-child(6) {
		right: 5%;
		top: 78%;
	}
	.layer-belonging {
		z-index: 7;
		color: #15372c;
	}
	.layer-belonging .orbit {
		position: absolute;
		left: 50%;
		top: 53%;
		height: auto;
		aspect-ratio: 1;
		border: 4px solid #e7b638;
		border-radius: 50%;
		transform: translate(-50%, -50%);
		animation: orbit-breathe 3s ease-in-out infinite alternate;
	}
	.layer-belonging .orbit-one {
		width: min(42%, 42dvh);
	}
	.layer-belonging .orbit-two {
		width: min(68%, 68dvh);
		border-color: #df725c;
		animation-delay: -1.5s;
	}
	.layer-belonging b {
		position: absolute;
		border: 2px solid #15372c;
		background: #f2ebdd;
		padding: 0.65rem 1rem;
		font-size: 0.75rem;
		letter-spacing: 0.12em;
		box-shadow: 5px 6px 0 #e7b638;
	}
	.layer-belonging b:nth-of-type(1) {
		left: 12%;
		top: 23%;
		transform: rotate(-5deg);
	}
	.layer-belonging b:nth-of-type(2) {
		right: 11%;
		top: 30%;
		transform: rotate(4deg);
	}
	.layer-belonging b:nth-of-type(3) {
		left: 43%;
		bottom: 9%;
		transform: rotate(-2deg);
	}

	.scene-state-3 .layer-belonging {
		opacity: 1;
		transform: scale(1);
	}
	.scene-state-5 .network-labels {
		opacity: 1;
		transform: scale(1);
	}
	.scene-state-5 .network-labels b {
		opacity: 1;
		transform: translateY(0) scale(1) rotate(0);
	}
	.scene-state-5 .network-labels b:nth-child(2) {
		transition-delay: 80ms;
	}
	.scene-state-5 .network-labels b:nth-child(3) {
		transition-delay: 160ms;
	}
	.scene-state-5 .network-labels b:nth-child(4) {
		transition-delay: 240ms;
	}
	.scene-state-5 .network-labels b:nth-child(5) {
		transition-delay: 320ms;
	}
	.scene-state-5 .network-labels b:nth-child(6) {
		transition-delay: 400ms;
	}
	@keyframes character-breathe {
		to {
			transform: translateY(-5px) scale(1.015);
		}
	}
	@keyframes object-float-left {
		from {
			transform: translateY(2px) rotate(-2deg);
		}
		to {
			transform: translateY(-9px) rotate(2deg);
		}
	}
	@keyframes object-float-right {
		from {
			transform: translateY(-3px) rotate(2deg);
		}
		to {
			transform: translateY(8px) rotate(-2deg);
		}
	}
	@keyframes flyer-sway {
		from {
			transform: rotate(-1.5deg);
		}
		to {
			transform: rotate(2deg) translateY(-3px);
		}
	}
	@keyframes phone-check {
		45% {
			transform: translateY(-4px) rotate(-1deg);
		}
		55% {
			transform: translateY(-6px) rotate(1deg);
		}
	}
	@keyframes active-bob {
		50% {
			transform: translateY(-6px) rotate(1deg);
		}
	}
	@keyframes musician-groove {
		35% {
			transform: rotate(-2deg) translateY(-3px);
		}
		70% {
			transform: rotate(2deg) translateY(1px);
		}
	}
	@keyframes contributor-proud {
		to {
			transform: translateY(-5px) scale(1.02);
		}
	}
	@keyframes node-breathe {
		to {
			transform: translateY(-4px) scale(1.035);
		}
	}
	@keyframes orbit-breathe {
		to {
			scale: 1.035;
			opacity: 0.72;
		}
	}
	@keyframes signal-wave {
		from {
			opacity: 1;
			transform: scale(0.35);
		}
		to {
			opacity: 0;
			transform: scale(1.5);
		}
	}
	@keyframes qr-focus {
		50% {
			opacity: 0.35;
			transform: scale(1.12);
		}
	}
	@keyframes wheel-spin {
		to {
			rotate: 360deg;
		}
	}
	@keyframes hub-pulse {
		to {
			opacity: 0;
			transform: translate(-50%, -50%) scale(2.8);
		}
	}
	@media (min-width: 1024px) {
		.scene-object {
			transition: none;
		}
	}
	@media (max-width: 1023px) {
		.story-chapter {
			border-bottom: 1px solid rgba(242, 235, 221, 0.14);
		}
		.chapter-copy {
			opacity: 1;
			transform: none;
		}
		.scene-layer,
		.scene-object {
			transition: none;
		}
		.scene-state-0 .object-chapter-0,
		.scene-state-1 .object-chapter-1,
		.scene-state-2 .object-chapter-2,
		.scene-state-3 .object-chapter-3,
		.scene-state-4 .object-chapter-4,
		.scene-state-5 .object-chapter-5 {
			opacity: 1;
			transform: translate(0, 0) scale(1) rotate(0);
		}
		.layer-belonging b {
			padding: 0.4rem 0.65rem;
			font-size: 0.55rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.chapter-copy,
		.scene-layer,
		.scene-object,
		.motion-art,
		.scene-object::after,
		.layer-belonging .orbit {
			animation: none;
			transition: none;
		}
		.chapter-copy {
			opacity: 1;
			transform: none;
		}
		.scene-state-0 .object-chapter-0,
		.scene-state-1 .object-chapter-1,
		.scene-state-2 .object-chapter-2,
		.scene-state-3 .object-chapter-3,
		.scene-state-4 .object-chapter-4,
		.scene-state-5 .object-chapter-5 {
			opacity: 1;
			transform: translate(0, 0) scale(1) rotate(0);
		}
	}
</style>

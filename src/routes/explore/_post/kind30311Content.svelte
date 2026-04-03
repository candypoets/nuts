<script lang="ts">
	import type { ParsedEvent } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asPreGeneric, fbArray, isParsedEvent } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { openLiveStream } from 'src/controller/image';
	import { onDestroy } from 'svelte';

	export let note: ParsedEvent;

	let videoEl: HTMLVideoElement;
	let audioEl: HTMLAudioElement;
	let error: string | null = null;
	let isPlaying = false;
	let isMuted = true; // Start muted for inline (autoplay friendly)
	let chatMessages: ParsedEvent[] = [];
	let chatSub: (() => void) | undefined;
	let hasSubscribed = false;
	let videoLoaded = false;

	// Get the PreGenericParsed view directly from the note
	$: generic = asPreGeneric(note);
	$: dTag = generic?.d();

	// Detect if this is likely an audio-only stream
	$: isAudioOnly =
		!generic?.image() &&
		(generic?.service()?.toLowerCase().includes('audio') ||
			generic?.title()?.toLowerCase().includes('audio') ||
			generic?.title()?.toLowerCase().includes('space'));

	$: status = generic?.status() || 'planned';
	$: isLive = status === 'live';
	$: isEnded = status === 'ended';
	$: streamUrl = isLive ? generic?.streaming() : generic?.recording();

	// Subscribe to chat messages when note and dTag are available
	$: if (note && dTag && !hasSubscribed) {
		hasSubscribed = true;
		subscribeToChat();
	}

	// Format timestamp
	function formatTime(timestamp: bigint | undefined): string {
		if (timestamp === undefined || timestamp === BigInt(0)) return '';
		try {
			const date = new Date(Number(timestamp) * 1000);
			return date.toLocaleString();
		} catch {
			return '';
		}
	}

	// Status colors
	const statusConfig = {
		planned: {
			color: 'text-warning',
			bg: 'bg-warning/20',
			icon: 'ri:calendar-line',
			label: 'Upcoming'
		},
		live: { color: 'text-error', bg: 'bg-error/20', icon: 'ri:broadcast-line', label: 'Live Now' },
		ended: { color: 'text-white/50', bg: 'bg-white/10', icon: 'ri:check-line', label: 'Ended' }
	};

	$: statusInfo = statusConfig[status as keyof typeof statusConfig] || statusConfig.planned;

	function openFullscreen(e?: MouseEvent) {
		// Don't open if clicking on video controls
		if (e) {
			const target = e.target as HTMLElement;
			if (
				target.tagName === 'BUTTON' ||
				target.closest('button') ||
				target.tagName === 'VIDEO' ||
				target.tagName === 'AUDIO'
			) {
				return;
			}
		}

		if (!note) return;

		// Pass the video/audio element for seamless transition
		if (isAudioOnly && audioEl) {
			openLiveStream(note, undefined, audioEl);
		} else if (!isAudioOnly && videoEl) {
			openLiveStream(note, videoEl);
		} else {
			openLiveStream(note);
		}
	}

	function togglePlay(e: MouseEvent) {
		e.stopPropagation();
		const el = isAudioOnly ? audioEl : videoEl;
		if (!el) return;
		if (el.paused) {
			el.play().catch(() => {});
			isPlaying = true;
		} else {
			el.pause();
			isPlaying = false;
		}
	}

	function toggleMute(e: MouseEvent) {
		e.stopPropagation();
		const el = isAudioOnly ? audioEl : videoEl;
		if (!el) return;
		el.muted = !el.muted;
		isMuted = el.muted;
	}

	function setupMediaElement() {
		if (!streamUrl || videoLoaded) return;

		const el = isAudioOnly ? audioEl : videoEl;
		if (!el) return;

		videoLoaded = true;

		// Check if native HLS support (Safari)
		if (streamUrl.endsWith('.m3u8')) {
			if (el.canPlayType('application/vnd.apple.mpegurl')) {
				el.src = streamUrl;
			} else {
				error = 'HLS streams require Safari or hls.js library';
			}
		} else {
			// Regular video/audio URL
			el.src = streamUrl;
		}
	}

	$: if (streamUrl && !videoLoaded) {
		// Wait for element to bind
		setTimeout(setupMediaElement, 0);
	}

	onDestroy(() => {
		if (chatSub) {
			chatSub();
		}
	});

	function subscribeToChat() {
		if (!note || !dTag) return;

		const author = note.pubkey();
		if (!author) return;

		// Build the a-tag reference for this live event (30311:<pubkey>:<d>)
		const aTag = `30311:${author}:${dTag}`;

		chatSub = useSubscription(
			`livechat_${note.id()}_${dTag}`,
			[
				{
					kinds: [1311],
					tags: { '#a': [aTag] },
					limit: 50,
					relays: []
				}
			],
			(message) => {
				const parsedEvent = isParsedEvent(message);
				// Check if this is a kind 1311 message
				if (parsedEvent && parsedEvent.kind() === 1311) {
					// Add new message to chat (avoid duplicates)
					if (!chatMessages.some((m) => m.id() === parsedEvent.id())) {
						chatMessages = [...chatMessages, parsedEvent];
					}
				}
			}
		);
	}
</script>

{#if generic?.title() || generic?.streaming()}
	<div
		class="mt-2 rounded-lg overflow-hidden border border-primary-content/20 cursor-pointer hover:opacity-95 transition-opacity relative group min-h-[200px]"
		on:click|stopPropagation={openFullscreen}
	>
		{#if generic?.image()}
			<!-- Full background image -->
			<div class="absolute inset-0">
				<img
					src={generic.image()}
					alt={generic.title()}
					class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
				/>
			</div>
			<!-- Gradient backdrop for text readability -->
			<div class="absolute inset-0 bg-gradient-to-b from-black/80 via-black/50 to-black/80"></div>
		{:else}
			<!-- Fallback gradient background -->
			<div
				class="absolute inset-0 bg-gradient-to-br from-error/30 via-purple-900/50 to-black"
			></div>
		{/if}

		<!-- Live indicator pulse for live streams -->
		{#if generic?.status() === 'live'}
			<div class="absolute top-3 right-3">
				<div
					class="flex items-center gap-2 bg-error/90 text-white px-3 py-1 rounded-full text-xs font-semibold animate-pulse"
				>
					<div class="w-2 h-2 bg-white rounded-full"></div>
					<span>LIVE</span>
				</div>
			</div>
		{/if}

		<!-- Content overlaid on top -->
		<div class="relative z-10 p-4 flex flex-col h-full min-h-[200px]">
			<!-- Live Event badge -->
			<div class="flex items-center gap-2 mb-3">
				<div
					class="flex items-center gap-1.5 {statusInfo.color} {statusInfo.bg} px-2.5 py-1 rounded-full text-xs font-medium"
				>
					<Icon icon={statusInfo.icon} />
					<span>{statusInfo.label}</span>
				</div>
				{#if fbArray(generic, 'topics').length > 0}
					<span class="text-xs bg-white/10 text-white/70 px-2 py-0.5 rounded-full">
						#{fbArray(generic, 'topics')[0]}
					</span>
				{/if}
			</div>

			<!-- Title -->
			{#if generic?.title()}
				<h3 class="font-bold text-lg leading-tight mb-2 text-white line-clamp-2 drop-shadow-lg">
					{generic.title()}
				</h3>
			{/if}

			<!-- Summary -->
			{#if generic?.description()}
				<p class="text-sm text-white/80 line-clamp-2 mb-3 drop-shadow-md">
					{generic.description()}
				</p>
			{/if}

			<!-- Inline Video Player (for live/recording streams) -->
			{#if streamUrl && !error}
				<div
					class="relative rounded-lg overflow-hidden bg-black/40 mb-3 group/video"
					on:click|stopPropagation
				>
					{#if isAudioOnly}
						<!-- Audio-only inline UI -->
						<div class="flex items-center gap-3 p-3">
							{#if generic?.image()}
								<img
									src={generic.image()}
									alt={generic?.title()}
									class="w-12 h-12 rounded object-cover"
								/>
							{:else}
								<div class="w-12 h-12 rounded bg-accent/30 flex items-center justify-center">
									<Icon icon="ri:music-2-line" class="text-xl text-white" />
								</div>
							{/if}
							<div class="flex-1 min-w-0">
								<p class="text-sm text-white truncate">{generic?.title() || 'Audio stream'}</p>
								<p class="text-xs text-white/50">Audio only</p>
							</div>
							<button
								class="p-2 rounded-full bg-accent hover:bg-accent/80 text-white transition-colors"
								on:click={togglePlay}
							>
								<Icon icon={isPlaying ? 'ri:pause-fill' : 'ri:play-fill'} class="text-lg" />
							</button>
							<button
								class="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
								on:click={toggleMute}
							>
								<Icon
									icon={isMuted ? 'ri:volume-mute-line' : 'ri:volume-up-line'}
									class="text-sm"
								/>
							</button>
						</div>
						<audio
							bind:this={audioEl}
							class="hidden"
							muted={isMuted}
							on:play={() => (isPlaying = true)}
							on:pause={() => (isPlaying = false)}
						/>
					{:else}
						<!-- Video inline UI -->
						<div class="relative aspect-video bg-black">
							<video
								bind:this={videoEl}
								class="w-full h-full object-contain"
								playsinline
								muted={isMuted}
								poster={generic?.image() || ''}
								on:play={() => (isPlaying = true)}
								on:pause={() => (isPlaying = false)}
							/>

							<!-- Center play button overlay when paused -->
							{#if !isPlaying}
								<button
									class="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/50 transition-colors"
									on:click={togglePlay}
								>
									<div
										class="w-14 h-14 rounded-full bg-accent/90 flex items-center justify-center hover:scale-110 transition-transform"
									>
										<Icon icon="ri:play-fill" class="text-2xl text-white ml-0.5" />
									</div>
								</button>
							{/if}

							<!-- Bottom controls -->
							<div
								class="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover/video:opacity-100 transition-opacity"
							>
								<div class="flex items-center gap-2">
									<button
										class="p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
										on:click={togglePlay}
									>
										<Icon icon={isPlaying ? 'ri:pause-fill' : 'ri:play-fill'} class="text-sm" />
									</button>
									<button
										class="p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
										on:click={toggleMute}
									>
										<Icon
											icon={isMuted ? 'ri:volume-mute-line' : 'ri:volume-up-line'}
											class="text-sm"
										/>
									</button>
									{#if isLive}
										<span class="text-xs text-white/70 flex items-center gap-1">
											<span class="w-1.5 h-1.5 bg-error rounded-full animate-pulse"></span>
											LIVE
										</span>
									{/if}
								</div>
							</div>
						</div>
					{/if}
				</div>
			{:else if error}
				<div class="flex items-center gap-2 text-warning text-xs p-2 bg-warning/10 rounded mb-3">
					<Icon icon="ri:error-warning-line" />
					<span>{error}</span>
				</div>
			{/if}

			<!-- Spacer to push footer to bottom -->
			<div class="flex-grow"></div>

			<!-- Participants info -->
			{#if fbArray(generic, 'participants').filter((p) => p.role() === 'Host').length > 0 || fbArray(generic, 'participants').filter((p) => p.role() === 'Speaker').length > 0}
				<div class="flex flex-wrap gap-2 mb-3">
					{#if fbArray(generic, 'participants').filter((p) => p.role() === 'Host').length > 0}
						<div class="flex items-center gap-1 text-xs text-white/70">
							<Icon icon="ri:user-star-line" />
							<span
								>{fbArray(generic, 'participants').filter((p) => p.role() === 'Host').length} host{fbArray(
									generic,
									'participants'
								).filter((p) => p.role() === 'Host').length > 1
									? 's'
									: ''}</span
							>
						</div>
					{/if}
					{#if fbArray(generic, 'participants').filter((p) => p.role() === 'Speaker').length > 0}
						<div class="flex items-center gap-1 text-xs text-white/70">
							<Icon icon="ri:microphone-line" />
							<span
								>{fbArray(generic, 'participants').filter((p) => p.role() === 'Speaker').length} speaker{fbArray(
									generic,
									'participants'
								).filter((p) => p.role() === 'Speaker').length > 1
									? 's'
									: ''}</span
							>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Footer with time and action -->
			<div class="flex items-center justify-between pt-3 border-t border-white/20">
				<div class="flex flex-col gap-1 text-xs text-white/60">
					{#if generic?.starts() !== undefined && generic?.starts() !== BigInt(0)}
						<div class="flex items-center gap-1">
							<Icon icon="ri:time-line" />
							<span>{formatTime(generic.starts())}</span>
						</div>
					{/if}
					{#if generic?.currentParticipants() !== undefined && generic?.currentParticipants() > BigInt(0)}
						<div class="flex items-center gap-1">
							<Icon icon="ri:user-line" />
							<span>{generic.currentParticipants()} watching</span>
						</div>
					{/if}
				</div>

				<!-- Action button - explicit click handler -->
				{#if generic?.status() === 'live' && generic?.streaming()}
					<button
						class="flex items-center gap-1.5 bg-accent hover:bg-accent/80 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors"
						on:click|stopPropagation={openFullscreen}
					>
						<Icon icon="ri:play-fill" />
						<span>Watch</span>
					</button>
				{:else if generic?.status() === 'planned'}
					<div
						class="flex items-center gap-1.5 bg-white/10 text-white/70 px-3 py-1.5 rounded-full text-xs"
					>
						<span>Starting soon</span>
					</div>
				{:else if generic?.recording()}
					<button
						class="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-full text-xs transition-colors"
						on:click|stopPropagation={openFullscreen}
					>
						<Icon icon="ri:play-circle-line" />
						<span>Replay</span>
					</button>
				{/if}
			</div>
		</div>
	</div>
{:else}
	<div class="p-3 rounded-lg bg-info-content/30 text-sm flex items-center gap-2 mt-2">
		<Icon icon="ri:broadcast-line" />
		<span>Live Event (kind 30311)</span>
	</div>
{/if}

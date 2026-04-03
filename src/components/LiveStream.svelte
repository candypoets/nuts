<script lang="ts">
	import type { ParsedEvent } from '@candypoets/nipworker';
	import { proxyPreviewUrl } from 'src/lib/proxy';
	import {
		liveStreamNote,
		liveStreamOpen,
		closeLiveStream,
		sharedLiveVideoElement,
		sharedLiveAudioElement
	} from 'src/controller/image';
	import Icon from '@iconify/svelte';
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { isMobile } from 'src/controller';

	import { useSubscription, usePublish } from '@candypoets/nipworker/hooks';
	import { asPreGeneric, isParsedEvent, isConnectionStatus } from '@candypoets/nipworker/utils';
	import { onDestroy } from 'svelte';
	import Kind1311Content from 'src/routes/explore/_post/kind1311Content.svelte';

	// Load media-chrome for video controls
	onMount(async () => {
		await import('media-chrome');
	});

	let videoEl: HTMLVideoElement;
	let audioEl: HTMLAudioElement;
	let videoContainer: HTMLElement;
	let error: string | null = null;
	let isPlaying = false;
	let isMuted = false; // Start unmuted for live streams
	let showContext: boolean = true;
	let chatMessages: ParsedEvent[] = [];
	let chatSub: (() => void) | undefined;
	let hasSubscribed = false;
	let chatInput = '';
	let isSubmitting = false;

	$: note = $liveStreamNote;
	$: isOpen = $liveStreamOpen;
	$: sharedVideo = $sharedLiveVideoElement;
	$: sharedAudio = $sharedLiveAudioElement;

	// Parse the live event using the utility function
	$: parsed = note ? asPreGeneric(note) : null;
	$: dTag = parsed?.d();

	// Derived state from parsed data
	$: isLive = parsed?.status() === 'live';
	$: isEnded = parsed?.status() === 'ended';
	$: streamUrl = isLive ? parsed?.streaming() : parsed?.recording();

	// Detect if this is likely an audio-only stream
	$: isAudioOnly =
		!parsed?.image() &&
		(parsed?.service()?.toLowerCase().includes('audio') ||
			parsed?.title()?.toLowerCase().includes('audio') ||
			parsed?.title()?.toLowerCase().includes('space'));

	// Move shared video/audio into fullscreen container when modal opens
	$: if (isOpen && sharedVideo && videoContainer && !isAudioOnly) {
		moveSharedVideoToFullscreen();
	}

	$: if (isOpen && sharedAudio && isAudioOnly) {
		moveSharedAudioToFullscreen();
	}

	function moveSharedVideoToFullscreen() {
		if (!sharedVideo || !videoContainer) return;

		// Only move if not already in container
		if (sharedVideo.parentElement !== videoContainer) {
			sharedVideo.setAttribute('slot', 'media');
			videoContainer.appendChild(sharedVideo);
			// Update classes for fullscreen
			sharedVideo.classList.remove('max-h-96', 'w-auto', 'object-contain');
			sharedVideo.classList.add(
				'm-auto',
				'h-full',
				'max-w-full',
				'w-full',
				'rounded-lg',
				'object-contain'
			);
			// Unmute for fullscreen
			sharedVideo.muted = false;
			if (sharedVideo.paused) {
				sharedVideo.play().catch(() => {});
			}
			isMuted = false;
			isPlaying = true;
		}
	}

	function moveSharedAudioToFullscreen() {
		if (!sharedAudio) return;
		// Audio element doesn't need visual handling, just continue playing
		sharedAudio.muted = false;
		if (sharedAudio.paused) {
			sharedAudio.play().catch(() => {});
		}
		isMuted = false;
		isPlaying = true;
	}

	function returnSharedMedia() {
		// Video element will be returned to inline player when store clears
		// Audio element continues naturally
		sharedLiveVideoElement.set(null);
		sharedLiveAudioElement.set(null);
	}

	onMount(() => {
		// If no shared video, setup the stream URL
		if (!sharedVideo && !sharedAudio && streamUrl) {
			// Check if native HLS support (Safari)
			if (streamUrl.endsWith('.m3u8')) {
				if ((videoEl || audioEl)?.canPlayType('application/vnd.apple.mpegurl')) {
					const el = isAudioOnly ? audioEl : videoEl;
					if (el) el.src = streamUrl;
				} else {
					error = 'HLS streams require Safari or hls.js library';
				}
			} else {
				const el = isAudioOnly ? audioEl : videoEl;
				if (el) el.src = streamUrl;
			}
		}
	});

	// Subscribe to live chat when note and dTag are available
	$: if (note && dTag && !hasSubscribed) {
		hasSubscribed = true;
		subscribeToChat();
	}

	onDestroy(() => {
		returnSharedMedia();
		if (chatSub) {
			chatSub();
		}
	});

	function subscribeToChat() {
		if (!note || !dTag) return;

		// Don't re-subscribe if already subscribed
		if (chatSub) return;

		const author = note.pubkey();
		if (!author) return;

		// Build the a-tag reference for this live event (30311:<pubkey>:<d>)
		const aTag = `30311:${author}:${dTag}`;

		chatSub = useSubscription(
			`livestream_chat_${note.id()}_${dTag}`,
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

	// Sort chat messages by created_at ascending (oldest first, newest last)
	$: sortedChatMessages = [...chatMessages].sort((a, b) => (a.createdAt() || 0) - (b.createdAt() || 0));

	function togglePlay() {
		if (!el) return;
		if (el.paused) {
			el.play().catch(() => {});
			isPlaying = true;
		} else {
			el.pause();
			isPlaying = false;
		}
	}

	function toggleMute() {
		const el = isAudioOnly ? sharedAudio || audioEl : sharedVideo || videoEl;
		if (!el) return;
		el.muted = !el.muted;
		isMuted = el.muted;
	}

	function toggleContext() {
		showContext = !showContext;
	}

	// Handle close on escape key
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			closeLiveStream();
		}
	}

	// Format timestamp for chat
	function formatTime(timestamp: number): string {
		try {
			const date = new Date(timestamp * 1000);
			return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		} catch {
			return '';
		}
	}

	// Send a kind 1311 chat message
	function sendMessage() {
		if (!chatInput.trim() || !note || !dTag || isSubmitting) return;

		const author = note.pubkey();
		if (!author) return;

		isSubmitting = true;

		// Build the a-tag reference for this live event (30311:<pubkey>:<d>)
		const aTag = `30311:${author}:${dTag}`;

		const post = {
			kind: 1311,
			created_at: Math.floor(Date.now() / 1000),
			content: chatInput.trim(),
			tags: [['a', aTag]]
		};

		const publishId = Math.random().toString(36).substring(2, 9);

		usePublish(publishId, post, (message) => {
			const status = isConnectionStatus(message);
			if (status && status.status() == 'true') {
				// Clear input on successful publish to any relay
				chatInput = '';
				isSubmitting = false;
			}
		});
	}

	// Auto-scroll chat to bottom when new messages arrive
	$: if (chatMessages.length > 0) {
		setTimeout(() => {
			const chatContainer = document.getElementById('chat-messages');
			if (chatContainer) {
				chatContainer.scrollTop = chatContainer.scrollHeight;
			}
		}, 0);
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen && streamUrl}
	<div
		class="z-50 fixed left-0 top-0 h-full w-full overflow-auto backdrop-blur-md flex"
		in:fade={{ duration: 200 }}
		on:click|preventDefault|stopPropagation={closeLiveStream}
	>
		<!-- Close button -->
		<button
			class="absolute pt-safe top-4 left-4 z-30 rounded-full bg-black/40 backdrop-blur-sm p-2 text-highlight hover:bg-black/60 transition-colors"
			on:click|preventDefault|stopPropagation={closeLiveStream}
		>
			<Icon icon="ri:close-line" class="text-2xl" />
		</button>

		<!-- Main player area -->
		<div
			class="flex-1 flex flex-col items-center justify-center w-full bg-black"
			on:click|stopPropagation
		>
			<!-- Video/Audio Player -->
			<div class="flex-1 flex items-center justify-center w-full relative">
				{#if error}
					<div class="text-center p-4">
						<Icon icon="ri:error-warning-line" class="text-6xl text-error mx-auto mb-4" />
						<p class="text-highlight/70 mb-2">{error}</p>
						{#if isAudioOnly}
							<p class="text-highlight/50 text-sm">Audio stream</p>
						{/if}
					</div>
				{:else if isAudioOnly}
					<!-- Audio-only UI -->
					<div class="flex flex-col items-center gap-6 p-8">
						{#if parsed?.image()}
							<img
								src={proxyPreviewUrl(parsed.image())}
								alt={parsed?.title()}
								class="w-64 h-64 rounded-2xl object-cover shadow-2xl"
							/>
						{:else}
							<div
								class="w-64 h-64 rounded-2xl bg-gradient-to-br from-accent/50 to-purple-600/50 flex items-center justify-center shadow-2xl"
							>
								<Icon icon="ri:music-2-line" class="text-8xl text-highlight/50" />
							</div>
						{/if}

						{#if parsed?.title()}
							<h2 class="text-2xl font-bold text-highlight text-center">{parsed.title()}</h2>
						{/if}
						{#if parsed?.description()}
							<p class="text-highlight/60 text-center max-w-md">{parsed.description()}</p>
						{/if}

						<!-- Audio controls -->
						<div class="flex items-center gap-4 mt-4">
							<button
								class="p-4 rounded-full bg-accent hover:bg-accent/80 text-accent-content transition-colors"
								on:click={togglePlay}
							>
								<Icon icon={isPlaying ? 'ri:pause-fill' : 'ri:play-fill'} class="text-3xl" />
							</button>
							<button
								class="p-3 rounded-full bg-base-100 hover:bg-base-200 text-base-content transition-colors"
								on:click={toggleMute}
							>
								<Icon
									icon={isMuted ? 'ri:volume-mute-line' : 'ri:volume-up-line'}
									class="text-xl"
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
					</div>
				{:else}
					<!-- Video UI with shared video support -->
					<div class="relative w-full h-full flex items-center justify-center">
						{#if !sharedVideo}
							<!-- No shared video - use regular video element -->
							<video
								bind:this={videoEl}
								class="max-w-full max-h-full object-contain"
								playsinline
								muted={isMuted}
								poster={parsed?.image() ? proxyPreviewUrl(parsed.image()) : ''}
								on:play={() => (isPlaying = true)}
								on:pause={() => (isPlaying = false)}
							/>
						{:else}
							<!-- Container for shared video element -->
							<media-controller
								bind:this={videoContainer}
								class="w-full h-full bg-transparent"
								on:click|stopPropagation
							>
								<!-- Shared video element is moved here via moveSharedVideoToFullscreen -->
							</media-controller>
						{/if}

						<!-- Center play button overlay (when no shared video and paused) -->
						{#if !isPlaying && !sharedVideo}
							<button
								class="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
								on:click={togglePlay}
							>
								<div
									class="w-20 h-20 rounded-full bg-accent/90 flex items-center justify-center hover:scale-110 transition-transform"
								>
									<Icon icon="ri:play-fill" class="text-4xl text-highlight ml-1" />
								</div>
							</button>
						{/if}
						<!-- Bottom controls for video -->
						{#if !isAudioOnly}
							<div
								class="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent"
							>
								<div class="flex items-center justify-center gap-4">
									<button
										class="p-3 rounded-full bg-base-100 hover:bg-base-200 text-base-content transition-colors"
										on:click={togglePlay}
									>
										<Icon icon={isPlaying ? 'ri:pause-fill' : 'ri:play-fill'} class="text-xl" />
									</button>
									<button
										class="p-2 rounded-full bg-base-100 hover:bg-base-200 text-base-content transition-colors"
										on:click={toggleMute}
									>
										<Icon
											icon={isMuted ? 'ri:volume-mute-line' : 'ri:volume-up-line'}
											class="text-lg"
										/>
									</button>
									{#if isLive}
										<div class="flex items-center gap-2 text-xs text-highlight/70 ml-4">
											<Icon icon="ri:broadcast-line" />
											<span>Live Stream</span>
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<!-- Context toggle button -->
		{#if !$isMobile}
			<button
				class="absolute top-4 z-[60] p-2 text-base-content hover:bg-opacity-100 transition-all"
				class:right-96={showContext}
				class:right-4={!showContext}
				on:click|preventDefault|stopPropagation={toggleContext}
			>
				<Icon
					icon={showContext ? 'mdi:chevron-double-right' : 'mdi:chevron-double-left'}
					class="text-4xl text-highlight drop-shadow-lg"
				/>
			</button>
		{/if}

		<!-- Context panel (chat area) -->
		{#if showContext && !$isMobile}
			<div
				class="h-full w-1/4 min-w-96 overflow-auto bg-base-300 border-l border-white/10"
				transition:slide={{ duration: 200, axis: 'x' }}
				on:click|stopPropagation
			>
				<div class="flex flex-col h-full relative">
					<!-- Chat header with status -->
					<div class="p-4 border-b border-white/10 bg-base-300/80 backdrop-blur-sm">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								{#if isLive}
									<span
										class="flex items-center gap-1.5 bg-error text-error-content px-2.5 py-1 rounded-full text-xs font-bold animate-pulse"
									>
										<span class="w-2 h-2 bg-white rounded-full"></span>
										LIVE
									</span>
								{:else if isEnded}
									<span class="bg-white/20 text-highlight/70 px-2.5 py-1 rounded-full text-xs">
										Ended
									</span>
								{:else}
									<span class="bg-warning/20 text-warning px-2.5 py-1 rounded-full text-xs">
										Upcoming
									</span>
								{/if}
								{#if parsed?.currentParticipants() && parsed.currentParticipants() > BigInt(0)}
									<span class="text-base-content/60 text-sm">
										{parsed.currentParticipants()} watching
									</span>
								{/if}
							</div>
							{#if sortedChatMessages.length > 0}
								<span class="text-xs text-highlight/50">
									{sortedChatMessages.length} messages
								</span>
							{/if}
						</div>
					</div>

					<!-- Chat messages -->
					<div class="flex-1 overflow-y-auto py-4 space-y-3" id="chat-messages">
						{#if chatMessages.length === 0}
							<div class="text-center text-base-content/30 text-sm py-8">
								<Icon icon="ri:chat-off-line" class="text-4xl mx-auto mb-2" />
								<p>No messages yet</p>
								<p class="text-xs mt-1">Live chat messages will appear here</p>
							</div>
						{:else}
							{#each sortedChatMessages as msg}
								<Kind1311Content note={msg} context={sortedChatMessages} />
							{/each}
						{/if}
					</div>

					<!-- Chat input -->
					<div class="p-4 border-t border-white/10">
						<form class="flex gap-2" on:submit|preventDefault={sendMessage}>
							<input
								type="text"
								placeholder="Say something..."
								bind:value={chatInput}
								disabled={isSubmitting}
								class="flex-1 bg-base-100 border border-base-300 rounded-lg px-3 py-2 text-sm text-base-content placeholder:text-base-content/50 focus:outline-none focus:border-accent disabled:opacity-50"
							/>
							<button
								type="submit"
								class="p-2 bg-accent text-accent-content rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								disabled={!chatInput.trim() || isSubmitting}
							>
								{#if isSubmitting}
									<Icon icon="ri:loader-4-line" class="animate-spin" />
								{:else}
									<Icon icon="ri:send-plane-fill" />
								{/if}
							</button>
						</form>
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}

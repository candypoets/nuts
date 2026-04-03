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

	import { useSubscription, usePublish } from '@candypoets/nipworker/hooks';
	import { asPreGeneric, isParsedEvent, isConnectionStatus } from '@candypoets/nipworker/utils';
	import { onDestroy } from 'svelte';
	import Kind1311Content from 'src/routes/explore/_post/kind1311Content.svelte';
	import { swipeDismiss } from 'src/actions/swipeDismiss';

	let containerEl: HTMLElement;

	// Load media-chrome for video controls
	onMount(async () => {
		await import('media-chrome');
	});

	let videoEl: HTMLVideoElement;
	let audioEl: HTMLAudioElement;
	let videoContainer: HTMLElement;
	let error: string | null = null;
	let isPlaying = false;
	let isMuted = false;
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

		if (sharedVideo.parentElement !== videoContainer) {
			sharedVideo.setAttribute('slot', 'media');
			videoContainer.appendChild(sharedVideo);
			sharedVideo.classList.remove('max-h-96', 'w-auto', 'object-contain');
			sharedVideo.classList.add(
				'm-auto',
				'h-full',
				'max-w-full',
				'w-full',
				'rounded-lg',
				'object-contain'
			);
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
		sharedAudio.muted = false;
		if (sharedAudio.paused) {
			sharedAudio.play().catch(() => {});
		}
		isMuted = false;
		isPlaying = true;
	}

	function returnSharedMedia() {
		sharedLiveVideoElement.set(null);
		sharedLiveAudioElement.set(null);
	}

	onMount(() => {
		if (!sharedVideo && !sharedAudio && streamUrl) {
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
		if (chatSub) return;

		const author = note.pubkey();
		if (!author) return;

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
				if (parsedEvent && parsedEvent.kind() === 1311) {
					if (!chatMessages.some((m) => m.id() === parsedEvent.id())) {
						chatMessages = [...chatMessages, parsedEvent];
					}
				}
			}
		);
	}

	function togglePlay() {
		const el = isAudioOnly ? sharedAudio || audioEl : sharedVideo || videoEl;
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

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			closeLiveStream();
		}
	}

	// Swipe dismiss animation state
	let isDismissing = false;
	const DISMISS_DURATION = 300;

	function handleSwipe(progress: number, deltaX: number, deltaY: number) {
		if (!containerEl) return;
		// Apply real-time visual feedback
		const opacity = Math.max(0.3, 1 - progress);
		containerEl.style.transform = `translateY(${deltaY}px)`;
		containerEl.style.opacity = String(opacity);
	}

	function animateDismiss(direction: number, fromY?: number) {
		if (!containerEl || isDismissing) return;

		isDismissing = true;
		const distance = direction > 0 ? window.innerHeight : -window.innerHeight;
		const startY = fromY ?? (parseInt(containerEl.style.transform.replace(/[^\d-]/g, '')) || 0);

		const animation = containerEl.animate(
			[
				{ transform: `translateY(${startY}px)`, opacity: 0.3 },
				{ transform: `translateY(${distance}px)`, opacity: 0 }
			],
			{ duration: DISMISS_DURATION, easing: 'cubic-bezier(0.32, 0.72, 0.06, 1)', fill: 'forwards' }
		);

		animation.onfinish = () => {
			closeLiveStream();
			isDismissing = false;
		};
	}

	function animateCancel() {
		if (!containerEl) return;

		const currentTransform = containerEl.style.transform;
		const currentY = parseInt(currentTransform.replace(/[^\d-]/g, '')) || 0;
		const currentOpacity = parseFloat(containerEl.style.opacity) || 1;

		containerEl.animate(
			[
				{ transform: `translateY(${currentY}px)`, opacity: currentOpacity },
				{ transform: 'translateY(0px)', opacity: '1' }
			],
			{ duration: 200, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
		);

		// Reset inline styles
		containerEl.style.transform = 'translateY(0px)';
		containerEl.style.opacity = '1';
	}

	function handleDismiss(deltaX: number, deltaY: number) {
		const direction = deltaY > 0 ? 1 : -1;
		animateDismiss(direction, deltaY);
	}

	function handleCancel() {
		animateCancel();
	}

	// Sort chat messages by created_at ascending (oldest first) - for desktop
	$: sortedChatMessages = [...chatMessages].sort(
		(a, b) => (a.createdAt() || 0) - (b.createdAt() || 0)
	);

	// Reverse order (newest first) - for mobile
	$: reversedChatMessages = [...sortedChatMessages].reverse();

	// Send a kind 1311 chat message
	function sendMessage() {
		if (!chatInput.trim() || !note || !dTag || isSubmitting) return;

		const author = note.pubkey();
		if (!author) return;

		isSubmitting = true;

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
			if (status && status.success()) {
				chatInput = '';
				isSubmitting = false;
			}
		});
	}

	// Auto-scroll chat to bottom when new messages arrive (desktop only)
	$: if (chatMessages.length > 0) {
		setTimeout(() => {
			// Only auto-scroll on desktop (window width >= 768px)
			if (typeof window !== 'undefined' && window.innerWidth >= 768) {
				const chatContainer = document.getElementById('chat-messages');
				if (chatContainer) {
					chatContainer.scrollTop = chatContainer.scrollHeight;
				}
			}
		}, 0);
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen && streamUrl}
	<!-- Main container with swipe dismiss -->
	<div
		class="z-50 fixed left-0 top-0 h-full w-full overflow-auto backdrop-blur-md flex flex-col md:flex-row"
		in:fade={{ duration: 200 }}
		on:click|preventDefault|stopPropagation={closeLiveStream}
		use:swipeDismiss={{
			direction: 'vertical',
			onSwipe: handleSwipe,
			onDismiss: handleDismiss,
			onCancel: handleCancel
		}}
	>
		<!-- Close button (outside swipe container so it stays accessible) -->
		<button
			class="absolute pt-safe top-4 left-4 z-[60] rounded-full bg-black/40 backdrop-blur-sm p-2 text-highlight hover:bg-black/60 transition-colors"
			on:click|preventDefault|stopPropagation={closeLiveStream}
		>
			<Icon icon="ri:close-line" class="text-2xl" />
		</button>

		<!-- Content container that transforms during swipe -->
		<div
			bind:this={containerEl}
			class="w-full h-full flex flex-col md:flex-row"
			on:click|stopPropagation
		>
			<!-- Video Section -->
			<div class="w-full md:flex-1 flex flex-col bg-black shrink-0 md:shrink">
				<!-- Video Player Container -->
				<div
					class="relative w-full aspect-video md:aspect-auto md:flex-1 flex items-center justify-center overflow-hidden"
				>
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
									class="w-48 h-48 md:w-64 md:h-64 rounded-2xl object-cover shadow-2xl"
								/>
							{:else}
								<div
									class="w-48 h-48 md:w-64 md:h-64 rounded-2xl bg-gradient-to-br from-accent/50 to-purple-600/50 flex items-center justify-center shadow-2xl"
								>
									<Icon icon="ri:music-2-line" class="text-6xl md:text-8xl text-highlight/50" />
								</div>
							{/if}

							{#if parsed?.title()}
								<h2 class="text-xl md:text-2xl font-bold text-highlight text-center">
									{parsed.title()}
								</h2>
							{/if}
							{#if parsed?.description()}
								<p class="text-highlight/60 text-center max-w-md text-sm md:text-base">
									{parsed.description()}
								</p>
							{/if}

							<!-- Audio controls -->
							<div class="flex items-center gap-4 mt-4">
								<button
									class="p-3 md:p-4 rounded-full bg-accent hover:bg-accent/80 text-accent-content transition-colors"
									on:click={togglePlay}
								>
									<Icon
										icon={isPlaying ? 'ri:pause-fill' : 'ri:play-fill'}
										class="text-2xl md:text-3xl"
									/>
								</button>
								<button
									class="p-2 md:p-3 rounded-full bg-base-100 hover:bg-base-200 text-base-content transition-colors"
									on:click={toggleMute}
								>
									<Icon
										icon={isMuted ? 'ri:volume-mute-line' : 'ri:volume-up-line'}
										class="text-lg md:text-xl"
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
						<!-- Video UI -->
						<div class="relative w-full h-full flex items-center justify-center">
							{#if !sharedVideo}
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
								<media-controller
									bind:this={videoContainer}
									class="w-full h-full bg-transparent"
									on:click|stopPropagation
								>
									<!-- Shared video element moved here -->
								</media-controller>
							{/if}

							{#if !isPlaying && !sharedVideo}
								<button
									class="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
									on:click={togglePlay}
								>
									<div
										class="w-16 h-16 md:w-20 md:h-20 rounded-full bg-accent/90 flex items-center justify-center hover:scale-110 transition-transform"
									>
										<Icon icon="ri:play-fill" class="text-3xl md:text-4xl text-highlight ml-1" />
									</div>
								</button>
							{/if}

							<!-- Bottom controls -->
							<div
								class="absolute bottom-0 left-0 right-0 p-3 md:p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent"
							>
								<div class="flex items-center justify-center gap-3 md:gap-4">
									<button
										class="p-2 md:p-3 rounded-full bg-base-100 hover:bg-base-200 text-base-content transition-colors"
										on:click={togglePlay}
									>
										<Icon
											icon={isPlaying ? 'ri:pause-fill' : 'ri:play-fill'}
											class="text-lg md:text-xl"
										/>
									</button>
									<button
										class="p-1.5 md:p-2 rounded-full bg-base-100 hover:bg-base-200 text-base-content transition-colors"
										on:click={toggleMute}
									>
										<Icon
											icon={isMuted ? 'ri:volume-mute-line' : 'ri:volume-up-line'}
											class="text-base md:text-lg"
										/>
									</button>
									{#if isLive}
										<div class="flex items-center gap-2 text-xs text-highlight/70 ml-2 md:ml-4">
											<Icon icon="ri:broadcast-line" />
											<span>Live</span>
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/if}
				</div>

				<!-- Streamer info bar (shows below video on mobile, hidden on desktop) -->
				<div
					class="w-full p-2 md:p-3 border-t border-white/10 bg-base-300 flex items-center gap-2 md:gap-3 shrink-0 md:hidden"
				>
					{#if isLive}
						<span
							class="bg-error text-error-content px-2 py-0.5 rounded text-xs font-bold animate-pulse"
						>
							LIVE
						</span>
					{:else if isEnded}
						<span class="bg-base-100 text-base-content/70 px-2 py-0.5 rounded text-xs">Ended</span>
					{:else}
						<span class="bg-warning/20 text-warning px-2 py-0.5 rounded text-xs">Upcoming</span>
					{/if}
					{#if parsed?.title()}
						<span class="font-semibold text-xs md:text-sm truncate">{parsed.title()}</span>
					{/if}
					{#if parsed?.currentParticipants() && parsed.currentParticipants() > BigInt(0)}
						<span class="text-xs text-base-content/50 ml-auto">
							{parsed.currentParticipants()} watching
						</span>
					{/if}
				</div>
			</div>

			<!-- Chat Section -->
			{#if showContext}
				<div
					class="flex-1 md:flex-none md:w-80 lg:w-96 bg-base-300 flex flex-col overflow-hidden border-t md:border-t-0 md:border-l border-white/10"
					transition:slide={{ duration: 200, axis: 'x' }}
					on:click|stopPropagation
				>
					<!-- Chat header -->
					<div
						class="p-3 border-b border-white/10 bg-base-300/80 backdrop-blur-sm flex items-center justify-between shrink-0"
					>
						<div class="flex items-center gap-2">
							{#if isLive}
								<span
									class="flex items-center gap-1 bg-error text-error-content px-2 py-0.5 rounded text-xs font-bold animate-pulse"
								>
									<span class="w-1.5 h-1.5 bg-white rounded-full"></span>
									LIVE
								</span>
							{:else if isEnded}
								<span class="bg-base-100 text-base-content/70 px-2 py-0.5 rounded text-xs"
									>Ended</span
								>
							{:else}
								<span class="bg-warning/20 text-warning px-2 py-0.5 rounded text-xs">Upcoming</span>
							{/if}
							{#if parsed?.currentParticipants() && parsed.currentParticipants() > BigInt(0)}
								<span class="text-xs text-base-content/60 hidden md:inline">
									{parsed.currentParticipants()} watching
								</span>
							{/if}
						</div>
						<span class="text-xs text-base-content/50">
							{sortedChatMessages.length} messages
						</span>
					</div>

					<!-- Chat messages - Desktop: chronological, Mobile: reverse chronological -->
					<div class="flex-1 overflow-y-auto p-3 space-y-2" id="chat-messages">
						{#if chatMessages.length === 0}
							<div class="text-center text-base-content/30 text-sm py-8">
								<Icon icon="ri:chat-off-line" class="text-3xl mx-auto mb-2" />
								<p>No messages yet</p>
								<p class="text-xs mt-1">Say hello!</p>
							</div>
						{:else}
							<!-- Desktop: oldest first (scrolls to bottom) -->
							<div class="hidden md:contents">
								{#each sortedChatMessages as msg (msg.id())}
									<Kind1311Content note={msg} context={sortedChatMessages} />
								{/each}
							</div>
							<!-- Mobile: newest first (no auto-scroll) -->
							<div class="contents md:hidden">
								{#each reversedChatMessages as msg (msg.id())}
									<Kind1311Content note={msg} context={reversedChatMessages} />
								{/each}
							</div>
						{/if}
					</div>

					<!-- Chat input -->
					<div class="px-3 pt-3 border-t border-white/10 shrink-0 pb-safe">
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
			{/if}
		</div>

		<!-- Context toggle button (desktop only) -->
		{#if !showContext}
			<button
				class="hidden md:flex absolute top-4 right-4 z-[60] p-2 text-base-content hover:bg-opacity-100 transition-all"
				on:click|preventDefault|stopPropagation={toggleContext}
			>
				<Icon icon="mdi:chevron-double-left" class="text-4xl text-highlight drop-shadow-lg" />
			</button>
		{/if}
	</div>
{/if}

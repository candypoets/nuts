<script lang="ts">
	import { PreGenericParsed, type ParsedEvent } from '@candypoets/nipworker';
	import { proxyPreviewUrl } from 'src/lib/proxy';
	import { liveStreamNote, liveStreamOpen, closeLiveStream } from 'src/controller/image';
	import Icon from '@iconify/svelte';
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { isMobile } from 'src/controller';

	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { fbArray } from '@candypoets/nipworker/utils';
	import { onDestroy } from 'svelte';

	let videoEl: HTMLVideoElement;
	let error: string | null = null;
	let isPlaying = false;
	let isMuted = false; // Start unmuted for live streams
	let showContext: boolean = true;
	let chatMessages: any[] = [];
	let chatSub: (() => void) | undefined;

	$: note = $liveStreamNote;
	$: isOpen = $liveStreamOpen;

	// Parse the live event
	function getPreGeneric(note: any): PreGenericParsed | null {
		if (!note) return null;
		try {
			return note.parsed(new PreGenericParsed()) as PreGenericParsed | null;
		} catch {
			return null;
		}
	}

	$: parsed = getPreGeneric(note);
	$: title = parsed?.title()?.toString() || '';
	$: summary = parsed?.description()?.toString() || '';
	$: image = parsed?.image()?.toString() || '';
	$: streaming = parsed?.streaming()?.toString() || '';
	$: recording = parsed?.recording()?.toString() || '';
	$: status = parsed?.status()?.toString() || 'planned';
	$: currentParticipants = parsed?.currentParticipants() || BigInt(0);
	$: service = parsed?.service()?.toString() || '';

	$: isLive = status === 'live';
	$: isEnded = status === 'ended';
	$: streamUrl = isLive ? streaming : recording;

	// Detect if this is likely an audio-only stream
	$: isAudioOnly = !image && (service?.toLowerCase().includes('audio') || title?.toLowerCase().includes('audio') || title?.toLowerCase().includes('space'));

	onMount(async () => {
		if (!streamUrl || !videoEl) return;

		// Check if native HLS support (Safari)
		if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
			videoEl.src = streamUrl;
		} else if (streamUrl.endsWith('.m3u8')) {
			// HLS streams require native support (Safari) or hls.js library
			// TODO: Add hls.js dependency for cross-browser HLS support
			error = 'HLS streams require Safari or hls.js library';
		} else {
			// Regular video/audio URL
			videoEl.src = streamUrl;
		}

		// Subscribe to live chat messages (kind 1311)
		if (note) {
			subscribeToChat();
		}
	});

	onDestroy(() => {
		if (chatSub) {
			chatSub();
		}
	});

	function subscribeToChat() {
		if (!note) return;
		
		const noteId = note.id()?.toString();
		const author = note.pubkey()?.toString();
		const dTag = parsed?.d()?.toString();
		
		if (!noteId || !author || !dTag) return;

		// Build the a-tag reference for this live event (30311:<pubkey>:<d>)
		const aTag = `30311:${author}:${dTag}`;

		chatSub = useSubscription(
			`livechat_${noteId}`,
			[{
				kinds: [1311],
				'#a': [aTag],
				limit: 50,
				relays: []
			}],
			(message: any) => {
				const parsedEvent = message.parsed?.();
				if (parsedEvent && parsedEvent.kind() === 1311) {
					// Add new message to chat
					chatMessages = [...chatMessages, parsedEvent];
				}
			}
		);
	}

	function togglePlay() {
		if (!videoEl) return;
		if (videoEl.paused) {
			videoEl.play();
			isPlaying = true;
		} else {
			videoEl.pause();
			isPlaying = false;
		}
	}

	function toggleMute() {
		if (!videoEl) return;
		videoEl.muted = !videoEl.muted;
		isMuted = videoEl.muted;
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

	// Format relative time
	function formatRelativeTime(timestamp: bigint | undefined): string {
		if (!timestamp || timestamp === BigInt(0)) return '';
		try {
			const date = new Date(Number(timestamp) * 1000);
			const now = new Date();
			const diff = now.getTime() - date.getTime();
			const minutes = Math.floor(diff / 60000);
			const hours = Math.floor(diff / 3600000);
			
			if (minutes < 1) return 'just now';
			if (minutes < 60) return `${minutes}m ago`;
			if (hours < 24) return `${hours}h ago`;
			return date.toLocaleDateString();
		} catch {
			return '';
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
			class="absolute pt-safe top-4 left-4 z-30 rounded-full bg-black/40 backdrop-blur-sm p-2 text-white hover:bg-black/60 transition-colors"
			on:click|preventDefault|stopPropagation={closeLiveStream}
		>
			<Icon icon="ri:close-line" class="text-2xl" />
		</button>

		<!-- Main player area -->
		<div
			class="flex-1 flex flex-col items-center justify-center w-full bg-black"
			on:click|stopPropagation
		>
			<!-- Header overlay -->
			<div class="absolute top-0 left-0 right-0 p-4 pt-safe bg-gradient-to-b from-black/80 to-transparent z-10">
				<div class="flex items-center gap-3 ml-12">
					{#if isLive}
						<span class="flex items-center gap-1.5 bg-error/90 text-white px-2.5 py-1 rounded-full text-xs font-bold animate-pulse">
							<span class="w-2 h-2 bg-white rounded-full"></span>
							LIVE
						</span>
					{:else if isEnded}
						<span class="bg-white/20 text-white/70 px-2.5 py-1 rounded-full text-xs">
							Ended
						</span>
					{:else}
						<span class="bg-warning/20 text-warning px-2.5 py-1 rounded-full text-xs">
							Upcoming
						</span>
					{/if}
					{#if currentParticipants > BigInt(0)}
						<span class="text-white/60 text-sm">
							{currentParticipants} watching
						</span>
					{/if}
				</div>
			</div>

			<!-- Video/Audio Player -->
			<div class="flex-1 flex items-center justify-center w-full relative">
				{#if error}
					<div class="text-center p-4">
						<Icon icon="ri:error-warning-line" class="text-6xl text-error mx-auto mb-4" />
						<p class="text-white/70 mb-2">{error}</p>
						{#if isAudioOnly}
							<p class="text-white/50 text-sm">Audio stream</p>
						{/if}
					</div>
				{:else}
					{#if isAudioOnly}
						<!-- Audio-only UI -->
						<div class="flex flex-col items-center gap-6 p-8">
							{#if image}
								<img
									src={proxyPreviewUrl(image)}
									alt={title}
									class="w-64 h-64 rounded-2xl object-cover shadow-2xl"
								/>
							{:else}
								<div class="w-64 h-64 rounded-2xl bg-gradient-to-br from-accent/50 to-purple-600/50 flex items-center justify-center shadow-2xl">
									<Icon icon="ri:music-2-line" class="text-8xl text-white/50" />
								</div>
							{/if}
							
							{#if title}
								<h2 class="text-2xl font-bold text-white text-center">{title}</h2>
							{/if}
							{#if summary}
								<p class="text-white/60 text-center max-w-md">{summary}</p>
							{/if}
							
							<!-- Audio controls -->
							<div class="flex items-center gap-4 mt-4">
								<button
									class="p-4 rounded-full bg-accent hover:bg-accent/80 text-white transition-colors"
									on:click={togglePlay}
								>
									<Icon icon={isPlaying ? 'ri:pause-fill' : 'ri:play-fill'} class="text-3xl" />
								</button>
								<button
									class="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
									on:click={toggleMute}
								>
									<Icon icon={isMuted ? 'ri:volume-mute-line' : 'ri:volume-up-line'} class="text-xl" />
								</button>
							</div>
							
							<audio
								bind:this={videoEl}
								class="hidden"
								muted={isMuted}
								on:play={() => isPlaying = true}
								on:pause={() => isPlaying = false}
							/>
						</div>
					{:else}
						<!-- Video UI -->
						<div class="relative w-full h-full flex items-center justify-center">
							<video
								bind:this={videoEl}
								class="max-w-full max-h-full object-contain"
								playsinline
								muted={isMuted}
								poster={image ? proxyPreviewUrl(image) : ''}
								on:play={() => isPlaying = true}
								on:pause={() => isPlaying = false}
							/>
							
							<!-- Center play button overlay -->
							{#if !isPlaying}
								<button
									class="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
									on:click={togglePlay}
								>
									<div class="w-20 h-20 rounded-full bg-accent/90 flex items-center justify-center hover:scale-110 transition-transform">
										<Icon icon="ri:play-fill" class="text-4xl text-white ml-1" />
									</div>
								</button>
							{/if}
						</div>
					{/if}
				{/if}
			</div>

			<!-- Bottom controls for video -->
			{#if !isAudioOnly}
				<div class="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
					<div class="flex items-center justify-center gap-4">
						<button
							class="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
							on:click={togglePlay}
						>
							<Icon icon={isPlaying ? 'ri:pause-fill' : 'ri:play-fill'} class="text-xl" />
						</button>
						<button
							class="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
							on:click={toggleMute}
						>
							<Icon icon={isMuted ? 'ri:volume-mute-line' : 'ri:volume-up-line'} class="text-lg" />
						</button>
						{#if isLive}
							<div class="flex items-center gap-2 text-xs text-white/70 ml-4">
								<Icon icon="ri:broadcast-line" />
								<span>Live Stream</span>
							</div>
						{/if}
					</div>
				</div>
			{/if}
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
					class="text-4xl text-white drop-shadow-lg"
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
				<div class="flex flex-col h-full">
					<!-- Chat header -->
					<div class="p-4 border-b border-white/10">
						<h3 class="font-semibold text-white flex items-center gap-2">
							<Icon icon="ri:chat-3-line" />
							Live Chat
							{#if chatMessages.length > 0}
								<span class="text-xs bg-white/10 text-white/70 px-2 py-0.5 rounded-full">
									{chatMessages.length}
								</span>
							{/if}
						</h3>
						<p class="text-xs text-white/50 mt-1">
							Kind 1311 messages (waiting for nipworker support)
						</p>
					</div>
					
					<!-- Chat messages -->
					<div class="flex-1 overflow-y-auto p-4 space-y-3" id="chat-messages">
						{#if chatMessages.length === 0}
							<div class="text-center text-white/30 text-sm py-8">
								<Icon icon="ri:chat-off-line" class="text-4xl mx-auto mb-2" />
								<p>No messages yet</p>
								<p class="text-xs mt-1">Live chat messages will appear here</p>
							</div>
						{:else}
							{#each chatMessages as msg}
								<div class="flex gap-2">
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-2">
											<span class="text-xs font-medium text-accent truncate">
												{msg.pubkey()?.toString().slice(0, 8)}...
											</span>
											<span class="text-xs text-white/30">
												{formatTime(msg.createdAt())}
											</span>
										</div>
										<p class="text-sm text-white/90 break-words">
											{msg.content()?.toString()}
										</p>
									</div>
								</div>
							{/each}
						{/if}
					</div>
					
					<!-- Chat input placeholder -->
					<div class="p-4 border-t border-white/10">
						<div class="flex gap-2">
							<input
								type="text"
								placeholder="Say something..."
								class="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-accent/50"
								disabled
							/>
							<button
								class="p-2 bg-accent/50 text-white rounded-lg opacity-50 cursor-not-allowed"
								disabled
							>
								<Icon icon="ri:send-plane-fill" />
							</button>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}

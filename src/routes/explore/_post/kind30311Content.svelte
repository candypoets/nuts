<script lang="ts">
	import { PreGenericParsed, type ParsedEvent } from '@candypoets/nipworker';
	import { fbArray } from '@candypoets/nipworker/utils';
	import { proxyPreviewUrl } from 'src/lib/proxy';
	import { openLiveStream } from 'src/controller/image';
	import Icon from '@iconify/svelte';

	export let note: ParsedEvent;

	// Extract PreGenericParsed from the note (for 30311 live events)
	function getPreGeneric(note: ParsedEvent): PreGenericParsed | null {
		if (!note) return null;
		try {
			const parsed = note.parsed(new PreGenericParsed());
			return parsed as PreGenericParsed | null;
		} catch {
			return null;
		}
	}

	$: parsed = getPreGeneric(note);

	// Extract live event data from PreGenericParsed
	$: title = parsed?.title()?.toString() || '';
	$: summary = parsed?.description()?.toString() || '';
	$: rawImage = parsed?.image()?.toString() || '';
	$: image = rawImage ? proxyPreviewUrl(rawImage) : '';
	$: streaming = parsed?.streaming()?.toString() || '';
	$: recording = parsed?.recording()?.toString() || '';
	$: status = parsed?.status()?.toString() || 'planned';
	$: dTag = parsed?.d()?.toString() || '';
	$: starts = parsed?.starts();
	$: ends = parsed?.ends();
	$: currentParticipants = parsed?.currentParticipants();
	$: totalParticipants = parsed?.totalParticipants();

	// Topics from parsed
	$: topics = parsed ? fbArray(parsed, 'topics').map(t => t.toString()) : [];

	// Participants from parsed PreParticipant objects
	$: participants = parsed 
		? fbArray(parsed, 'participants').map(p => ({
				pubkey: p.pubkey()?.toString() || '',
				relay: p.relay()?.toString(),
				role: p.role()?.toString(),
				proof: p.proof()?.toString()
			}))
		: [];
	$: hosts = participants.filter((p) => p.role === 'Host');
	$: speakers = participants.filter((p) => p.role === 'Speaker');

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
		planned: { color: 'text-warning', bg: 'bg-warning/20', icon: 'ri:calendar-line', label: 'Upcoming' },
		live: { color: 'text-error', bg: 'bg-error/20', icon: 'ri:broadcast-line', label: 'Live Now' },
		ended: { color: 'text-white/50', bg: 'bg-white/10', icon: 'ri:check-line', label: 'Ended' }
	};

	$: statusInfo = statusConfig[status as keyof typeof statusConfig] || statusConfig.planned;

	function openLiveEvent() {
		// Open live stream full-screen view
		if (note) {
			openLiveStream(note);
		}
	}
</script>

{#if title || streaming}
	<div
		class="mt-2 rounded-lg overflow-hidden border border-primary-content/20 cursor-pointer hover:opacity-95 transition-opacity relative group min-h-[200px]"
		on:click|stopPropagation={openLiveEvent}
	>
		{#if image}
			<!-- Full background image -->
			<div class="absolute inset-0">
				<img
					src={image}
					alt={title}
					class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
				/>
			</div>
			<!-- Gradient backdrop for text readability -->
			<div class="absolute inset-0 bg-gradient-to-b from-black/80 via-black/50 to-black/80"></div>
		{:else}
			<!-- Fallback gradient background -->
			<div class="absolute inset-0 bg-gradient-to-br from-error/30 via-purple-900/50 to-black"></div>
		{/if}

		<!-- Live indicator pulse for live streams -->
		{#if status === 'live'}
			<div class="absolute top-3 right-3">
				<div class="flex items-center gap-2 bg-error/90 text-white px-3 py-1 rounded-full text-xs font-semibold animate-pulse">
					<div class="w-2 h-2 bg-white rounded-full"></div>
					<span>LIVE</span>
				</div>
			</div>
		{/if}

		<!-- Content overlaid on top -->
		<div class="relative z-10 p-4 flex flex-col h-full min-h-[200px]">
			<!-- Live Event badge -->
			<div class="flex items-center gap-2 mb-3">
				<div class="flex items-center gap-1.5 {statusInfo.color} {statusInfo.bg} px-2.5 py-1 rounded-full text-xs font-medium">
					<Icon icon={statusInfo.icon} />
					<span>{statusInfo.label}</span>
				</div>
				{#if topics.length > 0}
					<span class="text-xs bg-white/10 text-white/70 px-2 py-0.5 rounded-full">
						#{topics[0]}
					</span>
				{/if}
			</div>

			<!-- Title -->
			{#if title}
				<h3 class="font-bold text-lg leading-tight mb-2 text-white line-clamp-2 drop-shadow-lg">
					{title}
				</h3>
			{/if}

			<!-- Summary -->
			{#if summary}
				<p class="text-sm text-white/80 line-clamp-2 mb-3 drop-shadow-md">{summary}</p>
			{/if}

			<!-- Spacer to push footer to bottom -->
			<div class="flex-grow"></div>

			<!-- Participants info -->
			{#if hosts.length > 0 || speakers.length > 0}
				<div class="flex flex-wrap gap-2 mb-3">
					{#if hosts.length > 0}
						<div class="flex items-center gap-1 text-xs text-white/70">
							<Icon icon="ri:user-star-line" />
							<span>{hosts.length} host{hosts.length > 1 ? 's' : ''}</span>
						</div>
					{/if}
					{#if speakers.length > 0}
						<div class="flex items-center gap-1 text-xs text-white/70">
							<Icon icon="ri:microphone-line" />
							<span>{speakers.length} speaker{speakers.length > 1 ? 's' : ''}</span>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Footer with time and action -->
			<div class="flex items-center justify-between pt-3 border-t border-white/20">
				<div class="flex flex-col gap-1 text-xs text-white/60">
					{#if starts !== undefined && starts !== BigInt(0)}
						<div class="flex items-center gap-1">
							<Icon icon="ri:time-line" />
							<span>{formatTime(starts)}</span>
						</div>
					{/if}
					{#if currentParticipants !== undefined && currentParticipants > BigInt(0)}
						<div class="flex items-center gap-1">
							<Icon icon="ri:user-line" />
							<span>{currentParticipants} watching</span>
						</div>
					{/if}
				</div>

				<!-- Action button -->
				{#if status === 'live' && streaming}
					<div class="flex items-center gap-1.5 bg-accent hover:bg-accent/80 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors">
						<Icon icon="ri:play-fill" />
						<span>Watch</span>
					</div>
				{:else if status === 'planned'}
					<div class="flex items-center gap-1.5 bg-white/10 text-white/70 px-3 py-1.5 rounded-full text-xs">
						<span>Starting soon</span>
					</div>
				{:else if recording}
					<div class="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-full text-xs transition-colors">
						<Icon icon="ri:play-circle-line" />
						<span>Replay</span>
					</div>
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

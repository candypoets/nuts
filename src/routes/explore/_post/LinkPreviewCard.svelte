<script lang="ts">
	import { ExternalLink, Play } from 'lucide-svelte';
	import { onMount } from 'svelte';

	type LinkPreview = {
		url: string;
		title?: string;
		description?: string;
		image?: string;
		siteName?: string;
	};

	export let url: string;
	export let text: string = '';

	let metadata: LinkPreview | null | undefined = undefined;
	let thumbnailFallback = 0;
	let mountedUrl = '';

	const youtubeThumbnails = ['maxresdefault.jpg', 'hqdefault.jpg', 'mqdefault.jpg', 'default.jpg'];

	$: normalizedUrl = normalizeLinkUrl(url);
	$: urlParts = getUrlParts(url);
	$: youtubeVideoId = getYoutubeVideoId(url);
	$: displayText = text && text !== url ? text : urlParts.path || url;
	$: thumbnailUrl =
		youtubeVideoId && thumbnailFallback < youtubeThumbnails.length
			? `https://i.ytimg.com/vi/${youtubeVideoId}/${youtubeThumbnails[thumbnailFallback]}`
			: metadata?.image || '';

	onMount(() => {
		mountedUrl = url;
		loadPreview(url);
	});

	$: if (mountedUrl && url !== mountedUrl) {
		mountedUrl = url;
		loadPreview(url);
	}

	async function loadPreview(nextUrl: string) {
		const requestUrl = nextUrl;
		metadata = undefined;
		thumbnailFallback = 0;

		try {
			const response = await fetch(`/api/link-preview?url=${encodeURIComponent(requestUrl)}`);
			if (!response.ok) {
				if (requestUrl === mountedUrl) metadata = null;
				return;
			}

			const data = await response.json();
			if (requestUrl === mountedUrl) metadata = data.preview ?? null;
		} catch {
			if (requestUrl === mountedUrl) metadata = null;
		}
	}

	function normalizeLinkUrl(value: string) {
		return /^https?:\/\//i.test(value) ? value : `https://${value}`;
	}

	function getUrlParts(value: string) {
		try {
			const parsed = new URL(normalizeLinkUrl(value));
			const label = parsed.hostname.replace(/^www\./, '');
			const path = `${label}${parsed.pathname === '/' ? '' : parsed.pathname}`;
			return { label, path };
		} catch {
			return { label: value, path: value };
		}
	}

	function getYoutubeVideoId(value: string) {
		try {
			const parsed = new URL(normalizeLinkUrl(value));
			const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();

			if (hostname === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || null;
			if (
				hostname === 'youtube.com' ||
				hostname === 'm.youtube.com' ||
				hostname === 'music.youtube.com'
			) {
				if (parsed.pathname === '/watch') return parsed.searchParams.get('v');

				const parts = parsed.pathname.split('/').filter(Boolean);
				if (['shorts', 'embed', 'live'].includes(parts[0])) return parts[1] || null;
			}
		} catch {
			return null;
		}

		return null;
	}
</script>

<a
	href={normalizedUrl}
	target="_blank"
	on:click|stopPropagation
	rel="noopener noreferrer"
	class="my-2 block w-full overflow-hidden rounded-lg border border-base-200 bg-base-300 text-highlight no-underline"
>
	{#if thumbnailUrl}
		<div class="relative aspect-video w-full overflow-hidden bg-base-200">
			<img
				src={thumbnailUrl}
				alt={metadata?.title || displayText}
				class="h-full w-full object-cover"
				loading="lazy"
				on:error={() => {
					if (youtubeVideoId) thumbnailFallback += 1;
				}}
			/>
			{#if youtubeVideoId}
				<div class="absolute inset-0 flex items-center justify-center">
					<div class="flex h-12 w-12 items-center justify-center rounded-full bg-black/70 text-white">
						<Play size={22} fill="currentColor" />
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<div class="space-y-1 px-3 py-2.5">
		<div class="flex min-w-0 items-center gap-1.5 text-xs font-medium uppercase text-muted">
			<span class="min-w-0 flex-1 truncate">
				{metadata?.siteName || (youtubeVideoId ? 'YouTube' : urlParts.label)}
			</span>
			<ExternalLink size={13} />
		</div>
		<div class="line-clamp-2 break-words text-[15px] font-medium leading-5 text-highlight">
			{metadata?.title || displayText.replace(/^https?:\/\/(www\.)?/, '')}
		</div>
		{#if metadata?.description}
			<div class="line-clamp-2 break-words text-xs text-muted">
				{metadata.description}
			</div>
		{:else if !youtubeVideoId}
			<div class="truncate text-xs text-muted">
				{normalizedUrl}
			</div>
		{/if}
	</div>
</a>

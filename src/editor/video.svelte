<script lang="ts">
	import { onMount } from 'svelte';
	import { NodeViewWrapper } from 'svelte-tiptap';

	// Props passed from the NodeView
	export let node;
	export let updateAttributes;

	// Extract video URL from node attributes
	const src = node.attrs?.src || '';

	// Detect video type (YouTube, direct MP4, etc.)
	$: isYouTube = src.includes('youtube.com') || src.includes('youtu.be');
	$: isVimeo = src.includes('vimeo.com');

	// Extract video ID for embedded videos
	$: youtubeId = isYouTube ? extractYouTubeId(src) : null;
	$: vimeoId = isVimeo ? extractVimeoId(src) : null;

	function extractYouTubeId(url) {
		const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
		const match = url.match(regExp);
		return match && match[2].length === 11 ? match[2] : null;
	}

	function extractVimeoId(url) {
		const regExp =
			/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|)(\d+)(?:$|\/|\?)/;
		const match = url.match(regExp);
		return match ? match[3] : null;
	}
</script>

<NodeViewWrapper>
	<div class="my-4 w-full">
		{#if isYouTube && youtubeId}
			<div class="relative pt-[56.25%]">
				<!-- 16:9 aspect ratio -->
				<iframe
					class="absolute top-0 left-0 w-full h-full rounded"
					src={`https://www.youtube.com/embed/${youtubeId}`}
					title="YouTube video player"
					frameborder="0"
					allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
					allowfullscreen
				></iframe>
			</div>
		{:else if isVimeo && vimeoId}
			<div class="relative pt-[56.25%]">
				<!-- 16:9 aspect ratio -->
				<iframe
					class="absolute top-0 left-0 w-full h-full rounded"
					src={`https://player.vimeo.com/video/${vimeoId}`}
					title="Vimeo video player"
					frameborder="0"
					allowfullscreen
				></iframe>
			</div>
		{:else}
			<!-- Direct video file -->
			<video controls class="w-full rounded" preload="metadata">
				<source {src} />
				Your browser does not support the video tag.
			</video>
		{/if}

		<div class="mt-1 text-xs text-gray-500 truncate">
			{src}
		</div>
	</div>
</NodeViewWrapper>

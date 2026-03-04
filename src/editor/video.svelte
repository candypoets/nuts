<script lang="ts">
	import { NodeViewWrapper } from 'svelte-tiptap';

	// Props passed from the NodeView
	export let node;
	export let updateAttributes;

	// Extract video URL from node attributes
	$: src = node?.attrs?.src || '';

	// Debug logging - only log when upload state changes
	$: if (node?.attrs) {
		console.log('Video upload state:', {
			uploading: node.attrs.uploading,
			uploadUrl: node.attrs.uploadUrl,
			uploadType: node.attrs.uploadType,
			defaultUploadUrl: node.attrs.defaultUploadUrl,
			uploadError: node.attrs.uploadError,
			src: node.attrs.src?.slice(0, 50) + '...'
		});
	}

	// Get the server URL to display
	$: serverUrl = node?.attrs?.uploadUrl || node?.attrs?.defaultUploadUrl || 'unknown server';

	// Detect video type (YouTube, direct MP4, etc.) only when not uploading
	$: isYouTube = !node?.attrs?.uploading && (src.includes('youtube.com') || src.includes('youtu.be'));
	$: isVimeo = !node?.attrs?.uploading && src.includes('vimeo.com');

	// Extract video ID for embedded videos
	$: youtubeId = isYouTube ? extractYouTubeId(src) : null;
	$: vimeoId = isVimeo ? extractVimeoId(src) : null;

	function extractYouTubeId(url: string): string | null {
		const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
		const match = url.match(regExp);
		return match && match[2].length === 11 ? match[2] : null;
	}

	function extractVimeoId(url: string): string | null {
		const regExp =
			/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|)(\d+)(?:$|\/|\?)/;
		const match = url.match(regExp);
		return match ? match[3] : null;
	}
</script>

<NodeViewWrapper>
	<div class="my-4 w-full">
		{#if node?.attrs?.uploading}
			<!-- Uploading state -->
			<div class="flex flex-col gap-1">
				<span class="text-gray-400 animate-pulse">
					Uploading video to <span class="text-primary font-medium">{serverUrl}</span>...
				</span>
				<span class="text-xs text-gray-500">Type: {node?.attrs?.uploadType || 'auto'}</span>
			</div>
		{:else if node?.attrs?.uploadError}
			<!-- Error state -->
			<div class="bg-error/10 text-error p-3 rounded-lg max-w-md">
				<p class="font-semibold">Upload failed</p>
				<p class="text-sm">{node.attrs.uploadError}</p>
				<p class="text-xs mt-1 opacity-70">Server: {serverUrl}</p>
			</div>
		{:else if isYouTube && youtubeId}
			<!-- YouTube embed -->
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
			<!-- Vimeo embed -->
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

		{#if !node?.attrs?.uploading && src}
			<div class="mt-1 text-xs text-gray-500 truncate">
				{src}
			</div>
		{/if}
	</div>
</NodeViewWrapper>

<script lang="ts">
	export let url: string;

	function extractYouTubeId(url: string): string | null {
		const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
		const match = url.match(regExp);
		return match && match[2].length === 11 ? match[2] : null;
	}

	$: youtubeId = extractYouTubeId(url);
	$: embedUrl = youtubeId ? `https://www.youtube.com/embed/${youtubeId}` : null;
</script>

{#if youtubeId}
	<div class="relative pt-[56.25%] w-full rounded-lg overflow-hidden my-2">
		<iframe
			class="absolute top-0 left-0 w-full h-full"
			src={embedUrl}
			title="YouTube video player"
			frameborder="0"
			allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
			allowfullscreen
		></iframe>
	</div>
{:else}
	<a
		class="text-accent hover:underline break-words break-all max-w-full w-full"
		href={url}
		target="_blank"
		rel="noopener noreferrer"
	>
		{url}
	</a>
{/if}

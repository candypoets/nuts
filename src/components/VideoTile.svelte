<script lang="ts">
	import { onMount } from 'svelte';

	export let src: string;
	export let poster: string | undefined = undefined;
	export let autoplay = true;
	export let loop = true;
	export let muted = true;
	export let className = '';
	export let onClick: (e: MouseEvent) => void = () => {};

	// Media Chrome are web components; load on client to avoid SSR issues.
	onMount(async () => {
		await import('media-chrome'); // npm i media-chrome
	});
	$: console.log(onClick);
</script>

<!--
  Tailwind classes:
  - group: lets us reveal controls on hover
  - relative: to place floating buttons inside
-->
<media-controller class={`group relative block ${className}`}>
	<!-- Native video element as usual -->
	<video
		slot="media"
		on:click={onClick}
		{src}
		{poster}
		{autoplay}
		{loop}
		{muted}
		playsinline
		webkit-playsinline
		class="h-96 w-full object-cover"
		disablePictureInPicture
	/>

	<!-- Always-visible quick Unmute button (Twitter-like) -->
	<media-mute-button
		class="absolute top-3 right-3 z-10 rounded-full bg-black/60 text-white p-2
           hover:bg-black/80 transition-opacity"
		aria-label="Toggle mute"
		on:click|stopPropagation
	></media-mute-button>

	<!-- Control bar only on hover -->
	<media-control-bar
		on:click|stopPropagation
		class="pointer-events-none opacity-0 group-hover:opacity-100 group-hover:pointer-events-auto
           transition-opacity duration-150 absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent p-2"
	>
		<div class="flex items-center gap-2 w-full">
			<media-play-button class="bg-transparent text-white px-2 py-1"></media-play-button>
			<media-time-range class="flex-1 bg-transparent"></media-time-range>
			<!-- <media-time-display class="text-white/90 text-sm" show-duration></media-time-display> -->
			<media-fullscreen-button class="bg-transparent text-white px-2 py-1"
			></media-fullscreen-button>
		</div>
	</media-control-bar>
</media-controller>

<style>
	/* Optional: fine-tune focus outlines for accessibility */
	media-mute-button:focus,
	media-play-button:focus,
	media-fullscreen-button:focus {
		outline: 2px solid rgba(255, 255, 255, 0.8);
		outline-offset: 2px;
	}
</style>

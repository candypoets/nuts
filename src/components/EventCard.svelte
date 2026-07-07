<script lang="ts" context="module">
	export type { CalendarEventCard } from 'src/lib/calendarEvent';
</script>

<script lang="ts">
	import Icon from '@iconify/svelte';
	import type { CalendarEventCard } from 'src/lib/calendarEvent';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import { go, usePagerNavigation } from 'src/routes/modals/modal';

	export let event: CalendarEventCard;
	export let rsvpCount = 0;
	export let feedRelays: string[] = [];
	const nav = usePagerNavigation();

	$: modalRelays = feedRelays.length ? feedRelays : event.relays;
	$: goingCount = rsvpCount || event.attendeeCount;
	$: spotsLeft = event.capacity ? Math.max(0, event.capacity - goingCount) : null;

	function formatEventMonth(timestamp: number) {
		return new Intl.DateTimeFormat(undefined, { month: 'short' })
			.format(new Date(timestamp * 1000))
			.toUpperCase();
	}

	function formatEventDay(timestamp: number) {
		return new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(
			new Date(timestamp * 1000)
		);
	}

	function formatEventTime(timestamp: number) {
		return new Intl.DateTimeFormat(undefined, {
			weekday: 'short',
			hour: 'numeric',
			minute: '2-digit'
		}).format(new Date(timestamp * 1000));
	}

	function openEvent() {
		const relayParam = modalRelays.map(encodeURIComponent).join(',');
		const eventPath = `event:${relayParam}:${encodeURIComponent(event.address)}`;
		nav ? nav.push(eventPath) : go(eventPath);
	}
</script>

<button
	type="button"
	class="flex h-[286px] w-60 shrink-0 self-start flex-col overflow-hidden rounded-lg border border-base-200 bg-base-300 p-0 text-left align-top transition-colors hover:border-primary/50"
	on:click|stopPropagation={openEvent}
>
	<div class="relative h-28 shrink-0 bg-base-200">
		{#if event.image}
			<img src={proxyAvatarUrl(event.image)} alt="" class="h-full w-full object-cover" />
		{:else}
			<div class="flex h-full w-full items-center justify-center bg-base-200">
				<Icon icon="mdi:calendar-outline" class="text-4xl text-primary" />
			</div>
		{/if}
		<div class="absolute inset-0 bg-black/25"></div>
		<div class="absolute left-3 top-3 overflow-hidden rounded-md bg-white">
			<div
				class="bg-base-300 px-2 py-1 text-center text-[10px] font-black uppercase text-base-content"
			>
				{formatEventMonth(event.start)}
			</div>
			<div class="px-2 py-1 text-center text-xl font-black text-black">
				{formatEventDay(event.start)}
			</div>
		</div>
	</div>

	<div class="flex min-h-0 flex-1 flex-col p-3">
		<h3 class="truncate text-base font-bold">{event.title}</h3>
		<p class="mt-2 truncate text-sm font-medium text-primary-content">
			{formatEventTime(event.start)}
		</p>
		{#if event.location}
			<p class="mt-1 truncate text-sm font-medium text-primary-content">{event.location}</p>
		{/if}

		<div class="mt-auto flex items-center pt-4">
			<div class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary/20">
				<Icon icon="mdi:account-group" class="text-xs text-primary" />
			</div>
			<span class="text-sm font-semibold text-primary">{goingCount} going</span>
		</div>

		{#if spotsLeft !== null}
			<p
				class="mt-2 truncate text-xs font-semibold"
				class:text-error={spotsLeft === 0}
				class:text-primary-content={spotsLeft > 0}
			>
				{spotsLeft ? `${spotsLeft} spots left` : 'Full'}
			</p>
		{/if}
	</div>
</button>

<script lang="ts">
	import { page } from '$app/stores';
	import { type NostrEvent } from 'nostr-tools';
	import VirtualListBottom from 'src/comp/VirtualListBottom.svelte';
	import Message from './message.svelte';
	import { db, key } from 'src/stores/db';
	import { slide } from 'svelte/transition';
	import User from 'src/routes/explore/user.svelte';
	import { swipe, type SwipeCustomEvent } from 'src/actions/swipe';
	import { spring, tweened } from 'svelte/motion';
	import { goto } from '$app/navigation';
	import { quintOut } from 'svelte/easing';
	import { onMount } from 'svelte';
	import PictureProfile from 'src/routes/explore/post/picture-profile.svelte';
	import Icon from '@iconify/svelte';
	import { sendMessage } from 'src/actions/chat';
	import { signer } from 'src/stores/signer';
	import { fetchMessages } from 'src/stores/chat';
	import { pool } from 'src/stores/relays';
	import _ from 'lodash';

	import { Keyboard } from '@capacitor/keyboard';

	let keyboardHeight = tweened(0, { delay: 250, easing: quintOut });

	Keyboard.addListener('keyboardWillShow', (info) => {
		// Animate your content here
		$keyboardHeight = info.keyboardHeight;
	});

	Keyboard.addListener('keyboardWillHide', () => {
		// Animate your content back
		$keyboardHeight = 0;
	});

	let postElement: HTMLElement;

	let scrollContainer: HTMLElement;

	let message: string = '';

	$: console.log($page.params.pubkey);

	onMount(() => {
		scrollContainer?.scrollTo({ top: 1000000 });
	});
	let incomings: NostrEvent[] = [];
	let outgoings: NostrEvent[] = [];
	$: $db.dms
		.where({ pubkey: $page.params.pubkey })
		.sortBy('created_at')
		.then((dms) => (incomings = dms));

	const groupMessagesByDate = (messages: NostrEvent[]) => {
		const now = new Date();
		const oneDay = 24 * 60 * 60 * 1000;
		const oneWeek = 7 * oneDay;
		const oneMonth = 30 * oneDay;

		return messages.reduce(
			(acc, message) => {
				const messageDate = new Date(message.created_at * 1000);
				const diffTime = now.getTime() - messageDate.getTime();
				const diffMinutes = Math.floor(diffTime / (60 * 1000));
				const diffDays = Math.floor(diffTime / oneDay);

				let key;
				if (diffMinutes < 60) {
					if (diffMinutes < 1) {
						key = 'Just now';
					} else if (diffMinutes < 10) {
						key = `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
					} else {
						key = `${Math.floor(diffMinutes / 10) * 10} minutes ago`;
					}
				} else if (diffDays < 1) {
					key = 'Today';
				} else if (diffDays === 1) {
					key = 'Yesterday';
				} else if (diffDays < 7) {
					key = `${diffDays} days ago`;
				} else if (diffDays < 30) {
					key = 'A few weeks ago';
				} else if (diffDays < 60) {
					key = 'A few months ago';
				} else {
					key = messageDate.toLocaleDateString();
				}

				if (!acc[key]) {
					acc[key] = [];
				}
				acc[key].push(message);
				return acc;
			},
			{} as Record<string, NostrEvent[]>
		);
	};

	$: $db.dms
		.filter((dm) => dm.tags.some((t) => t[0] == 'p' && t[1] == $page.params.pubkey))
		.sortBy('created_at')
		.then((dms) => (outgoings = dms));

	// $: console.log(incomings, outgoings);

	$: messages = [
		...incomings.map((i) => ({ ...i, incoming: true })),
		...outgoings.map((o) => ({ ...o, incoming: false }))
	].sort((a, b) => a.created_at - b.created_at);

	$: map = groupMessagesByDate(messages);

	$: groupedMessages = Object.keys(map)
		.reduce((acc, cur) => [...(acc || []), cur, ...map[cur]], [])
		.reverse();
	// $: console.log(map, groupedMessages);

	const translateX = spring(0, {
		stiffness: 0.3,
		damping: 0.8
	});
	function handler(event: SwipeCustomEvent) {
		console.log('handler');
		translateX.set(event.detail.deltaX, { hard: true });
	}
	function end(event: SwipeCustomEvent) {
		// console.log('end');
		if ($translateX > postElement.clientWidth / 2) {
			// goto('/explore');
			$translateX = postElement.clientWidth;
			setTimeout(() => {
				goto('/chat');
			}, 300);
		} else {
			$translateX = 0;
		}
	}

	let abortController = new AbortController();
	async function subscribe() {
		console.log('subscribe');
		abortController.abort();
		abortController = new AbortController();
		const lastEvent = await $db.dms.orderBy('created_at').last();
		try {
			const messages = fetchMessages(
				$pool,
				$signer,
				abortController,
				$key?.pub || '',
				$page.params.pubkey,
				lastEvent?.created_at
			);
			for await (const message of messages) {
				console.log('ok message');
				// divide the message in incoming and outgoing
				const newincomings = message.filter((m) => m.pubkey == $page.params.pubkey);
				incomings = _.uniqBy([...incomings, ...newincomings], 'id');

				const newoutgoings = message.filter((m) => m.pubkey != $page.params.pubkey);

				outgoings = _.uniqBy([...outgoings, ...newoutgoings], 'id');
			}
		} catch (error) {
			console.log('error', error);
		} finally {
			console.log('finally');
		}
	}

	$: $page.params.pubkey && subscribe();
</script>

<div
	class="fixed top-0 right-0 overflow-hidden z-10"
	transition:slide={{ duration: 300, easing: quintOut, axis: 'x' }}
	style="right: -{$translateX}px;"
	bind:this={postElement}
	use:swipe
	on:swipe={handler}
	on:end={end}
>
	{#key $page.params.pubkey}
		<div class="max-h-screen z-10 lg:w-50vw w-100vw bg-basic lg:border-l lg:border relative">
			<div
				class="fixed pt-safe flex justify-between lg:w-50vw py-2 w-full backdrop-blur-xl bg-transparent h-32 z-10"
			>
				<a href="/chat">
					<Icon icon="mingcute:left-line" class="text-2xl" />
				</a>
				<div>
					<PictureProfile pubkey={$page.params.pubkey || ''} className="!w-12 !h-12" />
					<User npub={$page.params.pubkey || ''} link={false} />
				</div>
				<div />
			</div>
			<div class="lg:m-auto lg:w-4/5 h-screen">
				<VirtualListBottom
					items={groupedMessages}
					let:item
					getItemId={(item) => item?.content || item}
				>
					<Message message={item} />
				</VirtualListBottom>
			</div>
			<div
				class="fixed w-full px-2 lg:w-40vw lg:px-0 m-auto pb-6 bottom-20 lg:bottom-0 bg-transparent"
				style="transform: translateY(calc(5rem - {$keyboardHeight
					? $keyboardHeight + 'px'
					: '5rem'}));"
			>
				<div class="join w-full">
					<input
						type="text"
						class="join-item input input-bordered w-full"
						placeholder="say something"
						bind:value={message}
					/>
					<button
						class="btn btn-primary join-item"
						on:click={() => {
							sendMessage($signer, $page.params.pubkey, message);
							message = '';
						}}
					>
						<Icon icon="ion:send" class="text-2xl" />
					</button>
				</div>
			</div>
		</div>
	{/key}
</div>

<style>
	.max-w-11-12 {
		max-width: 95%;
	}

	@media (min-width: 1024px) {
		.lg\:w-50vw {
			width: 50vw !important;
		}
		.lg\:w-40vw {
			width: 40vw !important;
			margin-left: 5vw;
		}
	}
	.w-100vw {
		width: 100vw;
	}

	.h-container {
		height: calc((var(--vc, 1vh) * 100) - 12rem);
	}
</style>

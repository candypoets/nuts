<script lang="ts">
	import Icon from '@iconify/svelte';
	import { goto } from '$app/navigation';
	import { nip19 } from 'nostr-tools';

	import Avatar from 'src/routes/explore/avatar.svelte';
	import User from 'src/routes/explore/user.svelte';
	import { carouselAnimator } from 'src/controller/carrousel';
	import { resolve } from 'src/lib/paths';

	// Optional: provide a list of suggested contacts as hex pubkeys
	export let contacts: string[] = [];

	let value = '';
	let hex = '';
	let error = '';
	let valid = false;

	function validate() {
		const v = value.trim();
		error = '';
		hex = '';
		valid = false;
		if (!v) return;

		// Accept raw hex
		if (/^[0-9a-fA-F]{64}$/.test(v)) {
			hex = v.toLowerCase();
			valid = true;
			return;
		}

		// Accept npub or nprofile
		try {
			const decoded = nip19.decode(v);
			if (decoded.type === 'npub') {
				hex = decoded.data as string;
				valid = true;
				return;
			}
			if (decoded.type === 'nprofile') {
				hex = (decoded.data as any).pubkey;
				valid = true;
				return;
			}
			error = "That doesn't look like a profile address.";
		} catch (e) {
			error = "That doesn't look like a profile address.";
		}
	}

	function submit() {
		validate();
		if (!valid || !hex) return;
		goto(resolve(`/chat/kind4:${hex}`));
	}

	function openChat(pubkey: string) {
		goto(resolve(`/chat/kind4:${pubkey}`));
	}

	$: value, validate(); // re-validate as user types
</script>

<div class="mx-1 bg-base-300 bg-opacity-85 rounded-xl p-6 shadow-widget">
	<div class="flex flex-col items-center text-center">
		<div class="mb-3">
			<span
				class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-base-200 text-primary"
			>
				<Icon icon="material-symbols:chat-add-on-outline-rounded" class="text-3xl" />
			</span>
		</div>

		<h2 class="text-2xl font-semibold mb-2">Who would you like to message?</h2>
		<p class="text-base-content/70 max-w-prose mb-5">
			Find someone you know and start a private conversation.
		</p>

		<div class="w-full max-w-xl">
			<button
				class="btn btn-primary w-full"
				on:click|stopPropagation={() => carouselAnimator.moveLeft()}
			>
				Find someone
			</button>

			<div class="divider my-5 text-base-content/60">Already have their address?</div>

			<label class="label" for="chat-profile-address">
				<span class="label-text">Paste their profile address</span>
			</label>
			<input
				id="chat-profile-address"
				class="input input-bordered w-full"
				placeholder="Profile address"
				bind:value
				on:keydown={(e) => e.key === 'Enter' && submit()}
				autocomplete="off"
				spellcheck="false"
				inputmode="text"
			/>

			{#if error}
				<div class="text-error text-sm mt-2">{error}</div>
			{/if}

			<button class="btn btn-primary w-full mt-3" disabled={!valid} on:click={submit}>
				<Icon icon="teenyicons:add-outline" class="text-lg mr-2" />
				Message them
			</button>

			<p class="mt-5 text-sm text-base-content/60">Your messages are private and encrypted.</p>
		</div>

		{#if contacts?.length}
			<div class="divider my-6">Message a contact</div>

			<ul class="w-full max-w-xl space-y-2">
				{#each contacts.slice(0, 5) as pub (pub)}
					<li
						class="flex items-center justify-between gap-3 p-3 rounded-lg bg-base-200 bg-opacity-70"
					>
						<div class="flex items-center gap-3 min-w-0">
							<Avatar pubkey={pub} size="lg" />
							<div class="truncate">
								<User pubkey={pub} link={false} />
								<div class="text-xs text-base-content/60 truncate">{pub}</div>
							</div>
						</div>
						<button class="btn btn-sm btn-accent" on:click={() => openChat(pub)}>
							Message
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>

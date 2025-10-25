<script lang="ts">
	import Icon from '@iconify/svelte';
	import { goto } from '$app/navigation';
	import { nip19 } from 'nostr-tools';

	import Avatar from 'src/routes/explore/avatar.svelte';
	import User from 'src/routes/explore/user.svelte';

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
			error = 'Unsupported bech32 type. Paste an npub or nprofile.';
		} catch (e) {
			error = 'Invalid npub or hex pubkey.';
		}
	}

	function submit() {
		validate();
		if (!valid || !hex) return;
		goto(`/chat/kind4:${hex}`);
	}

	$: validate(); // re-validate as user types
</script>

<div class="w-feed m-auto bg-base-300 bg-opacity-85 backdrop-blur-md rounded-xl p-6 shadow-widget">
	<div class="flex flex-col items-center text-center">
		<div class="mb-3">
			<span
				class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-base-200 text-primary"
			>
				<Icon icon="material-symbols:chat-add-on-outline-rounded" class="text-3xl" />
			</span>
		</div>

		<h2 class="text-2xl font-semibold mb-2">Start a Blurred Chat</h2>
		<p class="text-base-content/70 max-w-prose mb-4">
			End‑to‑end encrypted DMs on Nostr. Others may see who you're talking to, but never what you
			say.
		</p>

		<div class="w-full max-w-xl">
			<label class="label">
				<span class="label-text">Paste an npub, nprofile, or hex pubkey</span>
			</label>
			<input
				class="input input-bordered w-full"
				placeholder="npub1..."
				bind:value
				on:keydown={(e) => e.key === 'Enter' && submit()}
				autocomplete="off"
				spellcheck="false"
				inputmode="latin"
			/>

			{#if error}
				<div class="text-error text-sm mt-2">{error}</div>
			{/if}

			<button class="btn btn-primary w-full mt-3" disabled={!valid} on:click={submit}>
				<Icon icon="teenyicons:add-outline" class="text-lg mr-2" />
				Start a new chat
			</button>

			<a href="/explore" class="btn btn-ghost w-full mt-2">Find people to chat with</a>
		</div>

		{#if contacts?.length}
			<div class="divider my-6">Message a contact</div>

			<ul class="w-full max-w-xl space-y-2">
				{#each contacts.slice(0, 5) as pub}
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
						<button class="btn btn-sm btn-accent" on:click={() => goto(`/chat/kind4:${pub}`)}>
							Message
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>

<script lang="ts">
	import {
		constructClaimAuthorizationEvent,
		constructClaimRequest,
		postClaimRequest,
		queryAliasAvailability,
		queryExistingClaims,
		type LightningAlias
	} from 'src/lib/lightningAddressClient';
	import type { WorkerMessage } from '@candypoets/nipworker';
	import { usePublish, useSignEvent } from '@candypoets/nipworker/hooks';
	import {
		asKind0,
		asKind10019,
		asKind17375,
		fbArray,
		isConnectionStatus
	} from '@candypoets/nipworker/utils';
	import { hexToBytes } from '@noble/hashes/utils';
	import { env } from '$env/dynamic/public';
	import Icon from '@iconify/svelte';
	import { getPublicKey } from 'nostr-tools';
	import { getContext, onDestroy, onMount } from 'svelte';

	import { key } from 'src/controller';
	import { kind0, kind10019, kind17375 } from 'src/controller/nostr';
	import { now } from 'src/lib/period';
	import { buildProfileLightningAddressEvent } from 'src/lib/profileReplication';
	import { DEFAULT_MINTS } from 'src/lib/wallet';
	import { go } from 'src/routes/modals/modal';

	let animator: { goBack: () => void } = getContext('animator');

	let aliases: LightningAlias[] = [];
	let handle = '';
	let mintUrl = '';
	let loading = true;
	let submitting = false;
	let errorMessage = '';
	let successMessage = '';
	let copiedValue = '';
	let availabilityTimer: ReturnType<typeof setTimeout> | undefined;
	let availabilityRequestId = 0;
	let profilePublishUnsubscribe: (() => void) | undefined;
	let profilePublishTimeout: ReturnType<typeof setTimeout> | undefined;
	let updatingProfileAddress = '';
	let publishedProfileAddress = '';
	let profileUpdateError = '';

	type HandleAvailability =
		| 'idle'
		| 'invalid'
		| 'checking'
		| 'available'
		| 'owned'
		| 'taken'
		| 'error';
	let handleAvailability: HandleAvailability = 'idle';

	const domain = env.PUBLIC_LNUTS_DOMAIN || 'nuts.cash';

	$: currentProfile = $kind0 ? asKind0($kind0) : undefined;
	$: publicWallet = $kind10019 ? asKind10019($kind10019) : undefined;
	$: privateWallet = $kind17375 ? asKind17375($kind17375) : undefined;
	$: publicWalletMints = publicWallet
		? fbArray(publicWallet, 'trustedMints')
				.map((mint) => mint.url())
				.filter((mint): mint is string => !!mint)
		: [];
	$: privateWalletMints = privateWallet ? fbArray(privateWallet, 'mints') : [];
	$: availableMints = Array.from(
		new Set([
			...publicWalletMints,
			...privateWalletMints,
			...aliases.map((alias) => alias.mint_url),
			...DEFAULT_MINTS
		])
	);
	$: p2pkPubkey =
		publicWallet?.p2pkPubkey() ||
		privateWallet?.p2pkPubKey() ||
		deriveP2pkPubkey(privateWallet?.p2pkPrivKey());
	$: normalizedHandle = handle.trim();
	$: checkHandleAvailability(normalizedHandle, $key?.pub, aliases);
	$: canSubmitHandle = handleAvailability === 'available' || handleAvailability === 'owned';
	$: if (!mintUrl && availableMints.length) mintUrl = availableMints[0];

	onMount(loadAliases);
	onDestroy(() => {
		if (availabilityTimer) clearTimeout(availabilityTimer);
		if (profilePublishTimeout) clearTimeout(profilePublishTimeout);
		profilePublishUnsubscribe?.();
		availabilityRequestId += 1;
	});

	function deriveP2pkPubkey(privateKey: string | null | undefined) {
		if (!privateKey) return '';
		try {
			return getPublicKey(hexToBytes(privateKey));
		} catch {
			return '';
		}
	}

	function checkHandleAvailability(
		alias: string,
		pubkey: string | undefined,
		currentAliases: LightningAlias[]
	) {
		if (availabilityTimer) clearTimeout(availabilityTimer);
		const requestId = ++availabilityRequestId;

		if (!alias) {
			handleAvailability = 'idle';
			return;
		}
		if (!/^[A-Za-z0-9_]{1,30}$/.test(alias)) {
			handleAvailability = 'invalid';
			return;
		}
		if (currentAliases.some((claim) => claim.alias === alias && claim.pubkey === pubkey)) {
			handleAvailability = 'owned';
			return;
		}

		handleAvailability = 'checking';
		availabilityTimer = setTimeout(async () => {
			try {
				const result = await queryAliasAvailability(alias);
				if (requestId !== availabilityRequestId) return;

				if (result.available) {
					handleAvailability = 'available';
				} else if (result.data.pubkey === pubkey) {
					handleAvailability = 'owned';
				} else {
					handleAvailability = 'taken';
				}
			} catch {
				if (requestId === availabilityRequestId) handleAvailability = 'error';
			}
		}, 250);
	}

	async function loadAliases() {
		if (!$key?.pub) {
			aliases = [];
			loading = false;
			return;
		}

		loading = true;
		errorMessage = '';
		try {
			aliases = await queryExistingClaims($key.pub);
		} catch (error) {
			errorMessage =
				error instanceof Error ? error.message : 'Could not load your Lightning addresses.';
		} finally {
			loading = false;
		}
	}

	function editAlias(alias: LightningAlias) {
		handle = alias.alias;
		mintUrl = alias.mint_url;
		errorMessage = '';
		successMessage = '';
	}

	function clearForm() {
		handle = '';
		mintUrl = availableMints[0] || '';
		errorMessage = '';
		successMessage = '';
	}

	function addressFor(alias: LightningAlias) {
		return alias.lightningAddress || `${alias.alias}@${domain}`;
	}

	function profileHasAddress(address: string) {
		const profileAddress = publishedProfileAddress || currentProfile?.lud16() || '';
		return profileAddress.trim().toLowerCase() === address.trim().toLowerCase();
	}

	function updateProfileLightningAddress(alias: LightningAlias) {
		const address = addressFor(alias);
		if (updatingProfileAddress || profileHasAddress(address)) return;
		if ($key.hasSigner !== true) {
			profileUpdateError = 'Reconnect this account with a signer before updating your profile.';
			return;
		}

		updatingProfileAddress = address;
		profileUpdateError = '';
		profilePublishUnsubscribe?.();
		if (profilePublishTimeout) clearTimeout(profilePublishTimeout);

		const publishId = `kind0_lnurl_${now()}`;
		let settled = false;
		let lastRelayError = '';
		const finish = (error = '') => {
			if (settled) return;
			settled = true;
			updatingProfileAddress = '';
			profileUpdateError = error;
			if (profilePublishTimeout) clearTimeout(profilePublishTimeout);
			profilePublishUnsubscribe?.();
			profilePublishUnsubscribe = undefined;
		};

		try {
			profilePublishUnsubscribe = usePublish(
				publishId,
				buildProfileLightningAddressEvent(currentProfile, address, now()),
				(message: WorkerMessage) => {
					const status = isConnectionStatus(message);
					if (!status) return;

					const value = status.status()?.toString().toLowerCase();
					if (value === 'false') {
						lastRelayError = status.message()?.toString() || 'A relay rejected the profile update.';
						return;
					}
					if (value !== 'true' && value !== 'ok') return;

					publishedProfileAddress = address;
					finish();
				},
				{ trackStatus: true }
			);
			profilePublishTimeout = setTimeout(
				() =>
					finish(lastRelayError || 'No relay acknowledged the profile update. Please try again.'),
				8000
			);
		} catch (error) {
			finish(error instanceof Error ? error.message : 'Could not update your Nostr profile.');
		}
	}

	async function submitClaim() {
		errorMessage = '';
		successMessage = '';

		const alias = handle.trim();
		const mint = mintUrl.trim();

		if (!canSubmitHandle) {
			errorMessage =
				handleAvailability === 'taken'
					? 'This handle has already been claimed.'
					: 'Wait for the handle availability check to finish.';
			return;
		}
		if (!$key?.pub) {
			errorMessage = 'Connect a Nostr account before claiming an address.';
			return;
		}
		if ($key.hasSigner !== true) {
			errorMessage = 'Reconnect this account with a signer before claiming an address.';
			return;
		}
		if (!mint) {
			errorMessage = 'Choose the Cashu mint that will receive payments.';
			return;
		}

		try {
			const claimUrl = new URL('/api/claims', window.location.origin).toString();
			const request = constructClaimRequest(alias, mint, p2pkPubkey || undefined);
			const authorization = await constructClaimAuthorizationEvent(request, $key.pub, claimUrl);
			submitting = true;

			useSignEvent(authorization, async (signed) => {
				try {
					const result = await postClaimRequest(request, signed, claimUrl);
					if (result.status !== 'success') {
						throw new Error(result.reason || 'The handle could not be claimed.');
					}
					successMessage = result.message || `${alias}@${domain} is ready.`;
					await loadAliases();
				} catch (error) {
					errorMessage =
						error instanceof Error ? error.message : 'The handle could not be claimed.';
				} finally {
					submitting = false;
				}
			});
		} catch (error) {
			submitting = false;
			errorMessage = error instanceof Error ? error.message : 'The handle could not be claimed.';
		}
	}

	async function copy(value: string) {
		await navigator.clipboard.writeText(value);
		copiedValue = value;
		window.setTimeout(() => {
			if (copiedValue === value) copiedValue = '';
		}, 1400);
	}
</script>

<svelte:head>
	<title>Lightning addresses · Nuts</title>
</svelte:head>

<div class="h-screen overflow-y-auto bg-base-300/95" data-scroll-container>
	<header
		class="sticky top-0 z-10 border-b border-base-content/10 bg-base-300/95 px-4 pb-4 pt-safe backdrop-blur"
	>
		<div class="flex w-full items-center justify-between pt-4">
			<button
				type="button"
				class="btn btn-circle btn-ghost btn-sm"
				aria-label="Return to profile"
				on:click={animator.goBack}
			>
				<Icon icon="mingcute:down-line" class="h-6 w-6" />
			</button>
			<div class="text-center">
				<p class="text-xs font-semibold uppercase tracking-[0.16em] opacity-55">LNURL-pay</p>
				<h1 class="text-xl font-bold">Lightning addresses</h1>
			</div>
			<button
				type="button"
				class="btn btn-circle btn-ghost btn-sm"
				aria-label="Refresh Lightning addresses"
				disabled={loading}
				on:click={loadAliases}
			>
				<Icon icon="mdi:refresh" class={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
			</button>
		</div>
	</header>

	<main class="w-full space-y-5 px-4 py-6">
		{#if !$key?.pub}
			<section class="rounded-2xl border border-warning/30 bg-warning/10 p-5">
				<h2 class="font-bold">Connect an account</h2>
				<p class="mt-1 text-sm opacity-70">A Nostr identity owns each claimed handle.</p>
				<button type="button" class="btn btn-primary btn-sm mt-4" on:click={() => go('login')}>
					Connect account
				</button>
			</section>
		{:else}
			<section class="rounded-2xl border border-base-content/10 bg-base-200 p-5">
				<div class="flex items-center justify-between gap-3">
					<div>
						<h2 class="font-bold">Your addresses</h2>
						<p class="mt-1 text-sm opacity-60">Select one to inspect or update its destination.</p>
					</div>
					{#if aliases.length}
						<span class="badge badge-ghost">{aliases.length}</span>
					{/if}
				</div>

				{#if loading}
					<div class="flex items-center gap-3 py-8 text-sm opacity-60">
						<span class="loading loading-spinner loading-sm"></span>
						Querying lnuts…
					</div>
				{:else if aliases.length}
					<div class="mt-4 space-y-3">
						{#each aliases as alias (alias.alias)}
							<div class="rounded-xl border border-base-content/10 bg-base-100 p-4">
								<div class="flex items-start justify-between gap-3">
									<button
										type="button"
										class="min-w-0 flex-1 text-left"
										on:click={() => editAlias(alias)}
									>
										<strong class="block truncate text-lg">{addressFor(alias)}</strong>
										<span class="mt-1 block truncate text-xs opacity-55">{alias.mint_url}</span>
									</button>
									<div class="flex shrink-0 gap-1">
										<button
											type="button"
											class="btn btn-square btn-ghost btn-sm"
											aria-label={`Copy ${addressFor(alias)}`}
											on:click={() => copy(addressFor(alias))}
										>
											<Icon
												icon={copiedValue === addressFor(alias) ? 'mdi:check' : 'mdi:content-copy'}
												class="h-4 w-4"
											/>
										</button>
										<button
											type="button"
											class="btn btn-square btn-ghost btn-sm"
											aria-label={`Edit ${addressFor(alias)}`}
											on:click={() => editAlias(alias)}
										>
											<Icon icon="mdi:pencil-outline" class="h-4 w-4" />
										</button>
									</div>
								</div>
								{#if alias.p2pk_pubkey}
									<div class="mt-3 flex flex-wrap gap-2 text-xs">
										<span class="badge badge-ghost">P2PK protected</span>
									</div>
								{/if}
								{#if !profileHasAddress(addressFor(alias))}
									<div class="mt-4 rounded-xl border border-info/25 bg-info/10 p-3">
										<p class="text-sm">
											{#if currentProfile?.lud16()}
												Your Nostr profile currently uses
												<strong>{currentProfile.lud16()}</strong>.
											{:else}
												Your Nostr profile does not have a Lightning address yet.
											{/if}
										</p>
										<button
											type="button"
											class="btn btn-info btn-sm mt-3 w-full"
											disabled={!!updatingProfileAddress || $key.hasSigner !== true}
											on:click={() => updateProfileLightningAddress(alias)}
										>
											{#if updatingProfileAddress === addressFor(alias)}
												<span class="loading loading-spinner loading-xs"></span>
												Updating Nostr profile…
											{:else}
												Use {addressFor(alias)} on my profile
											{/if}
										</button>
									</div>
								{/if}
							</div>
						{/each}
						{#if profileUpdateError}
							<div class="alert alert-error text-sm" role="alert">
								<Icon icon="mdi:alert-circle-outline" class="h-5 w-5" />
								<span>{profileUpdateError}</span>
							</div>
						{/if}
					</div>
				{:else}
					<div class="mt-4 rounded-xl border border-dashed border-base-content/15 p-6 text-center">
						<Icon icon="mdi:at" class="mx-auto h-8 w-8 opacity-35" />
						<p class="mt-2 text-sm opacity-60">No handles claimed by this account yet.</p>
					</div>
				{/if}
			</section>

			<section class="rounded-2xl border border-base-content/10 bg-base-200 p-5">
				<div class="flex items-start justify-between gap-3">
					<div>
						<h2 class="font-bold">
							{handleAvailability === 'owned' ? 'Update handle' : 'Claim a handle'}
						</h2>
						<p class="mt-1 text-sm opacity-60">
							Letters, numbers, and underscores; up to 30 characters.
						</p>
					</div>
					{#if handle || successMessage}
						<button type="button" class="btn btn-ghost btn-xs" on:click={clearForm}>New</button>
					{/if}
				</div>

				<form class="mt-5 space-y-4" on:submit|preventDefault={submitClaim}>
					<div>
						<label for="lnurl-handle" class="mb-2 block text-sm font-semibold">Handle</label>
						<div class="join flex w-full">
							<input
								id="lnurl-handle"
								class="input input-bordered join-item min-w-0 flex-1"
								pattern="[A-Za-z0-9_]+"
								maxlength="30"
								autocomplete="off"
								placeholder="satoshi"
								required
								bind:value={handle}
							/>
							<span
								class="join-item flex items-center border border-base-content/20 bg-base-300 px-3 text-sm opacity-70"
							>
								@{domain}
							</span>
						</div>
					</div>

					<div>
						<label for="lnurl-mint" class="mb-2 block text-sm font-semibold">Cashu mint</label>
						<select
							id="lnurl-mint"
							class="select select-bordered w-full"
							required
							bind:value={mintUrl}
						>
							{#each availableMints as mint (mint)}
								<option value={mint}>
									{mint}{publicWalletMints.includes(mint) ? ' · Recommended on Nostr' : ''}
								</option>
							{/each}
						</select>
					</div>

					<div class="rounded-xl bg-base-300 p-3 text-xs leading-5 opacity-70">
						{#if p2pkPubkey}
							<Icon icon="mdi:shield-lock-outline" class="mr-1 inline h-4 w-4 align-text-bottom" />
							Incoming proofs will be locked to the P2PK key configured by your Cashu wallet.
						{:else}
							<Icon icon="mdi:information-outline" class="mr-1 inline h-4 w-4 align-text-bottom" />
							No wallet P2PK key is loaded. Configure your Cashu wallet before accepting payments.
						{/if}
					</div>

					{#if $key.hasSigner !== true}
						<div class="alert alert-warning text-sm">
							<Icon icon="mdi:key-alert-outline" class="h-5 w-5" />
							<span>This account is read-only. Reconnect it with a signer to continue.</span>
							<button type="button" class="btn btn-sm" on:click={() => go('login')}
								>Reconnect</button
							>
						</div>
					{/if}

					{#if errorMessage}
						<div class="alert alert-error text-sm" role="alert">
							<Icon icon="mdi:alert-circle-outline" class="h-5 w-5" />
							<span>{errorMessage}</span>
						</div>
					{/if}

					{#if successMessage}
						<div class="alert alert-success text-sm" role="status">
							<Icon icon="mdi:check-circle-outline" class="h-5 w-5" />
							<span>{successMessage}</span>
						</div>
					{/if}

					<button
						type="submit"
						class="btn btn-primary w-full"
						disabled={submitting || !canSubmitHandle || $key.hasSigner !== true || !p2pkPubkey}
					>
						{#if submitting}
							<span class="loading loading-spinner loading-sm"></span>
							Waiting for signer…
						{:else if handleAvailability === 'checking'}
							<span class="loading loading-spinner loading-sm"></span>
							Checking availability…
						{:else if handleAvailability === 'invalid'}
							Invalid handle
						{:else if handleAvailability === 'taken'}
							Handle unavailable
						{:else if handleAvailability === 'error'}
							Could not check availability
						{:else if handleAvailability === 'owned'}
							Update address
						{:else if handleAvailability === 'available'}
							Available — claim address
						{:else}
							Enter a handle
						{/if}
					</button>
				</form>
			</section>
		{/if}
	</main>
</div>

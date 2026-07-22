<script lang="ts">
	import type { RequestObject, WorkerMessage } from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import { isConnectionStatus, isParsedEvent } from '@candypoets/nipworker/utils';
	import imageCompression from 'browser-image-compression';
	import { BadgeCheck, CircleAlert, Link2, Save, Undo2, Upload } from 'lucide-svelte';
	import type { EventTemplate } from 'nostr-tools';
	import { normalizeURL } from 'nostr-tools/utils';
	import { selectedAdminRelayUrl } from 'src/controller';
	import {
		buildCommunityProfileTags,
		COMMUNITY_PROFILE_D,
		COMMUNITY_PROFILE_KIND,
		parseCommunityProfile,
		type CommunityProfile
	} from 'src/lib/communityProfile';
	import {
		archetypeFor,
		COMMUNITY_ARCHETYPES,
		DEFAULT_COMMUNITY_TYPE,
		type CommunityType
	} from 'src/lib/communityTypes';
	import { now } from 'src/lib/period';
	import { DEFAULT_SERVER, getUserUploadConfig, uploadFile } from 'src/lib/upload';
	import { onDestroy } from 'svelte';

	let relayUrl = '';
	let loadedRelayUrl = '';
	let loading = true;
	let loadedProfile: CommunityProfile | undefined;
	let communityType: CommunityType = DEFAULT_COMMUNITY_TYPE;
	let description = '';
	let image = '';
	let menuUrl = '';
	let bookingUrl = '';
	let imagePreview = '';
	let imageUploadStatus = '';
	let imageUploadState: 'idle' | 'preparing' | 'uploading' | 'success' | 'error' = 'idle';
	let imageUploading = false;
	let publishing = false;
	let publishStatus = '';
	let unsubscribeProfile: (() => void) | undefined;
	let unsubscribePublish: (() => void) | undefined;

	$: if ($selectedAdminRelayUrl !== loadedRelayUrl) {
		loadedRelayUrl = $selectedAdminRelayUrl;
		relayUrl = loadedRelayUrl ? normalizeURL(loadedRelayUrl) : '';
		subscribeProfile();
	}
	$: selectedArchetype = archetypeFor(communityType);
	$: isDirty =
		communityType !== (loadedProfile?.type || DEFAULT_COMMUNITY_TYPE) ||
		description.trim() !== (loadedProfile?.description || '') ||
		image !== (loadedProfile?.image || '') ||
		menuUrl.trim() !== (loadedProfile?.menuUrl || '') ||
		bookingUrl.trim() !== (loadedProfile?.bookingUrl || '');

	function applyProfile(profile: CommunityProfile | undefined) {
		communityType = profile?.type || DEFAULT_COMMUNITY_TYPE;
		description = profile?.description || '';
		image = profile?.image || '';
		menuUrl = profile?.menuUrl || '';
		bookingUrl = profile?.bookingUrl || '';
	}

	function subscribeProfile() {
		unsubscribeProfile?.();
		loadedProfile = undefined;
		applyProfile(undefined);
		loading = Boolean(relayUrl);
		publishStatus = '';
		if (!relayUrl) return;

		const requests: RequestObject[] = [
			{
				kinds: [COMMUNITY_PROFILE_KIND],
				tags: { '#d': [COMMUNITY_PROFILE_D] },
				limit: 10,
				relays: [relayUrl]
			}
		];
		unsubscribeProfile = useSubscription(
			'admin_community_profile_' + relayUrl,
			requests,
			(message: WorkerMessage) => {
				const event = isParsedEvent(message);
				if (!event) return;
				const profile = parseCommunityProfile(event);
				if (!profile) return;
				if (loadedProfile && profile.createdAt <= loadedProfile.createdAt) return;
				loadedProfile = profile;
				// Never yank the form away while the admin has unsaved edits.
				if (!isDirty) applyProfile(profile);
				loading = false;
			},
			{ bytesPerEvent: 10 * 1024 }
		);
		window.setTimeout(() => (loading = false), 1600);
	}

	async function uploadCommunityImage(event: Event) {
		const input = event.currentTarget;
		if (!(input instanceof HTMLInputElement)) return;
		const file = input.files?.[0];
		if (!file) return;
		if (imagePreview) URL.revokeObjectURL(imagePreview);
		imagePreview = URL.createObjectURL(file);
		image = '';
		imageUploadStatus = 'Preparing image for upload…';
		imageUploadState = 'preparing';
		imageUploading = true;
		const uploadConfig = getUserUploadConfig();
		const uploadType = uploadConfig?.type || 'blossom';
		const uploadServer = uploadConfig?.servers[0] || DEFAULT_SERVER;
		try {
			let prepared = file;
			if (file.type.startsWith('image/')) {
				prepared = await imageCompression(file, {
					maxSizeMB: 0.8,
					maxWidthOrHeight: 1400,
					useWebWorker: true,
					fileType: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
					initialQuality: 0.84
				});
			}
			imageUploadStatus = `Uploading to ${uploadType === 'blossom' ? 'Blossom' : 'NIP-96'} at ${uploadServer}…`;
			imageUploadState = 'uploading';
			const result = await uploadFile(prepared, {
				preferUserServers: true,
				alt: description.trim() || prepared.name || file.name,
				includeMimeTag: true,
				includeDimensions: true
			});
			image = result.url;
			imageUploadStatus = 'Uploaded successfully';
			imageUploadState = 'success';
			URL.revokeObjectURL(imagePreview);
			imagePreview = '';
		} catch (error) {
			imageUploadStatus = error instanceof Error ? error.message : 'Image upload failed';
			imageUploadState = 'error';
		} finally {
			imageUploading = false;
			input.value = '';
		}
	}

	function removeImage() {
		image = '';
		if (imagePreview) URL.revokeObjectURL(imagePreview);
		imagePreview = '';
		imageUploadStatus = '';
		imageUploadState = 'idle';
	}

	function discardChanges() {
		applyProfile(loadedProfile);
		publishStatus = '';
	}

	function saveProfile() {
		if (!relayUrl || !isDirty || publishing) return;
		publishing = true;
		publishStatus = '';
		unsubscribePublish?.();
		const event: EventTemplate = {
			kind: COMMUNITY_PROFILE_KIND,
			tags: buildCommunityProfileTags({
				type: communityType,
				description,
				image,
				menuUrl,
				bookingUrl
			}),
			content: '',
			created_at: now()
		};
		unsubscribePublish = usePublish(
			'admin_community_profile_save_' + relayUrl,
			event,
			(message: WorkerMessage) => {
				const status = isConnectionStatus(message);
				if (!status) return;
				publishing = false;
				publishStatus = 'Profile saved to the community relay.';
				window.setTimeout(() => (publishStatus = ''), 4000);
			},
			{ trackStatus: true, defaultRelays: [relayUrl] }
		);
		window.setTimeout(() => (publishing = false), 4000);
	}

	onDestroy(() => {
		if (imagePreview) URL.revokeObjectURL(imagePreview);
		unsubscribeProfile?.();
		unsubscribePublish?.();
	});
</script>

<section>
	<div class="border-b border-stone-200 pb-7">
		<p class="text-sm font-black uppercase tracking-[0.15em] text-emerald-800">Community</p>
		<h1 class="mt-2 text-4xl font-black tracking-tight text-stone-950">Profile & type</h1>
		<p class="mt-3 max-w-2xl font-semibold leading-7 text-stone-500">
			The community shape tunes the dashboard toolkit and suggested roles. Description, image and
			links are shown on your public community page.
		</p>
	</div>

	{#if !relayUrl}
		<div
			class="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-16 text-center"
		>
			<h2 class="text-2xl font-black">No community selected</h2>
			<p class="mx-auto mt-2 max-w-md font-semibold leading-6 text-stone-500">
				Select a community from the switcher above to edit its profile.
			</p>
		</div>
	{:else if loading}
		<div class="mt-8 grid gap-4">
			<div class="h-40 animate-pulse rounded-2xl bg-stone-100"></div>
			<div class="h-24 animate-pulse rounded-2xl bg-stone-100"></div>
		</div>
	{:else}
		<div class="mt-8 grid gap-8">
			<fieldset>
				<legend class="text-sm font-black text-stone-600">Community type</legend>
				<div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
					{#each COMMUNITY_ARCHETYPES as archetype (archetype.id)}
						<button
							type="button"
							class={`grid min-h-24 content-center justify-items-center gap-1.5 rounded-xl border p-3 text-center font-black transition focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98] ${
								communityType === archetype.id
									? 'border-emerald-950 bg-emerald-950 text-white shadow-sm shadow-emerald-950/20'
									: 'border-stone-200 bg-white/80 text-stone-600 shadow-sm shadow-stone-950/5 hover:border-stone-300 hover:bg-white hover:text-stone-950'
							}`}
							on:click={() => (communityType = archetype.id)}
						>
							<svelte:component this={archetype.icon} size={24} />
							<span class="text-xs leading-tight">{archetype.label}</span>
						</button>
					{/each}
				</div>
				<p class="mt-3 text-sm font-semibold text-stone-500">
					{selectedArchetype.tagline}. {selectedArchetype.membershipHint}
				</p>
			</fieldset>

			<label class="grid gap-2">
				<span class="text-sm font-black text-stone-600">Description</span>
				<textarea
					class="min-h-28 w-full resize-y rounded-xl border border-stone-200 bg-stone-50/70 px-4 py-4 text-base font-semibold leading-7 outline-none transition placeholder:text-stone-400 focus:border-emerald-900 focus:bg-white focus:ring-2 focus:ring-emerald-800/20"
					rows="3"
					maxlength="200"
					bind:value={description}
					placeholder="A place for players, parents and supporters."
				></textarea>
				<small class="justify-self-end text-xs font-black text-stone-400"
					>{description.length}/200</small
				>
			</label>

			<div>
				<span class="mb-2 block text-sm font-black text-stone-600"
					>Community image <span class="font-semibold text-stone-400">· optional</span></span
				>
				<div
					class="flex items-center gap-4 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-3"
				>
					{#if image || imagePreview}
						<img
							src={image || imagePreview}
							alt="Community preview"
							class="h-20 w-20 shrink-0 rounded-lg object-cover"
						/>
					{:else}
						<div
							class="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-emerald-950 text-white"
						>
							<Upload size={22} />
						</div>
					{/if}
					<div class="min-w-0 flex-1">
						<label
							class={`inline-flex h-10 items-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-black shadow-sm ${imageUploading ? 'cursor-wait opacity-60' : 'cursor-pointer hover:bg-stone-50'}`}
						>
							<input
								type="file"
								accept="image/*"
								class="sr-only"
								disabled={imageUploading}
								on:change={uploadCommunityImage}
							/>
							{imageUploading
								? 'Uploading…'
								: image || imagePreview
									? 'Replace image'
									: 'Upload image'}
						</label>
						{#if image || imagePreview}
							<button
								type="button"
								class="ml-2 text-xs font-black text-stone-500 hover:text-red-600"
								disabled={imageUploading}
								on:click={removeImage}>Remove</button
							>
						{/if}
						{#if imageUploadState !== 'idle'}
							<div
								class={`mt-3 rounded-lg border px-3 py-2 text-xs font-bold ${imageUploadState === 'error' ? 'border-red-200 bg-red-50 text-red-700' : imageUploadState === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}
								role="status"
							>
								<p class="flex items-center gap-2">
									{#if imageUploadState === 'success'}
										<BadgeCheck size={15} />
									{:else if imageUploadState === 'error'}
										<CircleAlert size={15} />
									{:else}
										<span
											class="h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent"
										></span>
									{/if}
									{imageUploadStatus}
								</p>
							</div>
						{/if}
					</div>
				</div>
			</div>

			{#if communityType === 'hospitality'}
				<fieldset class="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
					<legend class="flex items-center gap-2 px-1 text-sm font-black text-amber-900">
						<Link2 size={16} /> Menu & reservations
					</legend>
					<p class="mt-1 text-sm font-semibold leading-6 text-stone-600">
						These links appear as “View menu” and “Book a table” buttons on your public community
						page. Point them at your existing menu page or booking tool — table reservations
						themselves are handled by your booking provider.
					</p>
					<div class="mt-4 grid gap-4 sm:grid-cols-2">
						<label class="grid gap-2">
							<span class="text-sm font-black text-stone-600">Menu link</span>
							<input
								class="h-12 w-full rounded-lg border border-stone-300 bg-white px-3 font-semibold outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
								bind:value={menuUrl}
								type="url"
								inputmode="url"
								placeholder="https://example.com/menu"
							/>
						</label>
						<label class="grid gap-2">
							<span class="text-sm font-black text-stone-600">Booking link</span>
							<input
								class="h-12 w-full rounded-lg border border-stone-300 bg-white px-3 font-semibold outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
								bind:value={bookingUrl}
								type="url"
								inputmode="url"
								placeholder="https://example.com/reservations"
							/>
						</label>
					</div>
				</fieldset>
			{/if}

			<div class="flex flex-wrap items-center gap-3 border-t border-stone-200 pt-5">
				<button
					type="button"
					class="inline-flex h-11 items-center gap-2 rounded-lg bg-[#073c32] px-5 text-sm font-black text-white transition hover:bg-[#0a4b3e] disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500"
					disabled={!isDirty || publishing || imageUploading}
					on:click={saveProfile}
				>
					<Save size={17} />
					{publishing ? 'Saving…' : 'Save changes'}
				</button>
				<button
					type="button"
					class="inline-flex h-11 items-center gap-2 rounded-lg border border-stone-200 bg-white px-4 text-sm font-black text-stone-700 hover:bg-stone-50 disabled:opacity-50"
					disabled={!isDirty || publishing}
					on:click={discardChanges}
				>
					<Undo2 size={16} />
					Discard
				</button>
				<p class="min-w-0 text-xs font-bold text-stone-500">
					Publishing only to <span class="break-all text-stone-700">{relayUrl}</span>
				</p>
			</div>
			{#if publishStatus}
				<p
					class="rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-bold text-emerald-900"
				>
					{publishStatus}
				</p>
			{/if}
		</div>
	{/if}
</section>

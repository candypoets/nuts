<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { getContext } from 'svelte';
	import Icon from '@iconify/svelte';
	import { go } from 'src/routes/modals/modal';
	import { kind0 } from 'src/controller/nostr';
	import { asKind0, isConnectionStatus } from '@candypoets/nipworker/utils';
	import { usePublish } from '@candypoets/nipworker/hooks';
	import { proxyAvatarUrl, proxyBannerUrl } from 'src/lib/proxy';
	import { now } from 'src/lib/period';
	import { normalizeURL } from 'nostr-tools/utils';
	import type {
		ConnectionStatus,
		Kind0Parsed,
		ParsedEvent,
		WorkerMessage
	} from '@candypoets/nipworker';
	import { nip96Upload } from 'src/lib';
	import { updateSendStatus } from 'src/controller/sendStatus';
	import Editor from 'src/components/Editor.svelte';
	import type { Editor as TipTapEditor } from 'svelte-tiptap';
	import type { Readable } from 'svelte/store';

	// Get the animator context for navigation
	let animator: any = getContext('animator');

	// Current profile data
	let currentProfileData = asKind0($kind0 as ParsedEvent);

	// Profile objects for comparison
	let currentProfile = {
		name: '',
		nip05: '',
		about: '',
		website: '',
		lud16: '',
		picture: '',
		banner: ''
	};

	let updatedProfile = {
		name: '',
		nip05: '',
		about: '',
		website: '',
		lud16: '',
		picture: '',
		banner: ''
	};

	// Editable fields
	let name: string = currentProfileData?.name()?.toString() || '';
	let nip05: string = currentProfileData?.nip05()?.toString() || '';
	let about: string = currentProfileData?.about()?.toString() || '';
	let website: string = currentProfileData?.website()?.toString() || '';
	let lnAddress: string = currentProfileData?.lud16()?.toString() || '';
	let picture: string = currentProfileData?.picture()?.toString() || '';
	let banner: string = currentProfileData?.banner()?.toString() || '';

	// Editor instance for about field
	let aboutEditor: Readable<TipTapEditor>;

	// Reactive statement to update updatedProfile based on form fields
	$: updatedProfile = {
		name: name.trim() || '',
		nip05: nip05.trim() || '',
		about: aboutEditor ? $aboutEditor.getText().trim() || '' : about.trim() || '',
		website: website.trim() || '',
		lud16: lnAddress.trim() || '',
		picture: picture.trim() || '',
		banner: banner.trim() || ''
	};

	// Deep comparison function
	function deepEqual(obj1: any, obj2: any): boolean {
		const keys1 = Object.keys(obj1);
		const keys2 = Object.keys(obj2);

		if (keys1.length !== keys2.length) {
			return false;
		}

		for (let key of keys1) {
			if (obj1[key] !== obj2[key]) {
				return false;
			}
		}

		return true;
	}

	// Reactive statement to determine if changes have been made
	$: hasChanges = !deepEqual(currentProfile, updatedProfile);

	// Upload state
	let isAvatarUploading = false;
	let isBannerUploading = false;
	let uploadError = '';
	let uploadProgress = 0;

	// Form state
	let isSaving = false;
	let saveError = '';

	// Handle form submission
	async function handleSubmit(e: Event) {
		e.preventDefault();
		isSaving = true;
		saveError = '';

		try {
			// Create the updated kind0 event using updatedProfile
			const profileEvent = {
				kind: 0,
				created_at: now(),
				content: JSON.stringify({
					name: updatedProfile.name,
					nip05: updatedProfile.nip05,
					about: updatedProfile.about,
					website: updatedProfile.website,
					lud16: updatedProfile.lud16,
					picture: updatedProfile.picture,
					banner: updatedProfile.banner
				}),
				tags: []
			};
			let sendStatus: { [url: string]: ConnectionStatus } = {};
			// Publish the updated profile
			usePublish('kind0_update', profileEvent, (message: WorkerMessage) => {
				const status = isConnectionStatus(message);
				if (status) {
					const relayUrl = status.relayUrl()?.toString();
					if (relayUrl) {
						sendStatus[relayUrl] = status;
						updateSendStatus('kind0_update', sendStatus);
					}
				}
			});

			// Close the modal after successful save
			// animator.goBack();
		} catch (error) {
			console.error('Failed to update profile:', error);
			saveError = 'Failed to update profile. Please try again.';
		} finally {
			isSaving = false;
		}
	}

	// Reset form to current values
	function resetForm() {
		name = currentProfileData?.name()?.toString() || '';
		nip05 = currentProfileData?.nip05()?.toString() || '';
		about = currentProfileData?.about()?.toString() || '';
		website = currentProfileData?.website()?.toString() || '';
		lnAddress = currentProfileData?.lud16()?.toString() || '';
		picture = currentProfileData?.picture()?.toString() || '';
		banner = currentProfileData?.banner()?.toString() || '';

		// Update editor content
		if (aboutEditor && $aboutEditor) {
			$aboutEditor.commands.setContent(about);
		}
	}

	// Handle file selection for avatar
	async function handleAvatarFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const files = target.files;
		if (!files || files.length === 0) return;

		await upload(files[0], 'avatar');
	}

	// Handle file selection for banner
	async function handleBannerFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const files = target.files;
		if (!files || files.length === 0) return;

		await upload(files[0], 'banner');
	}

	// Upload file to image service
	async function upload(file: File, type: 'avatar' | 'banner') {
		if (type === 'avatar') {
			isAvatarUploading = true;
		} else {
			isBannerUploading = true;
		}
		uploadError = '';
		uploadProgress = 0;
		try {
			const result = await nip96Upload(file);
			const uploadUrl = result.url;
			console.log(uploadUrl);
			if (type === 'avatar') {
				picture = uploadUrl;
				isAvatarUploading = false;
			} else {
				banner = uploadUrl;
				isBannerUploading = false;
			}
		} catch (e) {
			if (type === 'avatar') {
				isAvatarUploading = false;
			} else {
				isBannerUploading = false;
			}
			uploadError = `Failed to upload ${type}. Please try again.`;
			console.log(e);
		}
	}

	// Initialize form with current profile data
	onMount(() => {
		resetForm();
		// Set currentProfile for comparison
		currentProfile = {
			name: currentProfileData?.name()?.toString() || '',
			nip05: currentProfileData?.nip05()?.toString() || '',
			about: currentProfileData?.about()?.toString() || '',
			website: currentProfileData?.website()?.toString() || '',
			lud16: currentProfileData?.lud16()?.toString() || '',
			picture: currentProfileData?.picture()?.toString() || '',
			banner: currentProfileData?.banner()?.toString() || ''
		};
	});
</script>

<div class="h-screen bg-base-300 bg-opacity-85 overflow-scroll">
	<div class="w-feed md:pt-4 pt-safe">
		<div class="px-4 flex justify-between">
			<button
				on:click={animator.goBack}
				class="p-1 rounded-full hover:bg-base-200"
				aria-label="Go back"
			>
				<Icon icon="mingcute:down-line" class="text-xl" />
			</button>
			<h2 class="text-xl font-bold">Edit Profile</h2>
			<div class="w-8"></div>
		</div>
	</div>

	<form class="p-4 overflow-scroll pb-20">
		<!-- Banner Preview -->
		{#if updatedProfile.banner}
			<div class="relative w-full h-48 rounded-lg overflow-hidden mb-4 group">
				<img
					src={proxyBannerUrl(updatedProfile.banner)}
					alt="Banner"
					class="w-full h-full object-cover"
				/>
				<div class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
				{#if isBannerUploading}
					<div class="absolute inset-0 bg-black/50 flex items-center justify-center">
						<span class="loading loading-spinner loading-lg text-white"></span>
					</div>
				{/if}
				<button
					class="absolute top-2 right-2 btn btn-sm btn-circle btn-primary opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
					on:click={() => document.getElementById('banner-upload-input')?.click()}
					title="Change banner"
					disabled={isBannerUploading}
				>
					<Icon icon="mdi:upload" />
				</button>
			</div>
		{:else}
			<div class="bg-base-200 h-48 rounded-lg mb-4 flex items-center justify-center relative group">
				<Icon icon="mdi:image-outline" class="text-4xl text-base-content/50" />
				{#if isBannerUploading}
					<div class="absolute inset-0 bg-black/50 flex items-center justify-center">
						<span class="loading loading-spinner loading-lg text-white"></span>
					</div>
				{/if}
				<button
					class="absolute top-2 right-2 btn btn-sm btn-circle btn-primary opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
					on:click={() => document.getElementById('banner-upload-input')?.click()}
					title="Upload banner"
					disabled={isBannerUploading}
				>
					<Icon icon="mdi:upload" />
				</button>
			</div>
		{/if}

		<!-- Profile Picture Preview -->
		<div class="flex justify-center -mt-20 mb-6 relative">
			{#if updatedProfile.picture}
				<div class="relative group">
					<img
						src={proxyAvatarUrl(updatedProfile.picture)}
						alt="Profile"
						class="w-32 h-32 rounded-full border-4 border-base-100 object-cover"
					/>
					{#if isAvatarUploading}
						<div class="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
							<span class="loading loading-spinner loading-md text-white"></span>
						</div>
					{/if}
					<button
						class="absolute -bottom-2 -right-2 btn btn-sm btn-circle btn-primary opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
						on:click={() => document.getElementById('avatar-upload-input')?.click()}
						title="Change avatar"
						disabled={isAvatarUploading}
					>
						<Icon icon="mdi:upload" />
					</button>
				</div>
			{:else}
				<div class="relative group">
					<div
						class="w-32 h-32 rounded-full border-4 border-base-100 bg-base-200 flex items-center justify-center"
					>
						<Icon icon="mdi:account" class="text-4xl text-base-content/50" />
						{#if isAvatarUploading}
							<div
								class="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center"
							>
								<span class="loading loading-spinner loading-md text-white"></span>
							</div>
						{/if}
					</div>
					<button
						class="absolute -bottom-2 -right-2 btn btn-sm btn-circle btn-primary opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
						on:click={() => document.getElementById('avatar-upload-input')?.click()}
						title="Upload avatar"
						disabled={isAvatarUploading}
					>
						<Icon icon="mdi:upload" />
					</button>
				</div>
			{/if}
		</div>

		<!-- Form Fields -->
		<div class="space-y-4">
			<!-- Name Field -->
			<div>
				<label class="label">
					<span class="label-text">Name</span>
				</label>
				<input
					type="text"
					class="input input-bordered w-full"
					bind:value={name}
					placeholder="Your name"
					on:keydown|stopPropagation
					on:keyup|stopPropagation
					on:keypress|stopPropagation
				/>
			</div>

			<!-- Display Name Field -->
			<!-- <div>
				<label class="label">
					<span class="label-text">Display Name</span>
				</label>
				<input
					type="text"
					class="input input-bordered w-full"
					bind:value={displayName}
					placeholder="Display name (optional)"
				/>
			</div> -->

			<!-- NIP-05 Identifier -->
			<div>
				<label class="label">
					<span class="label-text">NIP-05 Identifier</span>
				</label>
				<input
					type="text"
					class="input input-bordered w-full"
					bind:value={nip05}
					placeholder="user@example.com (optional)"
					on:keydown|stopPropagation
					on:keyup|stopPropagation
					on:keypress|stopPropagation
				/>
			</div>

			<!-- About Field -->
			<div>
				<label class="label">
					<span class="label-text">About</span>
				</label>
				<div class="min-h-32">
					<Editor bind:editor={aboutEditor} initialContent={about}>
						Tell others about yourself...
					</Editor>
				</div>
			</div>

			<!-- Website Field -->
			<div>
				<label class="label">
					<span class="label-text">Website</span>
				</label>
				<input
					type="url"
					class="input input-bordered w-full"
					bind:value={website}
					placeholder="https://yourwebsite.com (optional)"
					on:keydown|stopPropagation
					on:keyup|stopPropagation
					on:keypress|stopPropagation
				/>
			</div>

			<!-- Lightning Address -->
			<div>
				<label class="label">
					<span class="label-text">Lightning Address</span>
				</label>
				<input
					type="text"
					class="input input-bordered w-full"
					bind:value={lnAddress}
					placeholder="user@domain.com (optional)"
					on:keydown|stopPropagation
					on:keyup|stopPropagation
					on:keypress|stopPropagation
				/>
			</div>

			<!-- Picture URL -->
			<div>
				<label class="label">
					<span class="label-text">Profile Picture URL</span>
				</label>
				<input
					type="url"
					class="input input-bordered w-full"
					bind:value={picture}
					placeholder="https://example.com/profile.jpg (optional)"
					on:keydown|stopPropagation
					on:keyup|stopPropagation
					on:keypress|stopPropagation
				/>
			</div>

			<!-- Banner URL -->
			<div>
				<label class="label">
					<span class="label-text">Banner Image URL</span>
				</label>
				<input
					type="url"
					class="input input-bordered w-full"
					bind:value={banner}
					placeholder="https://example.com/banner.jpg (optional)"
					on:keydown|stopPropagation
					on:keyup|stopPropagation
					on:keypress|stopPropagation
				/>
			</div>
		</div>

		<!-- Upload Status -->
		{#if isAvatarUploading || isBannerUploading}
			<div class="alert alert-info mt-4">
				<Icon icon="mdi:upload" />
				<span>Uploading {isAvatarUploading ? 'avatar' : 'banner'}...</span>
			</div>
		{/if}

		<!-- Error Message -->
		{#if saveError}
			<div class="alert alert-error mt-4">
				<Icon icon="mdi:alert-circle" />
				<span>{saveError}</span>
			</div>
		{/if}

		{#if uploadError}
			<div class="alert alert-error mt-4">
				<Icon icon="mdi:alert-circle" />
				<span>{uploadError}</span>
			</div>
		{/if}
	</form>
	<!-- Hidden file inputs for uploads -->
	<input
		id="avatar-upload-input"
		type="file"
		accept="image/*"
		class="hidden"
		on:click|stopPropagation
		on:change={handleAvatarFileSelect}
	/>
	<input
		id="banner-upload-input"
		type="file"
		accept="image/*"
		class="hidden"
		on:click|stopPropagation
		on:change={handleBannerFileSelect}
	/>
</div>

<!-- Save Button -->
<div class="fixed bottom-4 left-4 right-4 w-feed m-auto px-4">
	<button
		type="submit"
		class="btn btn-accent w-full"
		disabled={isSaving || !hasChanges}
		on:click={handleSubmit}
	>
		{#if isSaving}
			<span class="loading loading-spinner"></span>
			Saving...
		{:else}
			Save Changes
		{/if}
	</button>
</div>

<script lang="ts">
	import Icon from '@iconify/svelte';
	import { onMount } from 'svelte';
	import {
		canInstallPWA,
		isStandalone,
		onPWAInstallAvailabilityChange,
		promptPWAInstall
	} from 'src/lib/pwa';
	import { go } from 'src/routes/modals/modal';

	const DISMISSED_KEY = 'nuts-shared-link-onboarding-dismissed';

	let visible = false;
	let installAvailable = false;
	let isIOS = false;
	let showIOSInstructions = false;

	function dismiss() {
		sessionStorage.setItem(DISMISSED_KEY, 'true');
		visible = false;
	}

	async function install() {
		if (isIOS && !installAvailable) {
			showIOSInstructions = true;
			return;
		}

		const result = await promptPWAInstall();
		if (result.outcome === 'accepted') dismiss();
	}

	function join() {
		dismiss();
		go('signup');
	}

	onMount(() => {
		if (isStandalone() || sessionStorage.getItem(DISMISSED_KEY)) return;

		isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
		installAvailable = canInstallPWA();
		const unsubscribe = onPWAInstallAvailabilityChange((available) => {
			installAvailable = available;
		});
		const showTimer = setTimeout(() => {
			visible = true;
		}, 900);

		return () => {
			clearTimeout(showTimer);
			unsubscribe();
		};
	});
</script>

{#if visible}
	<div
		class="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
	>
		<aside
			class="pointer-events-auto relative w-full max-w-lg rounded-2xl border border-base-content/15 bg-base-300/95 p-4 shadow-2xl backdrop-blur-md"
			aria-label="Get started with Nuts"
		>
			<button
				type="button"
				class="btn btn-ghost btn-circle btn-sm absolute right-2 top-2"
				aria-label="Dismiss"
				on:click={dismiss}
			>
				<Icon icon="carbon:close" class="h-5 w-5" />
			</button>

			<div class="flex gap-3 pr-8">
				<img src="/app-icon-192.png" alt="" class="h-12 w-12 rounded-xl" />
				<div>
					<p class="font-bold text-base-content">Keep Nuts close</p>
					<p class="mt-0.5 text-sm text-base-content/70">
						Install the app for quicker access, or create a profile to join the conversation.
					</p>
				</div>
			</div>

			<div class="mt-3 flex flex-wrap gap-2 pl-[3.75rem]">
				{#if installAvailable || isIOS}
					<button type="button" class="btn btn-accent btn-sm" on:click={install}>
						<Icon icon="carbon:download" class="h-4 w-4" />
						Install Nuts
					</button>
				{/if}
				<button type="button" class="btn btn-outline btn-sm" on:click={join}>Join Nuts</button>
			</div>

			{#if showIOSInstructions}
				<p class="mt-3 rounded-lg bg-base-200 px-3 py-2 text-sm text-base-content/80" role="status">
					Tap the browser’s Share button, then choose <strong>Add to Home Screen</strong>.
				</p>
			{/if}
		</aside>
	</div>
{/if}

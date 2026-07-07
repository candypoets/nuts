<script lang="ts">
	import Icon from '@iconify/svelte';
	import LoginForm from 'src/components/LoginForm.svelte';
	import { go } from '../modal';
	import { getContext } from 'svelte';
	import type { PagerAnimator } from 'src/lib/animations/PagerAnimator';

	export let initialKind: 'login' | 'signup' = 'login';

	let animator: PagerAnimator = getContext('animator');
</script>

<div class="h-full w-full overflow-y-auto bg-base-300 bg-opacity-85 pt-safe backdrop-blur-gpu">
	<div class="px-4">
		<div class="flex h-20 items-center justify-between border-b border-base-content/10">
			<button
				type="button"
				class="flex h-10 w-10 items-center justify-center rounded-full bg-base-content/5 text-base-content/70 transition hover:bg-base-content/10 hover:text-base-content focus:outline-none focus:ring-2 focus:ring-accent/30 active:scale-95"
				on:click={animator.goBack}
				aria-label="Close authentication"
			>
				<Icon icon="mingcute:down-line" class="text-xl" />
			</button>
			<div class="text-center">
				<p class="text-xs font-semibold uppercase tracking-[0.16em] text-base-content/35">Nuts</p>
				<h2 class="text-base font-bold text-base-content">
					{initialKind === 'signup' ? 'Create profile' : 'Connect'}
				</h2>
			</div>
			<div class="h-10 w-10"></div>
		</div>
	</div>

	<div class="w-full px-4 pb-safe pt-6">
		<LoginForm inline {initialKind} />
	</div>
</div>

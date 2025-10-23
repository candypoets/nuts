<script lang="ts">
	import Icon from '@iconify/svelte';
	import LoginForm from 'src/components/LoginForm.svelte';
	import { go } from '../modal';
	import { getContext } from 'svelte';
	import type { PagerAnimator } from 'src/lib/animations/PagerAnimator';

	let animator: PagerAnimator = getContext('animator');
</script>

<div class="bg-base-300 bg-opacity-85 backdrop-blur-md h-screen">
	<div class="px-4 pt-safe flex justify-between h-20 items-center">
		<div on:click={animator.goBack}>
			<Icon icon="mingcute:down-line" class="text-xl" />
		</div>
		<h2 class="text-xl font-bold px-4 pt-4">Authenticate</h2>
		<div class="w-4"></div>
	</div>

	<LoginForm inline />
</div>

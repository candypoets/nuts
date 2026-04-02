<script lang="ts">
	import Icon from '@iconify/svelte';

	export let size: 'sm' | 'md' | 'lg' = 'md';
	export let className: string = '';

	const sizeClasses = {
		sm: 'w-4 h-4',
		md: 'w-6 h-6',
		lg: 'w-8 h-8'
	};
</script>

<Icon icon="ei:spinner" class="animate-spin {sizeClasses[size]} {className}" />

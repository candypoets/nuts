<script>
	import { page } from '$app/stores';
</script>

<div class="h-screen w-screen flex items-center justify-center">
	<h1>{$page.status} {$page.error?.message}</h1>

	{#if $page.status === 500}
		An error occured.
		<!-- <ResetHistoryButton />
		<BackupButton /> -->
	{/if}
</div>

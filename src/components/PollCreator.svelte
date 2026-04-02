<script lang="ts">
	import Icon from '@iconify/svelte';

	export let options: string[] = ['', ''];
	export let pollType: 'singlechoice' | 'multiplechoice' = 'singlechoice';
	export let endsAt: number | null = null;
	export let disabled = false;

	function addOption() {
		if (options.length < 10) {
			options = [...options, ''];
		}
	}

	function removeOption(index: number) {
		if (options.length > 2) {
			options = options.filter((_, i) => i !== index);
		}
	}

	function updateOption(index: number, value: string) {
		options = options.map((opt, i) => (i === index ? value : opt));
	}

	function setDuration(days: number) {
		endsAt = Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
	}

	function clearDuration() {
		endsAt = null;
	}

	$: validOptionsCount = options.filter((o) => o.trim().length > 0).length;
	$: isValid = validOptionsCount >= 2;
</script>

<div class="bg-base-200/50 rounded-lg p-4 mb-4 space-y-4" class:opacity-50={disabled}>
	<!-- Poll Options -->
	<div class="space-y-2">
		{#each options as option, index}
			<div class="flex items-center gap-2">
				<div class="flex-shrink-0 text-base-content/50">
					{#if pollType === 'singlechoice'}
						<Icon icon="mdi:circle-outline" class="w-5 h-5" />
					{:else}
						<Icon icon="mdi:checkbox-blank-outline" class="w-5 h-5" />
					{/if}
				</div>
				<input
					type="text"
					placeholder="Option {index + 1}"
					value={option}
					on:input={(e) => updateOption(index, e.currentTarget.value)}
					{disabled}
					class="flex-1 input input-sm input-bordered bg-base-100"
				/>
				{#if options.length > 2}
					<button
						type="button"
						on:click={() => removeOption(index)}
						{disabled}
						class="btn btn-ghost btn-sm btn-circle text-error"
					>
						<Icon icon="mdi:close" class="w-4 h-4" />
					</button>
				{/if}
			</div>
		{/each}

		{#if options.length < 10}
			<button
				type="button"
				on:click={addOption}
				{disabled}
				class="btn btn-ghost btn-sm w-full"
			>
				<Icon icon="mdi:plus" class="w-4 h-4 mr-1" />
				Add option
			</button>
		{/if}
	</div>

	<!-- Poll Settings -->
	<div class="flex flex-wrap items-center gap-4 pt-2 border-t border-base-300">
		<!-- Poll Type -->
		<div class="flex items-center gap-2">
			<span class="text-sm text-base-content/70">Type:</span>
			<select
				bind:value={pollType}
				{disabled}
				class="select select-sm select-bordered bg-base-100"
			>
				<option value="singlechoice">Single choice</option>
				<option value="multiplechoice">Multiple choice</option>
			</select>
		</div>

		<!-- Duration -->
		<div class="flex items-center gap-2">
			<span class="text-sm text-base-content/70">Duration:</span>
			{#if endsAt}
				<span class="text-sm">
					{Math.ceil((endsAt - Date.now() / 1000) / (24 * 60 * 60))} days
				</span>
				<button
					type="button"
					on:click={clearDuration}
					{disabled}
					class="btn btn-ghost btn-xs"
				>
					<Icon icon="mdi:close" class="w-3 h-3" />
				</button>
			{:else}
				<div class="flex gap-1">
					<button
						type="button"
						on:click={() => setDuration(1)}
						{disabled}
						class="btn btn-xs btn-ghost"
					>
						1d
					</button>
					<button
						type="button"
						on:click={() => setDuration(3)}
						{disabled}
						class="btn btn-xs btn-ghost"
					>
						3d
					</button>
					<button
						type="button"
						on:click={() => setDuration(7)}
						{disabled}
						class="btn btn-xs btn-ghost"
					>
						7d
					</button>
				</div>
			{/if}
		</div>
	</div>

	<!-- Validation hint -->
	{#if !isValid}
		<p class="text-xs text-error">Add at least 2 options to create a poll</p>
	{/if}
</div>

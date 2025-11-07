<script lang="ts">
	import LoginForm from 'src/components/LoginForm.svelte';
	import Nutscash from 'src/components/Nutscash.svelte';

	let extensionError = false;

	$: {
		if (extensionError) {
			setTimeout(() => {
				extensionError = false;
			}, 5000);
		}
	}
</script>

<main
	class="bg-black bg-opacity-65 text-gray-800 md:flex flex md:flex-row flex-col justify-center items-stretch h-screen pt-safe"
>
	<div class="md:w-1/2 flex items-center justify-center">
		<div class="md:h-2/5">
			<Nutscash class="text-white md:h-96 md:w-96" />
		</div>
	</div>
	<div class="md:w-1/2">
		<LoginForm redirect />
	</div>
	<btn class="btn text-accent btn-link p-4 md:text-xl absolute md:right-4 right-2 top-4 pt-safe">
		{'<>'}
	</btn>
</main>

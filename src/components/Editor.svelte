<script lang="ts">
	import Icon from '@iconify/svelte';
	import { onMount } from 'svelte';
	import { createEditor, Editor, EditorContent } from 'svelte-tiptap';
	import type { Readable } from 'svelte/store';

	import { extensions } from 'src/editor';
	import GifPicker from 'src/components/GIFPicker.svelte';

	export let showPicker = false;

	// Props
	export let initialContent = '';
	export let autoFocus = false;
	export let sendButton = false;
	export let onSubmit: (content: string) => void;

	// Bindings - expose editor instance
	export let editor: Readable<Editor> = undefined;

	// Internal state
	let editorReady = false;

	onMount(async () => {
		editor = createEditor({
			extensions,
			editorProps: {
				attributes: {
					class: 'outline-none',
					spellcheck: 'false',
					autocorrect: 'off',
					autocapitalize: 'off',
					'data-gramm': 'false'
				}
			}
		});

		if (initialContent) {
			$editor.commands.setContent(initialContent);
		}

		editorReady = true;

		// Focus the editor if autoFocus is enabled
		if (autoFocus) {
			setTimeout(() => {
				focusEditor();
			}, 100);
		}
	});

	function focusEditor() {
		if (!$editor) return;

		requestAnimationFrame(() => {
			$editor.commands.focus();
			const editorElement = $editor.view.dom;
			if (editorElement && editorElement.focus) {
				editorElement.focus();
				if (editorElement.setAttribute) {
					editorElement.setAttribute('contenteditable', 'true');
				}
			}
		});
	}

	// Expose methods for external use
	export function focus() {
		console.log('focus');
		showPicker = false;
		focusEditor();
	}

	export function clear() {
		if ($editor) {
			$editor.commands.clearContent();
		}
	}

	export function setContent(content: string) {
		if ($editor) {
			$editor.commands.setContent(content);
		}
	}

	export function getText(): string {
		return $editor?.getText() || '';
	}

	export function getHTML(): string {
		return $editor?.getHTML() || '';
	}

	function toggleGifPicker() {
		console.log('toggleGifPicker');
		showPicker = !showPicker;
		// $editor?.commands.focus();
	}

	function handleGifSelect(gif: any) {
		const gifUrl = gif.media_formats.gif.url;
		$editor.commands.insertContent(
			`<img src="${gifUrl}" alt="${gif.content_description || 'GIF'}" />`
		);
		$editor.commands.focus();
		showPicker = false;
	}

	$: showPicker && $editor?.commands.focus();
</script>

<div class="w-full">
	<GifPicker show={showPicker} onGifSelect={handleGifSelect} />
	<div class="flex items-center gap-2 relative mt-2">
		<div
			class={'h-12 flex items-start justify-between w-full border border-primary-content prose dark:prose-invert prose-sm max-w-none p-3 md:py-2 py-2 bg-opacity-85 bg-base-100 rounded-md cursor-text text-highlight ' +
				($$props.class || '')}
			style="-webkit-backdrop-filter: blur(12px);"
		>
			{#if editor}
				<div class="w-full h-8">
					<EditorContent editor={$editor} on:click={toggleGifPicker} />
				</div>
			{/if}
			<slot name="toolbar" />
		</div>
		<button type="button" class="btn btn-accent" on:click={console.log} class:hidden={!sendButton}>
			<Icon icon="mdi:send" class="text-xl" />
		</button>
		<!-- Placeholder text -->
		{#if !$editor?.getText().trim() && $$slots.default}
			<div
				class="absolute py-2 md:left-3 top-0 left-6 text-gray-400 pointer-events-none text-accent"
				style={editorReady ? '' : 'display: none;'}
			>
				<slot />
			</div>
		{/if}
	</div>
</div>

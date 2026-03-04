<script lang="ts">
	import Icon from '@iconify/svelte';
	import { onDestroy, onMount } from 'svelte';
	import { createEditor, Editor, EditorContent } from 'svelte-tiptap';
	import type { Readable } from 'svelte/store';

	import { extensions } from 'src/editor';
	import GifPicker from 'src/components/GIFPicker.svelte';
	import { Container } from 'postcss';

	export let showPicker = false;

	// Props
	export let initialContent = '';
	export let autoFocus = false;
	export let sendButton = false;
	export let onSubmit: (content: string) => void;

	// Bindings - expose editor instance
	export let editor: Readable<Editor>;

	// Internal state
	let editorReady = false;

	let editorElement: HTMLDivElement | null = null;

	$: if (editorElement && !editor) {
		instanciate();
	}

	const instanciate = () => {
		editor = createEditor({
			element: editorElement,
			extensions,
			editorProps: {
				attributes: {
					class: 'outline-none w-full',
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
	};

	function focusEditor() {
		if (!editor) return;

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
		if (editor) {
			$editor.commands.clearContent();
		}
	}

	export function setContent(content: string) {
		if (editor) {
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
		// editor?.commands.focus();
	}

	function handleGifSelect(gif: any) {
		const gifUrl = gif.media_formats.gif.url;
		$editor.commands.insertContent(
			`<img src="${gifUrl}" alt="${gif.content_description || 'GIF'}" />`
		);
		$editor.commands.focus();
		showPicker = false;
	}

	function handleKeyDown(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
			event.preventDefault();
			submit();
		}

		if (event.key === 'Escape') {
			if (!$editor?.getText()) {
				// pagerAnimator.goBack();
			} else {
				$editor.commands.blur();
			}
		}
	}

	function submit() {
		onSubmit($editor.getText());
		$editor.commands.clearContent();
		$editor.commands.focus();
	}

	// $: showPicker && editor?.commands.focus();
</script>

<div class="w-full" on:keydown|stopPropagation={handleKeyDown}>
	<GifPicker show={showPicker} onGifSelect={handleGifSelect} />
	<div
		class="flex items-center relative mt-2 dark:prose-invert gap-1 prose-sm max-w-none rounded-md overflow-hidden"
	>
		<slot name="toolbar" />
		<div
			bind:this={editorElement}
			class={'flex items-stretch bg-opacity-90 bg-base-300 justify-between w-full prose p-3 md:py-2 py-2 cursor-text text-highlight ' +
				($$props.class || '')}
			style="-webkit-backdrop-filter: blur(12px);"
		>
			<div class="h-6 relative w-full">
				<!-- Placeholder text -->
				{#if !$editor?.getText().trim() && $$slots.default}
					<div
						class="absolute top-0 left-0 pointer-events-none text-opacity-50 text-base-content"
						style={editorReady ? '' : 'display: none;'}
					>
						<slot />
					</div>
				{/if}
			</div>
		</div>
		<button
			type="button"
			class="px-4 py-2 bg-accent rounded-r-full rounded-l-md"
			on:click={submit}
			class:hidden={!sendButton}
		>
			<Icon icon="mdi:send" class="text-xl" />
		</button>
	</div>
</div>

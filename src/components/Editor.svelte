<script lang="ts">
	import { extensions } from 'src/editor';
	import { onMount } from 'svelte';
	import { createEditor, Editor, EditorContent } from 'svelte-tiptap';
	import type { Readable } from 'svelte/store';

	// Props
	export let initialContent = '';
	export let autoFocus = false;

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
</script>

<!-- Editor container -->
<div class="min-h-[120px] rounded-md relative transition-all duration-200">
	<!-- Editor content -->
	<div
		class="min-h-[80px] border border-primary-content prose dark:prose-invert prose-sm max-w-none p-3 md:py-3 py-2 bg-opacity-85 bg-base-100 rounded-md cursor-text text-highlight"
		style="-webkit-backdrop-filter: blur(12px);"
		on:click|stopPropagation={focusEditor}
	>
		{#if editor}
			<EditorContent editor={$editor} />
		{/if}
	</div>

	<!-- Placeholder text -->
	{#if !$editor?.getText().trim() && $$slots.default}
		<div
			class="absolute md:top-3 top-2 md:left-3 left-6 text-gray-400 pointer-events-none text-accent"
			style={editorReady ? '' : 'display: none;'}
		>
			<slot />
		</div>
	{/if}
</div>

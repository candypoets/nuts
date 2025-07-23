import { SvelteNodeViewRenderer } from 'svelte-tiptap';
import StarterKit from '@tiptap/starter-kit';
import { NostrExtension } from 'nostr-editor';
import Image from './image.svelte';
import NAddr from './naddr.svelte';
import NEvent from './nevent.svelte';
import NProfile from './nprofile.svelte';
import Tweet from './tweet.svelte';
import Video from './video.svelte';

import { NostrMention } from './mention';
import { nostrManager } from '@candypoets/nipworker';

export const extensions = [
	StarterKit,
	NostrMention,
	NostrExtension.configure({
		image: {
			defaultUploadUrl: 'https://nostr.build',
			defaultUploadType: 'nip96' // or blossom
		},
		video: {
			defaultUploadUrl: 'https://nostr.build',
			defaultUploadType: 'nip96' // or blossom
		},

		fileUpload: {
			immediateUpload: true, // It will automatically upload when a file is added to the editor, if false, call `editor.commands.uploadFiles()` manually
			sign: async (event) => {
				const signed = await nostrManager.signEvent(event);
				return signed;
			},
			onDrop() {
				// File added to the editor
			},
			onComplete() {
				// All files were successfully uploaded
			}
		},
		extend: {
			nprofile: { addNodeView: () => SvelteNodeViewRenderer(NProfile) },
			nevent: { addNodeView: () => SvelteNodeViewRenderer(NEvent) },
			naddr: { addNodeView: () => SvelteNodeViewRenderer(NAddr) },
			image: { addNodeView: () => SvelteNodeViewRenderer(Image) },
			video: { addNodeView: () => SvelteNodeViewRenderer(Image) },
			tweet: { addNodeView: () => SvelteNodeViewRenderer(Tweet) }
		}
	})
];

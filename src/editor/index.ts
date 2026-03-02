import { SvelteNodeViewRenderer } from 'svelte-tiptap';
import StarterKit from '@tiptap/starter-kit';
import { NostrExtension, type FileAttributes } from 'nostr-editor';
import { get } from 'svelte/store';
import Image from './image.svelte';
import NAddr from './naddr.svelte';
import NEvent from './nevent.svelte';
import NProfile from './nprofile.svelte';
import Tweet from './tweet.svelte';
import Video from './video.svelte';

import { NostrMention } from './mention';
import { uploadFile, getUserUploadConfig, DEFAULT_SERVER } from 'src/lib/upload';

// Get the default upload URL and type based on user preferences
function getUploadDefaults() {
	const userConfig = getUserUploadConfig();
	if (userConfig) {
		return {
			url: userConfig.servers[0],
			type: userConfig.type
		};
	}
	return {
		url: DEFAULT_SERVER,
		type: 'blossom' as const
	};
}

const defaults = getUploadDefaults();

export const extensions = [
	StarterKit,
	NostrMention,
	NostrExtension.configure({
		image: {
			defaultUploadUrl: defaults.url,
			defaultUploadType: defaults.type
		},
		video: {
			defaultUploadUrl: defaults.url,
			defaultUploadType: defaults.type
		},

		fileUpload: {
			upload: async (attrs: FileAttributes) => {
				try {
					const { url, sha256, tags } = await uploadFile(attrs.file, {
						preferUserServers: true,
						alt: (attrs as any)?.alt,
						includeMimeTag: true,
						includeDimensions: true
					});

					console.log('Upload result:', url, sha256);

					return {
						result: {
							url,
							sha256,
							tags
						}
					};
				} catch (e: any) {
					return { error: e?.message || 'Upload failed' };
				}
			},
			immediateUpload: true, // It will automatically upload when a file is added to the editor, if false, call `editor.commands.uploadFiles()` manually
			// sign: async (event) => {
			// 	return new Promise((resolve) => {
			// 		useSignEvent(event, (signedEvent) => {
			// 			resolve(signedEvent);
			// 		});
			// 	});
			// },
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

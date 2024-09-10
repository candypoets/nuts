export function updateVc() {
	setTimeout(() => {
		console.log('update vc');
		// find a div with id container
		const container = document.getElementById('container');
		// find a div with id footer
		const footer = document.getElementById('footer');

		const topper = document.getElementById('top');

		const navbar = document.getElementById('navbar');
		// check the height of the footer
		if (!container || !footer) return;
		// see how many pixel it is from the top

		const top = container.getBoundingClientRect().top;
		const footerHeight = footer?.getBoundingClientRect().height;
		const topperBottom = topper?.getBoundingClientRect().bottom;
		const navbarHeight = navbar?.getBoundingClientRect().height;

		document.documentElement.style.setProperty('--vc', `${window.innerHeight * 0.01}px`);
		document.documentElement.style.setProperty('--footer-height', `${footerHeight + 15}px`);
		document.documentElement.style.setProperty('--container-top', `${topperBottom + 30}px`);

		console.log(navbar);

		let prevScrollPos = container.scrollTop;
		// on scroll down, add a className to the top container

		const fadein = (e) => {
			const currentScrollPos = container.scrollTop;
			if (currentScrollPos > prevScrollPos + 50) {
				topper?.classList.add('toggle-up');
				footer?.classList.add('blur-in');
				prevScrollPos = currentScrollPos;
			} else if (currentScrollPos < prevScrollPos - 50) {
				topper?.classList.remove('toggle-up');
				footer?.classList.remove('blur-in');
				prevScrollPos = currentScrollPos;
			} else if (currentScrollPos == 0) {
				topper?.classList.remove('toggle-up');
				footer?.classList.remove('blur-in');
				prevScrollPos = currentScrollPos;
			}
		};
		if (window.location.pathname.includes('home')) {
			console.log('removing');
			container.removeEventListener('scroll', fadein);
			footer?.classList.remove('blur-in');
		} else {
			container.addEventListener('scroll', fadein);
		}
		// if (topperBottom && top < 0) {
		//   topper?.classList.add("sticky");
		//   navbar?.classList.add("sticky");
		// } else {
		//   topper?.classList.remove("sticky");
		//   navbar?.classList.remove("sticky");
		// }
	}, 0);
}

export function isImageUrl(url: string) {
	if (url.endsWith('.jpg')) return true;
	return /\.(jpg|jpeg|png|webp|avif|gif|svg)$/i.test(url) || /\.jpe?g/i.test(url);
}

export function formatDate(date: Date) {
	const today = new Date();
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);

	const dateToFormat = new Date(date);
	const isToday = dateToFormat.toDateString() === today.toDateString();
	const isYesterday = dateToFormat.toDateString() === yesterday.toDateString();

	if (isToday) {
		return 'Today';
	} else if (isYesterday) {
		return 'Yesterday';
	} else {
		return dateToFormat.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}
}

import { nip19 } from 'nostr-tools';

// Decoding a Nostr reference
export function decodeNostrReference(reference: string) {
	try {
		if (reference.startsWith('nostr:')) {
			reference = reference.slice(6);
		}

		const { type, data } = nip19.decode(reference);

		console.log('decode', type, data, reference);

		switch (type) {
			case 'note':
				return { type: 'note', id: data };
			case 'npub':
				return { type: 'pubkey', id: data };
			case 'nevent':
				return { type: 'event', id: data.id, ...data };
			case 'nprofile':
				return { type: 'profile', id: data.pubkey, ...data };
			default:
				return null;
		}
	} catch (error) {
		console.error('Error decoding Nostr reference:', error);
		return null;
	}
}

// Encoding a Nostr reference
export function encodeNostrReference(type: string, data: string) {
	try {
		switch (type) {
			case 'note':
				return 'nostr:' + nip19.noteEncode(data);
			case 'pubkey':
				return 'nostr:' + nip19.npubEncode(data);
			case 'event':
				return 'nostr:' + nip19.neventEncode(data);
			case 'profile':
				return 'nostr:' + nip19.nprofileEncode(data);
			default:
				throw new Error('Unsupported type');
		}
	} catch (error) {
		console.error('Error encoding Nostr reference:', error);
		return null;
	}
}

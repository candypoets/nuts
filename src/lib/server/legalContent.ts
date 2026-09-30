// Adapted from docs/app-store/legal-drafts; see docs/legal-publication-review.md.
// Keep draft status until the operator resolves the documented review questions.
export const legalReviewPending = true;
export const legalContact = 'thib.duchene@gmail.com';

export type LegalDocument = {
	title: string;
	label: string;
	intro: string;
	sections: { id: string; title: string; paragraphs: string[] }[];
};

export const legalDocuments: Record<'privacy' | 'terms' | 'support', LegalDocument> = {
	privacy: {
		title: 'Privacy policy',
		label: 'Privacy',
		intro: 'How information moves through Nuts, and what you can control.',
		sections: [
			{
				id: 'operator',
				title: 'Who operates Nuts',
				paragraphs: [
					'Nuts is operated by DUCHENE SARL, 7 route de Mamer, Holzem. For privacy questions or requests, contact thib.duchene@gmail.com.',
					'This draft describes the Nuts website. Independent Nostr relays, remote signers, Cashu mints, media hosts and merchants have their own policies. Native iOS practices are addressed separately below; they must not be assumed to match the website.'
				]
			},
			{
				id: 'public-data',
				title: 'Your identity and public Nostr data',
				paragraphs: [
					'A Nostr public key identifies your account. Profile information, posts, follows, reactions and other public events you publish are distributed to Nostr relays. Events can include public keys, identifiers, timestamps, tags and links. Other people and services may read, copy, index or redistribute this information. A public key is not a guarantee of anonymity.',
					'Your chosen signing method authorizes actions for your identity. A browser extension or remote signer has its own security and privacy practices. The web app uses browser storage for account state, settings and cached data; this is different from iOS Keychain storage. Protect access to your device and browser. Never send private keys or recovery phrases to support.'
				]
			},
			{
				id: 'messages-media',
				title: 'Encrypted messages and uploaded media',
				paragraphs: [
					'The website encrypts direct-message content before publishing it to relays. Its NIP-04 message format leaves sender and recipient public keys, timestamps and other event metadata visible. Encryption of content does not make the communication anonymous. Recipients can retain or share messages.',
					'Photos and videos are uploaded to your configured media host. The website supports Blossom and NIP-96 hosts. Its default upload endpoint, blossom.nuts.cash, is operated by DUCHENE SARL. You can request removal of a file hosted there by emailing thib.duchene@gmail.com with the file URL. Removal from this host cannot remove copies held elsewhere. Uploading can begin when you add a file to the editor, before you publish the post. Removing it from the editor does not itself remove the uploaded file from the host.',
					'Media links may be public. Do not assume a file is private or encrypted because its link appears in an encrypted message. Media hosts receive uploaded files and associated request information; their storage and deletion practices also apply.'
				]
			},
			{
				id: 'network',
				title: 'Network requests and notifications',
				paragraphs: [
					'Using Nuts connects your browser to services needed for the features you select, including relays, media hosts, mints, signers and payment services. Requests can disclose your IP address and requested resources to the receiving service. Displaying remote images, embedded media or fonts can also contact their hosts. Link previews may be fetched through the Nuts backend; a relay proxy may relay connections when configured.',
					'The website displays in-app notifications. Native iOS push notifications use a separate notification service, described below; this is not a description of browser notifications.'
				]
			},
			{
				id: 'wallet',
				title: 'Wallet and community purchases',
				paragraphs: [
					'Wallet operations send the information needed for a payment to the selected Cashu mint, Lightning service or community checkout provider. The website stores ecash proofs and recovery state in browser storage and supports encrypted wallet backups on Nostr relays. Wallet information is therefore not exclusively device-local.',
					'Nuts is a crypto wallet. Its Lightning-address service acts as a proxy to external mint and Lightning services; the underlying Lightning payment service is not provided by the Nuts server. To provide an address and track delivery, the proxy stores address claims and operational records that can include invoices, amounts, recipient identifiers, payment references, statuses and token-delivery information. External payment and checkout providers have their own practices. Clearing data in the wallet does not delete the proxy’s records or records held by those providers.',
					'Merchants and payment services also process purchase information under their own terms and policies. Do not put spendable tokens, private keys or recovery phrases into support requests.'
				]
			},
			{
				id: 'purposes',
				title: 'Why information is processed',
				paragraphs: [
					'Information is used to provide the features you request: publishing and retrieving content, delivering messages, hosting uploads, sending payment requests to the services you choose and maintaining wallet recovery state. Information you choose to send by email is needed to understand your support, privacy or abuse request.',
					'Support, privacy and abuse emails are retained in the monitored contact mailbox, including after a request is resolved. No automatic email-deletion schedule is applied. Contact us with a request concerning correspondence you have sent; no response-time or automatic-erasure promise is made here.'
				]
			},
			{
				id: 'deletion',
				title: 'Retention and deletion limitations',
				paragraphs: [
					'Browser storage and caches support operation and recovery. Clearing website data can remove locally held identity and wallet information; move balances and preserve recovery information first. Clearing local data or signing out does not delete events from relays, media from hosts, or backend payment records.',
					'Nostr deletion requests cannot guarantee removal from independent relays, other clients, archives or recipients. Uploaded media requires separate handling by its host. Contact thib.duchene@gmail.com to request help with information controlled by DUCHENE SARL. Do not rely on an iOS Delete account instruction as a web feature.',
					'The hosting environment retains runtime diagnostic logs, and server-local deployment backups exist. These are separate from device-local wallet recovery data and encrypted wallet backups on Nostr relays. Runtime logs rotate by size rather than by a guaranteed time limit. Support correspondence is retained. Files hosted at blossom.nuts.cash can be removed on request and are subject to automatic expiry: the current configuration specifies 30 days for text, images and videos, and seven days for other file types, measured from the last access or from upload if never accessed. The operator has stated an intended one-year expiry; that differs from the running configuration and remains under review. Retention and removal of proxy records and deployment backups also remain under review. Independent relay, mint, payment and media services apply their own practices.'
				]
			},
			{
				id: 'ios',
				title: 'iOS notifications and account controls',
				paragraphs: [
					'In the iOS app, imported signing keys are stored locally in Keychain. Optional push notifications are delivered through Apple. The Nuts notification service subscribes to the relays selected by the user and forwards matching notifications. It stores the public key, device token, platform/app routing information and relay selections needed for delivery. It also stores event identifiers and delivery timestamps to prevent duplicate notifications. It is a forwarding service, not a persistent archive of full notification content; previews and profile information can be cached temporarily in memory.',
					'Device unregistration removes its registration, relay selections and delivery-deduplication records from the active notification database. Delivery identifiers older than seven days are cleaned up when new delivery records are processed, so this is not a guarantee of erasure at an exact deadline or from backups. The iOS app’s Profile → Delete account workflow requests a deleted Nostr profile and clears local identity and wallet data; when a push token exists, it requires push-service acknowledgment first. Move balances and preserve recovery information before deletion. This native workflow is not a web feature and cannot erase independently held public events or media.'
				]
			},
			{
				id: 'rights',
				title: 'Your choices and privacy requests',
				paragraphs: [
					'You can choose connected services such as relays, mints and a signer. Review what you publish and the policies of those services. Depending on applicable law, you may have rights to access, correct, erase, restrict or object to processing, receive portable data, withdraw consent, and complain to a supervisory authority.',
					'Contact thib.duchene@gmail.com for privacy requests. Include enough non-secret information to identify your request. Do not email your private key, recovery phrase or spendable tokens. We may ask for non-secret information needed to identify the account or content concerned.'
				]
			},
			{
				id: 'international',
				title: 'International services and changes',
				paragraphs: [
					'The website and media service are hosted using Servers.guru. The contact mailbox uses Gmail, and native iOS push delivery uses Apple. Nostr is a global network; independent relays, mints and other services you choose may process information in other countries. Naming the hosting provider does not establish a particular country for this deployment; no specific server location or transfer safeguard is asserted here.',
					'Once finalized, updates will be published at this address with an updated date and notice where required. This draft has no effective date.'
				]
			}
		]
	},
	terms: {
		title: 'Terms & community rules',
		label: 'Terms & rules',
		intro: 'A shared space built on respect, responsibility and informed choices.',
		sections: [
			{
				id: 'using-nuts',
				title: 'Using Nuts',
				paragraphs: [
					'These draft terms concern Nuts, operated by DUCHENE SARL, 7 route de Mamer, Holzem. Contact thib.duchene@gmail.com with questions. Use the service lawfully and respect others’ rights. Your statutory consumer rights are not limited by these terms.'
				]
			},
			{
				id: 'identity',
				title: 'Your identity and recovery',
				paragraphs: [
					'You control your Nostr identity through a signing key or signer. Keep keys and wallet recovery information secure and backed up. DUCHENE SARL cannot recreate a lost private key. Never share secrets in posts, reports or support requests.'
				]
			},
			{
				id: 'conduct',
				title: 'Content and conduct',
				paragraphs: [
					'Do not publish child sexual exploitation material, threats, harassment, hateful abuse, scams, malware, unlawful private information, impersonation or other illegal content. Respect intellectual-property rights. Do not use the service to facilitate illegal transactions or abuse other users.'
				]
			},
			{
				id: 'reports',
				title: 'Reports and blocking',
				paragraphs: [
					'To report abuse to the Nuts operator, email thib.duchene@gmail.com. Include the public event or profile identifier and a description. Do not send illegal media as an attachment. If someone is in immediate danger, contact emergency services directly.',
					'The iOS app provides post/profile reporting and blocking controls. These native instructions do not establish an equivalent web control. Nostr reports, when published as signed public events, are public. Hiding or blocking a profile in a client cannot stop independent clients from accessing public content.',
					'The proposed rules allow DUCHENE SARL to restrict content or access to services under its control to address abuse or legal obligations. The moderation, escalation and appeal process must be confirmed before these terms are finalized.'
				]
			},
			{
				id: 'wallet-services',
				title: 'Wallet and third-party services',
				paragraphs: [
					'Cashu ecash depends on the chosen mint’s ability and willingness to redeem it. Relays, mints, media hosts, remote signers, merchants and payment providers have their own practices and terms. Do not assume DUCHENE SARL controls every connected service.',
					'Payments may be irreversible and services may be unavailable. Review transaction details and fees before confirming; verify pending-payment status before retrying. Do not treat ecash as a guaranteed bank deposit.'
				]
			},
			{
				id: 'purchases',
				title: 'Community purchases',
				paragraphs: [
					'The merchant’s disclosed terms apply to community products, memberships, passes and tickets. Review price, delivery, cancellation and refund terms before purchasing. Nothing here removes rights you have under applicable consumer law.'
				]
			},
			{
				id: 'deletion',
				title: 'Public-network limits and deletion',
				paragraphs: [
					'Public Nostr content can be copied by others. Clearing local identity or wallet data does not guarantee removal from independent relays, clients or media hosts. Nostr deletion requests cannot ensure that every copy disappears. Transfer balances and preserve recovery information before clearing local data.',
					'The native app’s Profile → Delete account procedure is iOS-specific; it requests a deleted profile and removes local identity and wallet data. For information controlled by DUCHENE SARL, use the privacy contact on the support page.'
				]
			},
			{
				id: 'changes',
				title: 'Changes and contact',
				paragraphs: [
					'Once finalized, these terms may be updated to reflect changes in Nuts or applicable requirements, with notice where required. For support, abuse reports or disputes, contact thib.duchene@gmail.com. This draft has no effective date.'
				]
			}
		]
	},
	support: {
		title: 'Support',
		label: 'Support',
		intro: 'Get help, raise a privacy question or report something that should not be here.',
		sections: [
			{
				id: 'contact',
				title: 'Contact DUCHENE SARL',
				paragraphs: [
					'For support, abuse reports and privacy requests, email thib.duchene@gmail.com using the links below. If no email application opens, copy the address into your email service.',
					'For website issues, include the page URL, browser and device version, and steps to reproduce the problem. For iOS issues, include the Nuts app version and iOS version. Redact private information from screenshots. Never include private keys, wallet recovery phrases or spendable ecash tokens.',
					'This mailbox is monitored for support, privacy and abuse requests. Correspondence is retained, including resolved requests. No response time is promised in this draft.'
				]
			},
			{
				id: 'abuse',
				title: 'Report abuse',
				paragraphs: [
					'Email the public event or profile identifier, relevant link and a description of the problem. Do not attach illegal content or expose someone else’s private information unnecessarily. Contact emergency services directly if someone is in immediate danger.',
					'On iOS, use Report in a post menu or profile, or the blocking controls. For the website, use the email contact below. Nostr reports published as public events can be read by others. Email is the contact route provided here.'
				]
			},
			{
				id: 'payments',
				title: 'Payments and recovery',
				paragraphs: [
					'Check wallet activity and pending-payment status before retrying. For mint redemption or merchant fulfillment, include the service name and a non-secret transaction reference. Nuts support cannot recreate a lost key or reverse an independent payment.'
				]
			},
			{
				id: 'privacy',
				title: 'Privacy and deletion requests',
				paragraphs: [
					'For information held by DUCHENE SARL, use the privacy email link below. For removal of a file hosted at blossom.nuts.cash, include its URL. Describe the information and the action you are requesting without sending account secrets. Support correspondence is retained; email us to request deletion of your correspondence.',
					'Before clearing browser data, transfer your wallet balance and preserve recovery information. Clearing your browser is not an account-deletion request and does not delete backend records, relay events or hosted media. Public content may remain on independent services.',
					'On iOS, open Profile → Delete account. Move your balance and preserve recovery information first. If a push token exists, the app requires acknowledgment of unregistration before deleting local account data. This is an iOS-only workflow; web users can contact us using the privacy email link. Public content, independently hosted media and other backend records are not automatically erased by local account deletion.'
				]
			}
		]
	}
};

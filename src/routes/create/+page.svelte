<script lang="ts">
	import { resolve } from '$app/paths';
	import { QRCode } from 'svelte-qrcode-image/util';
	import {
		ArrowLeft,
		ArrowRight,
		CheckCircle2,
		Copy,
		Download,
		ImagePlus,
		Users
	} from 'lucide-svelte';

	type CommunityType = 'Sports club' | 'Association' | 'School' | 'Event' | 'Local group';
	type Visibility = 'Public' | 'Private';
	type Participation = 'Members only' | 'Everyone can reply' | 'Open';
	type MembershipChoice = 'No' | 'Yes' | 'Later';

	const steps = [
		'Community',
		'Visibility',
		'Participation',
		'Joining',
		'Memberships',
		'Done'
	];

	const communityTypes: CommunityType[] = [
		'Sports club',
		'Association',
		'School',
		'Event',
		'Local group'
	];

	const visibilityOptions: Array<{ value: Visibility; title: string; description: string }> = [
		{
			value: 'Public',
			title: 'Public',
			description: 'Anyone can follow and read public posts.'
		},
		{
			value: 'Private',
			title: 'Private',
			description: 'Only invited people can see the community.'
		}
	];

	const participationOptions: Array<{ value: Participation; title: string; description: string }> = [
		{
			value: 'Members only',
			title: 'Members only',
			description: 'Members can post and reply.'
		},
		{
			value: 'Everyone can reply',
			title: 'Everyone can reply',
			description: 'Members can post. Anyone can reply.'
		},
		{
			value: 'Open',
			title: 'Open',
			description: 'Anyone can post and reply.'
		}
	];

	const joinOptions = [
		{
			key: 'inviteLinks',
			title: 'Invite links',
			description: 'Create links you can send on WhatsApp or email.'
		},
		{
			key: 'qrCodes',
			title: 'QR codes',
			description: 'Print flyers, stickers or posters.'
		},
		{
			key: 'manualApproval',
			title: 'Manual approval',
			description: 'Review people before they become members.'
		}
	] as const;

	const membershipOptions: Array<{ value: MembershipChoice; title: string }> = [
		{ value: 'No', title: 'No, people join for free.' },
		{ value: 'Yes', title: 'Yes, we sell memberships.' },
		{ value: 'Later', title: 'Later.' }
	];

	const benefitOptions = ['Can post', 'Can comment', 'Member badge', 'Event access'];

	let currentStep = 0;
	let name = 'FC Avenir';
	let communityType: CommunityType = 'Sports club';
	let description = 'A place for players, parents and supporters.';
	let location = 'Luxembourg';
	let visibility: Visibility = 'Public';
	let participation: Participation = 'Open';
	let inviteLinks = true;
	let qrCodes = true;
	let manualApproval = true;
	let membershipChoice: MembershipChoice = 'Yes';
	let membershipName = 'Club Member';
	let membershipPrice = '€100 / year';
	let benefits = ['Can post', 'Can comment', 'Member badge', 'Event access'];
	let imageUrl = '';
	let imageDataUrl = '';
	let imageName = '';
	let qrDataUrl = '';
	let qrRequest = 0;
	let isExportingPdf = false;

	$: progress = ((currentStep + 1) / steps.length) * 100;
	$: accessSummary = visibility === 'Private' ? 'Private community' : `${participation} community`;
	$: inviteUrl = `https://nuts.cash/join/${
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'community'
	}`;
	$: selectedJoinMethods = [
		inviteLinks && 'Invite links',
		qrCodes && 'QR codes',
		manualApproval && 'Manual approval'
	].filter(Boolean);
	$: generateQr(inviteUrl);

	function goToStep(step: number) {
		currentStep = Math.min(Math.max(step, 0), steps.length - 1);
	}

	function next() {
		goToStep(currentStep + 1);
	}

	function previous() {
		goToStep(currentStep - 1);
	}

	function toggleBenefit(benefit: string) {
		benefits = benefits.includes(benefit)
			? benefits.filter((item) => item !== benefit)
			: [...benefits, benefit];
	}

	function toggleJoin(key: (typeof joinOptions)[number]['key']) {
		if (key === 'inviteLinks') inviteLinks = !inviteLinks;
		if (key === 'qrCodes') qrCodes = !qrCodes;
		if (key === 'manualApproval') manualApproval = !manualApproval;
	}

	function handleImageUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (imageUrl) URL.revokeObjectURL(imageUrl);
		imageUrl = URL.createObjectURL(file);
		imageName = file.name;

		const reader = new FileReader();
		reader.onload = () => {
			imageDataUrl = typeof reader.result === 'string' ? reader.result : '';
		};
		reader.readAsDataURL(file);
	}

	async function generateQr(text: string) {
		const requestId = ++qrRequest;
		const nextQrDataUrl = await QRCode.toDataURL(text, {
			errorCorrectionLevel: 'M',
			margin: 1,
			width: 720,
			color: {
				dark: '#151411',
				light: '#fff8ea'
			}
		});
		if (requestId !== qrRequest) return;
		qrDataUrl = nextQrDataUrl;
	}

	function escapeXml(value: string) {
		return value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function wrapText(value: string, maxLength: number, maxLines: number) {
		const words = value.split(/\s+/).filter(Boolean);
		const lines: string[] = [];
		let line = '';
		for (const word of words) {
			const next = line ? `${line} ${word}` : word;
			if (next.length > maxLength && line) {
				lines.push(line);
				line = word;
			} else {
				line = next;
			}
			if (lines.length === maxLines) break;
		}
		if (line && lines.length < maxLines) lines.push(line);
		return lines;
	}

	function buildPosterSvg() {
		const title = escapeXml(name || 'Community');
		const kind = escapeXml(communityType);
		const place = escapeXml(location || 'Community');
		const invite = escapeXml(inviteUrl);
		const lines = wrapText(description || 'Scan to join this community.', 34, 3);
		const descriptionSvg = lines
			.map((line, index) => `<tspan x="92" dy="${index === 0 ? 0 : 34}">${escapeXml(line)}</tspan>`)
			.join('');
		const iconSvg = imageDataUrl
			? `<image href="${escapeXml(
					imageDataUrl
				)}" x="92" y="92" width="128" height="128" preserveAspectRatio="xMidYMid slice" />`
			: `<rect x="92" y="92" width="128" height="128" fill="#dfe7c4" /><text x="156" y="166" text-anchor="middle" font-size="54" font-family="Arial, sans-serif" font-weight="700" fill="#151411">${escapeXml(
					(name || 'N').slice(0, 1).toUpperCase()
				)}</text>`;

		return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
<rect width="900" height="1200" fill="#fff8ea" />
<rect x="48" y="48" width="804" height="1104" fill="none" stroke="#151411" stroke-width="2" />
${iconSvg}
<text x="252" y="124" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#716341" letter-spacing="2">${kind}</text>
<text x="252" y="188" font-family="Arial, sans-serif" font-size="66" font-weight="700" fill="#151411">${title}</text>
<text x="92" y="302" font-family="Arial, sans-serif" font-size="26" font-weight="500" fill="#4f493d">${descriptionSvg}</text>
<rect x="92" y="432" width="716" height="2" fill="#151411" opacity="0.18" />
<text x="92" y="500" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#151411">${place}</text>
<text x="92" y="548" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#716341">Scan to join</text>
<image href="${escapeXml(qrDataUrl)}" x="250" y="610" width="400" height="400" />
<rect x="92" y="1060" width="716" height="58" fill="#151411" />
<text x="450" y="1098" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#fff8ea">${invite}</text>
</svg>`;
	}

	function downloadPosterSvg() {
		const svg = buildPosterSvg();
		const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${fileSlug()}-qr-poster.svg`;
		link.click();
		URL.revokeObjectURL(url);
	}

	function fileSlug() {
		return (
			name
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '') || 'community'
		);
	}

	function textToAsciiBytes(value: string) {
		const bytes = new Uint8Array(value.length);
		for (let index = 0; index < value.length; index += 1) {
			bytes[index] = value.charCodeAt(index) & 0xff;
		}
		return bytes;
	}

	function concatBytes(parts: Uint8Array[]) {
		const length = parts.reduce((total, part) => total + part.length, 0);
		const bytes = new Uint8Array(length);
		let offset = 0;
		for (const part of parts) {
			bytes.set(part, offset);
			offset += part.length;
		}
		return bytes;
	}

	function dataUrlToBytes(dataUrl: string) {
		const base64 = dataUrl.split(',')[1] || '';
		const binary = atob(base64);
		return textToAsciiBytes(binary);
	}

	function makePosterPdf(jpegBytes: Uint8Array) {
		const pageWidth = 595.28;
		const pageHeight = 793.7;
		const imageCommand = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Poster Do\nQ\n`;
		const objects = [
			'1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
			'2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
			`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Poster 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
			`4 0 obj\n<< /Type /XObject /Subtype /Image /Width 1800 /Height 2400 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
			`5 0 obj\n<< /Length ${imageCommand.length} >>\nstream\n${imageCommand}endstream\nendobj\n`
		];
		const header = textToAsciiBytes('%PDF-1.4\n');
		const parts: Uint8Array[] = [header];
		const offsets = [0];
		let position = header.length;

		for (let index = 0; index < objects.length; index += 1) {
			offsets.push(position);
			const objectStart = textToAsciiBytes(objects[index]);
			parts.push(objectStart);
			position += objectStart.length;
			if (index === 3) {
				const objectEnd = textToAsciiBytes('\nendstream\nendobj\n');
				parts.push(jpegBytes, objectEnd);
				position += jpegBytes.length + objectEnd.length;
			}
		}

		const xrefOffset = position;
		const xref = [
			'xref',
			`0 ${objects.length + 1}`,
			'0000000000 65535 f ',
			...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `),
			'trailer',
			`<< /Size ${objects.length + 1} /Root 1 0 R >>`,
			'startxref',
			String(xrefOffset),
			'%%EOF'
		].join('\n');
		parts.push(textToAsciiBytes(xref));

		return concatBytes(parts);
	}

	async function downloadPosterPdf() {
		isExportingPdf = true;
		try {
			const svg = buildPosterSvg();
			const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
			const svgUrl = URL.createObjectURL(svgBlob);
			const image = new Image();
			image.decoding = 'async';
			image.src = svgUrl;
			await image.decode();

			const canvas = document.createElement('canvas');
			canvas.width = 1800;
			canvas.height = 2400;
			const context = canvas.getContext('2d');
			if (!context) throw new Error('Canvas is not available.');
			context.fillStyle = '#fff8ea';
			context.fillRect(0, 0, canvas.width, canvas.height);
			context.drawImage(image, 0, 0, canvas.width, canvas.height);
			URL.revokeObjectURL(svgUrl);

			const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
			const pdfBytes = makePosterPdf(dataUrlToBytes(jpegDataUrl));
			const url = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
			const link = document.createElement('a');
			link.href = url;
			link.download = `${fileSlug()}-qr-poster.pdf`;
			link.click();
			URL.revokeObjectURL(url);
		} catch {
			downloadPosterSvg();
		} finally {
			isExportingPdf = false;
		}
	}

	async function copyInviteLink() {
		await navigator.clipboard?.writeText(inviteUrl);
	}
</script>

<svelte:head>
	<title>Create community - Nuts</title>
	<meta
		name="description"
		content="Create a Nuts community with simple social rules, invite links, QR codes and memberships."
	/>
</svelte:head>

<main class="create-page">
	<section class="wizard-shell">
		<header class="topbar">
			<a href={resolve('/')} aria-label="Back to Nuts">
				<ArrowLeft size={18} />
				<span>Nuts</span>
			</a>
			<div class="step-count">Step {currentStep + 1} of {steps.length}</div>
		</header>

		<div class="layout">
			<aside class="wizard-steps" aria-label="Create community steps">
				<div class="progress-track">
					<div class="progress-fill" style:width={`${progress}%`}></div>
				</div>
				{#each steps as step, index (step)}
					<button
						type="button"
						class:active={index === currentStep}
						class:complete={index < currentStep}
						on:click={() => goToStep(index)}
					>
						<span>{index < currentStep ? '✓' : index + 1}</span>
						{step}
					</button>
				{/each}
			</aside>

			<section class="panel" aria-live="polite">
				{#if currentStep === 0}
					<div class="step-head">
						<p>What are you creating?</p>
						<h1>Create your community.</h1>
					</div>
					<div class="field-grid identity-grid">
						<label class="form-cell name-field">
							<span>Name</span>
							<input bind:value={name} />
						</label>
						<label class="form-cell type-field">
							<span>Type</span>
							<select bind:value={communityType}>
								{#each communityTypes as type (type)}
									<option>{type}</option>
								{/each}
							</select>
						</label>
						<label class="form-cell description-field">
							<span>Description</span>
							<textarea rows="4" bind:value={description}></textarea>
						</label>
						<label class="form-cell location-field">
							<span>Location</span>
							<input bind:value={location} />
						</label>
						<label class="form-cell image-field">
							<span>Icon or image</span>
							<input
								class="file-input"
								type="file"
								accept="image/*"
								on:change={handleImageUpload}
							/>
							<span class="upload-box">
								{#if imageUrl}
									<img src={imageUrl} alt="" />
								{:else}
									<span class="upload-icon">
										<ImagePlus size={28} />
									</span>
								{/if}
								<small>{imageName || 'Upload club crest or community image'}</small>
							</span>
						</label>
					</div>
				{:else if currentStep === 1}
					<div class="step-head">
						<p>Who can see it?</p>
						<h1>Choose visibility.</h1>
					</div>
					<div class="option-list">
						{#each visibilityOptions as option (option.value)}
							<label class="choice" class:selected={visibility === option.value}>
								<input type="radio" bind:group={visibility} value={option.value} />
								<span>
									<strong>{option.title}</strong>
									<small>{option.description}</small>
								</span>
							</label>
						{/each}
					</div>
				{:else if currentStep === 2}
					<div class="step-head">
						<p>Who can post?</p>
						<h1>Set participation.</h1>
					</div>
					<div class="option-list">
						{#each participationOptions as option (option.value)}
							<label class="choice" class:selected={participation === option.value}>
								<input type="radio" bind:group={participation} value={option.value} />
								<span>
									<strong>{option.title}</strong>
									<small>{option.description}</small>
								</span>
							</label>
						{/each}
					</div>
					<p class="technical-note">
						Reactions and quotes are open to followers unless the community is private.
					</p>
				{:else if currentStep === 3}
					<div class="step-head">
						<p>How do people join?</p>
						<h1>Pick join methods.</h1>
					</div>
					<div class="option-list">
						{#each joinOptions as option (option.key)}
							<label
								class="choice"
								class:selected={(option.key === 'inviteLinks' && inviteLinks) ||
									(option.key === 'qrCodes' && qrCodes) ||
									(option.key === 'manualApproval' && manualApproval)}
							>
								<input
									type="checkbox"
									checked={(option.key === 'inviteLinks' && inviteLinks) ||
										(option.key === 'qrCodes' && qrCodes) ||
										(option.key === 'manualApproval' && manualApproval)}
									on:change={() => toggleJoin(option.key)}
								/>
								<span>
									<strong>{option.title}</strong>
									<small>{option.description}</small>
								</span>
							</label>
						{/each}
					</div>
				{:else if currentStep === 4}
					<div class="step-head">
						<p>Memberships</p>
						<h1>Does your community have memberships?</h1>
					</div>
					<div class="option-list compact">
						{#each membershipOptions as option (option.value)}
							<label class="choice" class:selected={membershipChoice === option.value}>
								<input type="radio" bind:group={membershipChoice} value={option.value} />
								<span>
									<strong>{option.title}</strong>
								</span>
							</label>
						{/each}
					</div>

					{#if membershipChoice === 'Yes'}
						<div class="membership-box">
							<label>
								<span>Membership name</span>
								<input bind:value={membershipName} />
							</label>
							<label>
								<span>Price</span>
								<input bind:value={membershipPrice} />
							</label>
							<div class="benefits">
								<span>Benefits</span>
								<div>
									{#each benefitOptions as benefit (benefit)}
										<label class:selected={benefits.includes(benefit)}>
											<input
												type="checkbox"
												checked={benefits.includes(benefit)}
												on:change={() => toggleBenefit(benefit)}
											/>
											{benefit}
										</label>
									{/each}
								</div>
							</div>
						</div>
					{/if}
				{:else}
					<div class="done-state">
						<span class="done-icon">
							<CheckCircle2 size={44} />
						</span>
						<p>Your community is ready.</p>
						<h1>{name}</h1>
						<span>{accessSummary}</span>
						<div class="done-actions">
							<button type="button" on:click={copyInviteLink}>
								<Copy size={18} />
								Copy invite link
							</button>
							<button
								type="button"
								class="secondary"
								disabled={isExportingPdf}
								on:click={downloadPosterPdf}
							>
				<Download size={18} />
				{isExportingPdf ? 'Building PDF' : 'Download QR poster'}
			</button>
						</div>
					</div>
				{/if}

				{#if currentStep < steps.length - 1}
					<footer class="controls" class:single={currentStep === 0}>
						{#if currentStep > 0}
							<button type="button" class="ghost" on:click={previous}>
								<ArrowLeft size={18} />
								Back
							</button>
						{/if}
						<button type="button" on:click={next}>
							Continue
							<ArrowRight size={18} />
						</button>
					</footer>
				{:else}
					<footer class="controls">
						<button type="button" class="ghost" on:click={previous}>
							<ArrowLeft size={18} />
							Back
						</button>
						<a href={resolve('/explore')}>Open community</a>
					</footer>
				{/if}
			</section>

			<aside class="preview" aria-label="Setup context">
				{#if currentStep === steps.length - 1}
					<div class="poster-preview">
						<div class="poster-head">
							{#if imageUrl}
								<img src={imageUrl} alt="" />
							{:else}
								<span>{(name || 'N').slice(0, 1)}</span>
							{/if}
							<div>
								<p>{communityType}</p>
								<h2>{name || 'New community'}</h2>
							</div>
						</div>
						<small>{description}</small>
						<div class="poster-qr">
							{#if qrDataUrl}
								<img src={qrDataUrl} alt="Invite QR code" />
							{/if}
						</div>
						<strong>{inviteUrl}</strong>
					</div>
				{:else}
					<div class="community-card">
						<div>
							<p>{communityType}</p>
							<h2>{name || 'New community'}</h2>
						</div>
						{#if imageUrl}
							<img class="community-image" src={imageUrl} alt="" />
						{:else}
							<span class="community-image placeholder">
								<Users size={22} />
							</span>
						{/if}
						<small>{description || 'Add a short description.'}</small>
						<div>
							<span>{location || 'Location'}</span>
							<span>{currentStep >= 1 ? visibility : 'Visibility later'}</span>
						</div>
					</div>
				{/if}

				<div class="context-card">
					<p>Setup so far</p>
					<ul>
						<li class:active={currentStep >= 0}>Community basics</li>
						<li class:active={currentStep >= 1}>{currentStep >= 1 ? visibility : 'Visibility'}</li>
						<li class:active={currentStep >= 2}>
							{currentStep >= 2 ? participation : 'Participation'}
						</li>
						<li class:active={currentStep >= 3}>
							{currentStep >= 3 ? selectedJoinMethods.join(' + ') : 'Join methods'}
						</li>
					</ul>
				</div>
			</aside>
		</div>
	</section>
</main>

<style>
	:global(body) {
		margin: 0;
		background: #f3eadc;
	}

	.create-page {
		min-height: 100vh;
		background: #f3eadc;
		color: #151411;
		font-family: "Suisse Int'l", Inter, ui-sans-serif, system-ui, sans-serif;
	}

	.wizard-shell {
		min-height: 100vh;
		padding: clamp(18px, 3vw, 36px);
	}

	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin: 0 auto clamp(18px, 3vw, 34px);
		max-width: 1360px;
	}

	.topbar a,
	.controls a {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		color: inherit;
		font-weight: 900;
		text-decoration: none;
	}

	.step-count {
		color: #716341;
		font-size: 0.86rem;
		font-weight: 900;
		text-transform: uppercase;
	}

	.layout {
		display: grid;
		grid-template-columns: 210px minmax(0, 760px) minmax(260px, 340px);
		gap: clamp(18px, 3vw, 38px);
		align-items: start;
		justify-content: center;
		max-width: 1360px;
		margin: 0 auto;
	}

	.wizard-steps,
	.panel,
	.preview {
		min-width: 0;
	}

	.wizard-steps {
		position: sticky;
		top: 28px;
		display: grid;
		gap: 8px;
	}

	.progress-track {
		height: 4px;
		overflow: hidden;
		background: rgba(21, 20, 17, 0.12);
	}

	.progress-fill {
		height: 100%;
		background: #53b86a;
		transition: width 180ms ease;
	}

	button,
	input,
	select,
	textarea,
	a {
		font: inherit;
		letter-spacing: 0;
	}

	button {
		border: 0;
		cursor: pointer;
	}

	.wizard-steps button {
		display: grid;
		grid-template-columns: 34px 1fr;
		align-items: center;
		gap: 10px;
		background: transparent;
		color: #716341;
		padding: 8px 0;
		text-align: left;
		font-weight: 900;
	}

	.wizard-steps button span {
		display: grid;
		width: 32px;
		height: 32px;
		place-items: center;
		border: 1px solid rgba(21, 20, 17, 0.18);
		background: #fff8ea;
		color: #151411;
		font-size: 0.84rem;
	}

	.wizard-steps button.active,
	.wizard-steps button.complete {
		color: #151411;
	}

	.wizard-steps button.active span,
	.wizard-steps button.complete span {
		border-color: #151411;
		background: #151411;
		color: #fff8ea;
	}

	.panel {
		min-height: min(720px, calc(100vh - 112px));
		background: #fff8ea;
		padding: clamp(26px, 4vw, 56px);
	}

	.step-head {
		max-width: 740px;
		margin-bottom: clamp(28px, 4vw, 46px);
	}

	.step-head p {
		margin: 0;
		color: #716341;
		font-size: 0.82rem;
		font-weight: 900;
		text-transform: uppercase;
	}

	h1,
	p {
		letter-spacing: 0;
	}

	h1 {
		margin: 10px 0 0;
		font-size: clamp(2.5rem, 5vw, 5rem);
		line-height: 0.92;
	}

	.field-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.18fr) minmax(210px, 0.82fr);
		gap: 1px;
		align-items: stretch;
		background: rgba(21, 20, 17, 0.2);
		border: 1px solid rgba(21, 20, 17, 0.2);
	}

	.identity-grid {
		grid-template-areas:
			'name type'
			'description location'
			'description image';
	}

	.name-field {
		grid-area: name;
	}

	.type-field {
		grid-area: type;
	}

	.description-field {
		grid-area: description;
	}

	.location-field {
		grid-area: location;
	}

	.image-field {
		grid-area: image;
		min-height: 130px;
	}

	label,
	.benefits {
		display: grid;
		gap: 8px;
	}

	.form-cell {
		display: grid;
		align-content: start;
		gap: 12px;
		background: #f3eadc;
		padding: 18px;
	}

	.form-cell.description-field,
	.form-cell.location-field {
		min-height: 190px;
	}

	.form-cell.image-field {
		min-height: 150px;
	}

	label span,
	.benefits > span {
		color: #4f493d;
		font-size: 0.9rem;
		font-weight: 900;
	}

	input,
	select,
	textarea {
		width: 100%;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: #151411;
		padding: 0;
		outline: 0;
	}

	.file-input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	.upload-box {
		display: grid;
		min-height: 86px;
		grid-template-columns: 64px 1fr;
		align-items: center;
		gap: 14px;
		border: 1px dashed rgba(21, 20, 17, 0.28);
		padding: 10px;
		color: #4f493d;
		cursor: pointer;
	}

	.upload-box img,
	.community-image {
		width: 64px;
		height: 64px;
		object-fit: cover;
	}

	.upload-icon {
		display: grid;
		place-items: center;
	}

	.upload-box small {
		overflow-wrap: anywhere;
		font-size: 0.88rem;
		font-weight: 900;
		line-height: 1.25;
	}

	textarea {
		min-height: 116px;
		resize: vertical;
	}

	input:focus,
	select:focus,
	textarea:focus {
		box-shadow: 0 2px 0 0 #151411;
	}

	.option-list {
		display: grid;
		gap: 12px;
		max-width: 760px;
	}

	.option-list.compact {
		gap: 8px;
	}

	.choice {
		display: grid;
		grid-template-columns: 22px 1fr;
		align-items: start;
		gap: 14px;
		border: 1px solid rgba(21, 20, 17, 0.18);
		background: #f3eadc;
		padding: 18px;
		cursor: pointer;
	}

	.choice.selected {
		border-color: #151411;
		background: #dfe7c4;
	}

	.choice input,
	.benefits input {
		width: 18px;
		height: 18px;
		accent-color: #151411;
	}

	.choice strong {
		display: block;
		font-size: 1.08rem;
	}

	.choice small,
	.technical-note {
		color: #4f493d;
		line-height: 1.45;
	}

	.technical-note {
		max-width: 660px;
		margin: 22px 0 0;
	}

	.membership-box {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 18px;
		max-width: 760px;
		margin-top: 24px;
		border-top: 1px solid rgba(21, 20, 17, 0.18);
		padding-top: 24px;
	}

	.benefits {
		grid-column: 1 / -1;
	}

	.benefits div {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.benefits label {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		border: 1px solid rgba(21, 20, 17, 0.18);
		background: #f3eadc;
		padding: 10px 12px;
		color: #4f493d;
		font-weight: 900;
	}

	.benefits label.selected {
		border-color: #151411;
		background: #dfe7c4;
		color: #151411;
	}

	.controls {
		display: flex;
		justify-content: space-between;
		gap: 14px;
		margin-top: clamp(34px, 5vw, 72px);
	}

	.controls.single {
		justify-content: flex-end;
	}

	.controls button,
	.controls a,
	.done-actions button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 9px;
		background: #53b86a;
		color: #151411;
		padding: 14px 18px;
		font-weight: 900;
	}

	.controls .ghost {
		border: 1px solid rgba(21, 20, 17, 0.22);
		background: transparent;
	}

	.done-state {
		display: grid;
		min-height: 470px;
		align-content: center;
		justify-items: start;
	}

	.done-icon {
		display: inline-flex;
		color: #53b86a;
	}

	.done-state p {
		margin: 18px 0 0;
		color: #716341;
		font-weight: 900;
		text-transform: uppercase;
	}

	.done-state span {
		margin-top: 18px;
		background: #151411;
		color: #fff8ea;
		padding: 10px 12px;
		font-weight: 900;
	}

	.done-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-top: 30px;
	}

	.done-actions .secondary {
		border: 1px solid #151411;
		background: transparent;
	}

	.preview {
		position: sticky;
		top: 28px;
		display: grid;
		gap: 14px;
	}

	.community-card,
	.context-card {
		background: #10100e;
		color: #fff8ea;
		padding: 22px;
	}

	.community-card {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 64px;
		gap: 18px;
	}

	.community-image {
		background: rgba(255, 248, 234, 0.1);
		color: #fff8ea;
	}

	.community-image.placeholder {
		display: grid;
		place-items: center;
	}

	.community-card p,
	.context-card p {
		margin: 0;
		color: #f2d35f;
		font-size: 0.82rem;
		font-weight: 900;
		text-transform: uppercase;
	}

	.community-card h2 {
		margin: 8px 0 0;
		font-size: clamp(2rem, 3.8vw, 3rem);
		line-height: 0.95;
	}

	.community-card small {
		grid-column: 1 / -1;
		color: rgba(255, 248, 234, 0.75);
		font-size: 1rem;
		line-height: 1.45;
	}

	.community-card div:last-child {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.community-card span {
		border: 1px solid rgba(255, 248, 234, 0.28);
		padding: 8px 10px;
		font-size: 0.84rem;
		font-weight: 900;
	}

	.context-card {
		background: #dfe7c4;
		color: #151411;
	}

	.context-card p {
		color: #716341;
	}

	.context-card ul {
		display: grid;
		gap: 10px;
		margin: 14px 0 0;
		padding: 0;
		list-style: none;
	}

	.context-card li {
		border-top: 1px solid rgba(21, 20, 17, 0.16);
		padding-top: 10px;
		color: rgba(21, 20, 17, 0.45);
		font-weight: 900;
	}

	.context-card li.active {
		color: #151411;
	}

	.poster-preview {
		display: grid;
		gap: 18px;
		background: #fff8ea;
		color: #151411;
		padding: 22px;
		border: 1px solid rgba(21, 20, 17, 0.24);
	}

	.poster-head {
		display: grid;
		grid-template-columns: 72px minmax(0, 1fr);
		gap: 14px;
		align-items: start;
	}

	.poster-head img,
	.poster-head > span {
		width: 72px;
		height: 72px;
		object-fit: cover;
		background: #dfe7c4;
	}

	.poster-head > span {
		display: grid;
		place-items: center;
		font-size: 2.5rem;
		font-weight: 900;
	}

	.poster-head p {
		margin: 0;
		color: #716341;
		font-size: 0.78rem;
		font-weight: 900;
		text-transform: uppercase;
	}

	.poster-head h2 {
		margin: 6px 0 0;
		font-size: clamp(1.8rem, 3.4vw, 2.8rem);
		line-height: 0.95;
	}

	.poster-preview small {
		color: #4f493d;
		font-size: 0.98rem;
		line-height: 1.4;
	}

	.poster-qr {
		display: grid;
		place-items: center;
		background: #fff8ea;
		border: 1px solid rgba(21, 20, 17, 0.16);
		padding: 12px;
	}

	.poster-qr img {
		width: min(100%, 220px);
		height: auto;
	}

	.poster-preview strong {
		overflow-wrap: anywhere;
		background: #151411;
		color: #fff8ea;
		padding: 10px;
		font-size: 0.78rem;
		text-align: center;
	}

	@media (max-width: 1080px) {
		.layout {
			grid-template-columns: 180px minmax(0, 1fr);
		}

		.preview {
			position: static;
			grid-column: 1 / -1;
			grid-template-columns: minmax(0, 1fr) minmax(260px, 0.58fr);
		}
	}

	@media (max-width: 760px) {
		.wizard-shell {
			padding: 14px;
		}

		.layout,
		.preview {
			grid-template-columns: 1fr;
		}

		.wizard-steps {
			position: static;
			grid-template-columns: repeat(6, minmax(0, 1fr));
			gap: 4px;
		}

		.progress-track {
			grid-column: 1 / -1;
		}

		.wizard-steps button {
			grid-template-columns: 1fr;
			gap: 6px;
			justify-items: center;
			overflow: hidden;
			font-size: 0;
			line-height: 0;
		}

		.wizard-steps button span {
			width: 32px;
			height: 32px;
			font-size: 0.82rem;
			line-height: 1;
		}

		.field-grid,
		.membership-box {
			grid-template-columns: 1fr;
		}

		.identity-grid {
			grid-template-areas:
				'name'
				'type'
				'description'
				'location'
				'image';
		}

		h1 {
			font-size: clamp(2.5rem, 13vw, 3.7rem);
		}

		.panel {
			min-height: auto;
		}

		.controls {
			flex-direction: column-reverse;
		}

		.controls button,
		.controls a,
		.done-actions button {
			width: 100%;
		}
	}
</style>

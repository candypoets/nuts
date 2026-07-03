<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		ArrowRight,
		CalendarDays,
		Check,
		Copy,
		Download,
		Eye,
		FileText,
		MessageSquare,
		RefreshCw,
		ShieldCheck,
		UserPlus,
		UsersRound
	} from 'lucide-svelte';

	export let communityName = '';
	export let communityDescription = '';
	export let communityImage = '';
	export let inviteUrl = '';
	export let qrDataUrl = '';
	export let recoveryNsec = '';

	$: displayName = communityName || 'New community';
	$: displayDescription = communityDescription || 'A home for your people.';

	const stats = [
		{ label: 'Members', value: '0', icon: UsersRound },
		{ label: 'Events', value: '0', icon: CalendarDays },
		{ label: 'Posts', value: '0', icon: MessageSquare },
		{ label: 'Invites sent', value: '0', icon: RefreshCw }
	];

	const nextSteps = [
		{
			label: 'Invite members',
			detail: 'Bring people into your community.',
			icon: UserPlus
		},
		{
			label: 'Create an event',
			detail: 'Organize your first event or meetup.',
			icon: CalendarDays
		},
		{
			label: 'Make a post',
			detail: 'Share an update with your members.',
			icon: FileText
		},
		{
			label: 'Assign roles',
			detail: 'Give permissions and empower your team.',
			icon: ShieldCheck
		}
	];

	async function copy(text: string) {
		await navigator.clipboard?.writeText(text);
	}

	function loadImage(src: string) {
		return new Promise<HTMLImageElement>((resolveImage, reject) => {
			const image = new Image();
			image.onload = () => resolveImage(image);
			image.onerror = reject;
			image.src = src;
		});
	}

	async function downloadInvitePoster() {
		if (!qrDataUrl) return;
		const canvas = document.createElement('canvas');
		canvas.width = 1200;
		canvas.height = 1600;
		const context = canvas.getContext('2d');
		if (!context) return;

		const gradient = context.createLinearGradient(0, 0, 1200, 1600);
		gradient.addColorStop(0, '#173827');
		gradient.addColorStop(1, '#0f1715');
		context.fillStyle = gradient;
		context.fillRect(0, 0, 1200, 1600);

		if (communityImage) {
			try {
				const image = await loadImage(communityImage);
				const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
				const width = image.width * scale;
				const height = image.height * scale;
				context.drawImage(
					image,
					(canvas.width - width) / 2,
					(canvas.height - height) / 2,
					width,
					height
				);
				context.fillStyle = 'rgba(10, 17, 16, 0.64)';
				context.fillRect(0, 0, canvas.width, canvas.height);
			} catch {
				// Keep the gradient background if the uploaded image cannot be read.
			}
		}

		context.fillStyle = 'rgba(255, 255, 255, 0.9)';
		fillRoundRect(context, 96, 96, 1008, 1408, 44);

		context.fillStyle = '#286541';
		context.font = '700 34px sans-serif';
		context.fillText('Join the community', 160, 190);

		context.fillStyle = '#171614';
		context.font = '900 84px sans-serif';
		wrapText(context, displayName, 160, 330, 880, 98, 3);

		context.fillStyle = '#5f594d';
		context.font = '600 42px sans-serif';
		wrapText(context, displayDescription, 160, 560, 880, 56, 3);

		const qrImage = await loadImage(qrDataUrl);
		context.fillStyle = '#ffffff';
		fillRoundRect(context, 330, 760, 540, 540, 28);
		context.drawImage(qrImage, 370, 800, 460, 460);

		context.fillStyle = '#171614';
		context.font = '800 34px sans-serif';
		context.textAlign = 'center';
		context.fillText(inviteUrl, 600, 1385, 880);
		context.textAlign = 'left';

		const link = document.createElement('a');
		link.href = canvas.toDataURL('image/png');
		link.download = `${
			displayName
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '') || 'community'
		}-invite.png`;
		link.click();
	}

	function fillRoundRect(
		context: CanvasRenderingContext2D,
		x: number,
		y: number,
		width: number,
		height: number,
		radius: number
	) {
		context.beginPath();
		context.moveTo(x + radius, y);
		context.lineTo(x + width - radius, y);
		context.quadraticCurveTo(x + width, y, x + width, y + radius);
		context.lineTo(x + width, y + height - radius);
		context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
		context.lineTo(x + radius, y + height);
		context.quadraticCurveTo(x, y + height, x, y + height - radius);
		context.lineTo(x, y + radius);
		context.quadraticCurveTo(x, y, x + radius, y);
		context.closePath();
		context.fill();
	}

	function wrapText(
		context: CanvasRenderingContext2D,
		text: string,
		x: number,
		y: number,
		maxWidth: number,
		lineHeight: number,
		maxLines: number
	) {
		const words = text.split(/\s+/);
		let line = '';
		let lineCount = 0;

		for (const word of words) {
			const nextLine = line ? `${line} ${word}` : word;
			if (context.measureText(nextLine).width > maxWidth && line) {
				context.fillText(line, x, y);
				line = word;
				y += lineHeight;
				lineCount += 1;
				if (lineCount >= maxLines - 1) break;
			} else {
				line = nextLine;
			}
		}

		if (line) context.fillText(line, x, y);
	}
</script>

<section class="min-w-0 flex-1 px-6 pb-10 lg:px-12 xl:px-16">
	<div class="relative grid h-16 w-16 place-items-center rounded-full border-4 border-[#286541]">
		<Check size={32} strokeWidth={2.5} class="text-[#286541]" />
		<span class="absolute -left-3 top-3 h-1.5 w-1.5 rounded-full bg-[#286541]"></span>
		<span class="absolute -right-4 top-1 h-1.5 w-1.5 rounded-full bg-[#286541]"></span>
		<span class="absolute -bottom-2 left-4 h-1.5 w-1.5 rounded-full bg-[#b8c8a6]"></span>
	</div>

	<p class="mt-8 text-sm font-black uppercase text-[#286541]">Community created</p>
	<h1
		class="mt-5 max-w-4xl break-words text-5xl font-black leading-none tracking-normal lg:text-7xl"
	>
		{displayName}
	</h1>
	<p class="mt-6 max-w-3xl break-words text-xl font-semibold leading-9 text-stone-600">
		{displayDescription}
	</p>

	<hr class="my-9 border-black/10" />

	<div>
		<h2 class="text-2xl font-black">Your community is ready.</h2>
		<p class="mt-3 text-xl font-semibold text-stone-600">
			Invite your first members to get started.
		</p>
	</div>

	<div class="mt-8 grid gap-4 md:grid-cols-4">
		{#each stats as stat (stat.label)}
			<div class="rounded-xl border border-black/5 bg-[#f2f1e9] p-5 shadow-sm">
				<svelte:component this={stat.icon} size={26} strokeWidth={1.8} class="text-[#286541]" />
				<p class="mt-5 text-4xl font-black">{stat.value}</p>
				<p class="mt-2 text-base font-bold text-stone-600">{stat.label}</p>
			</div>
		{/each}
	</div>

	<div class="mt-8 grid gap-5 lg:grid-cols-2">
		<button
			type="button"
			class="flex min-h-24 items-center gap-5 rounded-xl bg-[#245b39] px-6 py-5 text-left text-white shadow-lg shadow-[#245b39]/15"
			on:click={() => copy(inviteUrl)}
		>
			<UsersRound size={28} strokeWidth={1.8} />
			<span class="min-w-0 flex-1">
				<span class="block text-xl font-black">Invite members</span>
				<span class="mt-1 block text-base font-medium text-white/75">Copy invite link</span>
			</span>
			<ArrowRight size={26} />
		</button>

		<a
			class="flex min-h-24 items-center gap-5 rounded-xl border border-black/10 bg-white px-6 py-5 text-left no-underline shadow-sm"
			href={resolve('/admin')}
		>
			<Eye size={28} strokeWidth={1.8} class="text-[#171614]" />
			<span class="min-w-0 flex-1">
				<span class="block text-xl font-black text-[#171614]">Open community</span>
				<span class="mt-1 block text-base font-medium text-stone-600"
					>Go to your community home</span
				>
			</span>
			<ArrowRight size={26} class="text-[#171614]" />
		</a>
	</div>

	<section class="mt-8 rounded-xl border border-black/10 bg-white/60 p-6 shadow-sm">
		<h2 class="text-lg font-black uppercase">Invite link</h2>
		<div
			class="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] rounded-xl border border-black/10 bg-white"
		>
			<span class="min-w-0 truncate px-4 py-4 text-base font-bold">{inviteUrl}</span>
			<button
				type="button"
				class="m-1 rounded-lg border border-[#8fb79b] px-5 font-black text-[#286541]"
				on:click={() => copy(inviteUrl)}
			>
				Copy
			</button>
		</div>

		<div class="mt-5 flex flex-wrap items-center gap-5">
			<div class="grid h-32 w-32 place-items-center rounded-xl border border-black/10 bg-white p-3">
				{#if qrDataUrl}
					<img class="h-full w-full object-contain" src={qrDataUrl} alt="Invite QR code" />
				{:else}
					<span class="text-xs font-bold text-stone-500">Generating QR</span>
				{/if}
			</div>
			<button
				type="button"
				class="inline-flex h-12 items-center gap-2 rounded-lg border border-black/10 bg-white px-5 font-black text-[#286541] shadow-sm"
				on:click={downloadInvitePoster}
			>
				<Download size={18} />
				Download invite
			</button>
		</div>

		{#if recoveryNsec}
			<div class="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
				<p class="text-xs font-black uppercase text-amber-800">Account recovery</p>
				<p class="mt-2 break-all text-sm font-bold text-amber-900">{recoveryNsec}</p>
				<button
					type="button"
					class="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-500 px-3 py-2 text-sm font-black text-amber-900"
					on:click={() => copy(recoveryNsec)}
				>
					<Copy size={16} />
					Copy recovery key
				</button>
			</div>
		{/if}
	</section>

	<section class="mt-8 rounded-xl border border-black/10 bg-white/60 p-6 shadow-sm">
		<h2 class="text-xl font-black">Next steps</h2>
		<div class="mt-6 grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
			{#each nextSteps as step, index (step.label)}
				<div class="relative">
					<div class="grid h-12 w-12 place-items-center rounded-full bg-[#eef1e6] text-[#286541]">
						<svelte:component this={step.icon} size={24} strokeWidth={1.8} />
					</div>
					<div class="mt-4 flex items-center gap-2">
						<span
							class="grid h-6 w-6 place-items-center rounded-full bg-[#4e9361] text-xs font-black text-white"
							>{index + 1}</span
						>
						<h3 class="font-black">{step.label}</h3>
					</div>
					<p class="mt-2 text-sm leading-6 text-stone-600">{step.detail}</p>
				</div>
			{/each}
		</div>
		<div class="mt-6 border-t border-black/10 pt-5">
			<div class="grid grid-cols-[auto_1fr] items-center gap-5">
				<span class="text-sm font-bold text-stone-600">0 of 4 completed</span>
				<span class="h-2 rounded-full bg-stone-100"></span>
			</div>
		</div>
	</section>
</section>

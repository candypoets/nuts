<script lang="ts">
	import { DatePicker } from 'bits-ui';
	import { getLocalTimeZone, parseDate, today, type DateValue } from '@internationalized/date';
	import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-svelte';

	export let value: string;
	export let min: string | undefined = undefined;
	export let label = 'Event date';

	let selectedDate = parseValue(value);

	$: if (value && value !== selectedDate?.toString()) {
		selectedDate = parseValue(value);
	}
	$: minDate = parseValue(min) || today(getLocalTimeZone());
	$: formattedValue = selectedDate
		? new Intl.DateTimeFormat(undefined, {
				weekday: 'short',
				month: 'long',
				day: 'numeric',
				year: 'numeric'
			}).format(selectedDate.toDate(getLocalTimeZone()))
		: 'Choose a date';

	function parseValue(input: string | undefined): DateValue | undefined {
		if (!input) return undefined;
		try {
			return parseDate(input);
		} catch {
			return undefined;
		}
	}

	function handleValueChange(nextValue: DateValue | undefined) {
		selectedDate = nextValue;
		value = nextValue?.toString() || '';
	}
</script>

<DatePicker.Root
	value={selectedDate}
	minValue={minDate}
	preventDeselect={true}
	fixedWeeks={true}
	weekdayFormat="short"
	calendarLabel={label}
	onValueChange={handleValueChange}
>
	<DatePicker.Trigger
		class="flex h-12 w-full items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 text-left text-base font-bold text-[#171614] outline-none transition hover:border-stone-300 focus:border-emerald-900 focus:ring-2 focus:ring-emerald-800/20"
		aria-label={`Choose ${label.toLowerCase()}`}
	>
		<CalendarDays size={18} class="shrink-0 text-stone-400" />
		<span class="min-w-0 flex-1 truncate">{formattedValue}</span>
	</DatePicker.Trigger>

	<DatePicker.Content
		class="nuts-date-picker z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl shadow-stone-950/15 outline-none"
		sideOffset={8}
		collisionPadding={16}
	>
		<DatePicker.Calendar let:months let:weekdays>
			<DatePicker.Header class="mb-4 flex items-center justify-between gap-3">
				<DatePicker.PrevButton
					class="grid h-10 w-10 place-items-center rounded-xl text-stone-600 transition hover:bg-[#eef5f3] hover:text-[#15372c] focus:outline-none focus:ring-2 focus:ring-emerald-800/20"
				>
					<ChevronLeft size={20} />
				</DatePicker.PrevButton>
				<DatePicker.Heading class="text-base font-black tracking-tight text-[#171614]" />
				<DatePicker.NextButton
					class="grid h-10 w-10 place-items-center rounded-xl text-stone-600 transition hover:bg-[#eef5f3] hover:text-[#15372c] focus:outline-none focus:ring-2 focus:ring-emerald-800/20"
				>
					<ChevronRight size={20} />
				</DatePicker.NextButton>
			</DatePicker.Header>

			{#each months as month (month.value.toString())}
				<DatePicker.Grid class="w-full border-collapse" aria-label={month.value.toString()}>
					<DatePicker.GridHead>
						<DatePicker.GridRow>
							{#each weekdays as day (day)}
								<DatePicker.HeadCell
									class="h-9 text-center text-[11px] font-black uppercase tracking-wide text-stone-400"
								>
									{day}
								</DatePicker.HeadCell>
							{/each}
						</DatePicker.GridRow>
					</DatePicker.GridHead>
					<DatePicker.GridBody>
						{#each month.weeks as weekDates, weekIndex (`${month.value}-${weekIndex}`)}
							<DatePicker.GridRow>
								{#each weekDates as date (date.toString())}
									<DatePicker.Cell {date}>
										<DatePicker.Day
											{date}
											month={month.value}
											class="grid h-10 w-10 place-items-center rounded-xl text-sm font-bold text-stone-700 outline-none transition hover:bg-[#eef5f3] focus:ring-2 focus:ring-emerald-800/25"
										/>
									</DatePicker.Cell>
								{/each}
							</DatePicker.GridRow>
						{/each}
					</DatePicker.GridBody>
				</DatePicker.Grid>
			{/each}

			<div class="mt-3 flex items-center justify-between border-t border-stone-100 pt-3">
				<p class="text-xs font-bold text-stone-400">Dates use your local timezone</p>
				<DatePicker.Close
					class="rounded-lg bg-[#15372c] px-3 py-2 text-sm font-black text-white transition hover:bg-[#204c3e] focus:outline-none focus:ring-2 focus:ring-emerald-800/25 active:scale-[0.98]"
				>
					Done
				</DatePicker.Close>
			</div>
		</DatePicker.Calendar>
	</DatePicker.Content>
</DatePicker.Root>

<style>
	:global(.nuts-date-picker [data-selected]) {
		background: #15372c;
		color: white;
		box-shadow: 0 5px 14px rgba(21, 55, 44, 0.22);
	}

	:global(.nuts-date-picker [data-today]:not([data-selected])) {
		box-shadow: inset 0 0 0 1px #df725c;
		color: #a94231;
	}

	:global(.nuts-date-picker [data-outside-month]) {
		color: #d6d3d1;
	}

	:global(.nuts-date-picker [data-disabled]) {
		cursor: not-allowed;
		opacity: 0.3;
	}
</style>

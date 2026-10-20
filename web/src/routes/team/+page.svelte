<script lang="ts">
import { enhance, type SubmitFunction } from '$app/forms';
import type { PageProps } from './$types';

let { data, form }: PageProps = $props();
let busy = $state(false);
let copied = $state(false);
let copyError = $state(false);
let channel = $state('email');
let linkInput = $state<HTMLInputElement>();
const isCaptain = $derived(data.team?.captainId === data.user?.id);
const submit: SubmitFunction = () => {
	busy = true;
	return async ({ update }) => {
		try {
			await update();
		} finally {
			busy = false;
		}
	};
};
async function copy() {
	try {
		await navigator.clipboard.writeText(data.inviteLink);
		copied = true;
		copyError = false;
	} catch {
		linkInput?.focus();
		linkInput?.select();
		copyError = true;
	}
}
</script>

<svelte:head
	><title>{data.team ? `${data.team.name} · hcav` : 'register your team · hcav'}</title>
	<meta name="robots" content="noindex"></svelte:head
>

<div class="py-12 sm:py-18">
	{#if !data.team}
		<div class="mx-auto max-w-145 py-5 sm:py-12">
			<p class="text-hcav">personnel intake</p>
			<h1 class="mt-3 text-5xl leading-tight font-bold tracking-tight sm:text-6xl">
				every questionable idea needs a team.
			</h1>
			<p class="mt-6 text-xl text-neutral-600">
				hello, {data.user?.name}. give yours a name. recruitment follows.
			</p>
			{#if form?.message}
				<p role="status" class="mt-6 border-l-2 border-hcav pl-4">{form.message}</p>
			{/if}
			<form method="POST" use:enhance={submit} class="mt-10 space-y-5" aria-busy={busy}>
				<input type="hidden" name="action" value="create">
				<div>
					<label for="name" class="mb-2 block font-bold">team name</label>
					<input
						id="name"
						name="name"
						required
						minlength="2"
						maxlength="64"
						placeholder="something we can read aloud"
						class="w-full rounded-sm border border-neutral-400 bg-white px-4 py-3 placeholder:text-neutral-500"
					>
					<p class="mt-2 text-sm text-neutral-600">
						2–64 characters. no team size limit. no pressure.
					</p>
				</div>
				<button
					type="submit"
					disabled={busy}
					class="min-h-13 rounded-sm bg-hcav px-7 py-3 font-bold text-white hover:bg-[#a9271a] disabled:opacity-60"
				>
					{busy ? 'filing paperwork…' : 'register your team'}
				</button>
			</form>
			<p class="mt-10 text-base text-neutral-600">
				joining someone else? open the invitation they sent you instead.
			</p>
		</div>
	{:else}
		<div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
			<div>
				<p class="text-hcav">your team, on the record</p>
				<h1
					class="mt-2 max-w-170 text-4xl leading-tight font-bold tracking-tight break-words sm:text-6xl"
				>
					{data.team.name}
				</h1>
			</div>
			<p class="shrink-0 text-neutral-600">october 30 – november 2</p>
		</div>
		{#if form?.message}
			<p role="status" class="mt-8 border-l-2 border-hcav py-1 pl-4">{form.message}</p>
		{/if}
		<div class="mt-12 grid gap-12 lg:grid-cols-[1fr_1.35fr] lg:gap-20">
			<section aria-labelledby="roster">
				<h2 id="roster" class="text-2xl font-bold">the personnel ({data.members.length})</h2>
				<p class="mt-2 text-base text-neutral-600">no maximum occupancy.</p>
				<ul class="mt-5 divide-y divide-neutral-200">
					{#each data.members as member}
						<li class="py-4">
							<div class="flex items-baseline justify-between gap-4">
								<span class="break-words">{member.name}</span>
								{#if member.id === data.team.captainId}
									<span class="shrink-0 text-sm text-neutral-600">captain</span>
								{:else if member.id === data.user?.id}
									<span class="text-sm text-neutral-600">you</span>
								{/if}
							</div>
							{#if isCaptain && member.id !== data.user?.id}
								<form
									method="POST"
									use:enhance={submit}
									class="mt-2 flex gap-4 text-sm"
									onsubmit={(event) => {
										const action = (event.submitter as HTMLButtonElement)?.value;
										if (
											!confirm(
												action === 'transfer'
													? `make ${member.name} captain? you will lose captain controls.`
													: `remove ${member.name} from the team?`
											)
										)
											event.preventDefault();
									}}
								>
									<input type="hidden" name="member" value={member.id}>
									<button
										type="submit"
										name="action"
										value="transfer"
										disabled={busy}
										class="text-neutral-600 underline underline-offset-3 hover:text-black"
									>
										make captain
									</button>
									<button
										type="submit"
										name="action"
										value="remove"
										disabled={busy}
										class="text-hcav underline underline-offset-3"
									>
										remove
									</button>
								</form>
							{/if}
						</li>
					{/each}
				</ul>
				{#if !isCaptain}
					<form
						method="POST"
						use:enhance={submit}
						class="mt-6"
						onsubmit={(event) => {
							if (!confirm('leave this team? you will need a new invitation to rejoin.'))
								event.preventDefault();
						}}
					>
						<button
							type="submit"
							name="action"
							value="leave"
							disabled={busy}
							class="text-base text-hcav underline underline-offset-4"
						>
							leave team
						</button>
					</form>
				{/if}
			</section>
			<div class="space-y-10">
				<section aria-labelledby="recruit">
					<h2 id="recruit" class="text-2xl font-bold">recruit accomplices.</h2>
					<p class="mt-2 text-neutral-600">
						anyone with this link can sign in and join. share responsibly.
					</p>
					<label for="invite-link" class="mt-5 mb-2 block text-base font-bold"
						>your team invitation</label
					>
					<div class="flex flex-col gap-2 sm:flex-row">
						<input
							bind:this={linkInput}
							id="invite-link"
							readonly
							value={data.inviteLink}
							class="min-w-0 grow rounded-sm border border-neutral-400 bg-white px-3 py-3 text-base"
							onclick={(event) => event.currentTarget.select()}
						><button
							type="button"
							onclick={copy}
							class="shrink-0 rounded-sm bg-black px-5 py-3 font-bold text-white hover:bg-neutral-800"
						>
							{copied ? 'copied!' : 'copy link'}
						</button>
					</div>
					<p aria-live="polite" class="mt-2 text-sm text-neutral-600">
						{copyError
							? 'copy was blocked. the link is selected; copy it manually.'
							: copied
								? 'ready to send to your future accomplices.'
								: 'links last 14 days. your captain can replace this one.'}
					</p>
				</section>
				{#if isCaptain}
					<section aria-labelledby="dispatch" class="border-t border-neutral-200 pt-8">
						<h2 id="dispatch" class="text-2xl font-bold">have us send it.</h2>
						{#if !data.canSend}
							<p class="mt-3 text-neutral-600">
								sending requires a verified, eligible hack club account and a sign-in within the
								last 24 hours. sharing your link is always available.
							</p>
							<a
								href="/auth/login?refresh=1"
								class="mt-3 inline-block text-base underline decoration-hcav underline-offset-4"
								>refresh your sign-in</a
							>
						{:else if !data.messagesEnabled}
							<p class="mt-3 text-neutral-600">
								message dispatch is not open yet. use the copyable link above.
							</p>
						{:else}
							<form method="POST" use:enhance={submit} class="mt-5 space-y-5" aria-busy={busy}>
								<input type="hidden" name="action" value="invite">
								<div>
									<label for="channel" class="mb-2 block text-base font-bold">send via</label
									><select
										id="channel"
										name="channel"
										bind:value={channel}
										class="w-full rounded-sm border border-neutral-400 bg-white px-3 py-3"
									>
										<option value="email" disabled={!data.emailEnabled}>
											email{data.emailEnabled ? '' : ' (not available yet)'}
										</option>
										<option value="slack" disabled={!data.canSlack}>
											slack bot{data.canSlack ? '' : ' (link your slack account first)'}
										</option>
									</select>
								</div>
								<div>
									<label for="recipient" class="mb-2 block text-base font-bold"
										>{channel === 'email'
											? 'their email address'
											: 'their slack member id or profile link'}</label
									><input
										id="recipient"
										name="recipient"
										type={channel === 'email' ? 'email' : 'text'}
										required
										maxlength="254"
										placeholder={channel === 'email' ? 'friend@example.com' : 'U0123456789'}
										class="w-full rounded-sm border border-neutral-400 bg-white px-4 py-3 placeholder:text-neutral-500"
									>
									<p class="mt-2 text-sm text-neutral-600">
										only invite someone you know. we identify you as the sender.
									</p>
								</div>
								<button
									type="submit"
									disabled={busy || (channel === 'email' ? !data.emailEnabled : !data.canSlack)}
									class="rounded-sm bg-hcav px-6 py-3 font-bold text-white hover:bg-[#a9271a] disabled:opacity-60"
								>
									{busy ? 'recording request…' : 'send invitation'}
								</button>
								<p class="text-sm text-neutral-600">
									email: 5 requests per team per 24 hours, and only 1 per email address, ever. email
									+ slack: 10/hour, 40/day per captain and team. slack recipient cooldowns also
									apply.
								</p>
							</form>
						{/if}
					</section>
					<details class="border-t border-neutral-200 pt-6">
						<summary class="text-lg font-bold">captain’s paperwork</summary>
						<form method="POST" use:enhance={submit} class="mt-6 space-y-3">
							<input type="hidden" name="action" value="rename">
							<label for="rename" class="block text-base font-bold">team name</label>
							<input
								id="rename"
								name="name"
								value={data.team.name}
								required
								minlength="2"
								maxlength="64"
								class="w-full rounded-sm border border-neutral-400 px-4 py-3"
							><button
								type="submit"
								disabled={busy}
								class="rounded-sm border border-black px-5 py-2 hover:bg-neutral-100"
							>
								save name
							</button>
						</form>
						<form
							method="POST"
							use:enhance={submit}
							class="mt-7"
							onsubmit={(event) => {
								if (
									!confirm(
										'replace your link and revoke all outstanding invitations? existing members stay.'
									)
								)
									event.preventDefault();
							}}
						>
							<button
								type="submit"
								name="action"
								value="rotate"
								disabled={busy}
								class="text-base text-hcav underline underline-offset-4"
							>
								replace link & revoke invitations
							</button>
							<p class="mt-2 text-sm text-neutral-600">
								old links stop working. existing members stay.
							</p>
						</form>
						<p class="mt-6 text-sm text-neutral-600">
							to leave your team, make another member captain first.
						</p>
					</details>
				{/if}
			</div>
		</div>
	{/if}
</div>

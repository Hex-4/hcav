<script lang="ts">
import SlackPerson from '#lib/SlackPerson.svelte';
import { enhance } from '$app/forms';
import type { PageProps } from './$types';

let { data, form }: PageProps = $props();
const isCaptain = $derived(data.team?.captainId === data.user?.id);
let copied = $state(false);
let copyError = $state(false);
let linkInput = $state<HTMLInputElement>();

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

<svelte:head>
	<title>{data.team ? `${data.team.name} · HCAV` : 'Make a team · HCAV'}</title>
	<meta name="robots" content="noindex">
</svelte:head>

{#if form?.message}
	<p role="status">{form.message}</p>
{/if}

{#if !data.team}
	<h1>Make a team</h1>
	<p>You get to name it. This is a lot of responsibility.</p>
	<form method="POST" use:enhance>
		<input type="hidden" name="action" value="create">
		<label for="name">Team name</label>
		<input id="name" name="name" required minlength="2" maxlength="64">
		<button type="submit">Create team</button>
	</form>
	<p>2–64 characters. As many people as you can convince.</p>
	<p>Rather join one? <a href="/teams">Find a team</a>, or use a friend’s invite link.</p>
{:else}
	<h1>{data.team.name}</h1>
	<h2>The team ({data.members.length})</h2>
	<ul class="pl-6">
		{#each data.members as member}
			<li class="my-3">
				<SlackPerson {...member} />
				{#if member.id === data.team.captainId}
					(captain)
				{/if}
				{#if member.id === data.user?.id}
					(you)
				{/if}
				{#if isCaptain && member.id !== data.user?.id}
					<form
						method="POST"
						use:enhance
						class="mt-1"
						onsubmit={(event) => {
							const transfer = (event.submitter as HTMLButtonElement)?.value === 'transfer';
							if (
								!confirm(
									transfer
										? `Make ${member.name} captain? You will lose captain controls.`
										: `Remove ${member.name} from the team?`
								)
							)
								event.preventDefault();
						}}
					>
						<input type="hidden" name="member" value={member.id}>
						<button type="submit" name="action" value="transfer">Make captain</button>
						<button type="submit" name="action" value="remove">Remove</button>
					</form>
				{/if}
			</li>
		{/each}
	</ul>
	{#if !isCaptain}
		<form
			method="POST"
			use:enhance
			onsubmit={(event) => {
				if (!confirm('Leave this team? They\'ll miss you.')) event.preventDefault();
			}}
		>
			<button type="submit" name="action" value="leave">Leave team</button>
		</form>
	{/if}

	<h2>Invite people</h2>
	<p>Send them this link.</p>
	<label for="invite-link">Invite link</label>
	<input
		bind:this={linkInput}
		id="invite-link"
		readonly
		value={data.inviteLink}
		class="w-full my-2"
		onclick={(event) => event.currentTarget.select()}
	>
	<button type="button" onclick={copy}>{copied ? 'Copied!' : 'Copy link'}</button>
	<p aria-live="polite">
		{copyError
			? 'Copy was blocked. The link is selected; copy it manually.'
			: data.linkExpired
				? 'This link has expired. Ask your captain to replace it.'
				: 'Anyone with the link can join. It lasts 14 days. Please distribute responsibly.'}
	</p>

	<h2>Headquarters</h2>
	{#if data.team.hqId}
		<p>
			<a href={`https://hackclub.slack.com/archives/${data.team.hqId}`}>#{data.team.hqName}</a>. Try
			to look busy.
		</p>
	{:else}
		<p>No HQ yet. Your team is currently operating out of the beautiful, empty, ominous void.</p>
	{/if}
	{#if isCaptain}
		<p>
			To {data.team.hqId ? 'change' : 'set'} HQ, invite The Organization <a href="https://hackclub.enterprise.slack.com/archives/D0CC0Q1KLHE">bot</a> (make sure it's the app, not the user) (though we won't complain if you add the user too) to your team’s Slack
			channel and run <code>/hcav hq</code> there. Public or private is fine.
		</p>
		<p>We’ll add your teammates. Changing HQ won’t remove anyone from the old channel.</p>
	{:else if !data.team.hqId}
		<p>Your captain can set one.</p>
	{/if}

	{#if isCaptain}
		<h2>Captain things</h2>
		<form method="POST" use:enhance>
			<input type="hidden" name="action" value="registration">
			<label><input type="checkbox" name="open" checked={data.team.open}> Open registration</label>
			<button type="submit">Save registration</button>
		</form>
		<p>
			Open means anyone can join from <a href="/teams">the team list</a>. Closed means invite-only.
			Your invite link works either way.
		</p>
		<details>
			<summary>Other captain things</summary>
			<form method="POST" use:enhance class="my-4">
				<input type="hidden" name="action" value="rename">
				<label for="rename">Team name</label>
				<input id="rename" name="name" value={data.team.name} required minlength="2" maxlength="64">
				<button type="submit">Save name</button>
			</form>
			<form
				method="POST"
				use:enhance
				onsubmit={(event) => {
					if (
						!confirm(
							'Replace the invite link? The old one will stop working. Existing members stay.'
						)
					)
						event.preventDefault();
				}}
			>
				<button type="submit" name="action" value="rotate">Replace invite link</button>
			</form>
			<p>
				Old links stop working. Existing members stay. To leave, make another member captain first.
			</p>
		</details>
	{/if}
{/if}

<details class="mt-6">
	<summary>Slack channel status</summary>
	<ul>
		{#each data.channels as channel}
			<li>
				<a href={`https://hackclub.slack.com/archives/${channel.id}`}>#{channel.name}</a>:
				{channel.status === 'joined'
					? 'added'
					: channel.problem
						? `not added yet (${channel.problem})`
						: 'queued'}
			</li>
		{/each}
	</ul>
	<p>
		Channel trouble won’t undo your registration. The bot needs to be in the channel and have
		permission to add you.
	</p>
	<form method="POST" use:enhance>
		<button type="submit" name="action" value="retry-channels">Retry channel additions</button>
		<a href="/team" data-sveltekit-reload>Refresh status</a>
	</form>
</details>

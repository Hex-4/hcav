<script lang="ts">
let { name, imageUrl, slackId }: { name: string; imageUrl: string; slackId: string } = $props();
</script>

{#if imageUrl}
	<img
		src={imageUrl}
		alt=""
		width="24"
		height="24"
		class="inline-block align-middle object-cover"
		loading="lazy"
		referrerpolicy="no-referrer"
		onerror={(event) => {
			(event.currentTarget as HTMLImageElement).hidden = true;
		}}
	>
{/if}
{#if slackId}
	<a href={`https://hackclub.enterprise.slack.com/team/${slackId}`}>{name}</a>
{:else}
	<span>{name}</span>
{/if}

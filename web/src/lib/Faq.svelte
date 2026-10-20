<script lang="ts">
import type { Snippet } from 'svelte';

let { question, children }: { question: string; children: Snippet } = $props();
</script>

<details class="">
	<summary class="text-bold">{question}</summary>
	{@render children()}
</details>

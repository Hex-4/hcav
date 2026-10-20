<script lang="ts">
import JoinInvitation from '#lib/JoinInvitation.svelte';
import type { PageProps } from './$types';

let { data, form }: PageProps = $props();
</script>

<JoinInvitation {...data} message={form?.message} />

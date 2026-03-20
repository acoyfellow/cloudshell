<script lang="ts">
	import { cn } from "$lib/utils.js";
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import type { SVGAttributes } from "svelte/elements";

	let {
		class: className,
		role = "status",
		color,
		stroke,
		"aria-label": ariaLabel = "Loading",
	}: SVGAttributes<SVGSVGElement> & {
		color?: string | null;
		stroke?: string | number | null;
		"aria-label"?: string;
	} = $props();
</script>

<Loader2Icon
	{role}
	color={color === null ? undefined : color}
	stroke={stroke === null ? undefined : stroke}
	aria-label={ariaLabel}
	class={cn("size-4 animate-spin", className)}
/>

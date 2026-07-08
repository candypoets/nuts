import { base, resolveRoute } from '$app/paths';

export function resolve(path: string, params?: Record<string, string>): string {
	if (params) return resolveRoute(path as never, params as never);
	return base + path;
}

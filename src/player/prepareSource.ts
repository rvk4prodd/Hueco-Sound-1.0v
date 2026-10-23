/** Metro selects prepareSource.native.ts on Android/iOS. Web keeps normal URLs. */
export async function preparePlaybackSource(url: string, _signal?: AbortSignal): Promise<string> { return url; }
export function retainPreparedSources(_urls: string[]): void {}
export function originalPlaybackSource(url: string): string { return url; }

import { addProtocol } from 'maplibre-gl';
import { Protocol } from 'pmtiles';

let registered = false;

/** MapLibre 6 + pmtiles v4: range-request archives over the `pmtiles://` scheme. */
export function registerPmtilesProtocol(): void {
  if (registered || typeof window === 'undefined') return;
  const protocol = new Protocol();
  addProtocol('pmtiles', (params, abortController) => protocol.tilev4(params, abortController));
  registered = true;
}

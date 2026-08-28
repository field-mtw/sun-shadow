import type { IControl, Map as MapLibreMap } from 'maplibre-gl';

const MAXIMIZE = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
const MINIMIZE = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;

export class FullscreenControl implements IControl {
  private map: MapLibreMap | undefined;
  private container: HTMLDivElement | undefined;
  private button: HTMLButtonElement | undefined;
  private enterLabel: string;
  private exitLabel: string;

  constructor(opts: { enterLabel: string; exitLabel: string }) {
    this.enterLabel = opts.enterLabel;
    this.exitLabel = opts.exitLabel;
  }

  onAdd(map: MapLibreMap) {
    this.map = map;
    const group = document.createElement('div');
    group.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'maplibregl-ctrl-fullscreen';
    button.addEventListener('click', this.toggle);
    group.appendChild(button);
    this.container = group;
    this.button = button;
    document.addEventListener('fullscreenchange', this.sync);
    this.sync();
    return group;
  }

  onRemove() {
    document.removeEventListener('fullscreenchange', this.sync);
    this.container?.remove();
    this.container = undefined;
    this.button = undefined;
    this.map = undefined;
  }

  private toggle = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    document.documentElement.requestFullscreen().catch(() => {});
  };

  private sync = () => {
    if (!this.button) return;
    const active = Boolean(document.fullscreenElement);
    this.button.innerHTML = active ? MINIMIZE : MAXIMIZE;
    this.button.setAttribute('aria-label', active ? this.exitLabel : this.enterLabel);
    this.button.title = active ? this.exitLabel : this.enterLabel;
  };
}

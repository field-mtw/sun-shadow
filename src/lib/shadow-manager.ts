import ShadeMap from 'mapbox-gl-shadow-simulator';
import type { Map as MapLibreMap } from 'maplibre-gl';

export class ShadowManager {
  private shadeMap: any = null;

  constructor() {}

  /**
   * Initializes the shadow simulator with a MapLibre GL map instance
   */
  public initialize(map: MapLibreMap, apiKey: string): void {
    if (this.isInitialized()) {
      this.destroy();
    }

    const terrainSource = {
      tileSize: 256,
      maxZoom: 12,
      getSourceUrl: (params: { x: number; y: number; z: number }) => {
        return `https://api.maptiler.com/tiles/terrain-rgb-v2/${params.z}/${params.x}/${params.y}.webp?key=${apiKey}`;
      },
      getElevation: (params: { r: number; g: number; b: number; a: number }) => {
        return -10000 + ((params.r * 256 * 256 + params.g * 256 + params.b) * 0.1);
      }
    };

    try {
      this.shadeMap = new ShadeMap({
        date: new Date(),
        color: '#01112f',
        opacity: 0.7,
        apiKey,
        terrainSource
      }).addTo(map);
    } catch (error) {
      console.error('Failed to initialize ShadowManager:', error);
    }
  }

  /**
   * Updates the shadow based on a new datetime
   */
  public updateDateTime(date: Date): void {
    if (this.shadeMap && typeof this.shadeMap.setDate === 'function') {
      try {
        this.shadeMap.setDate(date);
      } catch (error) {
        console.error('Failed to update date in ShadowManager:', error);
      }
    }
  }

  /**
   * Sets the shadow opacity
   */
  public setOpacity(opacity: number): void {
    if (this.shadeMap && typeof this.shadeMap.setOpacity === 'function') {
      try {
        this.shadeMap.setOpacity(opacity);
      } catch (error) {
        console.error('Failed to set opacity in ShadowManager:', error);
      }
    }
  }

  /**
   * Sets the shadow color
   */
  public setColor(color: string): void {
    if (this.shadeMap && typeof this.shadeMap.setColor === 'function') {
      try {
        this.shadeMap.setColor(color);
      } catch (error) {
        console.error('Failed to set color in ShadowManager:', error);
      }
    }
  }

  /**
   * Cleans up the shadow manager resources and removes from map
   */
  public destroy(): void {
    if (this.shadeMap && typeof this.shadeMap.remove === 'function') {
      try {
        this.shadeMap.remove();
      } catch (error) {
        console.error('Failed to destroy ShadowManager:', error);
      }
    }
    this.shadeMap = null;
  }

  /**
   * Checks if the manager is currently initialized
   */
  public isInitialized(): boolean {
    return this.shadeMap !== null;
  }
}

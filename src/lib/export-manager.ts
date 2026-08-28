import { pad2 } from './sun-engine';

export function captureMapScreenshot(mapCanvas: HTMLCanvasElement, filename?: string): void {
  try {
    const dataUrl = mapCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    if (!filename) {
      const now = new Date();
      filename = `solaria-scope-${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}.png`;
    }
    link.download = filename;
    link.href = dataUrl;
    link.click();
  } catch (error) {
    console.error('Failed to capture map screenshot:', error);
  }
}

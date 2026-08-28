import { useState, useRef, useEffect } from 'react';

export function useMapInstance() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [center, setCenter] = useState<{lat: number, lng: number}>({lat: 13.7563, lng: 100.5018});
  const [zoom, setZoom] = useState(14);
  const mapRef = useRef<any>(null);

  return { mapRef, isLoaded, setIsLoaded, center, setCenter, zoom, setZoom };
}

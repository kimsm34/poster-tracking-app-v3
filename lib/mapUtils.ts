// lib/mapUtils.ts
import mapboxgl from "mapbox-gl";

export type MarkerData = {
  id: string;
  lng: number;
  lat: number;
  title?: string;
};

export function createMarker(
  map: mapboxgl.Map,
  data: MarkerData,
  onClick: (id: string) => void,
  color: string = "red"
): mapboxgl.Marker {
  const marker = new mapboxgl.Marker({ color })
    .setLngLat([data.lng, data.lat])
    .setPopup(new mapboxgl.Popup().setHTML(`<h3>${data.title || ""}</h3>`))
    .addTo(map);

  marker.getElement().addEventListener("click", (e) => {
    e.stopPropagation();
    onClick(data.id);
  });

  return marker;
}

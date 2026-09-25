import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Vite can't resolve Leaflet's default marker images, so point at a CDN copy.
const base = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/';
L.Icon.Default.mergeOptions({
  iconUrl: base + 'marker-icon.png',
  iconRetinaUrl: base + 'marker-icon-2x.png',
  shadowUrl: base + 'marker-shadow.png',
});

const dot = (color) =>
  L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 0 0 2px ${color}"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
const icons = { pickup: dot('#0e7c66'), drop: dot('#c8452d'), car: dot('#f0a202') };

function Clicks({ onPick }) {
  useMapEvents({ click: (e) => onPick?.({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function Fly({ to }) {
  const map = useMap();
  useEffect(() => {
    if (to) map.flyTo([to.lat, to.lng], Math.max(map.getZoom(), 14));
  }, [to?.lat, to?.lng]);
  return null;
}

// markers: [{ key: 'pickup' | 'drop' | 'car', pos: {lat,lng} | null }]
export default function MapView({ onPick, markers = [], fly }) {
  return (
    <div className="map-wrap">
      <MapContainer center={[12.9716, 77.5946]} zoom={12} className="map">
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Clicks onPick={onPick} />
        <Fly to={fly} />
        {markers.filter((m) => m.pos).map((m) => (
          <Marker key={m.key} position={[m.pos.lat, m.pos.lng]} icon={icons[m.key]} />
        ))}
      </MapContainer>
    </div>
  );
}

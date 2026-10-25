import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
export default function LocationMap({ points = [], approximate = false }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const container = useRef(null);
  const pointKey = JSON.stringify(
    points.filter((point) => point.location?.coordinates?.length === 2),
  );
  useEffect(() => {
    const data = JSON.parse(pointKey);
    if (!open || !data.length) return;
    let disposed = false;
    let map;
    import('leaflet')
      .then((module) => {
        if (disposed) return;
        const L = module.default || module;
        map = L.map(container.current, { scrollWheelZoom: false });
        L.tileLayer(
          import.meta.env.VITE_OSM_TILES_URL ||
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          {
            maxZoom: 19,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            referrerPolicy: 'strict-origin-when-cross-origin',
            updateWhenIdle: true,
            keepBuffer: 1,
          },
        )
          .on('tileerror', () =>
            setMessage(
              'Some map tiles could not load. Use the written locations instead.',
            ),
          )
          .addTo(map);
        const locations = data.map((point, index) => {
          const [lng, lat] = point.location.coordinates;
          const label = document.createElement('span');
          label.textContent = point.label;
          L.circleMarker([lat, lng], {
            radius: 7,
            color: index === 0 ? '#174d38' : '#c96a3d',
            fillOpacity: 0.8,
          })
            .bindPopup(label)
            .addTo(map);
          return [lat, lng];
        });
        map.fitBounds(L.latLngBounds(locations).pad(0.25), {
          maxZoom: approximate ? 12 : 15,
        });
      })
      .catch(() =>
        setMessage(
          'The optional map is unavailable. Written locations remain available.',
        ),
      );
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [open, pointKey, approximate]);
  if (JSON.parse(pointKey).length === 0)
    return (
      <p className="field-hint map-missing">
        No map coordinates are available. Collection details are shared with
        confirmed participants; direct handover remains available.
      </p>
    );
  return (
    <section className="map-panel">
      <div className="map-panel-header">
        <div>
          <strong>
            {approximate ? 'Approximate area map' : 'Participant location map'}
          </strong>
          <p>
            {approximate
              ? 'Area markers are rounded; they are not exact collection points.'
              : 'Only locations authorized for your current workflow are displayed.'}
          </p>
        </div>
        <button
          className="button button-outline"
          onClick={() => {
            setMessage('');
            setOpen(!open);
          }}
        >
          {open ? 'Hide map' : 'Show optional map'}
        </button>
      </div>
      {!open && (
        <p className="field-hint">
          Opening the map requests visible map tiles from OpenStreetMap. No
          offline download or prefetch is used.
        </p>
      )}
      {open && (
        <>
          <div
            className="location-map"
            ref={container}
            role="region"
            aria-label="Location map"
          />
          <p className="field-hint">
            {message ||
              'Straight-line locations only. No road route or travel-time calculation.'}{' '}
            <a
              href="https://www.openstreetmap.org/fixthemap"
              target="_blank"
              rel="noopener noreferrer"
            >
              Report a map issue
            </a>
          </p>
        </>
      )}
    </section>
  );
}

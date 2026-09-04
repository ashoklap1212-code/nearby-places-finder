import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, Polyline, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

type Location = { lat: number; lng: number };
type Place = { id: string; name: string; lat: number; lon: number; address: string; distance: number };
type SortMode = "distance" | "name";
const DEFAULT_POSITION: [number, number] = [13.0827, 80.2707];
const SAVED_PLACES_KEY = "nearby-places-saved";

function ChangeMapView({ location, selectedPlace }: { location: Location; selectedPlace: Place | null }) {
  const map = useMap();
  useEffect(() => {
    const target: [number, number] = selectedPlace ? [selectedPlace.lat, selectedPlace.lon] : [location.lat, location.lng];
    map.flyTo(target, selectedPlace ? 16 : 15, { duration: 0.65 });
  }, [location, map, selectedPlace]);
  return null;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function placeId(lat: number, lon: number, name: string) { return `${lat.toFixed(5)}-${lon.toFixed(5)}-${name.toLowerCase()}`; }

function App() {
  const [location, setLocation] = useState<Location | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [savedPlaces, setSavedPlaces] = useState<Place[]>(() => {
    try { return JSON.parse(localStorage.getItem(SAVED_PLACES_KEY) ?? "[]") as Place[]; } catch { return []; }
  });
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [radius, setRadius] = useState(10);
  const [sortMode, setSortMode] = useState<SortMode>("distance");
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [route, setRoute] = useState<[number, number][]>([]);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const [message, setMessage] = useState("Choose a category or search for a place after setting your location.");

  useEffect(() => { localStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(savedPlaces)); }, [savedPlaces]);
  const visiblePlaces = useMemo(() => places.filter((place) => place.distance <= radius).sort((a, b) => sortMode === "distance" ? a.distance - b.distance : a.name.localeCompare(b.name)), [places, radius, sortMode]);
  const clearRoute = () => { setRoute([]); setSelectedPlace(null); setRouteDistance(null); setRouteDuration(null); };

  const getMyLocation = () => {
    if (!navigator.geolocation) { setMessage("Location services are not supported by this browser."); return; }
    setLoading(true); setMessage("Finding your location…");
    navigator.geolocation.getCurrentPosition((position) => {
      setLocation({ lat: position.coords.latitude, lng: position.coords.longitude }); clearRoute(); setMessage("Location found. Pick a category or search for something nearby."); setLoading(false);
    }, () => { setMessage("We could not access your location. Check browser permissions and try again."); setLoading(false); }, { enableHighAccuracy: true, timeout: 10000 });
  };
  const setSearchResults = (results: Place[], label: string) => { setPlaces(results); clearRoute(); setMessage(results.length ? `${results.length} ${label} found. Showing ${results.filter((place) => place.distance <= radius).length} within ${radius} km.` : `No ${label} found nearby. Try a broader search.`); };

  const searchNearbyPlaces = async (category: string) => {
    if (!location) { setMessage("Set your location before searching nearby places."); return; }
    setLoading(true); setMessage(`Searching for ${category}s…`);
    try {
      const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(category)}&lat=${location.lat}&lon=${location.lng}&limit=30`);
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      const data: { features?: Array<{ geometry?: { coordinates?: unknown[] }; properties?: Record<string, unknown> }> } = await response.json();
      const results = (data.features ?? []).map((feature): Place | null => {
        const coordinates = feature.geometry?.coordinates; if (!coordinates || coordinates.length < 2) return null;
        const lon = Number(coordinates[0]); const lat = Number(coordinates[1]); if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
        const props = feature.properties ?? {}; const name = String(props.name ?? `${category} place`);
        return { id: placeId(lat, lon, name), name, lat, lon, address: [props.street, props.city, props.state].filter(Boolean).join(", ") || "Address not available", distance: calculateDistance(location.lat, location.lng, lat, lon) };
      }).filter((place): place is Place => place !== null);
      setSearchResults(results, category);
    } catch (error) { console.error("Nearby places error:", error); setMessage("Unable to find places right now. Please try again."); } finally { setLoading(false); }
  };
  const searchCustomPlace = async () => {
    if (!location) { setMessage("Set your location before searching."); return; }
    const query = searchText.trim(); if (!query) { setMessage("Enter a place, business, or address to search."); return; }
    setLoading(true); setMessage(`Searching for “${query}”…`);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=20&q=${encodeURIComponent(query)}&lat=${location.lat}&lon=${location.lng}`);
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      const data: Array<{ lat: string; lon: string; display_name?: string }> = await response.json();
      const results = data.map((item): Place | null => {
        const lat = Number(item.lat); const lon = Number(item.lon); if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
        const address = item.display_name ?? "Address not available"; const name = address.split(",")[0] || "Unnamed place";
        return { id: placeId(lat, lon, name), name, lat, lon, address, distance: calculateDistance(location.lat, location.lng, lat, lon) };
      }).filter((place): place is Place => place !== null);
      setSearchResults(results, "matches");
    } catch (error) { console.error("Search error:", error); setMessage("Search failed. Please try again."); } finally { setLoading(false); }
  };
  const getDirections = async (place: Place) => {
    if (!location) return;
    setLoading(true); setSelectedPlace(place); setMessage(`Getting directions to ${place.name}…`);
    try {
      const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${location.lng},${location.lat};${place.lon},${place.lat}?overview=full&geometries=geojson`);
      if (!response.ok) throw new Error("Route request failed");
      const data: { routes?: Array<{ distance: number; duration: number; geometry: { coordinates: [number, number][] } }> } = await response.json(); const selectedRoute = data.routes?.[0]; if (!selectedRoute) throw new Error("Route not found");
      setRoute(selectedRoute.geometry.coordinates.map(([lon, lat]) => [lat, lon])); setRouteDistance(selectedRoute.distance / 1000); setRouteDuration(selectedRoute.duration / 60); setMessage(`Route ready to ${place.name}.`);
    } catch (error) { console.error("Directions error:", error); setMessage("Unable to find a driving route to that place."); } finally { setLoading(false); }
  };
  const toggleSaved = (place: Place) => setSavedPlaces((current) => current.some((saved) => saved.id === place.id) ? current.filter((saved) => saved.id !== place.id) : [...current, place]);
  const isSaved = (place: Place) => savedPlaces.some((saved) => saved.id === place.id);
  const clearResults = () => { setPlaces([]); clearRoute(); setMessage("Results cleared. Search again whenever you’re ready."); };

  return <div className="app">
    <header className="intro"><p className="eyebrow">Local discovery, simplified</p><h1>Nearby Places Finder</h1><p>Find useful places around you, compare distance, save favourites, and get a driving route.</p></header>
    <section className="controls" aria-label="Place search controls"><button className="location-btn" onClick={getMyLocation} disabled={loading}>{loading ? "Working…" : "Use my location"}</button><div className="search-box"><input type="search" placeholder="Search places, businesses, addresses…" value={searchText} onChange={(event) => setSearchText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void searchCustomPlace(); }} /><button onClick={() => void searchCustomPlace()} disabled={loading}>Search</button></div><div className="categories"><span>Quick search</span>{["restaurant", "hospital", "atm", "fuel", "cafe"].map((category) => <button key={category} onClick={() => void searchNearbyPlaces(category)} disabled={loading}>{category}</button>)}</div><div className="filters"><label>Within <select value={radius} onChange={(event) => setRadius(Number(event.target.value))}><option value={2}>2 km</option><option value={5}>5 km</option><option value={10}>10 km</option><option value={25}>25 km</option><option value={100}>100 km</option></select></label><label>Sort <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}><option value="distance">Closest first</option><option value="name">Name A–Z</option></select></label>{places.length > 0 && <button className="text-button" onClick={clearResults}>Clear results</button>}</div></section>
    <p className="status" role="status">{message}</p>
    <MapContainer center={DEFAULT_POSITION} zoom={13} style={{ height: "500px", width: "100%" }}><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />{location && <><ChangeMapView location={location} selectedPlace={selectedPlace} /><Marker position={[location.lat, location.lng]}><Popup><strong>You are here</strong><br />{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</Popup></Marker></>}{route.length > 0 && <Polyline positions={route} pathOptions={{ color: "#25644d", weight: 5 }} />}{visiblePlaces.map((place) => <Marker key={place.id} position={[place.lat, place.lon]}><Popup><strong>{place.name}</strong><br />{place.address}<br /><strong>{place.distance.toFixed(2)} km away</strong><br /><button onClick={() => void getDirections(place)}>Directions</button></Popup></Marker>)}</MapContainer>
    {selectedPlace && routeDistance !== null && <section className="route-info"><div><p className="eyebrow">Driving route</p><h2>{selectedPlace.name}</h2></div><p><strong>{routeDistance.toFixed(2)} km</strong> · about {Math.round(routeDuration ?? 0)} min</p><button onClick={clearRoute}>Clear route</button></section>}
    {places.length > 0 && <section className="places-list"><div className="list-heading"><div><p className="eyebrow">Results</p><h2>{visiblePlaces.length} places within {radius} km</h2></div></div>{visiblePlaces.length === 0 ? <p className="empty-state">No results fall within this distance. Increase the search radius to see more.</p> : visiblePlaces.map((place) => <article className={`place-card ${selectedPlace?.id === place.id ? "selected" : ""}`} key={place.id}><div><h3>{place.name}</h3><p>{place.address}</p></div><strong className="distance">{place.distance.toFixed(2)} km</strong><div className="card-actions"><button className="save-button" onClick={() => toggleSaved(place)} aria-pressed={isSaved(place)}>{isSaved(place) ? "Saved" : "Save"}</button><button onClick={() => void getDirections(place)}>Directions</button></div></article>)}</section>}
    {savedPlaces.length > 0 && <section className="saved-list"><div><p className="eyebrow">Saved places</p><h2>Your shortlist ({savedPlaces.length})</h2></div><div className="saved-chips">{savedPlaces.map((place) => <button key={place.id} onClick={() => { setSelectedPlace(place); setMessage(`Showing ${place.name} on the map.`); }}>{place.name}<span onClick={(event) => { event.stopPropagation(); toggleSaved(place); }} role="button" aria-label={`Remove ${place.name} from saved places`}> ×</span></button>)}</div></section>}
  </div>;
}
export default App;

import { useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";
import "./App.css";

type Location = {
  lat: number;
  lng: number;
};

type Place = {
  id: number;
  name: string;
  lat: number;
  lon: number;
  address: string;
  distance?: number;
};

function ChangeMapView({ location }: { location: Location }) {
  const map = useMap();

  map.setView([location.lat, location.lng], 15);

  return null;
}

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function App() {
  const [location, setLocation] =
    useState<Location | null>(null);

  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");

  const [selectedPlace, setSelectedPlace] =
    useState<Place | null>(null);

  const [route, setRoute] = useState<
    [number, number][]
  >([]);

  const [routeDistance, setRouteDistance] =
    useState<number | null>(null);

  const [routeDuration, setRouteDuration] =
    useState<number | null>(null);

  // Get current location
  const getMyLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    setLoading(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });

        setLoading(false);
      },
      () => {
        alert(
          "Unable to get your location. Please allow location access."
        );

        setLoading(false);
      }
    );
  };

  // Search nearby places using Photon
  const searchNearbyPlaces = async (category: string) => {
    if (!location) {
      alert("First click My Location.");
      return;
    }

    setLoading(true);
    setPlaces([]);
    setRoute([]);
    setSelectedPlace(null);

    try {
      const response = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(
          category
        )}&lat=${location.lat}&lon=${location.lng}&limit=30`
      );

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();

      const results: Place[] = data.features
        .map((feature: any, index: number) => {
          const coordinates = feature.geometry?.coordinates;

          if (!coordinates || coordinates.length < 2) {
            return null;
          }

          const properties = feature.properties || {};

          const lat = Number(coordinates[1]);
          const lon = Number(coordinates[0]);

          const distance = calculateDistance(
            location.lat,
            location.lng,
            lat,
            lon
          );

          return {
            id: index,
            name: properties.name || `${category} place`,
            lat,
            lon,
            address: [
              properties.street,
              properties.city,
              properties.state,
            ]
              .filter(Boolean)
              .join(", ") || "Address not available",
            distance,
          };
        })
        .filter(
          (place: Place | null): place is Place =>
            place !== null &&
            !isNaN(place.lat) &&
            !isNaN(place.lon)
        )
        .sort(
          (a: Place, b: Place) =>
            (a.distance ?? 999) -
            (b.distance ?? 999)
        );

      setPlaces(results);

      if (results.length === 0) {
        alert(`No ${category} found nearby.`);
      }
    } catch (error) {
      console.error("Nearby places error:", error);
      alert("Unable to find places. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Custom search
  const searchCustomPlace = async () => {
    if (!location) {
      alert("First click My Location.");
      return;
    }

    if (!searchText.trim()) {
      alert("Enter a place to search.");
      return;
    }

    setLoading(true);
    setPlaces([]);
    setRoute([]);
    setSelectedPlace(null);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=10&q=${encodeURIComponent(
          searchText
        )}&lat=${location.lat}&lon=${location.lng}`
      );

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();

      const results: Place[] = data
        .map((item: any, index: number) => {
          const lat = Number(item.lat);
          const lon = Number(item.lon);

          const distance = calculateDistance(
            location.lat,
            location.lng,
            lat,
            lon
          );

          return {
            id: index,
            name: item.display_name
              ? item.display_name.split(",")[0]
              : "Unnamed Place",
            lat,
            lon,
            address:
              item.display_name || "Address not available",
            distance,
          };
        })
        .filter(
          (place: Place) =>
            !isNaN(place.lat) &&
            !isNaN(place.lon)
        )
        .sort(
          (a: Place, b: Place) =>
            (a.distance ?? 999) -
            (b.distance ?? 999)
        );

      setPlaces(results);

      if (results.length === 0) {
        alert("No places found.");
      }
    } catch (error) {
      console.error("Search error:", error);
      alert("Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Get route from current location to selected place
  const getDirections = async (place: Place) => {
    if (!location) {
      alert("First click My Location.");
      return;
    }

    setLoading(true);
    setSelectedPlace(place);

    try {
      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${location.lng},${location.lat};` +
        `${place.lon},${place.lat}` +
        `?overview=full&geometries=geojson`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Route request failed");
      }

      const data = await response.json();

      if (!data.routes || data.routes.length === 0) {
        alert("Route not found.");
        return;
      }

      const selectedRoute = data.routes[0];

      const routeCoordinates: [number, number][] =
        selectedRoute.geometry.coordinates.map(
          (coordinate: [number, number]) => [
            coordinate[1],
            coordinate[0],
          ]
        );

      setRoute(routeCoordinates);

      setRouteDistance(
        selectedRoute.distance / 1000
      );

      setRouteDuration(
        selectedRoute.duration / 60
      );
    } catch (error) {
      console.error("Directions error:", error);
      alert("Unable to find route.");
    } finally {
      setLoading(false);
    }
  };

  const clearRoute = () => {
    setRoute([]);
    setSelectedPlace(null);
    setRouteDistance(null);
    setRouteDuration(null);
  };

  const defaultPosition: [number, number] = [
    13.0827,
    80.2707,
  ];

  return (
    <div className="app">
      <h1>📍 Nearby Places Finder</h1>

      <div className="controls">
        <button
          className="location-btn"
          onClick={getMyLocation}
        >
          {loading ? "Loading..." : "📍 My Location"}
        </button>

        <div className="search-box">
          <input
            type="text"
            placeholder="Search places..."
            value={searchText}
            onChange={(e) =>
              setSearchText(e.target.value)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                searchCustomPlace();
              }
            }}
          />

          <button onClick={searchCustomPlace}>
            🔎 Search
          </button>
        </div>

        <div className="categories">
          <button
            onClick={() =>
              searchNearbyPlaces("restaurant")
            }
          >
            🍔 Restaurant
          </button>

          <button
            onClick={() =>
              searchNearbyPlaces("hospital")
            }
          >
            🏥 Hospital
          </button>

          <button
            onClick={() =>
              searchNearbyPlaces("atm")
            }
          >
            🏧 ATM
          </button>

          <button
            onClick={() =>
              searchNearbyPlaces("fuel")
            }
          >
            ⛽ Petrol
          </button>

          <button
            onClick={() =>
              searchNearbyPlaces("cafe")
            }
          >
            ☕ Cafe
          </button>
        </div>
      </div>

      {/* Map */}
      <MapContainer
        center={defaultPosition}
        zoom={13}
        style={{
          height: "500px",
          width: "100%",
        }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {location && (
          <>
            <ChangeMapView location={location} />

            <Marker
              position={[
                location.lat,
                location.lng,
              ]}
            >
              <Popup>
                📍 <strong>You are here!</strong>
                <br />
                Latitude: {location.lat.toFixed(5)}
                <br />
                Longitude: {location.lng.toFixed(5)}
              </Popup>
            </Marker>
          </>
        )}

        {/* Route line */}
        {route.length > 0 && (
          <Polyline
            positions={route}
            pathOptions={{
              color: "blue",
              weight: 5,
            }}
          />
        )}

        {/* Place markers */}
        {places.map((place) => (
          <Marker
            key={place.id}
            position={[place.lat, place.lon]}
          >
            <Popup>
              <strong>{place.name}</strong>
              <br />
              {place.address}
              <br />
              📏{" "}
              <strong>
                {place.distance?.toFixed(2)} KM
              </strong>{" "}
              away
              <br />
              <button
                onClick={() => getDirections(place)}
              >
                🧭 Get Directions
              </button>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Route details */}
      {selectedPlace && routeDistance !== null && (
        <div className="route-info">
          <h2>🧭 Route Details</h2>

          <p>
            <strong>Destination:</strong>{" "}
            {selectedPlace.name}
          </p>

          <p>
            📏 Distance:{" "}
            <strong>
              {routeDistance.toFixed(2)} KM
            </strong>
          </p>

          <p>
            ⏱️ Estimated time:{" "}
            <strong>
              {Math.round(routeDuration ?? 0)} minutes
            </strong>
          </p>

          <button onClick={clearRoute}>
            Clear Route
          </button>
        </div>
      )}

      {/* Places list */}
      {places.length > 0 && (
        <div className="places-list">
          <h2>
            Nearby Places ({places.length})
          </h2>

          {places.map((place) => (
            <div
              className="place-card"
              key={place.id}
            >
              <h3>📍 {place.name}</h3>

              <p>{place.address}</p>

              <p>
                📏{" "}
                <strong>
                  {place.distance?.toFixed(2)} KM
                </strong>{" "}
                away
              </p>

              <button
                onClick={() => getDirections(place)}
              >
                🧭 Get Directions
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
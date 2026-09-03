import { useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
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
};

function ChangeMapView({ location }: { location: Location }) {
  const map = useMap();

  map.setView([location.lat, location.lng], 15);

  return null;
}

function App() {
  const [location, setLocation] = useState<Location | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");

  // ==============================
  // GET CURRENT LOCATION
  // ==============================

  const getMyLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    setLoading(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setLocation(newLocation);
        setLoading(false);
      },
      () => {
        alert("Unable to get your location. Please allow location access.");
        setLoading(false);
      }
    );
  };

  // ==============================
  // SEARCH NEARBY CATEGORY
  // ==============================
const searchNearbyPlaces = async (category: string) => {
  if (!location) {
    alert("First click My Location.");
    return;
  }

  setLoading(true);
  setPlaces([]);

  try {
    const response = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(
        category
      )}&lat=${location.lat}&lon=${location.lng}&limit=10`
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

        return {
          id: index,
          name:
            properties.name ||
            `${category} place`,
          lat: Number(coordinates[1]),
          lon: Number(coordinates[0]),
          address: [
            properties.street,
            properties.city,
            properties.state,
          ]
            .filter(Boolean)
            .join(", ") || "Address not available",
        };
      })
      .filter(Boolean);

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

  // ==============================
  // CUSTOM SEARCH
  // ==============================

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

    try {
      const query = encodeURIComponent(searchText);

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=10&q=${query}&lat=${location.lat}&lon=${location.lng}`
      );

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();

      const results: Place[] = data.map(
        (item: any, index: number) => ({
          id: index,
          name: item.display_name
            ? item.display_name.split(",")[0]
            : "Unnamed Place",
          lat: Number(item.lat),
          lon: Number(item.lon),
          address: item.display_name || "Address not available",
        })
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

  // ==============================
  // DEFAULT MAP POSITION
  // ==============================

  const defaultPosition: [number, number] = [
    13.0827,
    80.2707,
  ];

  // ==============================
  // UI
  // ==============================

  return (
    <div className="app">

      <h1>📍 Nearby Places Finder</h1>

      <div className="controls">

        {/* MY LOCATION */}

        <button
          className="location-btn"
          onClick={getMyLocation}
        >
          {loading ? "Loading..." : "📍 My Location"}
        </button>

        {/* SEARCH */}

        <div className="search-box">

          <input
            type="text"
            placeholder="Search places..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
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

        {/* CATEGORIES */}

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

      {/* MAP */}

      <MapContainer
        center={defaultPosition}
        zoom={13}
        style={{
          height: "500px",
          width: "100%",
        }}
      >

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* CURRENT LOCATION */}

        {location && (
          <>
            <ChangeMapView
              location={location}
            />

            <Marker
              position={[
                location.lat,
                location.lng,
              ]}
            >
              <Popup>

                📍 <strong>You are here!</strong>

                <br />

                Latitude:{" "}
                {location.lat.toFixed(5)}

                <br />

                Longitude:{" "}
                {location.lng.toFixed(5)}

              </Popup>
            </Marker>
          </>
        )}

        {/* PLACE MARKERS */}

        {places.map((place) => (
          <Marker
            key={place.id}
            position={[
              place.lat,
              place.lon,
            ]}
          >
            <Popup>

              <strong>
                {place.name}
              </strong>

              <br />

              {place.address}

            </Popup>
          </Marker>
        ))}

      </MapContainer>

      {/* PLACES LIST */}

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

              <h3>
                📍 {place.name}
              </h3>

              <p>
                {place.address}
              </p>

            </div>
          ))}

        </div>
      )}

    </div>
  );
}

export default App;
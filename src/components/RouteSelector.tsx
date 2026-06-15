"use client";

import { useState, useEffect, useCallback } from "react";
import { GoogleMap, useJsApiLoader, Polyline, Marker, InfoWindow } from "@react-google-maps/api";

interface RouteSelectorProps {
  from: { lat: number; lng: number; name: string };
  to: { lat: number; lng: number; name: string };
  onRouteSelect: (geometry: { coordinates: number[][] }) => void;
  onClose: () => void;
}

const mapContainerStyle = {
  width: "100%",
  height: "400px",
  borderRadius: "12px",
};

const defaultCenter = {
  lat: 17.44,
  lng: 78.45,
};

const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: true,
};

const colors = ["#6675FF", "#FF6B6B", "#4ECDC4", "#95E1D3", "#F38181"];

export default function RouteSelector({
  from,
  to,
  onRouteSelect,
  onClose,
}: RouteSelectorProps) {
  const [routes, setRoutes] = useState<any[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number>(-1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
  });

  useEffect(() => {
    async function fetchRoutes() {
      if (!from?.lat || !to?.lat) return;
      
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/routes/alternatives?fromLat=${from.lat}&fromLng=${from.lng}&toLat=${to.lat}&toLng=${to.lng}`
        );

        if (!response.ok) throw new Error("Failed to fetch routes");

        const data = await response.json();
        
        if (data.routes && data.routes.length > 0) {
          setRoutes(data.routes);
          if (data.routes.length === 1) {
            setSelectedRouteIndex(0);
          }
        } else {
          setError("No routes found");
        }
      } catch (err) {
        console.error("Error fetching routes:", err);
        setError("Could not load alternative routes");
      } finally {
        setLoading(false);
      }
    }

    if (isLoaded) {
      fetchRoutes();
    }
  }, [from, to, isLoaded]);

  const handleRouteClick = (index: number) => {
    setSelectedRouteIndex(index);
  };

  const handleConfirm = () => {
    if (selectedRouteIndex >= 0 && routes[selectedRouteIndex]) {
      const geometry = routes[selectedRouteIndex].geometry;
      onRouteSelect(geometry);
    }
  };

  const fitBounds = useCallback(() => {
    if (!map || !from?.lat || !to?.lat) return;

    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: from.lat, lng: from.lng });
    bounds.extend({ lat: to.lat, lng: to.lng });
    
    routes.forEach((route) => {
      if (route.geometry?.coordinates) {
        route.geometry.coordinates.forEach((coord: number[]) => {
          bounds.extend({ lat: coord[1], lng: coord[0] });
        });
      }
    });

    map.fitBounds(bounds, 50);
  }, [map, from, to, routes]);

  useEffect(() => {
    if (map && routes.length > 0) {
      fitBounds();
    }
  }, [map, routes, fitBounds]);

  if (loadError) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-xl">
        <div className="text-center text-red-500">Error loading map</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-xl max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Select Your Route</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Select the route you usually take from <strong>{from?.name}</strong> to <strong>{to?.name}</strong>
      </p>

      {loading ? (
        <div className="h-[400px] flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#6675FF]"></div>
        </div>
      ) : error ? (
        <div className="h-[400px] flex items-center justify-center text-red-500">
          {error}
        </div>
      ) : (
        <>
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={defaultCenter}
            zoom={12}
            options={mapOptions}
            onLoad={(mapInstance) => setMap(mapInstance)}
          >
            {/* Start marker */}
            <Marker
              position={{ lat: from.lat, lng: from.lng }}
              label={{ text: "A", color: "white" }}
            />
            
            {/* End marker */}
            <Marker
              position={{ lat: to.lat, lng: to.lng }}
              label={{ text: "B", color: "white" }}
            />

            {/* Route polylines */}
            {routes.map((route, index) => {
              const path = route.geometry.coordinates.map(
                (coord: number[]) => ({ lat: coord[1], lng: coord[0] })
              );
              
              const isSelected = index === selectedRouteIndex;
              const isHovered = index !== selectedRouteIndex;

              return (
                <Polyline
                  key={index}
                  path={path}
                  options={{
                    strokeColor: isSelected ? colors[index % colors.length] : "#ccc",
                    strokeOpacity: isSelected ? 1 : 0.4,
                    strokeWeight: isSelected ? 5 : 3,
                  }}
                  onClick={() => handleRouteClick(index)}
                />
              );
            })}
          </GoogleMap>

          {/* Route options list */}
          <div className="mt-4 space-y-2 max-h-[150px] overflow-y-auto">
            {routes.map((route, index) => (
              <button
                key={index}
                onClick={() => handleRouteClick(index)}
                className={`w-full p-3 rounded-xl text-left transition-all flex items-center gap-3 ${
                  selectedRouteIndex === index
                    ? "bg-[#6675FF]/10 border-2 border-[#6675FF]"
                    : "bg-gray-50 border-2 border-transparent hover:border-gray-200"
                }`}
              >
                <div
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: colors[index % colors.length] }}
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">
                    Route {index + 1}
                  </p>
                  <p className="text-xs text-gray-500">
                    {(route.distance / 1000).toFixed(1)} km • {Math.round(route.duration / 60)} min
                  </p>
                </div>
                {selectedRouteIndex === index && (
                  <svg className="w-5 h-5 text-[#6675FF]" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={selectedRouteIndex < 0}
          className={`flex-1 py-3 font-medium rounded-xl transition-colors ${
            selectedRouteIndex >= 0
              ? "bg-[#6675FF] text-white hover:bg-[#5565e6]"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          Confirm Route
        </button>
      </div>
    </div>
  );
}

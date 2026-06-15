"use client";

import { useState, useEffect, useRef } from "react";

interface LocationInputProps {
  value: string;
  onChange: (value: string) => void;
  onLocationSelect?: (location: {
    address: string;
    lat: number;
    lng: number;
  }) => void;
  placeholder: string;
  icon?: "start" | "end";
  required?: boolean;
  showCurrentLocation?: boolean;
  error?: string;
}

interface SearchResult {
  place_id: string | number;
  display_name: string;
  lat?: string;
  lon?: string;
  main_text?: string;
  secondary_text?: string;
}

export default function LocationInput({
  value,
  onChange,
  onLocationSelect,
  placeholder,
  icon = "start",
  required = false,
  showCurrentLocation = true,
  error,
}: LocationInputProps) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search for locations using our API route (avoids CORS issues)
  const searchLocations = async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    setShowSuggestions(true);
    setHasSearched(true);

    try {
      console.log("Searching for:", query);

      const response = await fetch(
        `/api/locations/search?q=${encodeURIComponent(query)}`,
      );

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data: SearchResult[] = await response.json();
      console.log("Search results:", data);
      setSuggestions(data);
    } catch (error) {
      console.error("Error searching locations:", error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    console.log("Input changed:", newValue);
    setInputValue(newValue);
    onChange(newValue);
    setLocationError(null);

    // Debounce search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      console.log("Debounce triggered, searching:", newValue);
      searchLocations(newValue);
    }, 300);
  };

  const handleSelectSuggestion = async (suggestion: SearchResult) => {
    // Clean up the display name (remove country at the end)
    const cleanName = suggestion.display_name
      .split(", ")
      .slice(0, -1)
      .join(", ");

    setInputValue(cleanName);
    onChange(cleanName);
    setSuggestions([]);
    setShowSuggestions(false);

    // If we have lat/lng already (from Nominatim), use them
    if (suggestion.lat && suggestion.lon) {
      onLocationSelect?.({
        address: cleanName,
        lat: parseFloat(suggestion.lat),
        lng: parseFloat(suggestion.lon),
      });
    } 
    // Otherwise, geocode the place_id (from Google Places)
    else if (suggestion.place_id && typeof suggestion.place_id === 'string') {
      try {
        const response = await fetch(
          `/api/locations/geocode?place_id=${encodeURIComponent(suggestion.place_id)}`
        );

        if (response.ok) {
          const geocodeData = await response.json();
          onLocationSelect?.({
            address: cleanName,
            lat: geocodeData.lat,
            lng: geocodeData.lng,
          });
        }
      } catch (error) {
        console.error("Geocoding failed:", error);
      }
    }
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      return;
    }

    setIsGettingLocation(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        try {
          // Use our API route for reverse geocoding (avoids CORS)
          const response = await fetch(
            `/api/locations/reverse?lat=${latitude}&lon=${longitude}`,
          );

          if (!response.ok) {
            throw new Error("Failed to get address");
          }

          const data = await response.json();

          if (data.display_name) {
            // Clean up the display name
            const cleanName = data.display_name
              .split(", ")
              .slice(0, -1)
              .join(", ");
            setInputValue(cleanName);
            onChange(cleanName);
            
            // Provide lat/lng to parent
            onLocationSelect?.({
              address: cleanName,
              lat: latitude,
              lng: longitude,
            });
          } else if (data.error) {
            // API returned an error
            console.error("Reverse geocoding API error:", data.error);
            const coordString = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            setInputValue(coordString);
            onChange(coordString);
          } else {
            const coordString = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            setInputValue(coordString);
            onChange(coordString);
          }
        } catch (error) {
          console.error("Error getting address:", error);
          const coordString = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
          setInputValue(coordString);
          onChange(coordString);
          
          // Provide lat/lng to parent
          onLocationSelect?.({
            address: coordString,
            lat: latitude,
            lng: longitude,
          });
            
            // Provide lat/lng to parent
            onLocationSelect?.({
              address: coordString,
              lat: latitude,
              lng: longitude,
            });
        } finally {
          setIsGettingLocation(false);
        }
      },
      (error) => {
        setIsGettingLocation(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError("Please allow location access in your browser");
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError("Location information unavailable");
            break;
          case error.TIMEOUT:
            setLocationError("Location request timed out");
            break;
          default:
            setLocationError("Unable to get your location");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  };

  return (
    <div className="space-y-1" ref={wrapperRef}>
      <div className="relative">
        {/* Location Icon */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none z-10">
          <svg
            className={`w-5 h-5 ${icon === "end" ? "text-[#6675FF]" : "text-gray-400"}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </div>

        {/* Input */}
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          placeholder={placeholder}
          className={`w-full pl-12 pr-28 py-3.5 border-2 rounded-2xl bg-white/50 text-[#171717] placeholder-gray-400 focus:outline-none focus:bg-white transition-all duration-300 focus:shadow-lg ${error ? "border-red-400 focus:border-red-400 focus:shadow-red-100/50" : "border-gray-200 focus:border-[#6675FF] focus:shadow-[#6675FF]/10"}`}
          required={required}
          autoComplete="off"
        />

        {/* Current Location Button - More visible */}
        {showCurrentLocation && (
          <button
            type="button"
            onClick={getCurrentLocation}
            disabled={isGettingLocation}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-[#6675FF]/10 hover:bg-[#6675FF]/20 border border-[#6675FF]/30 transition-all disabled:opacity-50 group flex items-center gap-1.5"
            title="Use current location"
          >
            {isGettingLocation ? (
              <>
                <svg
                  className="w-4 h-4 text-[#6675FF] animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <span className="text-xs text-[#6675FF] font-medium">
                  Locating...
                </span>
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4 text-[#6675FF]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <circle cx="12" cy="12" r="3" strokeWidth={2} />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 2v3m0 14v3M2 12h3m14 0h3"
                  />
                </svg>
                <span className="text-xs text-[#6675FF] font-medium hidden sm:inline">
                  Current
                </span>
              </>
            )}
          </button>
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute right-14 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-[#6675FF] rounded-full animate-spin"></div>
          </div>
        )}

        {/* Suggestions Dropdown */}
        {showSuggestions && (isLoading || hasSearched) && (
          <div className="absolute z-50 w-full mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-4 text-center text-gray-500 text-sm flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-[#6675FF] rounded-full animate-spin"></div>
                Searching...
              </div>
            ) : suggestions.length === 0 ? (
              <div className="px-4 py-4 text-center text-gray-500 text-sm">
                No locations found. Try a different search or use current
                location.
              </div>
            ) : (
              suggestions.map((suggestion) => (
                <button
                  key={suggestion.place_id}
                  type="button"
                  onClick={() => handleSelectSuggestion(suggestion)}
                  className="w-full px-4 py-3 text-left hover:bg-[#6675FF]/5 transition-colors border-b border-gray-50 last:border-b-0 flex items-start gap-3"
                >
                  <svg
                    className="w-5 h-5 text-[#6675FF] mt-0.5 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <span className="text-sm text-gray-700 line-clamp-2">
                    {suggestion.display_name}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Error message */}
      {(locationError || error) && (
        <p className="text-xs text-red-500 ml-1">{locationError || error}</p>
      )}
    </div>
  );
}

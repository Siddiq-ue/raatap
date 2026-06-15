"use client";

import LocationInput from "@/components/LocationInput";
import RouteSelector from "@/components/RouteSelector";
import { DAYS, COLLEGES } from "../DashboardContent";

interface ProfileFormStep1Props {
  formData: any;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  errors: Record<string, string>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  handleNext: () => void;
  showRouteSelector?: boolean;
  setShowRouteSelector?: (show: boolean) => void;
  onRouteSelect?: (geometry: any) => void;
}

export default function ProfileFormStep1({
  formData,
  setFormData,
  errors,
  setErrors,
  handleNext,
  showRouteSelector,
  setShowRouteSelector,
  onRouteSelect,
}: ProfileFormStep1Props) {
  const toggleArrayValue = (field: "days_of_commute", value: string) => {
    setFormData((prev: any) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((v: string) => v !== value)
        : [...prev[field], value],
    }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Full Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">
            Full Name
          </label>
          <input
            type="text"
            value={formData.full_name}
            onChange={(e) => {
              setFormData((prev: any) => ({
                ...prev,
                full_name: e.target.value,
              }));
              if (errors.full_name)
                setErrors((prev) => ({ ...prev, full_name: "" }));
            }}
            className={`w-full px-4 py-3.5 border-2 rounded-2xl bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-4 transition-all ${errors.full_name ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "border-gray-200 focus:border-[#6675FF] focus:ring-[#6675FF]/10"}`}
            placeholder="e.g., Alex Johnson"
            required
          />
          {errors.full_name && (
            <p className="text-red-500 text-xs mt-1 ml-1">
              {errors.full_name}
            </p>
          )}
        </div>

        {/* Phone Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">
            WhatsApp Number
          </label>
          <input
            type="tel"
            value={formData.phone_number}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "").slice(0, 10);
              setFormData((prev: any) => ({
                ...prev,
                phone_number: val,
              }));
              if (errors.phone_number)
                setErrors((prev) => ({ ...prev, phone_number: "" }));
            }}
            className={`w-full px-4 py-3.5 border-2 rounded-2xl bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-4 transition-all ${errors.phone_number ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "border-gray-200 focus:border-[#6675FF] focus:ring-[#6675FF]/10"}`}
            placeholder="98765 43210"
            required
          />
          {errors.phone_number && (
            <p className="text-red-500 text-xs mt-1 ml-1">
              {errors.phone_number}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Age */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">
            Age
          </label>
          <input
            type="number"
            value={formData.age}
            onChange={(e) => {
              setFormData((prev: any) => ({
                ...prev,
                age: e.target.value,
              }));
              if (errors.age) setErrors((prev) => ({ ...prev, age: "" }));
            }}
            className={`w-full px-4 py-3.5 border-2 rounded-2xl bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-4 transition-all ${errors.age ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "border-gray-200 focus:border-[#6675FF] focus:ring-[#6675FF]/10"}`}
            placeholder="20"
            required
          />
          {errors.age && (
            <p className="text-red-500 text-xs mt-1 ml-1">{errors.age}</p>
          )}
        </div>

        {/* Gender */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">
            Gender
          </label>
          <div className="relative">
            <select
              value={formData.gender}
              onChange={(e) => {
                setFormData((prev: any) => ({
                  ...prev,
                  gender: e.target.value,
                }));
                if (errors.gender)
                  setErrors((prev) => ({ ...prev, gender: "" }));
              }}
              className={`w-full px-5 py-3.5 border-2 rounded-2xl bg-white text-gray-800 focus:outline-none focus:ring-4 transition-all appearance-none cursor-pointer ${errors.gender ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "border-gray-200 focus:border-[#6675FF] focus:ring-[#6675FF]/10"}`}
              required
            >
              <option value="">Select</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg
                className="w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>
          </div>
          {errors.gender && (
            <p className="text-red-500 text-xs mt-1 ml-1">
              {errors.gender}
            </p>
          )}
        </div>
      </div>

      {/* Institution */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">
          Institution
        </label>
        <div className="relative">
          <select
            value={formData.institution}
            onChange={(e) => {
              setFormData((prev: any) => ({
                ...prev,
                institution: e.target.value,
              }));
              if (errors.institution)
                setErrors((prev) => ({ ...prev, institution: "" }));
            }}
            className={`w-full px-5 py-3.5 border-2 rounded-2xl bg-white text-gray-800 focus:outline-none focus:ring-4 transition-all appearance-none cursor-pointer ${errors.institution ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "border-gray-200 focus:border-[#6675FF] focus:ring-[#6675FF]/10"}`}
            required
          >
            <option value="">Select your institution</option>
            {COLLEGES.map((college) => (
              <option key={college} value={college}>
                {college}
              </option>
            ))}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg
              className="w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>
        {errors.institution && (
          <p className="text-red-500 text-xs mt-1 ml-1">
            {errors.institution}
          </p>
        )}
      </div>

      {/* Student ID */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">
          Student ID Number
        </label>
        <input
          type="text"
          value={formData.student_id}
          onChange={(e) => {
            setFormData((prev: any) => ({
              ...prev,
              student_id: e.target.value,
            }));
            if (errors.student_id)
              setErrors((prev) => ({ ...prev, student_id: "" }));
          }}
          className={`w-full px-4 py-3.5 border-2 rounded-2xl bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-4 transition-all ${errors.student_id ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "border-gray-200 focus:border-[#6675FF] focus:ring-[#6675FF]/10"}`}
          placeholder="e.g., 2303A51001"
          required
        />
        {errors.student_id && (
          <p className="text-red-500 text-xs mt-1 ml-1">
            {errors.student_id}
          </p>
        )}
      </div>

      {/* Host/Rider Toggle */}
      <div className="bg-gradient-to-r from-[#6675FF]/5 to-transparent rounded-2xl p-5 border border-[#6675FF]/20">
        <h3 className="text-sm font-semibold text-[#6675FF] mb-4">
          You want to
        </h3>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl hover:bg-white/50 transition-colors group">
            <input
              type="checkbox"
              checked={formData.prefer_hosting}
              onChange={(e) => {
                setFormData((prev: any) => ({
                  ...prev,
                  prefer_hosting: e.target.checked,
                  prefer_taking_ride: e.target.checked ? false : prev.prefer_taking_ride,
                }));
                if (errors.preference)
                  setErrors((prev) => ({ ...prev, preference: "" }));
              }}
              className="w-5 h-5 text-[#6675FF] border-2 border-gray-300 rounded focus:ring-2 focus:ring-[#6675FF]/50"
            />
            <span className="text-gray-700 font-medium">
              Host (I have a vehicle & can offer rides)
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl hover:bg-white/50 transition-colors group">
            <input
              type="checkbox"
              checked={formData.prefer_taking_ride}
              onChange={(e) => {
                setFormData((prev: any) => ({
                  ...prev,
                  prefer_taking_ride: e.target.checked,
                  prefer_hosting: e.target.checked ? false : prev.prefer_hosting,
                }));
                if (errors.preference)
                  setErrors((prev) => ({ ...prev, preference: "" }));
              }}
              className="w-5 h-5 text-[#6675FF] border-2 border-gray-300 rounded focus:ring-2 focus:ring-[#6675FF]/50"
            />
            <span className="text-gray-700 font-medium">
              Take a ride (I need a ride)
            </span>
          </label>
        </div>
        {errors.preference && (
          <p className="text-red-500 text-xs mt-2">{errors.preference}</p>
        )}
      </div>

      {/* Vehicle Type - Only for Hosts */}
      {formData.prefer_hosting && (
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            Your Vehicle
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="relative cursor-pointer group">
              <input
                type="radio"
                name="vehicle_type"
                value="2_wheeler"
                checked={formData.vehicle_type === "2_wheeler"}
                onChange={(e) => {
                  setFormData((prev: any) => ({
                    ...prev,
                    vehicle_type: e.target.value,
                  }));
                  if (errors.vehicle_type)
                    setErrors((prev) => ({ ...prev, vehicle_type: "" }));
                }}
                className="peer sr-only"
              />
              <div
                className={`p-3 sm:p-4 border-2 rounded-2xl bg-white text-center transition-all peer-checked:border-[#6675FF] peer-checked:bg-[#6675FF]/5 peer-checked:shadow-lg peer-checked:shadow-[#6675FF]/20 hover:border-[#6675FF]/50 ${errors.vehicle_type ? "border-red-300" : "border-gray-200"}`}
              >
                <div className="text-xl sm:text-2xl mb-1 sm:mb-2 text-[#6675FF]">
                  2W
                </div>
                <span className="text-gray-700 font-medium text-xs sm:text-sm">
                  2 Wheeler
                </span>
              </div>
            </label>

            <label className="relative cursor-pointer group">
              <input
                type="radio"
                name="vehicle_type"
                value="4_wheeler"
                checked={formData.vehicle_type === "4_wheeler"}
                onChange={(e) => {
                  setFormData((prev: any) => ({
                    ...prev,
                    vehicle_type: e.target.value,
                  }));
                  if (errors.vehicle_type)
                    setErrors((prev) => ({ ...prev, vehicle_type: "" }));
                }}
                className="peer sr-only"
              />
              <div
                className={`p-3 sm:p-4 border-2 rounded-2xl bg-white text-center transition-all peer-checked:border-[#6675FF] peer-checked:bg-[#6675FF]/5 peer-checked:shadow-lg peer-checked:shadow-[#6675FF]/20 hover:border-[#6675FF]/50 ${errors.vehicle_type ? "border-red-300" : "border-gray-200"}`}
              >
                <div className="text-xl sm:text-2xl mb-1 sm:mb-2 text-[#6675FF]">
                  4W
                </div>
                <span className="text-gray-700 font-medium text-xs sm:text-sm">
                  4 Wheeler
                </span>
              </div>
            </label>
          </div>
          {errors.vehicle_type && (
            <p className="text-red-500 text-xs mt-2">{errors.vehicle_type}</p>
          )}
        </div>
      )}

      {/* Rider info */}
      {formData.prefer_taking_ride && !formData.prefer_hosting && (
        <div className="bg-gray-50 p-4 rounded-xl text-sm text-gray-600">
          You'll be matched with a host going your way. No vehicle needed!
        </div>
      )}

      {/* Route Section */}
      <div className="bg-gradient-to-r from-[#6675FF]/5 to-transparent rounded-2xl p-5 border border-[#6675FF]/20">
        <h3 className="text-sm font-semibold text-[#6675FF] mb-4 flex items-center gap-2">
          <svg
            className="w-5 h-5"
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
          Your Daily Route
        </h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5 ml-1">
              From (Home/Start Location)
            </label>
            <LocationInput
              value={formData.from_location}
              onChange={(value) => {
                setFormData((prev: any) => ({
                  ...prev,
                  from_location: value,
                }));
                if (errors.from_location)
                  setErrors((prev) => ({ ...prev, from_location: "" }));
              }}
              onLocationSelect={(location) => {
                setFormData((prev: any) => ({
                  ...prev,
                  from_lat: location.lat,
                  from_lng: location.lng,
                }));
              }}
              placeholder="e.g., Kukatpally, Hyderabad"
              error={errors.from_location}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5 ml-1">
              To (College/Destination)
            </label>
            <LocationInput
              value={formData.to_location}
              onChange={(value) => {
                setFormData((prev: any) => ({
                  ...prev,
                  to_location: value,
                }));
                if (errors.to_location)
                  setErrors((prev) => ({ ...prev, to_location: "" }));
              }}
              onLocationSelect={(location) => {
                setFormData((prev: any) => ({
                  ...prev,
                  to_lat: location.lat,
                  to_lng: location.lng,
                }));
              }}
              placeholder="e.g., CBIT, Gandipet"
              error={errors.to_location}
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="block text-xs font-medium text-gray-600 mb-1.5 ml-1">
            Landmark (Optional)
          </label>
          <input
            type="text"
            value={formData.landmark}
            onChange={(e) => {
              setFormData((prev: any) => ({
                ...prev,
                landmark: e.target.value,
              }));
              if (errors.landmark)
                setErrors((prev) => ({ ...prev, landmark: "" }));
            }}
            className={`w-full px-4 py-3.5 border-2 rounded-2xl bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-4 transition-all ${errors.landmark ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "border-gray-200 focus:border-[#6675FF] focus:ring-[#6675FF]/10"}`}
            placeholder="e.g., Near Gachibowli Stadium"
          />
          {errors.landmark && (
            <p className="text-red-500 text-xs mt-1 ml-1">
              {errors.landmark}
            </p>
          )}
        </div>

        {/* Route Selector Button - Only for hosts when locations are set */}
        {formData.prefer_hosting && formData.from_lat && formData.to_lat && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowRouteSelector?.(true)}
              className="w-full py-3 px-4 bg-[#6675FF]/10 border-2 border-[#6675FF]/30 rounded-xl text-[#6675FF] font-medium hover:bg-[#6675FF]/20 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              {formData.route_geometry ? "Change Route" : "Select Your Route"}
            </button>
            {formData.route_geometry && (
              <p className="text-xs text-green-600 mt-2 text-center">
                ✓ Route selected
              </p>
            )}
          </div>
        )}
      </div>

      {/* Route Selector Modal */}
      {showRouteSelector && formData.from_lat && formData.to_lat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <RouteSelector
            from={{ lat: formData.from_lat, lng: formData.from_lng, name: formData.from_location }}
            to={{ lat: formData.to_lat, lng: formData.to_lng, name: formData.to_location }}
            onRouteSelect={(geometry) => {
              onRouteSelect?.(geometry);
              setShowRouteSelector?.(false);
            }}
            onClose={() => setShowRouteSelector?.(false)}
          />
        </div>
      )}

      {/* Time Windows */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">
            Leave Home
          </label>
          <input
            type="time"
            value={formData.leave_home_time}
            onChange={(e) => {
              setFormData((prev: any) => ({
                ...prev,
                leave_home_time: e.target.value,
              }));
              if (errors.leave_home_time)
                setErrors((prev) => ({ ...prev, leave_home_time: "" }));
            }}
            className={`w-full px-4 py-3.5 border-2 rounded-2xl bg-white text-gray-800 focus:outline-none focus:ring-4 transition-all ${errors.leave_home_time ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "border-gray-200 focus:border-[#6675FF] focus:ring-[#6675FF]/10"}`}
            required
          />
          {errors.leave_home_time && (
            <p className="text-red-500 text-xs mt-1 ml-1">
              {errors.leave_home_time}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">
            Leave College
          </label>
          <input
            type="time"
            value={formData.leave_college_time}
            onChange={(e) => {
              setFormData((prev: any) => ({
                ...prev,
                leave_college_time: e.target.value,
              }));
              if (errors.leave_college_time)
                setErrors((prev) => ({
                  ...prev,
                  leave_college_time: "",
                }));
            }}
            className={`w-full px-4 py-3.5 border-2 rounded-2xl bg-white text-gray-800 focus:outline-none focus:ring-4 transition-all ${errors.leave_college_time ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "border-gray-200 focus:border-[#6675FF] focus:ring-[#6675FF]/10"}`}
            required
          />
          {errors.leave_college_time && (
            <p className="text-red-500 text-xs mt-1 ml-1">
              {errors.leave_college_time}
            </p>
          )}
        </div>
      </div>

      {/* Days of Commute */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3 ml-1">
          Days of Commute
        </label>
        <div className="flex flex-wrap gap-2 justify-center">
          {DAYS.map((day) => (
            <label key={day} className="relative cursor-pointer group">
              <input
                type="checkbox"
                checked={formData.days_of_commute.includes(day)}
                onChange={() =>
                  toggleArrayValue("days_of_commute", day)
                }
                className="peer sr-only"
              />
              <div
                className={`px-3 sm:px-4 py-2 sm:py-2.5 border-2 rounded-xl bg-white text-center text-xs sm:text-sm font-medium text-gray-600 transition-all peer-checked:border-[#6675FF] peer-checked:bg-[#6675FF] peer-checked:text-white hover:border-[#6675FF]/50 min-w-[52px] ${errors.days_of_commute ? "border-red-300" : "border-gray-200"}`}
              >
                {day.slice(0, 3)}
              </div>
            </label>
          ))}
        </div>
        {errors.days_of_commute && (
          <p className="text-red-500 text-xs mt-2 text-center">
            {errors.days_of_commute}
          </p>
        )}
      </div>

      <button
        onClick={handleNext}
        className="w-full mt-6 py-4 bg-gradient-to-r from-[#6675FF] to-[#8892ff] text-white font-semibold text-lg rounded-2xl hover:shadow-xl hover:shadow-[#6675FF]/30 transition-all hover:-translate-y-0.5 active:translate-y-0"
      >
        Continue
      </button>
    </div>
  );
}

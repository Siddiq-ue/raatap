"use client";

interface ProfileFormStep2Props {
  formData: any;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  errors: Record<string, string>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  handleNext: () => void;
  handleBack: () => void;
}

export default function ProfileFormStep2({
  formData,
  setFormData,
  errors,
  setErrors,
  handleNext,
  handleBack,
}: ProfileFormStep2Props) {
  return (
    <div className="space-y-6">
      {/* You prefer */}
      <div
        className={`bg-gradient-to-r from-[#6675FF]/5 to-transparent rounded-2xl p-5 border ${errors.preference ? "border-red-300" : "border-[#6675FF]/20"}`}
      >
        <label className="block text-sm font-semibold text-[#6675FF] mb-4">
          You prefer
        </label>
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
              Hosting (I have a vehicle)
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
              Taking ride (I need a ride)
            </span>
          </label>
        </div>
        {errors.preference && (
          <p className="text-red-500 text-xs mt-2">
            {errors.preference}
          </p>
        )}
      </div>

      {/* Vehicle */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">
          Vehicle Type
        </label>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
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
          <p className="text-red-500 text-xs mt-2">
            {errors.vehicle_type}
          </p>
        )}
      </div>

      {/* Comfortable with */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">
          Comfortable riding with
        </label>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <label className="relative cursor-pointer flex-1 min-w-[80px]">
            <input
              type="radio"
              name="comfortable_with"
              value="male"
              checked={formData.comfortable_with === "male"}
              onChange={(e) => {
                setFormData((prev: any) => ({
                  ...prev,
                  comfortable_with: e.target.value,
                }));
                if (errors.comfortable_with)
                  setErrors((prev) => ({
                    ...prev,
                    comfortable_with: "",
                  }));
              }}
              className="peer sr-only"
            />
            <div
              className={`px-3 sm:px-4 py-2 sm:py-2.5 border-2 rounded-xl bg-white text-center text-xs sm:text-sm font-medium text-gray-600 transition-all peer-checked:border-[#6675FF] peer-checked:bg-[#6675FF] peer-checked:text-white hover:border-[#6675FF]/50 ${errors.comfortable_with ? "border-red-300" : "border-gray-200"}`}
            >
              Male
            </div>
          </label>
          <label className="relative cursor-pointer flex-1 min-w-[80px]">
            <input
              type="radio"
              name="comfortable_with"
              value="female"
              checked={formData.comfortable_with === "female"}
              onChange={(e) => {
                setFormData((prev: any) => ({
                  ...prev,
                  comfortable_with: e.target.value,
                }));
                if (errors.comfortable_with)
                  setErrors((prev) => ({
                    ...prev,
                    comfortable_with: "",
                  }));
              }}
              className="peer sr-only"
            />
            <div
              className={`px-3 sm:px-4 py-2 sm:py-2.5 border-2 rounded-xl bg-white text-center text-xs sm:text-sm font-medium text-gray-600 transition-all peer-checked:border-[#6675FF] peer-checked:bg-[#6675FF] peer-checked:text-white hover:border-[#6675FF]/50 ${errors.comfortable_with ? "border-red-300" : "border-gray-200"}`}
            >
              Female
            </div>
          </label>
          <label className="relative cursor-pointer flex-1 min-w-[80px]">
            <input
              type="radio"
              name="comfortable_with"
              value="both"
              checked={formData.comfortable_with === "both"}
              onChange={(e) => {
                setFormData((prev: any) => ({
                  ...prev,
                  comfortable_with: e.target.value,
                }));
                if (errors.comfortable_with)
                  setErrors((prev) => ({
                    ...prev,
                    comfortable_with: "",
                  }));
              }}
              className="peer sr-only"
            />
            <div
              className={`px-3 sm:px-4 py-2 sm:py-2.5 border-2 rounded-xl bg-white text-center text-xs sm:text-sm font-medium text-gray-600 transition-all peer-checked:border-[#6675FF] peer-checked:bg-[#6675FF] peer-checked:text-white hover:border-[#6675FF]/50 ${errors.comfortable_with ? "border-red-300" : "border-gray-200"}`}
            >
              Any
            </div>
          </label>
        </div>
        {errors.comfortable_with && (
          <p className="text-red-500 text-xs mt-2">
            {errors.comfortable_with}
          </p>
        )}
      </div>

      {/* Terms */}
      <div className="pt-2">
        <label className="flex items-start gap-3 cursor-pointer group">
          <div className="relative flex items-center">
            <input
              type="checkbox"
              checked={formData.agreed_to_terms}
              onChange={(e) => {
                setFormData((prev: any) => ({
                  ...prev,
                  agreed_to_terms: e.target.checked,
                }));
                if (errors.agreed_to_terms)
                  setErrors((prev) => ({
                    ...prev,
                    agreed_to_terms: "",
                  }));
              }}
              className="peer sr-only"
            />
            <div
              className={`w-5 h-5 border-2 rounded transition-all ${formData.agreed_to_terms ? "bg-[#6675FF] border-[#6675FF]" : "bg-white border-gray-300 peer-hover:border-[#6675FF]"}`}
            >
              <svg
                className={`w-4 h-4 text-white absolute top-0.5 left-0.5 transition-all ${formData.agreed_to_terms ? "opacity-100 scale-100" : "opacity-0 scale-50"}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </div>
          <span className="text-xs text-gray-500 leading-relaxed">
            I agree to the{" "}
            <a href="#" className="text-[#6675FF] underline">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="#" className="text-[#6675FF] underline">
              Privacy Policy
            </a>
            . I understand that my safety is my responsibility.
          </span>
        </label>
        {errors.agreed_to_terms && (
          <p className="text-red-500 text-xs mt-1 ml-8">
            {errors.agreed_to_terms}
          </p>
        )}
      </div>

      {/* Buttons */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={handleBack}
          className="flex-1 py-4 bg-gray-100 text-gray-700 font-semibold text-lg rounded-2xl hover:bg-gray-200 transition-all hover:-translate-y-0.5"
        >
          Back
        </button>
        <button
          onClick={handleNext}
          className="flex-1 py-4 bg-gradient-to-r from-[#6675FF] to-[#8892ff] text-white font-semibold text-lg rounded-2xl hover:shadow-xl hover:shadow-[#6675FF]/30 transition-all hover:-translate-y-0.5 active:translate-y-0"
        >
          Verify Email
        </button>
      </div>
    </div>
  );
}

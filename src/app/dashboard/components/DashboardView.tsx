"use client";

import type { User } from "@supabase/supabase-js";

interface DashboardViewProps {
  user: User | null;
  formData: any;
  confirmedPods: any;
  matchSuggestions: any[];
  loadingPods: boolean;
  handleAcceptMatch: (matchId: string, riderName: string) => void;
  handleRejectMatch: (matchId: string) => void;
  handleSkipMatch: (matchId: string) => void;
  handleConfirmMatch: (matchId: string) => void;
}

export default function DashboardView({
  user,
  formData,
  confirmedPods,
  matchSuggestions,
  loadingPods,
  handleAcceptMatch,
  handleRejectMatch,
  handleSkipMatch,
  handleConfirmMatch,
}: DashboardViewProps) {
  return (
    <div className="relative w-full max-w-lg">
      {loadingPods && (
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl p-8 text-center border border-white/50">
          <div className="w-12 h-12 border-4 border-[#6675FF] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">
            {loadingPods
              ? "Checking for scheduled rides..."
              : "Finding your best matches..."}
          </p>
        </div>
      )}
      {confirmedPods &&
        (confirmedPods.host_pods?.length > 0 ||
          confirmedPods.rider_rides?.length > 0) && (
          // CONFIRMED RIDE CARD
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-[#6675FF]/10 overflow-hidden border border-white/50">
            <div className="bg-gradient-to-r from-[#10b981] to-[#059669] p-6 text-white text-center">
              <h2 className="text-2xl font-semibold mb-1">Ride Confirmed!</h2>
              <p className="opacity-90">Your commute is scheduled</p>
            </div>

            <div className="p-8">
              {/* HOST VIEW OF POD */}
              {confirmedPods.host_pods?.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">
                    Your Pod
                  </h3>
                  {confirmedPods.host_pods.map((pod: any) => (
                    <div key={pod.id} className="space-y-4">
                      {/* Route Summary Card */}
                      <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3 opacity-10">
                          <svg
                            className="w-24 h-24 text-[#6675FF]"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
                          </svg>
                        </div>
                        <div className="relative z-10">
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-xs font-bold text-[#6675FF] bg-[#6675FF]/10 px-2 py-1 rounded-full uppercase tracking-wider">
                              Pool
                            </span>
                            <span className="text-sm font-medium text-gray-500 flex items-center gap-1">
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                              {pod.ride_template?.departure_time}
                            </span>
                          </div>
                          <h4 className="text-lg font-bold text-gray-800 mb-1">
                            My Route
                          </h4>
                          <div className="flex items-center gap-2 text-gray-600 text-sm">
                            <span className="truncate max-w-[45%]">
                              {pod.ride_template?.from_location}
                            </span>
                            <svg
                              className="w-4 h-4 flex-shrink-0 text-gray-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M17 8l4 4m0 0l-4 4m4-4H3"
                              />
                            </svg>
                            <span className="truncate max-w-[45%]">
                              {pod.ride_template?.to_location}
                            </span>
                          </div>
                          <div className="mt-3 flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full transition-all duration-500"
                                style={{
                                  width: `${(pod.ride_template?.available_seats || 0) > 0 ? ((pod.ride_template?.seats_taken || 0) / (pod.ride_template?.available_seats || 1)) * 100 : 0}%`,
                                }}
                              ></div>
                            </div>
                            <span className="text-xs font-semibold text-gray-500">
                              {pod.ride_template?.seats_taken || 0}/
                              {pod.ride_template?.available_seats || 0} Seats
                            </span>
                          </div>
                          <div className="mt-3 text-xs text-gray-600">
                            {pod.ride_template?.days_available && Array.isArray(pod.ride_template?.days_available) && (
                              <div className="flex items-center gap-1.5">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                <span>{pod.ride_template?.days_available?.map((d: string) => d.slice(0, 3)).join(', ')}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-end mb-3">
                          <p className="text-sm font-semibold text-gray-700">
                            Riders ({pod.pod_members?.length || 0})
                          </p>
                        </div>

                        {pod.pod_members?.length > 0 ? (
                          <div className="space-y-3">
                            {pod.pod_members.map((member: any) => (
                              <div
                                key={member.id}
                                className="relative p-4 border border-gray-100 rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow"
                              >
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#6675FF] to-[#8892ff] flex items-center justify-center text-white font-bold">
                                    {member.profiles?.full_name?.charAt(0) ||
                                      "R"}
                                  </div>
                                  <div>
                                    <p className="font-semibold text-gray-800">
                                      {member.profiles?.full_name || "Rider"}
                                    </p>
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                      <span
                                        className={`px-2 py-0.5 rounded-full ${member.status === "active" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}
                                      >
                                        {member.status === "active"
                                          ? "Confirmed"
                                          : member.status}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="ml-auto flex items-center gap-2">
                                    <span className="text-xs text-gray-500">{member.profiles?.phone_number}</span>
                                    <a
                                      href={`tel:${member.profiles?.phone_number}`}
                                      className="w-8 h-8 flex items-center justify-center bg-gray-100 text-gray-600 rounded-full hover:bg-[#6675FF] hover:text-white transition-colors"
                                    >
                                      <svg
                                        className="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                                        />
                                      </svg>
                                    </a>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div className="bg-[#6675FF]/10 p-2 rounded-lg">
                                    <span className="block text-[#6675FF] font-bold uppercase tracking-wider text-[10px] mb-0.5">
                                      Pickup
                                    </span>
                                    <span
                                      className="text-gray-700 font-medium truncate block"
                                      title={
                                        member.ride_requests?.pickup_location
                                      }
                                    >
                                      {member.ride_requests?.pickup_location ||
                                        "N/A"}
                                    </span>
                                    {member.ride_requests?.pickup_landmark && (
                                      <span className="text-gray-500 text-[10px] truncate block opacity-80" title={member.ride_requests?.pickup_landmark}>
                                        ({member.ride_requests.pickup_landmark})
                                      </span>
                                    )}
                                  </div>
                                  <div className="bg-[#4d5ce6]/10 p-2 rounded-lg">
                                    <span className="block text-[#4d5ce6] font-bold uppercase tracking-wider text-[10px] mb-0.5">
                                      Dropoff
                                    </span>
                                    <span
                                      className="text-gray-700 font-medium truncate block"
                                      title={
                                        member.ride_requests?.destination_location
                                      }
                                    >
                                      {member.ride_requests
                                        ?.destination_location || "N/A"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                            <p className="text-gray-500 text-sm">
                              Waiting for riders to match...
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* RIDER VIEW OF POD */}
              {confirmedPods.rider_rides?.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">
                    Your Pod
                  </h3>
                  {confirmedPods.rider_rides.map((ride: any) => (
                    <div key={ride.id} className="space-y-4">
                      <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#6675FF] to-[#8892ff] flex items-center justify-center text-white text-lg font-bold">
                          {ride.pod?.profiles?.full_name?.charAt(0) || "H"}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 flex items-center gap-2">
                            {ride.pod?.profiles?.full_name || "Host"}
                            <span className="text-xs px-2 py-0.5 bg-[#6675FF]/10 text-[#6675FF] rounded-full font-medium">
                              Host
                            </span>
                          </p>
                          <p className="text-sm text-gray-500">
                            Pool • {ride.pod?.profiles?.gender}
                          </p>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                          <span className="text-xs text-gray-500">{ride.pod?.profiles?.phone_number}</span>
                          <a
                            href={`tel:${ride.pod?.profiles?.phone_number}`}
                            className="w-10 h-10 flex items-center justify-center bg-green-100 text-green-600 rounded-full hover:bg-green-200 transition-colors"
                          >
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
                                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                              />
                            </svg>
                          </a>
                        </div>
                      </div>

                      {/* Co-Riders View */}
                      {ride.pod?.pod_members?.length > 1 && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <p className="text-sm font-medium text-gray-700 mb-2">
                            Co-Riders with you:
                          </p>
                          <div className="space-y-2">
                            {ride.pod.pod_members
                              .filter(
                                (m: any) =>
                                  m.rider_id !== user?.id &&
                                  m.status === "active",
                              ) // Exclude self and pending
                              .map((member: any) => (
                                <div
                                  key={member.id}
                                  className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-100"
                                >
                                  <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">
                                    {member.profiles?.full_name?.charAt(0) ||
                                      "R"}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-gray-800">
                                      {member.profiles?.full_name || "Rider"}
                                    </p>
                                    <p className="text-xs text-gray-500 capitalize">
                                      {member.status}
                                    </p>
                                  </div>
                                </div>
                              ))}
                          </div>
                          {ride.pod.pod_members.filter(
                            (m: any) =>
                              m.rider_id !== user?.id && m.status === "active",
                          ).length === 0 && (
                            <p className="text-xs text-gray-400 italic">
                              No other riders yet
                            </p>
                          )}
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="p-3 bg-[#6675FF]/10 rounded-xl">
                          <p className="text-xs text-[#6675FF] font-semibold uppercase mb-1">
                            Pickup
                          </p>
                          <p className="text-gray-700 text-sm font-medium">
                            {ride.pickup_location}
                          </p>
                        </div>
                        <div className="p-3 bg-[#4d5ce6]/10 rounded-xl">
                          <p className="text-xs text-[#4d5ce6] font-semibold uppercase mb-1">
                            Departure Time
                          </p>
                          <p className="text-gray-700 text-sm font-medium">
                            {ride.pod?.ride_template?.departure_time}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-gray-600">
                        {ride.pod?.ride_template?.days_available && Array.isArray(ride.pod?.ride_template?.days_available) && (
                          <div className="flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            <span>{ride.pod?.ride_template?.days_available?.map((d: string) => d.slice(0, 3)).join(', ')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      {matchSuggestions.length > 0 &&
        !confirmedPods?.rider_rides?.length && (
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-[#6675FF]/10 overflow-hidden border border-white/50 mt-6">
            <div
              className={`p-6 text-white text-center ${matchSuggestions[0].status === "accepted" ? "bg-green-600" : "bg-[#6675FF]"}`}
            >
              <h2 className="text-2xl font-semibold mb-1">
                {matchSuggestions[0].status === "accepted"
                  ? "Host Accepted! Please Confirm"
                  : "Top Match Found!"}
              </h2>
              <p className="opacity-90">
                {matchSuggestions[0].status === "accepted"
                  ? "Your ride is ready to go"
                  : "Based on your route and schedule"}
              </p>
            </div>

            <div className="p-8">
              {/* Check if we are viewing as Host (looking at Rider) or Rider (looking at Host) */}
              {matchSuggestions[0].view_type === "host" ? (
                // HOST VIEW
                <>
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#6675FF] to-[#8892ff] flex items-center justify-center text-white text-xl font-bold">
                      {matchSuggestions[0].ride_requests.profiles.full_name?.charAt(
                        0,
                      ) || "R"}
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-gray-800">
                        Rider Request
                      </h3>
                      <p className="text-gray-500 text-sm">
                        {matchSuggestions[0].ride_requests.profiles
                          .student_year || "Student"}{" "}
                        •{" "}
                        {matchSuggestions[0].ride_requests.profiles.gender}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">
                          {Math.round(
                            matchSuggestions[0].overall_score * 100,
                          )}
                          % Match
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 mb-8">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 bg-[#6675FF]/10 p-1.5 rounded-lg text-[#6675FF]">
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
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-semibold">
                          Pickup
                        </p>
                        <p className="text-gray-700">
                          {matchSuggestions[0].ride_requests.pickup_location}
                        </p>
                        {matchSuggestions[0].ride_requests.pickup_landmark && (
                          <p className="text-gray-500 text-sm mt-0.5">
                            ({matchSuggestions[0].ride_requests.pickup_landmark})
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="mt-1 bg-[#4d5ce6]/10 p-1.5 rounded-lg text-[#4d5ce6]">
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
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-semibold">
                          Detour
                        </p>
                        <p className="text-gray-700">
                          {matchSuggestions[0].detour_distance_meters
                            ? `${(matchSuggestions[0].detour_distance_meters / 1000).toFixed(1)} km`
                            : "Minimal detour"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={() =>
                        handleSkipMatch(matchSuggestions[0].id)
                      }
                      className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
                    >
                      Skip
                    </button>
                    <button
                      onClick={() =>
                        handleAcceptMatch(
                          matchSuggestions[0].id,
                          matchSuggestions[0].ride_requests.profiles
                            .full_name,
                        )
                      }
                      className="flex-1 py-3.5 bg-[#6675FF] hover:bg-[#5b6ae0] text-white rounded-xl font-medium transition-colors shadow-lg shadow-[#6675FF]/20"
                    >
                      Accept Request
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 text-center mt-3">
                    Contact info will be revealed after acceptance
                  </p>
                </>
              ) : matchSuggestions[0].view_type === "rider" ? (
                // RIDER VIEW
                <>
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#6675FF] to-[#8892ff] flex items-center justify-center text-white text-xl font-bold">
                      {matchSuggestions[0].ride_templates.profiles.full_name?.charAt(
                        0,
                      ) || "H"}
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-gray-800">
                        Host Matches You!
                      </h3>
                      <p className="text-gray-500 text-sm">
                        {matchSuggestions[0].ride_templates.vehicle_type ===
                        "2_wheeler"
                          ? "Bike"
                          : "Car"}{" "}
                        •{" "}
                        {
                          matchSuggestions[0].ride_templates.profiles
                            .gender
                        }
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">
                          Accepted!
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 mb-8">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 bg-[#6675FF]/10 p-1.5 rounded-lg text-[#6675FF]">
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
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-semibold">
                          Route
                        </p>
                        <p className="text-gray-700">
                          {matchSuggestions[0].ride_templates.from_location}{" "}
                          →{" "}
                          {matchSuggestions[0].ride_templates.to_location}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="mt-1 bg-[#4d5ce6]/10 p-1.5 rounded-lg text-[#4d5ce6]">
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
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-semibold">
                          Departure
                        </p>
                        <p className="text-gray-700">
                          {
                            matchSuggestions[0].ride_templates
                              .departure_time
                          }
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={() =>
                        handleRejectMatch(matchSuggestions[0].id)
                      }
                      className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() =>
                        handleConfirmMatch(matchSuggestions[0].id)
                      }
                      className="flex-1 py-3.5 bg-[#10b981] hover:bg-[#059669] text-white rounded-xl font-medium transition-colors shadow-lg shadow-[#10b981]/20"
                    >
                      Confirm Ride
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 text-center mt-3">
                    Confirm to lock your seat (irreversible)
                  </p>
                </>
              ) : (
                <div className="text-center p-4">
                  <p>Loading details...</p>
                </div>
              )}
            </div>
          </div>
        )}
      {!confirmedPods?.rider_rides?.length &&
        !confirmedPods?.host_pods?.length &&
        matchSuggestions.length === 0 && (
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-[#6675FF]/10 p-8 md:p-10 border border-white/50 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-[#6675FF] to-[#8892ff] flex items-center justify-center animate-pulse">
              <svg
                className="w-10 h-10 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-[#171717] mb-3">
              We are matching you up
            </h1>
            <p className="text-gray-500 mb-6">
              Thanks for verifying, {formData.full_name}! We&apos;re
              currently looking for the best riders for your route.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#6675FF]/10 text-[#6675FF] rounded-full text-sm font-medium">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#8892ff] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#6675FF]"></span>
              </span>
              Searching for riders...
            </div>
          </div>
        )}
    </div>
  );
}

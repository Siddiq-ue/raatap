"use client";

import React from "react";

interface MatchSuggestionCardProps {
  match: any;
  viewerRole: "host" | "rider";
  onAccept?: (matchId: string, name: string) => void;
  onReject?: (matchId: string) => void;
  onSkip?: (matchId: string) => void;
  onConfirm?: (matchId: string) => void;
}

export default function MatchSuggestionCard({
  match,
  viewerRole,
  onAccept,
  onReject,
  onSkip,
  onConfirm
}: MatchSuggestionCardProps) {
  // Determine data based on view
  const isHostView = viewerRole === "host";
  
  // For host, the other user is the rider (request)
  // For rider, the other user is the host (template)
  const otherUser = isHostView 
    ? match.ride_requests?.profiles 
    : match.ride_templates?.profiles;
    
  const otherName = otherUser?.full_name || (isHostView ? "Rider" : "Host");
  const otherInitial = otherUser?.full_name?.charAt(0) || (isHostView ? "R" : "H");
  
  const score = Math.round(match.overall_score * 100);
  let scoreColor = "bg-gray-100 text-gray-700";
  if (score >= 80) scoreColor = "bg-green-100 text-green-700 border-green-200";
  else if (score >= 60) scoreColor = "bg-yellow-100 text-yellow-700 border-yellow-200";
  else scoreColor = "bg-red-100 text-red-700 border-red-200";

  const pickupDistance = isHostView 
    ? null // Task 5: hide for host
    : match.pickup_distance_meters ? `${(match.pickup_distance_meters / 1000).toFixed(1)} km walk` : "Nearby";
    
  const dropDistance = match.drop_distance_meters 
    ? `${(match.drop_distance_meters / 1000).toFixed(1)} km walk` 
    : "Nearby";

  const statusText = match.status === "accepted" 
    ? (isHostView ? "You Accepted!" : "Host Accepted!") 
    : "Top Match!";
  const isAccepted = match.status === "accepted";

  const days = isHostView 
    ? match.ride_requests?.days_needed 
    : match.ride_templates?.days_available;

  return (
    <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl border border-gray-100 overflow-hidden mb-6 transition-all hover:shadow-2xl">
      {/* Header Area */}
      <div className={`p-4 text-center text-white ${isAccepted ? 'bg-green-600' : 'bg-gradient-to-r from-[#6675FF] to-[#8892ff]'}`}>
        <h2 className="text-xl font-bold">{statusText}</h2>
        <p className="opacity-90 text-sm">
          {isAccepted 
            ? (isHostView ? "Waiting for rider to confirm" : "Review and confirm this ride") 
            : "Based on your route and schedule"}
        </p>
      </div>

      <div className="p-6 md:p-8">
        {/* Profile & Score */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[#6675FF]/10 flex items-center justify-center text-[#6675FF] text-xl font-bold border-2 border-white shadow-sm ring-2 ring-[#6675FF]/20">
              {otherInitial}
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800">{otherName}</h3>
              <p className="text-sm text-gray-500 capitalize">
                {otherUser?.gender || "Unknown"} • {otherUser?.institution || "Student"}
              </p>
            </div>
          </div>
          <div className={`px-3 py-1.5 rounded-xl border font-bold shadow-sm ${scoreColor}`}>
            {score}% Match
          </div>
        </div>

        {/* Visual Route Timeline */}
        <div className="relative pl-6 mb-8 border-l-2 border-gray-100 space-y-6">
          {/* Pickup Node */}
          <div className="relative">
            <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-[#6675FF] ring-4 ring-white"></div>
            <p className="text-xs uppercase tracking-wider font-bold text-[#6675FF] mb-1">Pickup</p>
            <p className="text-gray-800 font-medium">
              {isHostView ? match.ride_requests?.pickup_location : match.ride_templates?.from_location}
            </p>
            {pickupDistance && (
              <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                {pickupDistance}
              </p>
            )}
          </div>

          {/* Drop Node */}
          <div className="relative">
            <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-[#4d5ce6] ring-4 ring-white"></div>
            <p className="text-xs uppercase tracking-wider font-bold text-[#4d5ce6] mb-1">Dropoff</p>
            <p className="text-gray-800 font-medium">
              {isHostView ? match.ride_requests?.destination_location : match.ride_templates?.to_location}
            </p>
            <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              {dropDistance}
            </p>
          </div>
        </div>

        {/* Schedule / Day Chips */}
        {days && Array.isArray(days) && days.length > 0 && (
          <div className="mb-8">
            <p className="text-xs text-gray-500 font-semibold uppercase mb-2">Schedule Matches</p>
            <div className="flex flex-wrap gap-2">
              {days.map((day: string) => (
                <span key={day} className="px-3 py-1 bg-gray-50 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium shadow-sm">
                  {day.substring(0, 3)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t border-gray-100">
          {isHostView && !isAccepted ? (
            <>
              <button
                onClick={() => onSkip && onSkip(match.id)}
                className="flex-1 py-3.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl font-semibold transition-colors border border-gray-200"
              >
                Skip
              </button>
              <button
                onClick={() => onAccept && onAccept(match.id, otherName)}
                className="flex-1 py-3.5 bg-[#6675FF] hover:bg-[#5b6ae0] text-white rounded-xl font-semibold transition-colors shadow-lg shadow-[#6675FF]/20"
              >
                Accept Request
              </button>
            </>
          ) : isHostView && isAccepted ? (
            <div className="flex-1 text-center py-3 bg-gray-50 rounded-xl text-gray-500 font-medium border border-gray-100">
              Waiting for rider...
            </div>
          ) : !isHostView && isAccepted ? (
            <>
              <button
                onClick={() => onReject && onReject(match.id)}
                className="flex-1 py-3.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl font-semibold transition-colors border border-gray-200"
              >
                Reject
              </button>
              <button
                onClick={() => onConfirm && onConfirm(match.id)}
                className="flex-1 py-3.5 bg-[#10b981] hover:bg-[#059669] text-white rounded-xl font-semibold transition-colors shadow-lg shadow-[#10b981]/20"
              >
                Confirm Ride
              </button>
            </>
          ) : (
            <div className="flex-1 text-center py-3 bg-gray-50 rounded-xl text-gray-500 font-medium border border-gray-100">
              Processing...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

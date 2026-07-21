"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isValidPhoneNumber } from "libphonenumber-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import LocationInput from "@/components/LocationInput";
import RouteSelector from "@/components/RouteSelector";
import SocialProof from "@/components/SocialProof";
import ProfileEditor from "@/components/ProfileEditor";

interface FormData {
  // Step 1 fields
  full_name: string;
  phone_number: string;
  age: string;
  gender: string;
  student_id: string;
  institution: string;
  academic_start_year: string;
  academic_end_year: string;
  is_pursuing: boolean | null;
  from_location: string;
  landmark: string;
  to_location: string;
  from_lat: number | null;
  from_lng: number | null;
  to_lat: number | null;
  to_lng: number | null;
  leave_home_time: string;
  leave_college_time: string;
  days_of_commute: string[];

  // Step 2 fields
  prefer_hosting: boolean;
  prefer_taking_ride: boolean;
  vehicle_type: string; // 2_wheeler, 4_wheeler
  comfortable_with: string; // male, female, both
  agreed_to_terms: boolean;
  agreed_to_policies: boolean;
  route_geometry?: any; // Selected route geometry from route selector
}

export const COLLEGES = [
  "Chaitanya Bharathi Institute of Technology",
  "Mahatma Gandhi Institute of Technology",
  "Vasavi College of Engineering",
  "Lords Institute of Engineering & Technology",
  "KL University (Aziz Nagar)",
  "Vidya Jyothi Institute of Technology (VJIT)",
  "Chaitanya (Deemed to be University)",
  "J B Institute of Engineering and Technology",
  "Global Institute of Engineering & Technology",
  "KG Reddy College of Engineering and Technology (KGRCET)",
];

export const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// Bounds for academic start/end year selects. Wide enough to cover alumni
// (is_pursuing = false) and incoming students, but narrow enough that a
// typo like "30000" or "20003" is structurally impossible to enter - both
// fields are rendered as <select> dropdowns built from this range, not free
// text input.
const CURRENT_YEAR = new Date().getFullYear();
export const MIN_ACADEMIC_YEAR = CURRENT_YEAR - 15;
export const MAX_ACADEMIC_YEAR = CURRENT_YEAR + 8;
export const ACADEMIC_YEARS = Array.from(
  { length: MAX_ACADEMIC_YEAR - MIN_ACADEMIC_YEAR + 1 },
  (_, i) => MAX_ACADEMIC_YEAR - i, // newest first
);

export default function DashboardContent() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [currentInstitutionalEmail, setCurrentInstitutionalEmail] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const [matchSuggestions, setMatchSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [confirmedPods, setConfirmedPods] = useState<any>(null); // { host_pods: [], rider_rides: [] }
  const [loadingPods, setLoadingPods] = useState(false);
  const [podsLoadError, setPodsLoadError] = useState(false);
  const podsFetchInFlightRef = useRef(false);

  // Notification/Toast state
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // OTP Verification states
  const [verificationStep, setVerificationStep] = useState<"otp" | null>(null);
  const [hasInstitutionalEmail, setHasInstitutionalEmail] = useState<boolean | null>(null);
  const [institutionalEmail, setInstitutionalEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  // State for custom college name when "Other" is selected
  const [customCollege, setCustomCollege] = useState("");

  // State for route selector modal
  const [showRouteSelector, setShowRouteSelector] = useState(false);
  const [selectedRouteGeometry, setSelectedRouteGeometry] = useState<any>(null);

  // Leave Pod Modal State
  const [showLeavePodModal, setShowLeavePodModal] = useState(false);
  const [selectedPodMemberId, setSelectedPodMemberId] = useState<string | null>(null);
  const [leaveReason, setLeaveReason] = useState("");
  const [willingToRejoin, setWillingToRejoin] = useState(true);
  const [leavingPod, setLeavingPod] = useState(false);

  // Dismiss Rider Modal State
  const [showDismissModal, setShowDismissModal] = useState(false);
  const [selectedDismissMemberId, setSelectedDismissMemberId] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const [dismissingRider, setDismissingRider] = useState(false);
  const [approvingRider, setApprovingRider] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    full_name: "",
    phone_number: "",
    age: "",
    gender: "",
    student_id: "",
    institution: "",
    academic_start_year: "",
    academic_end_year: "",
    is_pursuing: null,
    from_location: "",
    landmark: "",
    to_location: "",
    from_lat: null,
    from_lng: null,
    to_lat: null,
    to_lng: null,
    leave_home_time: "",
    leave_college_time: "",
    days_of_commute: [],
    prefer_hosting: false,
    prefer_taking_ride: false,
    vehicle_type: "",
    comfortable_with: "",
    agreed_to_terms: false,
    agreed_to_policies: false,
    route_geometry: undefined,
  });

  // Helper function to show notifications
  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    // Auto-dismiss after 5 seconds
    setTimeout(() => setNotification(null), 5000);
  };

  const loadProfileIntoFormData = (existingProfile: any) => {
    setFormData({
      full_name: existingProfile.full_name || "",
      phone_number: existingProfile.phone_number || "",
      age: existingProfile.age?.toString() || "",
      gender: existingProfile.gender || "",
      student_id: existingProfile.student_id || "",
      institution: existingProfile.institution || "",
      academic_start_year: existingProfile.academic_start_year?.toString() || "",
      academic_end_year: existingProfile.academic_end_year?.toString() || "",
      is_pursuing:
        existingProfile.is_pursuing === null ||
        existingProfile.is_pursuing === undefined
          ? null
          : existingProfile.is_pursuing,
      from_location: existingProfile.from_location || "",
      landmark: existingProfile.pickup_landmark || "",
      to_location: existingProfile.to_location || "",
      from_lat: existingProfile.from_lat || null,
      from_lng: existingProfile.from_lng || null,
      to_lat: existingProfile.to_lat || null,
      to_lng: existingProfile.to_lng || null,
      leave_home_time: existingProfile.leave_home_time || "",
      leave_college_time: existingProfile.leave_college_time || "",
      days_of_commute: existingProfile.days_of_commute || [],
      prefer_hosting: existingProfile.prefer_hosting || false,
      prefer_taking_ride: existingProfile.prefer_taking_ride || false,
      vehicle_type: existingProfile.vehicle_type || "",
      comfortable_with: existingProfile.comfortable_with || "",
      agreed_to_terms: true,
      agreed_to_policies: true,
    });
  };

  const handleChangeLocation = async () => {
    if (!user) return;

    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (existingProfile) {
      loadProfileIntoFormData(existingProfile);
    }

    setErrors({});
    setIsEditingLocation(true);
    setCurrentStep(1);
    setSubmitted(false);
  };

  const handleSaveLocation = async () => {
    const newErrors: Record<string, string> = {};
    if (!formData.from_location)
      newErrors.from_location = "Start location is required";
    if (!formData.to_location)
      newErrors.to_location = "Destination is required";
    if (!formData.from_lat || !formData.from_lng)
      newErrors.from_location = "Please select a valid location from the suggestions";
    if (!formData.to_lat || !formData.to_lng)
      newErrors.to_location = "Please select a valid location from the suggestions";

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      return;
    }

    const freshUserId = await getFreshUserId();
    if (!freshUserId) return;

    setSubmitting(true);

    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("email_verified, institutional_email")
      .eq("id", freshUserId)
      .single();

    const { error } = await upsertProfileRecord(
      freshUserId,
      existingProfile?.email_verified ?? false,
      existingProfile?.institutional_email ?? null,
    );

    if (error) {
      setSubmitting(false);
      console.error("Error updating location:", error);
      showNotification("error", "Failed to update location. Please try again.");
      return;
    }

    // The profile's from/to coordinates just changed, but matching runs
    // against ride_templates/ride_requests, which are only ever snapshotted
    // once and don't auto-refresh on a plain coordinate update - push the
    // new location into those rows and re-run matching against it.
    try {
      const rematchResponse = await fetch("/api/profile/update-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: freshUserId }),
      });

      if (rematchResponse.ok) {
        const suggestionsResponse = await fetch("/api/matches/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: freshUserId }),
        });
        if (suggestionsResponse.ok) {
          setMatchSuggestions(await suggestionsResponse.json());
        }
      } else {
        console.error("Failed to re-run matching after location change:", await rematchResponse.json().catch(() => ({})));
      }
    } catch (rematchError) {
      console.error("Error re-running matching after location change:", rematchError);
    }

    setSubmitting(false);
    setIsEditingLocation(false);
    setSubmitted(true);
    showNotification("success", "Location updated successfully!");
  };

  const handleAcceptMatch = async (matchId: string, riderName: string) => {
    console.log("🎯 [Frontend] Accepting match:", {
      matchId,
      hostId: user?.id,
      riderName,
      userExists: !!user?.id
    });

    try {
      const response = await fetch("/api/matches/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId,
          hostId: user?.id
        }),
      });

      console.log("📊 [Frontend] Accept response status:", response.status);
      const data = await response.json();
      console.log("📊 [Frontend] Accept response data:", data);

      if (response.ok && data.success) {
        console.log("✅ [Frontend] Match accepted successfully");
        showNotification('success', `Accepted request from ${riderName}!`);
        // Remove accepted match from queue
        setMatchSuggestions(prev => prev.filter(m => m.id !== matchId));
        // Refresh pods to show updated seat count
        if (user?.id) fetchConfirmedPods(user.id);
      } else {
        console.error("❌ [Frontend] Failed to accept match:", data.error);
        showNotification('error', data.error || 'Failed to accept match');
      }
    } catch (error) {
      console.error("❌ [Frontend] Error accepting match:", error);
      showNotification('error', 'Error accepting match. Please try again.');
    }
  };

  const handleConfirmRiderRide = async (rideRequestId: string) => {
    try {
      const response = await fetch("/api/pods/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rideRequestId,
          riderId: user?.id
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showNotification('success', 'Ride confirmed! You are now part of the pod.');
        // Refresh pods to show the confirmed ride
        if (user?.id) fetchConfirmedPods(user.id);
      } else {
        showNotification('error', data.error || 'Failed to confirm ride');
      }
    } catch (error) {
      console.error("Error confirming ride:", error);
      showNotification('error', 'Error confirming ride. Please try again.');
    }
  };

  const handleSkipMatch = async (matchId: string) => {
    try {
      const response = await fetch("/api/matches/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId,
          userId: user?.id,
          userRole: 'host'
        }),
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        showNotification('info', 'Skipped this match');
        setMatchSuggestions(prev => prev.filter(m => m.id !== matchId));
      } else {
        console.error("Failed to skip match", data.error);
        showNotification('error', data.error || 'Failed to skip match');
      }
    } catch (error) {
      console.error("Error skipping match:", error);
      showNotification('error', 'Error skipping match. Please try again.');
    }
  };

  const handleConfirmMatch = async (matchId: string) => {
    try {
      const confirmResponse = await fetch("/api/matches/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId,
          riderId: user?.id
        }),
      });

      const data = await confirmResponse.json();

      if (confirmResponse.ok && data.success) {
        showNotification('success', 'Ride confirmed! You are now part of the pod.');
        setMatchSuggestions(prev => prev.filter(m => m.id !== matchId));
        // Refresh pods to show the confirmed ride
        if (user?.id) fetchConfirmedPods(user.id);
      } else {
        showNotification('error', data.error || 'Failed to confirm ride');
        // Remove match from local state when seat unavailable
        if (data.error?.toLowerCase().includes("seat")) {
          setMatchSuggestions(prev => prev.filter(m => m.id !== matchId));
        }
      }
    } catch (error) {
      console.error("Error confirming match:", error);
      showNotification('error', 'Error confirming match. Please try again.');
    }
  };

  const handleRejectMatch = async (matchId: string) => {
    try {
      const response = await fetch("/api/matches/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId,
          userId: user?.id,
          userRole: 'rider'
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showNotification('info', 'Rejected this match');
        setMatchSuggestions(prev => prev.filter(m => m.id !== matchId));
      } else {
        console.error("Failed to reject match", data.error);
        showNotification('error', data.error || 'Failed to reject match');
      }
    } catch (error) {
      console.error("Error rejecting match:", error);
      showNotification('error', 'Error rejecting match. Please try again.');
    }
  };

  const handleRejectRiderRide = async (rideRequestId: string) => {
    try {
      // Delete the pod member record to reject the ride
      const { error } = await supabase
        .from("pod_members")
        .delete()
        .eq("ride_request_id", rideRequestId)
        .eq("rider_id", user?.id)
        .eq("status", "pending_rider");

      if (error) {
        console.error("Failed to reject ride:", error);
        showNotification('error', 'Failed to reject ride');
      } else {
        showNotification('info', 'Rejected this ride');
        // Refresh pods to remove the pending ride
        if (user?.id) fetchConfirmedPods(user.id);
      }
    } catch (error) {
      console.error("Error rejecting ride:", error);
      showNotification('error', 'Error rejecting ride. Please try again.');
    }
  };

  const handleLeavePod = async () => {
    if (!selectedPodMemberId || !user?.id || !leaveReason) {
      showNotification('error', 'Please select a reason for leaving');
      return;
    }

    setLeavingPod(true);
    try {
      const response = await fetch("/api/pods/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          podMemberId: selectedPodMemberId,
          userId: user.id,
          reason: leaveReason,
          willingToRejoin: willingToRejoin
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showNotification('success', 'You have left the pod');
        setShowLeavePodModal(false);
        setLeaveReason("");
        setWillingToRejoin(true);
        setSelectedPodMemberId(null);
        // Refresh pods
        fetchConfirmedPods(user.id);
      } else {
        showNotification('error', data.error || 'Failed to leave pod');
      }
    } catch (error) {
      console.error("Error leaving pod:", error);
      showNotification('error', 'Error leaving pod. Please try again.');
    } finally {
      setLeavingPod(false);
    }
  };

  const handleDismissRider = async () => {
    if (!selectedDismissMemberId || !user?.id || !dismissReason) {
      showNotification('error', 'Please select a reason for dismissing');
      return;
    }

    setDismissingRider(true);
    try {
      const response = await fetch("/api/pods/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          podMemberId: selectedDismissMemberId,
          hostId: user.id,
          reason: dismissReason
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showNotification('success', 'Rider has been removed from the pod');
        setShowDismissModal(false);
        setDismissReason("");
        setSelectedDismissMemberId(null);
        // Refresh pods
        fetchConfirmedPods(user.id);
      } else {
        showNotification('error', data.error || 'Failed to dismiss rider');
      }
    } catch (error) {
      console.error("Error dismissing rider:", error);
      showNotification('error', 'Error dismissing rider. Please try again.');
    } finally {
      setDismissingRider(false);
    }
  };

  const handleApproveRider = async (podMemberId: string) => {
    if (!user?.id) return;

    setApprovingRider(true);
    try {
      const response = await fetch("/api/pods/approve-rider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          podMemberId,
          hostId: user.id
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showNotification('success', 'Rider has been approved');
        fetchConfirmedPods(user.id);
      } else {
        showNotification('error', data.error || 'Failed to approve rider');
      }
    } catch (error) {
      console.error("Error approving rider:", error);
      showNotification('error', 'Error approving rider. Please try again.');
    } finally {
      setApprovingRider(false);
    }
  };

  const fetchConfirmedPods = async (userId: string) => {
    if (podsFetchInFlightRef.current) {
      return confirmedPods || { host_pods: [], rider_rides: [] };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      podsFetchInFlightRef.current = true;
      setLoadingPods(true);
      setPodsLoadError(false);
      const response = await fetch("/api/pods/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
        signal: controller.signal,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("API Error:", response.status, errorData);
        setPodsLoadError(true);
        setConfirmedPods({ host_pods: [], rider_rides: [] });
        return { host_pods: [], rider_rides: [] };
      }
      
      const data = await response.json();
      
      if (data.error) {
        console.error("Data Error:", data.error);
        setPodsLoadError(true);
        setConfirmedPods({ host_pods: [], rider_rides: [] });
      } else {
        setPodsLoadError(false);
        setConfirmedPods(data);
      }
      
      return data;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        console.error("Error fetching pods: request timed out after 12 seconds");
      } else {
        console.error("Error fetching pods:", error);
      }
      setPodsLoadError(true);
      setConfirmedPods({ host_pods: [], rider_rides: [] });
      return { host_pods: [], rider_rides: [] };
    } finally {
      clearTimeout(timeoutId);
      podsFetchInFlightRef.current = false;
      setLoadingPods(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    if (user?.id) {
       fetchConfirmedPods(user.id).then((data) => {
         if (!isMounted) return;

         // Allow fetching suggestions if:
         // 1. User is a HOST (host_pods > 0) OR
         // 2. User has NO ACTIVE confirmed rides (rider_rides with status 'active', 'pending_rider', 'pending_host')
         const hasActiveRide = data?.rider_rides?.some((ride: any) =>
           ride.status === 'active' || ride.status === 'pending_rider' || ride.status === 'pending_host'
         );

         if (!data || !hasActiveRide) {
           const fetchSuggestions = async () => {
             setLoadingSuggestions(true);
             try {
               const response = await fetch("/api/matches/suggestions", {
                 method: "POST",
                 headers: { "Content-Type": "application/json" },
                 body: JSON.stringify({ userId: user.id }),
               });

                if (response.ok && isMounted) {
                  const suggestionsData = await response.json();
                  console.log("🔍 [Dashboard] Raw match_suggestions from DB via /api/matches/suggestions:",
                    suggestionsData.map((s: any) => ({
                      id: s.id,
                      status: s.status,
                      created_at: s.created_at,
                      pickup_distance_meters: s.pickup_distance_meters,
                      destination_distance_meters: s.destination_distance_meters,
                      overlapping_distance_meters: s.overlapping_distance_meters,
                      route_match_score: s.route_match_score,
                      ride_template_id: s.ride_template_id ?? s.ride_template?.id,
                      ride_request_id: s.ride_request_id ?? s.ride_request?.id,
                    }))
                  );
                  setMatchSuggestions(suggestionsData);
               } else if (isMounted) {
                 console.error("Failed to fetch suggestions:", await response.json().catch(() => ({})));
               }
             } catch (error) {
               console.error("Error fetching suggestions:", error);
             } finally {
               if (isMounted) setLoadingSuggestions(false);
             }
           };
           fetchSuggestions();
         }
       });
    }

    return () => {
      isMounted = false;
    };
  }, [user?.id, submitted]);

  useEffect(() => {
    if (!user?.id || !isSupabaseConfigured()) return;

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const schedulePodsRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        fetchConfirmedPods(user.id);
      }, 400);
    };

    const channel = supabase
      .channel('pod_members_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pod_members',
          filter: `rider_id=eq.${user.id}`,
        },
        () => {
          schedulePodsRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pods',
          filter: `host_id=eq.${user.id}`,
        },
        () => {
          schedulePodsRefresh();
        }
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    const checkUser = async () => {
      if (!isSupabaseConfigured()) {
        setLoading(false);
        return;
      }

      // Longer delay to allow session to initialize after redirect
      await new Promise((resolve) => setTimeout(resolve, 500));

      try {
        // Use getUser() which validates with the server - more reliable after OAuth
        const {
          data: { user: authUser },
          error: authError,
        } = await supabase.auth.getUser();

      console.log(
        "Dashboard checkUser - authUser:",
        authUser?.email,
        "error:",
        authError?.message,
      );

      if (authUser) {
        // Check if email user has set their password
        // OAuth users (Google) don't need this check
        const provider = authUser.app_metadata?.provider;
        const isOAuthUser = provider && provider !== "email";
        const passwordSet = authUser.user_metadata?.password_set === true;

        if (!isOAuthUser && !passwordSet) {
          // User hasn't set their password yet — redirect to set-password
          console.log("User hasn't set password, redirecting to /set-password");
          setLoading(false);
          router.push("/set-password");
          return;
        }

        setUser(authUser);

        // Check if user has already submitted
        const { data: existingEntry } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", authUser.id)
          .single();

        if (existingEntry) {
          setSubmitted(true);
          setIsVerified(existingEntry.email_verified);
          setCurrentInstitutionalEmail(existingEntry.institutional_email);
          setRejectionReason(existingEntry.rejection_reason || null);
        } else if (authUser.user_metadata?.full_name) {
          setFormData((prev) => ({
            ...prev,
            full_name: authUser.user_metadata.full_name,
          }));
        }
        console.log("Dashboard data loaded at:", Date.now());
        setLoading(false);
        return;
      }

      // Fallback: try getSession
      const {
        data: { session },
      } = await supabase.auth.getSession();

      console.log("Dashboard checkUser - session:", session?.user?.email);

      if (session?.user) {
        // Same password check for fallback session path
        const fallbackProvider = session.user.app_metadata?.provider;
        const fallbackIsOAuth = fallbackProvider && fallbackProvider !== "email";
        const fallbackPasswordSet = session.user.user_metadata?.password_set === true;

        if (!fallbackIsOAuth && !fallbackPasswordSet) {
          console.log("Fallback: User hasn't set password, redirecting to /set-password");
          setLoading(false);
          router.push("/set-password");
          return;
        }

        setUser(session.user);

        // Check if user has already submitted
        const { data: existingEntry } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();

        if (existingEntry) {
          setSubmitted(true);
          setIsVerified(existingEntry.email_verified);
          setCurrentInstitutionalEmail(existingEntry.institutional_email);
          setRejectionReason(existingEntry.rejection_reason || null);
        } else if (session.user.user_metadata?.full_name) {
          setFormData((prev) => ({
            ...prev,
            full_name: session.user.user_metadata.full_name,
          }));
        }
        setLoading(false);
        return;
      }

      // No user found, redirect to login
      console.log("No session found, redirecting to login");
      setLoading(false); // Set loading to false BEFORE redirect to prevent white flash
      router.push("/signup");
      } catch (err) {
        console.error("Error checking user:", err);
        setLoading(false);
      }
    };

    // Track if checkUser is still running to prevent race conditions
    let checkUserPromise: Promise<void> | null = null;

    const handleAuthStateChange = async (event: string, session: any) => {
      console.log("Dashboard auth state change:", event, session?.user?.email);
      
      if (event === "SIGNED_OUT") {
        router.push("/signup");
        return;
      }
      
      if (event === "SIGNED_IN" && session?.user) {
        // If checkUser is still running, wait for it to complete
        if (checkUserPromise) {
          await checkUserPromise;
        }
        // Only update if user hasn't been set yet
        if (!user?.id || user.id !== session.user.id) {
          setUser(session.user);
          // Don't set loading=false here - checkUser will do it
          // This prevents race conditions where we render before submitted is set
        }
      }
    };

    // Start checkUser and store the promise so auth handler can await it
    checkUserPromise = checkUser();
    checkUserPromise.catch(console.error); // Prevent unhandled rejection

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(handleAuthStateChange);

    return () => subscription.unsubscribe();
  }, [router, user?.id]);

  // Academic years are a mandatory profile field - every path that writes to
  // the profiles table must go through this so a forgotten field in one
  // upsert call can never silently persist NULL instead of failing loudly.
  const getValidatedAcademicYears = (): { startYear: number; endYear: number } | null => {
    const startYear = parseInt(formData.academic_start_year);
    const endYear = parseInt(formData.academic_end_year);
    if (!Number.isInteger(startYear) || !Number.isInteger(endYear)) {
      return null;
    }
    return { startYear, endYear };
  };

  const handleNext = () => {
    // Validate step 1 fields
    const newErrors: Record<string, string> = {};

    if (!formData.full_name) newErrors.full_name = "Full name is required";
    if (!formData.phone_number)
      newErrors.phone_number = "Phone number is required";
    else if (!isValidPhoneNumber(formData.phone_number, "IN"))
      newErrors.phone_number = "Enter a valid phone number";
    if (!formData.age) newErrors.age = "Age is required";
    if (!formData.gender) newErrors.gender = "Gender is required";
    if (!formData.institution)
      newErrors.institution = "Institution is required";
    // Validate custom college if "Other" is selected
    if (formData.institution === "Other" && !customCollege)
      newErrors.institution = "Please enter your institution name";
    if (!formData.student_id)
      newErrors.student_id = "Student ID is required";
    if (!formData.academic_start_year)
      newErrors.academic_start_year = "Academic start year is required";
    else if (!ACADEMIC_YEARS.includes(parseInt(formData.academic_start_year)))
      newErrors.academic_start_year = `Enter a year between ${MIN_ACADEMIC_YEAR} and ${MAX_ACADEMIC_YEAR}`;
    if (!formData.academic_end_year)
      newErrors.academic_end_year = "Academic end year is required";
    else if (!ACADEMIC_YEARS.includes(parseInt(formData.academic_end_year)))
      newErrors.academic_end_year = `Enter a year between ${MIN_ACADEMIC_YEAR} and ${MAX_ACADEMIC_YEAR}`;
    if (
      formData.academic_start_year &&
      formData.academic_end_year &&
      parseInt(formData.academic_end_year) < parseInt(formData.academic_start_year)
    )
      newErrors.academic_end_year = "End year cannot be before start year";
    if (formData.is_pursuing === null)
      newErrors.is_pursuing = "Please tell us if you're currently a student";
    // Host/Rider preference
    if (!formData.prefer_hosting && !formData.prefer_taking_ride) {
      newErrors.preference = "Select at least one option";
    }
    // Vehicle type only required for hosts
    if (formData.prefer_hosting && !formData.vehicle_type) {
      newErrors.vehicle_type = "Select your vehicle type";
    }
    if (!formData.from_location)
      newErrors.from_location = "Start location is required";
    if (!formData.to_location)
      newErrors.to_location = "Destination is required";
    if (!formData.from_lat || !formData.from_lng)
      newErrors.from_location = "Please select a valid location from the suggestions";
    if (!formData.to_lat || !formData.to_lng)
      newErrors.to_location = "Please select a valid location from the suggestions";
    if (!formData.leave_home_time)
      newErrors.leave_home_time = "Leave home time is required";
    if (!formData.leave_college_time)
      newErrors.leave_college_time = "Leave college time is required";
    if (formData.days_of_commute.length === 0)
      newErrors.days_of_commute = "Select at least one day";

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return;
    }
    setCurrentStep(2);
  };

  const handleNextToStep3 = () => {
    // Validate step 2 fields
    const newErrors: Record<string, string> = {};

    if (!formData.comfortable_with)
      newErrors.comfortable_with = "Select who you're comfortable with";
    if (!formData.agreed_to_terms)
      newErrors.agreed_to_terms = "You must agree to continue";

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return;
    }
    setCurrentStep(3);
  };

  const handleBack = () => {
    if (currentStep === 3) {
      setCurrentStep(2);
    } else {
      setCurrentStep(1);
    }
    setErrors({});
  };

  const getFreshUserId = async (): Promise<string | null> => {
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authUser?.id) {
      console.error("Unable to resolve authenticated user:", authError);
      setOtpError("Session expired. Please sign in again.");
      router.push("/signup");
      return null;
    }

    if (!user || user.id !== authUser.id) {
      setUser(authUser);
    }

    return authUser.id;
  };

  const upsertProfileRecord = async (
    userId: string,
    emailVerified: boolean,
    institutionalEmailValue: string | null,
  ) => {
    const finalInstitution =
      formData.institution === "Other" ? customCollege : formData.institution;

    const academicYears = getValidatedAcademicYears();
    if (!academicYears) {
      return {
        error: { message: "Academic start/end year is required." } as any,
      };
    }

    return supabase.from("profiles").upsert(
      {
        id: userId,
        full_name: formData.full_name,
        phone_number: formData.phone_number,
        age: parseInt(formData.age),
        gender: formData.gender,
        student_id: formData.student_id,
        institution: finalInstitution,
        academic_start_year: academicYears.startYear,
        academic_end_year: academicYears.endYear,
        is_pursuing: formData.is_pursuing,
        institutional_email: institutionalEmailValue,
        from_location: formData.from_location,
        pickup_landmark: formData.landmark || null,
        to_location: formData.to_location,
        from_lat: formData.from_lat,
        from_lng: formData.from_lng,
        to_lat: formData.to_lat,
        to_lng: formData.to_lng,
        leave_home_time: formData.leave_home_time,
        leave_college_time: formData.leave_college_time,
        days_of_commute: formData.days_of_commute,
        prefer_hosting: formData.prefer_hosting,
        prefer_taking_ride: formData.prefer_taking_ride,
        vehicle_type: formData.prefer_hosting ? formData.vehicle_type : null,
        comfortable_with: formData.comfortable_with,
        agreed_to_terms: formData.agreed_to_terms,
        email_verified: emailVerified,
      },
      { onConflict: "id" },
    );
  };

  const handleSendOTP = async () => {
    // Validate institutional email
    if (!institutionalEmail) {
      setOtpError("Institutional email is required");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(institutionalEmail)) {
      setOtpError("Please enter a valid email address");
      return;
    }

    // Educational domain validation (from educational_mails.txt)
    const allowedDomains = [
      "vjit.ac.in",
      "cbit.org.in",
      "chaitanya.edu.in",
      "vce.ac.in",
      "lords.ac.in",
      "mgit.ac.in",
      "cvr.ac.in"
    ];
    const emailDomain = institutionalEmail.split("@")[1]?.toLowerCase();
    
    if (!emailDomain || !allowedDomains.includes(emailDomain)) {
      setOtpError("Unsupported college email. Please skip verification for now and we will do it later.");
      return;
    }

    const freshUserId = await getFreshUserId();
    if (!freshUserId) {
      return;
    }

    setOtpLoading(true);
    setOtpError("");

    try {
      const { error: profileSaveError } = await upsertProfileRecord(
        freshUserId,
        false,
        institutionalEmail,
      );

      if (profileSaveError) {
        console.error("Error saving profile before OTP send:", profileSaveError);
        setOtpError(
          `Failed to save profile: ${profileSaveError.message}. Please try again.`,
        );
        setOtpLoading(false);
        return;
      }

      const response = await fetch("/api/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: institutionalEmail,
          userId: freshUserId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setOtpError(data.error || "Failed to send OTP");
        setOtpLoading(false);
        return;
      }

      setVerificationStep("otp");
      setResendTimer(60);
    } catch (err) {
      console.error("Send OTP error:", err);
      setOtpError("Failed to send OTP. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendTimer > 0) return;

    const freshUserId = await getFreshUserId();
    if (!freshUserId) {
      return;
    }

    setOtpLoading(true);
    setOtpError("");

    try {
      const response = await fetch("/api/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: institutionalEmail,
          userId: freshUserId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setOtpError(data.error || "Failed to resend OTP");
      } else {
        setResendTimer(60);
        setOtpError("");
      }
    } catch (err) {
      setOtpError("Failed to resend OTP");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otpCode || otpCode.length !== 6) {
      setOtpError("Please enter a valid 6-digit code");
      return;
    }

    setOtpLoading(true);
    setOtpError("");

    try {
      const freshUserId = await getFreshUserId();
      if (!freshUserId) {
        setOtpLoading(false);
        return;
      }

      const response = await fetch("/api/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          otp: otpCode,
          userId: freshUserId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setOtpError(data.error || "Invalid OTP");
        setOtpLoading(false);
        return;
      }

      // OTP verified, now save the profile
      setSubmitting(true);
      // Use custom college if "Other" is selected
      const finalInstitution = formData.institution === "Other" ? customCollege : formData.institution;

      // Calculate available seats based on vehicle type (2-wheeler: 1, 4-wheeler: 3)
      const availableSeats = formData.vehicle_type === '2_wheeler' ? 1 : 3;

      const academicYears = getValidatedAcademicYears();
      if (!academicYears) {
        setOtpError("Academic start/end year is required.");
        setOtpLoading(false);
        setSubmitting(false);
        return;
      }

      const { error: insertError } = await supabase.from("profiles").upsert(
        {
          id: user?.id,
          full_name: formData.full_name,
          phone_number: formData.phone_number,
          age: parseInt(formData.age),
          gender: formData.gender,
          student_id: formData.student_id,
          institution: finalInstitution,
          academic_start_year: academicYears.startYear,
          academic_end_year: academicYears.endYear,
          is_pursuing: formData.is_pursuing,
          institutional_email: institutionalEmail,
          from_location: formData.from_location,
          pickup_landmark: formData.landmark || null,
          to_location: formData.to_location,
          from_lat: formData.from_lat,
          from_lng: formData.from_lng,
          to_lat: formData.to_lat,
          to_lng: formData.to_lng,
          leave_home_time: formData.leave_home_time,
          leave_college_time: formData.leave_college_time,
          days_of_commute: formData.days_of_commute,
          prefer_hosting: formData.prefer_hosting,
          prefer_taking_ride: formData.prefer_taking_ride,
          vehicle_type: formData.prefer_hosting ? formData.vehicle_type : null,
          comfortable_with: formData.comfortable_with,
          agreed_to_terms: formData.agreed_to_terms,
          email_verified: true,
          rejection_reason: null,
        },
        { onConflict: "id" },
      );

      if (insertError) {
        console.error("Error saving profile:", insertError);
        console.error("Insert error details:", {
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
          code: insertError.code,
        });
        setOtpError(
          `Failed to save profile: ${insertError.message}. Check console for details.`,
        );
        return;
      }

      console.log("Profile saved successfully!");

      // If user is hosting, create ride template automatically
      if (formData.prefer_hosting) {
        console.log("Creating ride template for host with", availableSeats, "seats");

        const rideTemplateResponse = await fetch("/api/rides/templates/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: freshUserId,
            vehicleType: formData.vehicle_type,
            availableSeats: availableSeats,
            maxDetourMeters: 2000,
            returnTime: formData.leave_college_time,
            routeGeometry: selectedRouteGeometry,
          }),
        });

        const rideTemplateResult = await rideTemplateResponse.json();

        if (rideTemplateResult.success || rideTemplateResult.ride_template_id) {
          console.log("Ride template created successfully:", rideTemplateResult.ride_template_id);
        } else {
          console.error("Failed to create ride template:", rideTemplateResult.error);
          // Don't block the flow, just log the error
        }
      }

      // If user is taking ride, create ride request automatically
      if (formData.prefer_taking_ride) {
        console.log("Creating ride request for rider");

        const rideRequestResponse = await fetch("/api/rides/requests/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: freshUserId,
            preferredArrivalTime: formData.leave_college_time,
            timeFlexibilityMins: 30,
            vehiclePreference: 'any',
            genderPreference: formData.comfortable_with || 'both',
          }),
        });

        const rideRequestResult = await rideRequestResponse.json();

        if (rideRequestResult.success || rideRequestResult.ride_request_id) {
          console.log("Ride request created successfully:", rideRequestResult.ride_request_id);
        } else {
          console.error("Failed to create ride request:", rideRequestResult.error);
          // Don't block the flow, just log the error
        }
      }

      setIsVerified(true);
      setCurrentInstitutionalEmail(institutionalEmail);
      setOtpLoading(false);
      setSubmitting(false);
      setVerificationStep(null); // Reset verification step to allow submitted screen to show
      setSubmitted(true);
      return; // Exit early after success
    } catch (err) {
      console.error("Catch block error:", err);
      setOtpError("Failed to verify OTP. Please try again.");
      setOtpLoading(false);
      setSubmitting(false);
    }
  };

  const handleRequestManualVerification = async () => {
    setSubmitting(true);
    setOtpError("");

    try {
      const freshUserId = await getFreshUserId();
      if (!freshUserId) {
        setSubmitting(false);
        return;
      }

      // Use custom college if "Other" is selected
      const finalInstitution = formData.institution === "Other" ? customCollege : formData.institution;

      // Calculate available seats based on vehicle type (2-wheeler: 1, 4-wheeler: 3)
      const availableSeats = formData.vehicle_type === '2_wheeler' ? 1 : 3;

      const academicYears = getValidatedAcademicYears();
      if (!academicYears) {
        setOtpError("Academic start/end year is required.");
        setSubmitting(false);
        return;
      }

      const { error: insertError } = await supabase.from("profiles").upsert(
        {
          id: user?.id,
          full_name: formData.full_name,
          phone_number: formData.phone_number,
          age: parseInt(formData.age),
          gender: formData.gender,
          student_id: formData.student_id,
          institution: finalInstitution,
          academic_start_year: academicYears.startYear,
          academic_end_year: academicYears.endYear,
          is_pursuing: formData.is_pursuing,
          institutional_email: null,
          from_location: formData.from_location,
          pickup_landmark: formData.landmark || null,
          to_location: formData.to_location,
          from_lat: formData.from_lat,
          from_lng: formData.from_lng,
          to_lat: formData.to_lat,
          to_lng: formData.to_lng,
          leave_home_time: formData.leave_home_time,
          leave_college_time: formData.leave_college_time,
          days_of_commute: formData.days_of_commute,
          prefer_hosting: formData.prefer_hosting,
          prefer_taking_ride: formData.prefer_taking_ride,
          vehicle_type: formData.prefer_hosting ? formData.vehicle_type : null,
          comfortable_with: formData.comfortable_with,
          agreed_to_terms: formData.agreed_to_terms,
          email_verified: false,
          rejection_reason: null,
        },
        { onConflict: "id" },
      );

      if (insertError) {
        console.error("Error saving profile:", insertError);
        setOtpError(
          `Failed to save profile: ${insertError.message}. Please try again.`,
        );
        setSubmitting(false);
        return;
      }

      console.log("Profile saved successfully (without email)!");

      // If user is hosting, create ride template automatically
      if (formData.prefer_hosting) {
        console.log("Creating ride template for host with", availableSeats, "seats");

        const rideTemplateResponse = await fetch("/api/rides/templates/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: freshUserId,
            vehicleType: formData.vehicle_type,
            availableSeats: availableSeats,
            maxDetourMeters: 2000,
            returnTime: formData.leave_college_time,
            routeGeometry: selectedRouteGeometry,
          }),
        });

        const rideTemplateResult = await rideTemplateResponse.json();

        if (rideTemplateResult.success || rideTemplateResult.ride_template_id) {
          console.log("Ride template created successfully:", rideTemplateResult.ride_template_id);
        } else {
          console.error("Failed to create ride template:", rideTemplateResult.error);
          // Don't block the flow, just log the error
        }
      }

      // If user is taking ride, create ride request automatically
      if (formData.prefer_taking_ride) {
        console.log("Creating ride request for rider");

        const rideRequestResponse = await fetch("/api/rides/requests/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: freshUserId,
            preferredArrivalTime: formData.leave_college_time,
            timeFlexibilityMins: 30,
            vehiclePreference: 'any',
            genderPreference: formData.comfortable_with || 'both',
          }),
        });

        const rideRequestResult = await rideRequestResponse.json();

        if (rideRequestResult.success || rideRequestResult.ride_request_id) {
          console.log("Ride request created successfully:", rideRequestResult.ride_request_id);
        } else {
          console.error("Failed to create ride request:", rideRequestResult.error);
          // Don't block the flow, just log the error
        }
      }

      setIsVerified(false);
      setCurrentInstitutionalEmail(null);
      setSubmitting(false);
      setSubmitted(true);
    } catch (err) {
      console.error("Error saving profile:", err);
      setOtpError("Failed to save profile. Please try again.");
      setSubmitting(false);
    }
  };

  // Timer for resend OTP
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  const toggleArrayValue = (field: "days_of_commute", value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((v) => v !== value)
        : [...prev[field], value],
    }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#6675FF]/20"></div>
          <p className="text-gray-500">Loading...</p>
        </div>
      </main>
    );
  }

  if (submitted) {
    if (isVerified === false) {
      return (
        <main className="min-h-screen bg-gradient-to-br from-[#f0f2ff] via-white to-[#e8ebff] flex items-center justify-center px-4 py-8">
          <div className="fixed inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#6675FF]/10 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#6675FF]/10 rounded-full blur-3xl"></div>
          </div>
          <div className="relative w-full max-w-lg bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl p-10 text-center border border-white/50">
            {currentInstitutionalEmail === "REJECTED" ? (
              <>
                <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-3">Verification Rejected</h2>
                {rejectionReason && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-left">
                    <p className="text-sm font-semibold text-red-800 mb-1">Reason for rejection:</p>
                    <p className="text-sm text-red-700">{rejectionReason}</p>
                  </div>
                )}
                <p className="text-gray-600 mb-6">
                  Please update your profile with correct details and resubmit for verification.
                </p>
                <button
                  onClick={async () => {
                    setSubmitted(false);
                    setCurrentInstitutionalEmail(null);
                    setRejectionReason(null);
                    
                    // Load existing profile data into form
                    if (user) {
                      const { data: existingProfile } = await supabase
                        .from("profiles")
                        .select("*")
                        .eq("id", user.id)
                        .single();

                      if (existingProfile) {
                        loadProfileIntoFormData(existingProfile);
                      }
                    }
                  }}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#6675FF] hover:bg-[#5568e3] text-white font-semibold rounded-xl transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Update & Resubmit
                </button>
              </>
            ) : (
              <>
                <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-3">Verifying Your Identity</h2>
                <p className="text-gray-600 mb-6">
                  Your profile is currently under manual review. This usually takes up to 24 hours. We'll notify you once verified!
                </p>
                <div className="w-12 h-12 border-4 border-[#6675FF] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              </>
            )}
          </div>
        </main>
      );
    }

    return (
      <main className="min-h-screen bg-gradient-to-br from-[#f0f2ff] via-white to-[#e8ebff] flex justify-center px-4 sm:px-6 lg:px-8 py-8">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#6675FF]/10 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#6675FF]/10 rounded-full blur-3xl"></div>
        </div>

        <div className="relative w-full max-w-7xl">
          {/* Toast Notification */}
          {notification && (
            <div className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-slide-in ${
              notification.type === 'success' ? 'bg-green-500 text-white' :
              notification.type === 'error' ? 'bg-red-500 text-white' :
              'bg-gray-800 text-white'
            }`}>
              {notification.type === 'success' && (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {notification.type === 'error' && (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {notification.type === 'info' && (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <span className="font-medium">{notification.message}</span>
            </div>
          )}

          {(loadingPods) && (
             <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl p-8 text-center border border-white/50">
               <div className="w-12 h-12 border-4 border-[#6675FF] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
               <p className="text-gray-500">
                 {loadingPods ? "Checking for scheduled rides..." : "Finding your best matches..."}
               </p>
             </div>
          )} 

          {/* PENDING PODS - Host accepted, waiting for rider (HOST VIEW) */}
          {(confirmedPods && confirmedPods.host_pods?.some((pod: any) =>
            pod.pod_members?.some((m: any) => m.status === 'pending_rider')
          )) && (
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-[#6675FF]/10 overflow-hidden border border-white/50">
               <div className="bg-gradient-to-r from-[#f59e0b] to-[#d97706] p-6 text-white text-center">
                 <h2 className="text-2xl font-semibold mb-1">Waiting for rider confirmation</h2>
                 <p className="opacity-90">You've accepted, rider needs to confirm</p>
               </div>

               <div className="p-8">
                 {confirmedPods.host_pods
                   .filter((pod: any) => pod.pod_members?.some((m: any) => m.status === 'pending_rider'))
                   .map((pod: any) => (
                     <div key={pod.id} className="space-y-4">
                       <h3 className="text-lg font-semibold text-gray-800 mb-4">Pending Riders</h3>
                       {pod.pod_members
                         .filter((member: any) => member.status === 'pending_rider')
                         .map((member: any) => (
                           <div key={member.id} className="p-4 border border-amber-200 bg-amber-50 rounded-xl">
                             <div className="flex items-center gap-3">
                               <div className="w-10 h-10 rounded-full bg-amber-200 flex items-center justify-center text-amber-700 font-bold">
                                 {member.profiles?.full_name?.charAt(0) || "R"}
                               </div>
                               <div>
                                 <p className="font-semibold text-gray-800">{member.profiles?.full_name || "Rider"}</p>
                                 <p className="text-xs text-amber-700">Waiting for confirmation</p>
                               </div>
                             </div>
                           </div>
                         ))}
                     </div>
                   ))}
               </div>
            </div>
          )}

          {/* PENDING PODS - Rider needs to confirm (RIDER VIEW) */}
          {(confirmedPods && confirmedPods.rider_rides?.some((ride: any) => ride.status === 'pending_rider')) && (
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-[#6675FF]/10 overflow-hidden border border-white/50">
               <div className="bg-gradient-to-r from-[#f59e0b] to-[#d97706] p-6 text-white text-center">
                 <h2 className="text-2xl font-semibold mb-1">Host accepted your request!</h2>
                 <p className="opacity-90">Confirm your ride to join the pod</p>
               </div>

               <div className="p-8">
                 {confirmedPods.rider_rides
                   .filter((ride: any) => ride.status === 'pending_rider')
                   .map((ride: any) => (
                     <div key={ride.id} className="space-y-4">
                       <div className="flex items-center gap-4 p-4 bg-amber-50 rounded-xl border border-amber-200">
                         <div className="w-12 h-12 rounded-full bg-amber-200 flex items-center justify-center text-amber-700 text-lg font-bold">
                           {ride.pod?.profiles?.full_name?.charAt(0) || "H"}
                         </div>
                         <div>
                           <p className="font-semibold text-gray-800">
                             {ride.pod?.profiles?.full_name || "Host"}
                           </p>
                           <p className="text-sm text-amber-700">Waiting for your confirmation</p>
                         </div>
                       </div>

<div className="space-y-2">
                          <div className="p-3 bg-[#6675FF]/10 rounded-xl">
                            <p className="text-xs text-[#6675FF] font-semibold uppercase mb-1">Pickup</p>
                            <p className="text-gray-700 text-sm font-medium">{ride.pickup_location}</p>
                          </div>
                          <div className="p-3 bg-[#4d5ce6]/10 rounded-xl">
                            <p className="text-xs text-[#4d5ce6] font-semibold uppercase mb-1">Departure Time</p>
                            <p className="text-gray-700 text-sm font-medium">{ride.pod?.ride_template?.departure_time}</p>
                          </div>
                        </div>

                       <div className="flex gap-3">
                         <button
                           onClick={() => handleConfirmRiderRide(ride.ride_request_id)}
                           className="flex-1 py-3 bg-gradient-to-r from-[#10b981] to-[#059669] text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-green-500/30 transition-all"
                         >
                           Confirm Ride
                         </button>
                         <button
                           onClick={() => handleRejectRiderRide(ride.ride_request_id)}
                           className="flex-1 py-3 bg-gradient-to-r from-gray-400 to-gray-500 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-gray-500/30 transition-all"
                         >
                           Reject
                         </button>
                       </div>
                     </div>
                   ))}
               </div>
            </div>
          )}

          {/* CONFIRMED PODS */}
          {(confirmedPods && (
            // Show confirmed pod card if:
            // 1. Host has ANY pod (with or without members), OR
            // 2. Rider has active ride
            (confirmedPods.host_pods?.length > 0) ||
            (confirmedPods.rider_rides?.some((ride: any) => ride.status === 'active'))
          )) && (
            // CONFIRMED RIDE CARD
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-[#6675FF]/10 overflow-hidden border border-white/50">
               <div className="bg-gradient-to-r from-[#10b981] to-[#059669] p-6 text-white text-center">
                 <h2 className="text-2xl font-semibold mb-1">Your Ride Pod</h2>
                 <p className="opacity-90">Your commute is ready</p>
               </div>

               <div className="p-8">
                 {/* HOST VIEW OF POD */}
                 {confirmedPods.host_pods?.length > 0 && (
                   <div className="mb-6">
                     <h3 className="text-lg font-semibold text-gray-800 mb-4">Your Pod</h3>
                     {confirmedPods.host_pods.map((pod: any) => (
                       <div key={pod.id} className="space-y-4">
                         {/* Route Summary Card */}
                         <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-3 opacity-10">
                               <svg className="w-24 h-24 text-[#6675FF]" fill="currentColor" viewBox="0 0 24 24"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
                            </div>
                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-xs font-bold text-[#6675FF] bg-[#6675FF]/10 px-2 py-1 rounded-full uppercase tracking-wider">
                                        Pool
                                    </span>
                                    <span className="text-sm font-medium text-gray-500 flex items-center gap-1">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        {pod.ride_template?.departure_time}
                                    </span>
                                </div>
                                <h4 className="text-lg font-bold text-gray-800 mb-1">My Route</h4>
                                <div className="flex items-center gap-2 text-gray-600 text-sm">
                                    <span className="truncate max-w-[45%]">{pod.ride_template?.from_location}</span>
                                    <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                                    <span className="truncate max-w-[45%]">{pod.ride_template?.to_location}</span>
                                </div>
                                <div className="mt-3 flex items-center gap-2">
                                     <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-green-500 rounded-full transition-all duration-500"
                                            style={{ width: `${(pod.actual_available_seats ?? pod.ride_template?.available_seats ?? pod.available_seats ?? 0) > 0 ? ((pod.actual_seats_taken ?? 0) / (pod.actual_available_seats ?? pod.ride_template?.available_seats ?? pod.available_seats ?? 1)) * 100 : 0}%` }}
                                        ></div>
                                     </div>
                                      <span className="text-xs font-semibold text-gray-500">
                                         {pod.actual_seats_taken ?? 0}/{pod.actual_available_seats ?? pod.ride_template?.available_seats ?? pod.available_seats ?? 0} Seats Available
                                      </span>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                  {pod.ride_template?.days_available && Array.isArray(pod.ride_template?.days_available) && (
                                    <div className="flex items-center gap-1.5 text-gray-600">
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                      <span>{pod.ride_template.days_available.map((d: string) => d.slice(0, 3)).join(', ')}</span>
                                    </div>
                                  )}
                                  {pod.pod_members?.some((m: any) => m.ride_requests?.time_flexibility_mins) && (
                                    <div className="flex items-center gap-1.5 text-gray-600">
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                      <span>±{pod.pod_members.find((m: any) => m.ride_requests?.time_flexibility_mins)?.ride_requests?.time_flexibility_mins || 0} mins</span>
                                    </div>
                                  )}
                                </div>
                            </div>
                         </div>
                         
<div>
                            <div className="flex justify-between items-end mb-3">
                                 {(() => {
                                   const confirmedCount = (pod.pod_members?.filter((m: any) => m.status === 'active') || []).length;
                                   const pendingCount = (pod.pod_members?.filter((m: any) => m.status === 'pending_host') || []).length;
                                   return <p className="text-sm font-semibold text-gray-700">Riders ({confirmedCount + pendingCount})</p>;
                                 })()}
                            </div>
                            
                            {(() => {
                              const confirmedMembers = pod.pod_members?.filter((m: any) => m.status === 'active') || [];
                              const pendingMembers = pod.pod_members?.filter((m: any) => m.status === 'pending_host') || [];
                              
                              return (
                                <>
                                  {pendingMembers.length > 0 && (
                                    <div className="mb-4">
                                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Waiting for Approval ({pendingMembers.length})</p>
                                      <div className="space-y-3">
                                        {pendingMembers.map((member: any) => (
                                          <div key={member.id} className="relative p-4 border border-amber-200 rounded-xl bg-amber-50 shadow-sm">
                                            <div className="flex items-center gap-3 mb-3">
                                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center text-white font-bold">
                                                {member.profiles?.full_name?.charAt(0) || "R"}
                                              </div>
                                              <div>
                                                <p className="font-semibold text-gray-800">{member.profiles?.full_name || "Rider"}</p>
                                                <div className="flex items-center gap-2 text-xs text-amber-600">
                                                   <span className="px-2 py-0.5 rounded-full bg-amber-100">
                                                     Waiting for host approval
                                                   </span>
                                                </div>
                                              </div>
                                              <div className="ml-auto flex items-center gap-2">
                                                  <button
                                                    onClick={() => handleApproveRider(member.id)}
                                                    disabled={approvingRider}
                                                    className="px-3 py-1.5 bg-green-500 text-white text-xs font-medium rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
                                                  >
                                                    {approvingRider ? '...' : 'Accept'}
                                                  </button>
                                                  <button
                                                    onClick={() => {
                                                      setSelectedDismissMemberId(member.id);
                                                      setShowDismissModal(true);
                                                    }}
                                                    className="w-8 h-8 flex items-center justify-center bg-red-100 text-red-600 rounded-full hover:bg-red-200 transition-colors"
                                                    title="Reject rider"
                                                  >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                  </button>
                                              </div>
                                            </div>
<div className="space-y-2 text-xs">
                                               <div className="bg-white p-2 rounded-lg border border-amber-100">
                                                 <span className="block text-amber-600 font-bold uppercase tracking-wider text-[10px] mb-0.5">Pickup</span>
                                                 <span className="text-gray-700 font-medium">
                                                     {member.ride_requests?.pickup_location || "N/A"}
                                                 </span>
                                               </div>
                                               <div className="bg-white p-2 rounded-lg border border-amber-100">
                                                 <span className="block text-amber-600 font-bold uppercase tracking-wider text-[10px] mb-0.5">Dropoff</span>
                                                 <span className="text-gray-700 font-medium">
                                                     {member.ride_requests?.destination_location || "N/A"}
                                                 </span>
                                               </div>
{member.overlapping_distance_meters > 0 && (
                                                   <div className="bg-green-50 p-2 rounded-lg border border-green-100">
                                                     <span className="block text-green-700 font-bold uppercase tracking-wider text-[10px] mb-0.5">One Way Cost Contribution</span>
                                                     <span className="text-gray-700 font-medium">
                                                       ₹{Math.round((member.overlapping_distance_meters / 1000) * 4)} ({Math.round(member.overlapping_distance_meters / 1000)} km)
                                                     </span>
                                                   </div>
                                                 )}
                                           </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {confirmedMembers.length > 0 ? (
                                    <div className="space-y-3">
                                      {confirmedMembers.map((member: any) => (
                                        <div key={member.id} className="relative p-4 border border-gray-100 rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow">
                                          <div className="flex items-center gap-3 mb-3">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#6675FF] to-[#8892ff] flex items-center justify-center text-white font-bold">
                                              {member.profiles?.full_name?.charAt(0) || "R"}
                                            </div>
                                            <div>
                                              <p className="font-semibold text-gray-800">{member.profiles?.full_name || "Rider"}</p>
                                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                                 <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                                                   Confirmed
                                                 </span>
                                              </div>
                                            </div>
                                            <div className="ml-auto flex items-center gap-2">
                                              <span className="text-xs text-gray-500">{member.profiles?.phone_number}</span>
                                               <a href={`tel:${member.profiles?.phone_number}`} className="w-8 h-8 flex items-center justify-center bg-gray-100 text-gray-600 rounded-full hover:bg-[#6675FF] hover:text-white transition-colors">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                               </a>
                                               <button
                                                 onClick={() => {
                                                   setSelectedDismissMemberId(member.id);
                                                   setShowDismissModal(true);
                                                 }}
                                                 className="w-8 h-8 flex items-center justify-center bg-red-100 text-red-600 rounded-full hover:bg-red-200 transition-colors"
                                                 title="Remove rider"
                                               >
                                                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                               </button>
                                            </div>
                                          </div>
                                          
<div className="space-y-2 text-xs">
                                             <div className="bg-[#6675FF]/10 p-2 rounded-lg">
                                               <span className="block text-[#6675FF] font-bold uppercase tracking-wider text-[10px] mb-0.5">Pickup</span>
                                               <span className="text-gray-700 font-medium">
                                                   {member.ride_requests?.pickup_location || "N/A"}
                                               </span>
                                             </div>
                                             <div className="bg-[#4d5ce6]/10 p-2 rounded-lg">
                                               <span className="block text-[#4d5ce6] font-bold uppercase tracking-wider text-[10px] mb-0.5">Dropoff</span>
                                               <span className="text-gray-700 font-medium">
                                                   {member.ride_requests?.destination_location || "N/A"}
                                               </span>
                                             </div>
                                             {member.overlapping_distance_meters > 0 && (
                                                 <div className="bg-green-50 p-2 rounded-lg border border-green-100">
                                                   <span className="block text-green-700 font-bold uppercase tracking-wider text-[10px] mb-0.5">One Way Cost Contribution</span>
                                                   <span className="text-gray-700 font-medium">
                                                     ₹{Math.round((member.overlapping_distance_meters / 1000) * 4)} ({Math.round(member.overlapping_distance_meters / 1000)} km)
                                                   </span>
                                                 </div>
                                               )}
                                           </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : pendingMembers.length === 0 && (
                                    <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                       <p className="text-gray-500 text-sm">Waiting for riders to match...</p>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>

                          {/* Activity Logs */}
                          {confirmedPods.activity_logs && confirmedPods.activity_logs.length > 0 && (
                            <div className="mt-6 pt-4 border-t border-gray-100">
                              <h4 className="text-sm font-semibold text-gray-700 mb-3">Recent Activity</h4>
                              <div className="space-y-2">
                                {confirmedPods.activity_logs.slice(0, 5).map((log: any) => (
                                  <div key={log.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                                    <div className="w-8 h-8 rounded-full bg-[#6675FF]/10 flex items-center justify-center flex-shrink-0">
                                      {(log.action || "").toLowerCase().includes("leave") ? (
                                        <svg className="w-4 h-4 text-[#6675FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                      ) : (log.action || "").toLowerCase().includes("dismiss") || (log.action || "").toLowerCase().includes("remove") ? (
                                        <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" /></svg>
                                      ) : (
                                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                      )}
                                    </div>
                                    <div>
                                      <p className="text-sm text-gray-700">{log.message}</p>
                                      <p className="text-xs text-gray-400">{new Date(log.log_time).toLocaleString()}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* RIDER VIEW OF POD */}
                 {confirmedPods.rider_rides?.length > 0 && (
                   <div className="mb-6">
                     <h3 className="text-lg font-semibold text-gray-800 mb-4">Your Pod</h3>
                     {confirmedPods.rider_rides.map((ride: any) => (
                       <div key={ride.id} className="space-y-4">
                         <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                           <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#6675FF] to-[#8892ff] flex items-center justify-center text-white text-lg font-bold">
                             {ride.pod?.profiles?.full_name?.charAt(0) || "H"}
                           </div>
                           <div>
                             <p className="font-semibold text-gray-800 flex items-center gap-2">
                                {ride.pod?.profiles?.full_name || "Host"}
                                <span className="text-xs px-2 py-0.5 bg-[#6675FF]/10 text-[#6675FF] rounded-full font-medium">Host</span>
                             </p>
                              <p className="text-sm text-gray-500">
                                Pool • {ride.pod?.profiles?.gender || 'N/A'}
                              </p>
                            </div>
                            <div className="ml-auto flex items-center gap-2">
                              <span className="text-xs text-gray-500">{ride.pod?.profiles?.phone_number}</span>
                              <a href={`tel:${ride.pod?.profiles?.phone_number}`} className="w-10 h-10 flex items-center justify-center bg-green-100 text-green-600 rounded-full hover:bg-green-200 transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                              </a>
                            </div>
                          </div>

                         {/* Co-Riders View */}
                         {ride.pod?.pod_members?.length > 1 && (
                          <div className="mt-4 pt-4 border-t border-gray-100">
                             <p className="text-sm font-medium text-gray-700 mb-2">Co-Riders with you:</p>
                             <div className="space-y-2">
                               {ride.pod.pod_members
                                 .filter((m: any) => m.rider_id !== user?.id && m.status === 'active') // Exclude self and pending
                                 .map((member: any) => (
                                   <div key={member.id} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-100">
                                      <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">
                                        {member.profiles?.full_name?.charAt(0) || "R"}
                                      </div>
                                      <div>
                                        <p className="text-sm font-medium text-gray-800">{member.profiles?.full_name || "Rider"}</p>
                                        <p className="text-xs text-gray-500 capitalize">{member.status}</p>
                                      </div>
                                   </div>
                               ))}
                             </div>
                             {ride.pod.pod_members.filter((m: any) => m.rider_id !== user?.id && m.status === 'active').length === 0 && (
                               <p className="text-xs text-gray-400 italic">No other riders yet</p>
                             )}
                          </div>
                        )}

                          <div className="space-y-2">
                            <div className="p-3 bg-[#6675FF]/10 rounded-xl">
                              <p className="text-xs text-[#6675FF] font-semibold uppercase mb-1">Pickup</p>
                              <p className="text-gray-700 text-sm font-medium">{ride.pickup_location}</p>
                            </div>
                            <div className="p-3 bg-[#4d5ce6]/10 rounded-xl">
                              <p className="text-xs text-[#4d5ce6] font-semibold uppercase mb-1">Departure Time</p>
                              <p className="text-gray-700 text-sm font-medium">{ride.pod?.ride_template?.departure_time}</p>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            {ride.pod?.ride_template?.days_available && Array.isArray(ride.pod?.ride_template?.days_available) && (
                              <div className="flex items-center gap-1.5 text-gray-600">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                <span>{ride.pod?.ride_template?.days_available?.map((d: string) => d.slice(0, 3)).join(', ')}</span>
                              </div>
                            )}
                            {ride.ride_requests?.time_flexibility_mins > 0 && (
                              <div className="flex items-center gap-1.5 text-gray-600">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <span>±{ride.ride_requests?.time_flexibility_mins} mins</span>
                              </div>
                            )}
                            {ride.overlapping_distance_meters > 0 && (
                              <div className="flex items-center gap-1.5 text-gray-600">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <span>₹{Math.round((ride.overlapping_distance_meters / 1000) * 4)} ({Math.round(ride.overlapping_distance_meters / 1000)} km)</span>
                              </div>
                            )}
                          </div>

                          {/* Leave Pod Button */}
                          <button
                            onClick={() => {
                              setSelectedPodMemberId(ride.id);
                              setShowLeavePodModal(true);
                            }}
                            className="w-full mt-4 py-2 px-4 bg-red-50 border border-red-200 text-red-600 font-medium rounded-xl hover:bg-red-100 transition-colors"
                          >
                            Leave Pod
                          </button>

                          {/* Activity Logs for Rider */}
                          {confirmedPods.activity_logs && confirmedPods.activity_logs.length > 0 && (
                            <div className="mt-6 pt-4 border-t border-gray-100">
                              <h4 className="text-sm font-semibold text-gray-700 mb-3">Recent Activity</h4>
                              <div className="space-y-2">
                                {confirmedPods.activity_logs.slice(0, 5).map((log: any) => (
                                  <div key={log.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                                    <div className="w-8 h-8 rounded-full bg-[#6675FF]/10 flex items-center justify-center flex-shrink-0">
                                      {(log.action || "").toLowerCase().includes("leave") ? (
                                        <svg className="w-4 h-4 text-[#6675FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                      ) : (log.action || "").toLowerCase().includes("dismiss") || (log.action || "").toLowerCase().includes("remove") ? (
                                        <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" /></svg>
                                      ) : (
                                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                      )}
                                    </div>
                                    <div>
                                      <p className="text-sm text-gray-700">{log.message}</p>
                                      <p className="text-xs text-gray-400">{new Date(log.log_time).toLocaleString()}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}           {matchSuggestions.length > 0 && (!confirmedPods?.rider_rides?.length) && (
            <>
              <div className="flex items-center justify-end mb-2 px-1">
                <button
                  onClick={() => setIsEditingProfile(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#6675FF] bg-[#6675FF]/10 rounded-lg hover:bg-[#6675FF]/20 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  Edit Profile
                </button>
              </div>
              <MatchQueue
                matchSuggestions={matchSuggestions}
                onAcceptMatch={handleAcceptMatch}
                onSkipMatch={handleSkipMatch}
                onConfirmMatch={handleConfirmMatch}
                onRejectMatch={handleRejectMatch}
                onChangeLocation={handleChangeLocation}
                user={user}
              />
              <div className="mt-4 flex justify-center">
                <SocialProof userId={user?.id} variant="compact" />
              </div>
            </>
          )}

          {/* Leave Pod Modal */}
          {showLeavePodModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="bg-gradient-to-r from-red-500 to-red-600 p-4 text-white">
                  <h3 className="text-lg font-semibold">Leave Pod</h3>
                  <p className="text-sm text-red-100">We're sorry to see you go</p>
                </div>
                
                <div className="p-6 space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Why are you leaving?
                    </label>
                    <select
                      value={leaveReason}
                      onChange={(e) => setLeaveReason(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none"
                    >
                      <option value="">Select a reason</option>
                      <option value="schedule_conflict">Schedule conflict</option>
                      <option value="host_no_show">Host didn't show up</option>
                      <option value="host_behavior">Host behavior issue</option>
                      <option value="other">Other reason</option>
                    </select>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-xl">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={willingToRejoin}
                        onChange={(e) => setWillingToRejoin(e.target.checked)}
                        className="w-5 h-5 text-red-500 border-gray-300 rounded focus:ring-red-400"
                      />
                      <div>
                        <p className="font-medium text-gray-700">Would you join this pod again?</p>
                        <p className="text-xs text-gray-500">This helps us improve matching</p>
                      </div>
                    </label>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => {
                        setShowLeavePodModal(false);
                        setLeaveReason("");
                        setWillingToRejoin(true);
                        setSelectedPodMemberId(null);
                      }}
                      className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
                      disabled={leavingPod}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleLeavePod}
                      className="flex-1 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-medium rounded-xl transition-all shadow-lg shadow-red-500/30 disabled:opacity-50"
                      disabled={!leaveReason || leavingPod}
                    >
                      {leavingPod ? "Leaving..." : "Leave Pod"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Dismiss Rider Modal */}
          {showDismissModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-4 text-white">
                  <h3 className="text-lg font-semibold">Remove Rider</h3>
                  <p className="text-sm text-orange-100">This will remove the rider from your pod</p>
                </div>
                
                <div className="p-6 space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Reason for removal
                    </label>
                    <select
                      value={dismissReason}
                      onChange={(e) => setDismissReason(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none"
                    >
                      <option value="">Select a reason</option>
                      <option value="rider_no_show">Rider didn't show up</option>
                      <option value="rider_behavior">Rider behavior issue</option>
                      <option value="seat_unavailable">Seat no longer available</option>
                      <option value="other">Other reason</option>
                    </select>
                  </div>

                  <p className="text-sm text-gray-500 bg-amber-50 p-3 rounded-lg">
                    The rider will be notified and can be matched with other hosts.
                  </p>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => {
                        setShowDismissModal(false);
                        setDismissReason("");
                        setSelectedDismissMemberId(null);
                      }}
                      className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
                      disabled={dismissingRider}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDismissRider}
                      className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-medium rounded-xl transition-all shadow-lg shadow-orange-500/30 disabled:opacity-50"
                      disabled={!dismissReason || dismissingRider}
                    >
                      {dismissingRider ? "Removing..." : "Remove Rider"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )} {podsLoadError && (
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-[#6675FF]/10 p-8 md:p-10 border border-white/50 text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-red-500 to-red-600 flex items-center justify-center">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h1 className="text-2xl font-semibold text-[#171717] mb-3">
                Unable to load your pods
              </h1>
              <p className="text-gray-500 mb-6">
                There was an error loading your pod data. Please try again.
              </p>
              <button
                onClick={() => user?.id && fetchConfirmedPods(user.id)}
                className="px-6 py-3 bg-gradient-to-r from-[#6675FF] to-[#8892ff] text-white font-medium rounded-xl hover:from-[#8892ff] hover:to-[#6675FF] transition-all shadow-lg"
              >
                Retry
              </button>
            </div>
          )}           {(confirmedPods !== null && !podsLoadError && !confirmedPods?.rider_rides?.length && !confirmedPods?.host_pods?.length && matchSuggestions.length === 0) && (
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
              <p className="text-gray-500 mb-4">
                Thanks for verifying, {formData.full_name}! We&apos;re currently looking for the best riders for your route.
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#6675FF]/10 text-[#6675FF] rounded-full text-sm font-medium mb-6">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#8892ff] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-[#6675FF]"></span>
                </span>
                Searching for riders...
              </div>

              {/* Social Proof */}
              <div className="mt-4">
                <SocialProof userId={user?.id} variant="full" />
              </div>

              {/* Edit Profile button */}
              <button
                onClick={() => setIsEditingProfile(true)}
                className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                Edit Profile
              </button>
            </div>
          )}
          {/* Profile Editor Modal */}
          <ProfileEditor
            isOpen={isEditingProfile}
            onClose={() => setIsEditingProfile(false)}
            userId={user?.id || ''}
            profileData={formData}
            isInPod={!!(confirmedPods?.rider_rides?.length || confirmedPods?.host_pods?.length)}
            onProfileUpdated={async (updatedProfile) => {
              loadProfileIntoFormData(updatedProfile);
              // Re-fetch match suggestions with updated profile
              if (user?.id) {
                try {
                  const suggestionsResponse = await fetch('/api/matches/suggestions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: user.id }),
                  });
                  if (suggestionsResponse.ok) {
                    setMatchSuggestions(await suggestionsResponse.json());
                  }
                } catch (e) {
                  console.error('Error refreshing suggestions:', e);
                }
              }
              showNotification('success', 'Profile updated successfully!');
            }}
            onPodLeft={async () => {
              setConfirmedPods(null);
              if (user?.id) {
                const podData = await fetchConfirmedPods(user.id);
                setConfirmedPods(podData);
                // Re-fetch suggestions since rider is back in matching
                const suggestionsResponse = await fetch('/api/matches/suggestions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: user.id }),
                });
                if (suggestionsResponse.ok) {
                  setMatchSuggestions(await suggestionsResponse.json());
                }
              }
              showNotification('info', 'You have left your pod and will be re-matched.');
            }}
            onPodDisbanded={async () => {
              setConfirmedPods(null);
              if (user?.id) {
                const podData = await fetchConfirmedPods(user.id);
                setConfirmedPods(podData);
              }
              showNotification('info', 'Your pod has been disbanded. All riders will be re-matched.');
            }}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#f0f2ff] via-white to-[#e8ebff] flex items-center justify-center px-4 py-12">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#6675FF]/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#6675FF]/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-2xl">
        {/* Title */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-[#6675FF] mb-2">
            {isEditingLocation ? "Update Location" : "Verify"}
          </h1>
          <p className="text-gray-500 text-sm sm:text-base">
            {isEditingLocation
              ? "Change your pickup and drop-off location"
              : "Complete your profile to get started"}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-[#6675FF]/10 border border-white/50 p-5 sm:p-8 md:p-12">
          {/* Progress indicator */}
          {!isEditingLocation && (
            <div className="flex items-center justify-center gap-2 mb-8">
              <div
                className={`w-3 h-3 rounded-full transition-all ${currentStep === 1 ? "bg-[#6675FF] w-8" : currentStep > 1 ? "bg-[#6675FF]" : "bg-gray-300"}`}
              ></div>
              <div
                className={`w-3 h-3 rounded-full transition-all ${currentStep === 2 ? "bg-[#6675FF] w-8" : currentStep > 2 ? "bg-[#6675FF]" : "bg-gray-300"}`}
              ></div>
              <div
                className={`w-3 h-3 rounded-full transition-all ${currentStep === 3 ? "bg-[#6675FF] w-8" : "bg-gray-300"}`}
              ></div>
            </div>
          )}

          {/* Back Button & Subtitle */}
          <div className="flex items-center gap-3 mb-6">
            {(isEditingLocation || currentStep === 2 || currentStep === 3) && (
              <button
                onClick={() => {
                  if (isEditingLocation) {
                    setIsEditingLocation(false);
                    setErrors({});
                    setSubmitted(true);
                  } else {
                    handleBack();
                  }
                }}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <svg
                  className="w-6 h-6 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            )}
            <h2 className="text-lg font-medium text-gray-700 flex-1">
              {isEditingLocation
                ? "Update your pickup and drop-off details"
                : currentStep === 1
                ? "Complete your profile for membership"
                : currentStep === 2
                ? "Set your preferences"
                : "Verify your institutional email"}
            </h2>
          </div>

          {/* Step 1: Basic Info */}
          {currentStep === 1 && (
            <div className="space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="Enter your full name"
                  value={formData.full_name}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      full_name: e.target.value,
                    }));
                    if (errors.full_name)
                      setErrors((prev) => ({ ...prev, full_name: "" }));
                  }}
                  className={`w-full px-5 py-3.5 border-2 rounded-2xl bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-4 transition-all ${errors.full_name ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "border-gray-200 focus:border-[#6675FF] focus:ring-[#6675FF]/10"}`}
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
                  Phone Number
                </label>
                <input
                  type="tel"
                  placeholder="Enter 10-digit phone number"
                  value={formData.phone_number}
                  onChange={(e) => {
                    const value = e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 10);
                    setFormData((prev) => ({
                      ...prev,
                      phone_number: value,
                    }));
                    if (errors.phone_number)
                      setErrors((prev) => ({ ...prev, phone_number: "" }));
                  }}
                  className={`w-full px-5 py-3.5 border-2 rounded-2xl bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-4 transition-all ${errors.phone_number ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "border-gray-200 focus:border-[#6675FF] focus:ring-[#6675FF]/10"}`}
                  required
                />
                {errors.phone_number && (
                  <p className="text-red-500 text-xs mt-1 ml-1">
                    {errors.phone_number}
                  </p>
                )}
              </div>

              {/* Age & Gender Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">
                    Age
                  </label>
                  <input
                    type="number"
                    placeholder="Age"
                    min="1"
                    max="120"
                    value={formData.age}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, age: e.target.value }));
                      if (errors.age)
                        setErrors((prev) => ({ ...prev, age: "" }));
                    }}
                    className={`w-full px-5 py-3.5 border-2 rounded-2xl bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-4 transition-all ${errors.age ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "border-gray-200 focus:border-[#6675FF] focus:ring-[#6675FF]/10"}`}
                    required
                  />
                  {errors.age && (
                    <p className="text-red-500 text-xs mt-1 ml-1">
                      {errors.age}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">
                    Gender
                  </label>
                  <div className="relative">
                    <select
                      value={formData.gender}
                      onChange={(e) => {
                        setFormData((prev) => ({
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
                      const selectedValue = e.target.value;
                      setFormData((prev) => ({
                        ...prev,
                        institution: selectedValue,
                      }));
                      // Clear custom college if not "Other"
                      if (selectedValue !== "Other") {
                        setCustomCollege("");
                      }
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
                {/* Custom college input when "Other" is selected */}
                {formData.institution === "Other" && (
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1.5 ml-1">
                      Please specify your institution
                    </label>
                    <input
                      type="text"
                      value={customCollege}
                      onChange={(e) => {
                        setCustomCollege(e.target.value);
                        if (errors.institution)
                          setErrors((prev) => ({ ...prev, institution: "" }));
                      }}
                      placeholder="e.g., XYZ Engineering College"
                      className={`w-full px-5 py-3.5 border-2 rounded-2xl bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-4 transition-all ${errors.institution ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "border-gray-200 focus:border-[#6675FF] focus:ring-[#6675FF]/10"}`}
                      required
                    />
                    {errors.institution && customCollege === "" && (
                      <p className="text-red-500 text-xs mt-1 ml-1">
                        Please enter your institution name
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Student ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">
                  Student ID Number
                </label>
                <input
                  type="text"
                  placeholder="e.g., 2303A51001"
                  value={formData.student_id}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      student_id: e.target.value,
                    }));
                    if (errors.student_id)
                      setErrors((prev) => ({ ...prev, student_id: "" }));
                  }}
                  className={`w-full px-5 py-3.5 border-2 rounded-2xl bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-4 transition-all ${errors.student_id ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "border-gray-200 focus:border-[#6675FF] focus:ring-[#6675FF]/10"}`}
                  required
                />
                {errors.student_id && (
                  <p className="text-red-500 text-xs mt-1 ml-1">
                    {errors.student_id}
                  </p>
                )}
              </div>

              {/* Academic Start/End Year */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">
                    Academic Start Year
                  </label>
                  <select
                    value={formData.academic_start_year}
                    onChange={(e) => {
                      setFormData((prev) => ({
                        ...prev,
                        academic_start_year: e.target.value,
                      }));
                      if (errors.academic_start_year)
                        setErrors((prev) => ({ ...prev, academic_start_year: "" }));
                    }}
                    className={`w-full px-4 py-3.5 border-2 rounded-2xl bg-white text-gray-800 focus:outline-none focus:ring-4 transition-all ${errors.academic_start_year ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "border-gray-200 focus:border-[#6675FF] focus:ring-[#6675FF]/10"}`}
                    required
                  >
                    <option value="" disabled>
                      Select year
                    </option>
                    {ACADEMIC_YEARS.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                  {errors.academic_start_year && (
                    <p className="text-red-500 text-xs mt-1 ml-1">
                      {errors.academic_start_year}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">
                    Academic End Year
                  </label>
                  <select
                    value={formData.academic_end_year}
                    onChange={(e) => {
                      setFormData((prev) => ({
                        ...prev,
                        academic_end_year: e.target.value,
                      }));
                      if (errors.academic_end_year)
                        setErrors((prev) => ({ ...prev, academic_end_year: "" }));
                    }}
                    className={`w-full px-4 py-3.5 border-2 rounded-2xl bg-white text-gray-800 focus:outline-none focus:ring-4 transition-all ${errors.academic_end_year ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "border-gray-200 focus:border-[#6675FF] focus:ring-[#6675FF]/10"}`}
                    required
                  >
                    <option value="" disabled>
                      Select year
                    </option>
                    {ACADEMIC_YEARS.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                  {errors.academic_end_year && (
                    <p className="text-red-500 text-xs mt-1 ml-1">
                      {errors.academic_end_year}
                    </p>
                  )}
                </div>
              </div>

              {/* Currently Pursuing */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">
                  Are you currently a pursuing student?
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="relative cursor-pointer">
                    <input
                      type="radio"
                      name="is_pursuing"
                      checked={formData.is_pursuing === true}
                      onChange={() => {
                        setFormData((prev) => ({ ...prev, is_pursuing: true }));
                        if (errors.is_pursuing)
                          setErrors((prev) => ({ ...prev, is_pursuing: "" }));
                      }}
                      className="peer sr-only"
                    />
                    <div
                      className={`px-4 py-3.5 border-2 rounded-2xl bg-white text-center font-medium text-gray-600 transition-all peer-checked:border-[#6675FF] peer-checked:bg-[#6675FF] peer-checked:text-white hover:border-[#6675FF]/50 ${errors.is_pursuing ? "border-red-300" : "border-gray-200"}`}
                    >
                      Yes, I'm still studying
                    </div>
                  </label>
                  <label className="relative cursor-pointer">
                    <input
                      type="radio"
                      name="is_pursuing"
                      checked={formData.is_pursuing === false}
                      onChange={() => {
                        setFormData((prev) => ({ ...prev, is_pursuing: false }));
                        if (errors.is_pursuing)
                          setErrors((prev) => ({ ...prev, is_pursuing: "" }));
                      }}
                      className="peer sr-only"
                    />
                    <div
                      className={`px-4 py-3.5 border-2 rounded-2xl bg-white text-center font-medium text-gray-600 transition-all peer-checked:border-[#6675FF] peer-checked:bg-[#6675FF] peer-checked:text-white hover:border-[#6675FF]/50 ${errors.is_pursuing ? "border-red-300" : "border-gray-200"}`}
                    >
                      No, I've graduated
                    </div>
                  </label>
                </div>
                {errors.is_pursuing && (
                  <p className="text-red-500 text-xs mt-2 ml-1">
                    {errors.is_pursuing}
                  </p>
                )}
                {formData.is_pursuing === false && (
                  <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-800">
                    Heads up — Raatap currently operates only for enrolled students.
                    We&apos;ll still save your profile, but our team may reach out
                    since you&apos;ve indicated you&apos;re no longer pursuing your
                    degree.
                  </div>
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
                        setFormData((prev) => ({
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
                        setFormData((prev) => ({
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
                          setFormData((prev) => ({
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
                          setFormData((prev) => ({
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
                  You&apos;ll be matched with a host going your way. No vehicle needed!
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
                        setFormData((prev) => ({
                          ...prev,
                          from_location: value,
                        }));
                        if (errors.from_location)
                          setErrors((prev) => ({ ...prev, from_location: "" }));
                      }}
                      onLocationSelect={(location) => {
                        setFormData((prev) => ({
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
                        setFormData((prev) => ({
                          ...prev,
                          to_location: value,
                        }));
                        if (errors.to_location)
                          setErrors((prev) => ({ ...prev, to_location: "" }));
                      }}
                      onLocationSelect={(location) => {
                        setFormData((prev) => ({
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

                {/* Landmark */}
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-600 mb-1.5 ml-1">
                    Landmark (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Near Gachibowli Stadium"
                    value={formData.landmark}
                    onChange={(e) => {
                      setFormData((prev) => ({
                        ...prev,
                        landmark: e.target.value,
                      }));
                      if (errors.landmark)
                        setErrors((prev) => ({ ...prev, landmark: "" }));
                    }}
                    className="w-full px-5 py-3.5 border-2 border-gray-200 rounded-2xl bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-4 focus:border-[#6675FF] focus:ring-[#6675FF]/10 transition-all"
                  />
                </div>

                {/* Route Selector Button - Only for hosts when locations are set */}
                {formData.prefer_hosting && formData.from_lat && formData.to_lat && (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => setShowRouteSelector(true)}
                      className="w-full py-3 px-4 bg-[#6675FF]/10 border-2 border-[#6675FF]/30 rounded-xl text-[#6675FF] font-medium hover:bg-[#6675FF]/20 transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                      </svg>
                      {selectedRouteGeometry ? "Change Route" : "Select Your Route"}
                    </button>
                    {selectedRouteGeometry && (
                      <p className="text-xs text-green-600 mt-2 text-center">
                        ✓ Route selected
                      </p>
                    )}
                  </div>
                )}
              </div>

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
                      setFormData((prev) => ({
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
                      setFormData((prev) => ({
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
                onClick={isEditingLocation ? handleSaveLocation : handleNext}
                disabled={submitting}
                className="w-full mt-6 py-4 bg-gradient-to-r from-[#6675FF] to-[#8892ff] text-white font-semibold text-lg rounded-2xl hover:shadow-xl hover:shadow-[#6675FF]/30 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {isEditingLocation
                  ? submitting
                    ? "Saving..."
                    : "Save Location"
                  : "Continue"}
              </button>
            </div>
          )}

          {/* Route Selector Modal */}
          {showRouteSelector && formData.from_lat && formData.to_lat && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
              <RouteSelector
                from={{ lat: formData.from_lat, lng: formData.from_lng!, name: formData.from_location }}
                to={{ lat: formData.to_lat, lng: formData.to_lng!, name: formData.to_location }}
                onRouteSelect={(geometry) => {
                  setSelectedRouteGeometry(geometry);
                  setFormData((prev) => ({ ...prev, route_geometry: geometry }));
                  setShowRouteSelector(false);
                }}
                onClose={() => setShowRouteSelector(false)}
              />
            </div>
          )}

          {/* Step 2: Preferences */}
          {currentStep === 2 && (
            <div className="space-y-6">
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
                        setFormData((prev) => ({
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
                      className={`p-2.5 sm:p-3 border-2 rounded-xl bg-white text-center text-xs sm:text-sm font-medium text-gray-700 transition-all peer-checked:border-[#6675FF] peer-checked:bg-[#6675FF] peer-checked:text-white hover:border-[#6675FF]/50 ${errors.comfortable_with ? "border-red-300" : "border-gray-200"}`}
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
                        setFormData((prev) => ({
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
                      className={`p-2.5 sm:p-3 border-2 rounded-xl bg-white text-center text-xs sm:text-sm font-medium text-gray-700 transition-all peer-checked:border-[#6675FF] peer-checked:bg-[#6675FF] peer-checked:text-white hover:border-[#6675FF]/50 ${errors.comfortable_with ? "border-red-300" : "border-gray-200"}`}
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
                        setFormData((prev) => ({
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
                      className={`p-2.5 sm:p-3 border-2 rounded-xl bg-white text-center text-xs sm:text-sm font-medium text-gray-700 transition-all peer-checked:border-[#6675FF] peer-checked:bg-[#6675FF] peer-checked:text-white hover:border-[#6675FF]/50 ${errors.comfortable_with ? "border-red-300" : "border-gray-200"}`}
                    >
                      Both
                    </div>
                  </label>
                </div>
                {errors.comfortable_with && (
                  <p className="text-red-500 text-xs mt-2">
                    {errors.comfortable_with}
                  </p>
                )}
              </div>

              {/* Agreement checkboxes */}
              <div className="space-y-3">
                <label
                  className={`flex items-start gap-3 cursor-pointer p-4 rounded-2xl bg-amber-50 border-2 hover:bg-amber-100/50 transition-colors ${errors.agreed_to_terms ? "border-red-300" : "border-amber-200/50"}`}
                >
                  <input
                    type="checkbox"
                    checked={formData.agreed_to_terms}
                    onChange={(e) => {
                      setFormData((prev) => ({
                        ...prev,
                        agreed_to_terms: e.target.checked,
                      }));
                      if (errors.agreed_to_terms)
                        setErrors((prev) => ({ ...prev, agreed_to_terms: "" }));
                    }}
                    className="w-5 h-5 text-[#6675FF] border-2 border-gray-300 rounded mt-0.5 focus:ring-2 focus:ring-[#6675FF]/50"
                  />
                  <span className="text-sm text-gray-700 leading-relaxed">
                    I agree to commute with my friends and follow community
                    guidelines
                  </span>
                </label>
                {errors.agreed_to_terms && (
                  <p className="text-red-500 text-xs mt-1 ml-1">
                    {errors.agreed_to_terms}
                  </p>
                )}

                <label
                  className="flex items-start gap-3 cursor-pointer p-4 rounded-2xl bg-amber-50 border-2 border-amber-200/50 hover:bg-amber-100/50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={formData.agreed_to_policies}
                    onChange={(e) => {
                      setFormData((prev) => ({
                        ...prev,
                        agreed_to_policies: e.target.checked,
                      }));
                    }}
                    className="w-5 h-5 text-[#6675FF] border-2 border-gray-300 rounded mt-0.5 focus:ring-2 focus:ring-[#6675FF]/50"
                  />
                  <span className="text-sm text-gray-700 leading-relaxed">
                    I have read the{" "}
                    <a
                      href="/terms_&_conditions"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#6675FF] font-medium hover:underline"
                    >
                      Terms and Conditions
                    </a>{" "}
                    and{" "}
                    <a
                      href="/privacy_policy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#6675FF] font-medium hover:underline"
                    >
                      Privacy Policy
                    </a>
                  </span>
                </label>
              </div>

              <button
                onClick={handleNextToStep3}
                className="w-full mt-6 py-4 bg-gradient-to-r from-[#6675FF] to-[#8892ff] text-white font-semibold text-lg rounded-2xl hover:shadow-xl hover:shadow-[#6675FF]/30 transition-all hover:-translate-y-0.5 active:translate-y-0"
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 3: Email Verification */}
          {currentStep === 3 && (
            <div className="space-y-6">
              {/* First ask if user has institutional email */}
              {hasInstitutionalEmail === null && (
                <>
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#6675FF]/10 flex items-center justify-center">
                      <svg
                        className="w-8 h-8 text-[#6675FF]"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">
                      Do you have an institutional email?
                    </h3>
                    <p className="text-gray-500 text-sm">
                      An institutional email helps verify your college affiliation
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setHasInstitutionalEmail(true)}
                      className="py-4 px-6 border-2 border-[#6675FF] text-[#6675FF] font-semibold text-lg rounded-2xl hover:bg-[#6675FF] hover:text-white transition-all hover:-translate-y-0.5 active:translate-y-0"
                    >
                      Yes, I have one
                    </button>
                    <button
                      onClick={() => setHasInstitutionalEmail(false)}
                      className="py-4 px-6 border-2 border-gray-300 text-gray-600 font-semibold text-lg rounded-2xl hover:border-gray-400 hover:bg-gray-50 transition-all hover:-translate-y-0.5 active:translate-y-0"
                    >
                      No, I don&apos;t
                    </button>
                  </div>
                </>
              )}

              {/* User doesn't have institutional email - confirm and submit */}
              {hasInstitutionalEmail === false && (
                <>
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
                      <svg
                        className="w-8 h-8 text-amber-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">
                      No problem!
                    </h3>
                    <p className="text-gray-500 text-sm">
                      You can still join. You can verify your email later from your profile.
                    </p>
                  </div>

                  {otpError && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-sm text-red-600">{otpError}</p>
                    </div>
                  )}

                  <button
                    onClick={handleRequestManualVerification}
                    disabled={submitting}
                    className="w-full py-4 bg-gradient-to-r from-[#6675FF] to-[#8892ff] text-white font-semibold text-lg rounded-2xl hover:shadow-xl hover:shadow-[#6675FF]/30 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg
                          className="animate-spin w-5 h-5"
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
                        Completing...
                      </span>
                    ) : (
                      "Complete Registration"
                    )}
                  </button>

                  <button
                    onClick={() => setHasInstitutionalEmail(null)}
                    disabled={submitting}
                    className="w-full py-2 text-gray-500 font-medium hover:text-[#6675FF] transition-colors disabled:opacity-50"
                  >
                    Go back
                  </button>
                </>
              )}

              {/* User has institutional email - show email input */}
              {hasInstitutionalEmail === true && verificationStep !== "otp" && (
                <>
                  <div className="text-center mb-4">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#6675FF]/10 flex items-center justify-center">
                      <svg
                        className="w-8 h-8 text-[#6675FF]"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <p className="text-gray-500 text-sm">
                      Enter your institutional email to receive a verification code
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">
                      Institutional Email
                    </label>
                    <input
                      type="email"
                      placeholder="e.g., yourname@cbit.ac.in"
                      value={institutionalEmail}
                      onChange={(e) => {
                        setInstitutionalEmail(e.target.value);
                        if (errors.institutional_email)
                          setErrors((prev) => ({
                            ...prev,
                            institutional_email: "",
                          }));
                        setOtpError("");
                      }}
                      className={`w-full px-5 py-3.5 border-2 rounded-2xl bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-4 transition-all ${errors.institutional_email ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "border-gray-200 focus:border-[#6675FF] focus:ring-[#6675FF]/10"}`}
                    />
                    {errors.institutional_email && (
                      <p className="text-red-500 text-xs mt-1 ml-1">
                        {errors.institutional_email}
                      </p>
                    )}
                  </div>

                  {otpError && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-sm text-red-600">{otpError}</p>
                    </div>
                  )}

                  <button
                    onClick={handleSendOTP}
                    disabled={otpLoading}
                    className="w-full py-4 bg-gradient-to-r from-[#6675FF] to-[#8892ff] text-white font-semibold text-lg rounded-2xl hover:shadow-xl hover:shadow-[#6675FF]/30 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {otpLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg
                          className="animate-spin w-5 h-5"
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
                        Sending...
                      </span>
                    ) : (
                      "Send Verification Code"
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setHasInstitutionalEmail(null);
                      setInstitutionalEmail("");
                      setOtpError("");
                    }}
                    disabled={otpLoading}
                    className="w-full py-2 text-gray-500 font-medium hover:text-[#6675FF] transition-colors disabled:opacity-50"
                  >
                    Go back
                  </button>
                </>
              )}

              {/* OTP sent - show OTP input */}
              {hasInstitutionalEmail === true && verificationStep === "otp" && (
                <>
                  <div className="text-center mb-4">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                      <svg
                        className="w-8 h-8 text-green-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                    <p className="text-gray-700 font-medium mb-1">
                      Code sent!
                    </p>
                    <p className="text-gray-500 text-sm">
                      We sent a 6-digit code to{" "}
                      <span className="font-medium text-[#6675FF]">
                        {institutionalEmail}
                      </span>
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">
                      Enter 6-digit code
                    </label>
                    <input
                      type="text"
                      value={otpCode}
                      onChange={(e) => {
                        const value = e.target.value
                          .replace(/[^0-9]/g, "")
                          .slice(0, 6);
                        setOtpCode(value);
                        setOtpError("");
                      }}
                      placeholder="000000"
                      maxLength={6}
                      className="w-full px-5 py-4 border-2 border-gray-200 rounded-2xl bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:border-[#6675FF] focus:ring-4 focus:ring-[#6675FF]/10 transition-all text-center text-2xl tracking-[0.5em] font-mono"
                      autoFocus
                    />
                  </div>

                  {otpError && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-sm text-red-600">{otpError}</p>
                    </div>
                  )}

                  <button
                    onClick={handleVerifyOTP}
                    disabled={otpLoading || otpCode.length !== 6}
                    className="w-full py-4 bg-gradient-to-r from-[#6675FF] to-[#8892ff] text-white font-semibold text-lg rounded-2xl hover:shadow-xl hover:shadow-[#6675FF]/30 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {otpLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg
                          className="animate-spin w-5 h-5"
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
                        Verifying...
                      </span>
                    ) : (
                      "Verify & Complete"
                    )}
                  </button>

                  <div className="flex flex-col gap-2">
                    {resendTimer > 0 ? (
                      <p className="text-center text-sm text-gray-500">
                        Resend code in {resendTimer}s
                      </p>
                    ) : (
                      <button
                        onClick={handleResendOTP}
                        disabled={otpLoading}
                        className="w-full py-2 text-[#6675FF] font-medium hover:underline disabled:opacity-50"
                      >
                        Resend Code
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setVerificationStep(null);
                        setOtpCode("");
                        setOtpError("");
                      }}
                      disabled={otpLoading}
                      className="w-full py-2 text-gray-500 font-medium hover:text-[#6675FF] transition-colors disabled:opacity-50"
                    >
                      Change email
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// Match Queue Component - Shows matches based on vehicle type queue limit
interface MatchQueueProps {
  matchSuggestions: any[];
  onAcceptMatch: (matchId: string, riderName: string) => void;
  onSkipMatch: (matchId: string) => void;
  onConfirmMatch: (matchId: string) => void;
  onRejectMatch: (matchId: string) => void;
  onChangeLocation: () => void;
  user: User | null;
}

function MatchQueue({
  matchSuggestions,
  onAcceptMatch,
  onSkipMatch,
  onConfirmMatch,
  onRejectMatch,
  onChangeLocation,
  user
}: MatchQueueProps) {
  if (matchSuggestions.length === 0) {
    return null;
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between px-1 mb-6">
        <h2 className="text-xl font-semibold text-gray-800">Suggestions</h2>
        <span className="bg-[#6675FF]/10 text-[#6675FF] px-3 py-1 rounded-full text-xs font-medium">
          {matchSuggestions.length} {matchSuggestions.length === 1 ? "suggestion" : "suggestions"}
        </span>
      </div>

      <div className="flex flex-wrap gap-6">
        {matchSuggestions.map((match) => (
          <div key={match.id} className="flex-1 min-w-[320px] max-w-[420px]">
            <MatchCard
              match={match}
              user={user}
              onAcceptMatch={onAcceptMatch}
              onSkipMatch={onSkipMatch}
              onConfirmMatch={onConfirmMatch}
              onRejectMatch={onRejectMatch}
              onChangeLocation={onChangeLocation}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

interface MatchCardProps {
  match: any;
  user: User | null;
  onAcceptMatch: (matchId: string, riderName: string) => void;
  onSkipMatch: (matchId: string) => void;
  onConfirmMatch: (matchId: string) => void;
  onRejectMatch: (matchId: string) => void;
  onChangeLocation: () => void;
}

function MatchCard({
  match: currentMatch,
  user,
  onAcceptMatch,
  onSkipMatch,
  onConfirmMatch,
  onRejectMatch,
  onChangeLocation,
}: MatchCardProps) {
  // Determine if user is host or rider for this match
  const isHostView = currentMatch?.ride_template?.host_id === user?.id;

  // Calculate cost contribution - ₹4/km for both bike and car
  const costPerKm = 4;

  // Calculate overlapping distance and estimated cost
  const overlappingDistanceKm = currentMatch?.overlapping_distance_meters != null
    ? (currentMatch.overlapping_distance_meters / 1000).toFixed(1)
    : null;

  const estimatedCost = overlappingDistanceKm != null
    ? (parseFloat(overlappingDistanceKm) * costPerKm).toFixed(0)
    : null;

  // Guard: Check if ride_template or ride_request exists
  if (!currentMatch?.ride_template && !currentMatch?.ride_request) {
    console.error("❌ [Dashboard] Invalid match data:", currentMatch);
    return (
      <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-[#6675FF]/10 overflow-hidden border border-white/50">
        <div className="p-8 text-center">
          <p className="text-gray-500">Invalid match data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-[#6675FF]/10 overflow-hidden border border-white/50">
      {/* Header */}
      <div className={`p-6 text-white text-center relative ${currentMatch.status === 'accepted' ? 'bg-green-600' : 'bg-[#6675FF]'}`}>
        <h2 className="text-xl font-semibold mb-1">
          {isHostView ? 'Review Rider Request' : 'Host Match Found!'}
        </h2>
        <p className="opacity-90 text-sm">
          {isHostView ? 'Accept or skip this rider' : 'Review and confirm this ride'}
        </p>
      </div>

      <div className="p-8">
        {isHostView ? (
          // HOST VIEW - Reviewing Rider Requests
          <>
            <button
              onClick={onChangeLocation}
              className="flex items-center gap-2 text-sm font-medium text-[#6675FF] hover:text-[#5568e3] transition-colors mb-4"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Change My Location
            </button>

            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#6675FF] to-[#8892ff] flex items-center justify-center text-white text-xl font-bold">
                {currentMatch.ride_request?.profiles?.full_name?.charAt(0) || "R"}
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-800">
                  {currentMatch.ride_request?.profiles?.full_name || "Rider"}
                </h3>
                <p className="text-gray-500 text-sm">
                  {currentMatch.ride_request?.profiles?.gender || "N/A"} • {currentMatch.ride_request?.profiles?.institution || "N/A"}
                </p>
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <div className="mt-1 bg-[#6675FF]/10 p-1.5 rounded-lg text-[#6675FF]">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 uppercase font-semibold">Pickup Location</p>
                  <p className="text-gray-700">{currentMatch.ride_request?.pickup_location}</p>
                  {currentMatch.ride_request?.pickup_landmark && (
                    <p className="text-xs text-gray-500 mt-1">
                      Landmark: {currentMatch.ride_request?.pickup_landmark}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-1 bg-[#6675FF]/10 p-1.5 rounded-lg text-[#6675FF]">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 uppercase font-semibold">Drop-off Location</p>
                  <p className="text-gray-700">{currentMatch.ride_request?.destination_location}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-1 bg-[#4d5ce6]/10 p-1.5 rounded-lg text-[#4d5ce6]">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 uppercase font-semibold">Distance to Pickup</p>
                  <p className="text-gray-700">
                    {currentMatch.pickup_distance_meters
                      ? `${(currentMatch.pickup_distance_meters / 1000).toFixed(2)} km`
                      : "Minimal"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-1 bg-purple-100 p-1.5 rounded-lg text-purple-600">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold">Overlapping Route</p>
                  <p className="text-gray-700">
                    {overlappingDistanceKm ? `${overlappingDistanceKm} km together` : "Calculating..."}
                  </p>
                  {estimatedCost && (
                    <p className="text-xs text-green-600 font-semibold mt-1">
                      Rider pays: ₹{estimatedCost}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-1 bg-green-100 p-1.5 rounded-lg text-green-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold">One Way Cost Contribution</p>
                  <p className="text-gray-700">₹{costPerKm}/km</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => onSkipMatch(currentMatch.id)}
                className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
              >
                Skip
              </button>
              <button
                onClick={() => onAcceptMatch(currentMatch.id, currentMatch.ride_request?.profiles?.full_name)}
                className="flex-1 py-3.5 bg-[#6675FF] hover:bg-[#5b6ae0] text-white rounded-xl font-medium transition-colors shadow-lg shadow-[#6675FF]/20"
              >
                Accept
              </button>
            </div>
            <p className="text-xs text-gray-400 text-center mt-3">
              Contact info will be revealed after acceptance
            </p>
          </>
        ) : (
          // RIDER VIEW - Reviewing Host Matches
          <>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#6675FF] to-[#8892ff] flex items-center justify-center text-white text-xl font-bold">
                {currentMatch.ride_template?.profiles?.full_name?.charAt(0) || "H"}
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-800">
                  {currentMatch.ride_template?.profiles?.full_name || "Host"}
                </h3>
                <p className="text-gray-500 text-sm">
                  {currentMatch.ride_template?.vehicle_type === '2_wheeler' ? '🏍️ Bike' : '🚗 Car'} • {currentMatch.ride_template?.profiles?.gender || "N/A"} • {currentMatch.ride_template?.profiles?.institution || "N/A"}
                </p>
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <div className="mt-1 bg-[#6675FF]/10 p-1.5 rounded-lg text-[#6675FF]">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold">Host Route</p>
                  <p className="text-gray-700">{currentMatch.ride_template?.from_location} → {currentMatch.ride_template?.to_location}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-1 bg-purple-100 p-1.5 rounded-lg text-purple-600">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold">Your Pickup Distance</p>
                  <p className="text-gray-700">
                    {currentMatch.pickup_distance_meters
                      ? `${(currentMatch.pickup_distance_meters / 1000).toFixed(2)} km from host pickup`
                      : "Near host pickup"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-1 bg-green-100 p-1.5 rounded-lg text-green-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold">Your Destination</p>
                  <p className="text-gray-700">
                    {currentMatch.destination_distance_meters
                      ? `${(currentMatch.destination_distance_meters / 1000).toFixed(2)} km from host dropoff`
                      : "Near host dropoff"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-1 bg-green-100 p-1.5 rounded-lg text-green-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold">Your One Way Cost Contribution</p>
                  <p className="text-gray-700">
                    {overlappingDistanceKm 
                      ? `₹${estimatedCost} for ${overlappingDistanceKm} km`
                      : `₹${costPerKm}/km`
                    }
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => onRejectMatch(currentMatch.id)}
                className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
              >
                Reject
              </button>
              <button
                onClick={() => onConfirmMatch(currentMatch.id)}
                className="flex-1 py-3.5 bg-[#10b981] hover:bg-[#059669] text-white rounded-xl font-medium transition-colors shadow-lg shadow-[#10b981]/20"
              >
                Confirm Ride
              </button>
            </div>
            <p className="text-xs text-gray-400 text-center mt-3">
              Confirm to lock your seat (irreversible)
            </p>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import LocationInput from "@/components/LocationInput";

interface ProfileEditorProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  profileData: any;
  isInPod: boolean;
  onProfileUpdated: (updatedProfile: any) => void;
  onPodLeft: () => void;
  onPodDisbanded: () => void;
}

export default function ProfileEditor({
  isOpen,
  onClose,
  userId,
  profileData,
  isInPod,
  onProfileUpdated,
  onPodLeft,
  onPodDisbanded
}: ProfileEditorProps) {
  const [formData, setFormData] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [impactWarning, setImpactWarning] = useState<any>(null);

  useEffect(() => {
    if (isOpen && profileData) {
      setFormData({ ...profileData });
      setImpactWarning(null);
    }
  }, [isOpen, profileData]);

  if (!isOpen) return null;

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleLocationSelect = (type: 'from' | 'to', location: { address: string; lat: number; lng: number }) => {
    setFormData((prev: any) => ({
      ...prev,
      [`${type}_location`]: location.address,
      [`${type}_lat`]: location.lat,
      [`${type}_lng`]: location.lng,
    }));
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      
      const changedFieldsOnly: Record<string, any> = {};
      Object.keys(formData).forEach((key) => {
        if (formData[key] !== profileData[key]) {
          changedFieldsOnly[key] = formData[key];
        }
      });

      if (Object.keys(changedFieldsOnly).length === 0) {
        onClose();
        return;
      }

      // Step 1: Check Impact
      const impactRes = await fetch('/api/profile/update-with-impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, updates: changedFieldsOnly })
      });
      const impactData = await impactRes.json();

      if (impactData.impact === 'pod_breaking') {
        setImpactWarning({
          ...impactData,
          updates: changedFieldsOnly
        });
        setLoading(false);
        return;
      }

      // Step 2: Safe to update
      await confirmUpdate(changedFieldsOnly);

    } catch (error) {
      console.error("❌ Failed to update profile:", error);
    } finally {
      if (!impactWarning) setLoading(false);
    }
  };

  const confirmUpdate = async (updates: Record<string, any>) => {
    try {
      setLoading(true);
      const res = await fetch('/api/profile/update-with-impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, updates, confirmed: true })
      });
      const data = await res.json();
      
      if (data.success) {
        onProfileUpdated(data.profile);
        onClose();
      }
    } catch (error) {
      console.error("❌ Failed to confirm profile update:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleImpactConfirm = async () => {
    try {
      setLoading(true);
      
      if (impactWarning.action === 'leave_pod') {
        await fetch('/api/pods/leave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            podMemberId: impactWarning.podMemberId, 
            userId, 
            reason: 'profile_changed', 
            willingToRejoin: true 
          })
        });
      } else if (impactWarning.action === 'disband_pod') {
        await fetch('/api/pods/disband', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            hostId: userId, 
            podId: impactWarning.podId, 
            reason: 'host_profile_changed' 
          })
        });
      }

      // Proceed with profile update
      await confirmUpdate(impactWarning.updates);

      // Trigger callbacks
      if (impactWarning.action === 'leave_pod') onPodLeft();
      if (impactWarning.action === 'disband_pod') onPodDisbanded();

    } catch (error) {
      console.error("❌ Failed to handle pod breaking change:", error);
    } finally {
      setLoading(false);
      setImpactWarning(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
        style={{ animation: 'fadeInScale 0.2s ease-out' }}
      >
        <div className="bg-gradient-to-r from-[#6675FF] to-[#8892ff] p-5 text-white flex justify-between items-center shrink-0">
          <h2 className="text-xl font-semibold">Edit Profile</h2>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            ✕
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {impactWarning ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800">
              <h3 className="font-semibold flex items-center gap-2 mb-2">
                <span>⚠️</span> This change will affect your current pod
              </h3>
              <p className="text-sm opacity-90 mb-4">
                {impactWarning.action === 'leave_pod' 
                  ? "You will be removed from your current pod and re-matched."
                  : "Your pod will be disbanded and all riders will be re-matched."}
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={handleImpactConfirm}
                  disabled={loading}
                  className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {loading ? 'Confirming...' : 'Confirm Change'}
                </button>
                <button 
                  onClick={() => setImpactWarning(null)}
                  disabled={loading}
                  className="bg-white border border-amber-200 text-amber-800 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Personal Info */}
              <section className="space-y-4">
                <h3 className="font-medium text-gray-900 border-b pb-2">Personal Info</h3>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={formData.full_name || ''}
                    onChange={(e) => handleChange('full_name', e.target.value)}
                    placeholder="Full Name"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#6675FF] focus:ring-2 focus:ring-[#6675FF]/20 outline-none transition-all"
                  />
                  <input
                    type="text"
                    value={formData.phone_number || ''}
                    onChange={(e) => handleChange('phone_number', e.target.value)}
                    placeholder="Phone Number"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#6675FF] focus:ring-2 focus:ring-[#6675FF]/20 outline-none transition-all"
                  />
                  <input
                    type="text"
                    value={formData.institution || ''}
                    onChange={(e) => handleChange('institution', e.target.value)}
                    placeholder="Institution"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#6675FF] focus:ring-2 focus:ring-[#6675FF]/20 outline-none transition-all"
                  />
                </div>
              </section>

              {/* Route */}
              <section className="space-y-4">
                <h3 className="font-medium text-gray-900 border-b pb-2">Route</h3>
                <div className="space-y-3">
                  <LocationInput
                    value={formData.from_location || ''}
                    onChange={(val) => handleChange('from_location', val)}
                    onLocationSelect={(loc) => handleLocationSelect('from', loc)}
                    placeholder="From Location"
                    icon="start"
                  />
                  <LocationInput
                    value={formData.to_location || ''}
                    onChange={(val) => handleChange('to_location', val)}
                    onLocationSelect={(loc) => handleLocationSelect('to', loc)}
                    placeholder="To Location"
                    icon="end"
                  />
                </div>
              </section>

              {/* Preferences */}
              <section className="space-y-4">
                <h3 className="font-medium text-gray-900 border-b pb-2">Preferences</h3>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        handleChange('prefer_hosting', true);
                        handleChange('prefer_taking_ride', false);
                      }}
                      className={`flex-1 py-3 rounded-xl border-2 font-medium transition-all ${
                        formData.prefer_hosting 
                          ? 'border-[#6675FF] bg-[#6675FF]/10 text-[#6675FF]' 
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      Host
                    </button>
                    <button
                      onClick={() => {
                        handleChange('prefer_hosting', false);
                        handleChange('prefer_taking_ride', true);
                      }}
                      className={`flex-1 py-3 rounded-xl border-2 font-medium transition-all ${
                        formData.prefer_taking_ride 
                          ? 'border-[#6675FF] bg-[#6675FF]/10 text-[#6675FF]' 
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      Rider
                    </button>
                  </div>
                  
                  <select
                    value={formData.comfortable_with || 'both'}
                    onChange={(e) => handleChange('comfortable_with', e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#6675FF] focus:ring-2 focus:ring-[#6675FF]/20 outline-none transition-all appearance-none bg-white"
                  >
                    <option value="both">Comfortable with Anyone</option>
                    <option value="male_only">Male Only</option>
                    <option value="female_only">Female Only</option>
                  </select>
                </div>
              </section>

              {/* Vehicle (Only if Host) */}
              {formData.prefer_hosting && (
                <section className="space-y-4">
                  <h3 className="font-medium text-gray-900 border-b pb-2">Vehicle Details</h3>
                  <div className="space-y-3 flex gap-3">
                    <select
                      value={formData.vehicle_type || '4_wheeler'}
                      onChange={(e) => handleChange('vehicle_type', e.target.value)}
                      className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#6675FF] focus:ring-2 focus:ring-[#6675FF]/20 outline-none transition-all appearance-none bg-white"
                    >
                      <option value="2_wheeler">2 Wheeler</option>
                      <option value="4_wheeler">4 Wheeler</option>
                    </select>
                    <input
                      type="number"
                      value={formData.available_seats || 1}
                      onChange={(e) => handleChange('available_seats', parseInt(e.target.value))}
                      placeholder="Seats"
                      min="1"
                      max="8"
                      className="w-24 px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#6675FF] focus:ring-2 focus:ring-[#6675FF]/20 outline-none transition-all"
                    />
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {!impactWarning && (
          <div className="p-5 border-t shrink-0">
            <button
              onClick={handleSave}
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#6675FF] to-[#8892ff] text-white font-medium rounded-xl py-3 shadow-md hover:shadow-lg transition-all active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}} />
    </div>
  );
}

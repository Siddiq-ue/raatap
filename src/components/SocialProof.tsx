"use client";

import React, { useState, useEffect } from 'react';

interface SocialProofProps {
  userId?: string;
  variant?: 'full' | 'compact';
}

interface Stats {
  activePods: number;
  activeRiders: number;
  activeHosts: number;
  totalMembers: number;
  recentMatches24h: number;
  corridorRiders: number;
  corridorHosts: number;
}

interface ProofItem {
  emoji: string;
  text: string;
}

export default function SocialProof({ userId, variant = 'full' }: SocialProofProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/stats/social-proof', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId }),
        });
        
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error("❌ [SocialProof Component] Error fetching stats", error);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, [userId]);

  const proofItems: ProofItem[] = [];

  if (stats) {
    if (stats.activePods >= 3) proofItems.push({ emoji: '🚗', text: `${stats.activePods} active carpools on Raatap` });
    if (stats.corridorRiders >= 2) proofItems.push({ emoji: '🎯', text: `${stats.corridorRiders} riders near your route are waiting!` });
    if (stats.corridorHosts >= 1) proofItems.push({ emoji: '🛣️', text: `${stats.corridorHosts} hosts drive through your corridor` });
    if (stats.recentMatches24h >= 1) proofItems.push({ emoji: '⚡', text: `${stats.recentMatches24h} matches made in the last 24 hours` });
    if (stats.totalMembers >= 5) proofItems.push({ emoji: '👥', text: `${stats.totalMembers} people are carpooling right now` });
    if (stats.activeRiders >= 3) proofItems.push({ emoji: '🙋', text: `${stats.activeRiders} riders are looking for a host` });
    if (stats.activeHosts >= 2) proofItems.push({ emoji: '🚙', text: `${stats.activeHosts} hosts are offering rides` });
  }

  useEffect(() => {
    if (variant === 'compact' && proofItems.length > 0) {
      const rotation = setInterval(() => {
        setCurrentIndex(prev => (prev + 1) % proofItems.length);
      }, 5000);
      return () => clearInterval(rotation);
    }
  }, [variant, proofItems.length]);

  if (!stats) return null;

  if (proofItems.length === 0) {
    proofItems.push({ emoji: '🚀', text: "You're among the first in your area — early users get matched first!" });
  }

  if (variant === 'compact') {
    const currentItem = proofItems[currentIndex] || proofItems[0];
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#6675FF]/10 text-gray-700 text-sm font-medium rounded-full border border-[#6675FF]/20 overflow-hidden transition-all duration-500 ease-in-out hover:bg-[#6675FF]/20">
        <span className="text-base">{currentItem.emoji}</span>
        <span key={currentItem.text} className="animate-fade-in-fast">{currentItem.text}</span>
        
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes fadeInFast {
            from { opacity: 0; transform: translateY(2px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in-fast {
            animation: fadeInFast 0.4s ease-out forwards;
          }
        `}} />
      </div>
    );
  }

  const displayItems = proofItems.slice(0, 3); // Show 3 items max

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 animate-fade-in-up">
      {displayItems.map((item, i) => (
        <div key={i} className="flex flex-col items-center justify-center p-4 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-sm transition-all duration-300 hover:scale-[1.02] hover:bg-white/20 hover:shadow-md">
          <div className="text-3xl mb-2">{item.emoji}</div>
          <div className="text-gray-800 text-sm font-medium text-center">
            {item.text}
          </div>
        </div>
      ))}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.6s ease-out forwards;
        }
      `}} />
    </div>
  );
}

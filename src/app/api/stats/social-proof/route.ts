import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function POST(req: NextRequest) {
  try {
    console.log("📥 [SocialProof] Processing stats request");
    
    const body = await req.json().catch(() => ({}));
    const { userId } = body;

    const [
      { count: activePods },
      { count: activeRiders },
      { count: activeHosts },
      { count: totalMembers },
      { count: recentMatches }
    ] = await Promise.all([
      supabase.from('pods').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('ride_requests').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('ride_templates').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('pod_members').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('match_suggestions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending_host_approval')
        .gte('created_at', new Date(Date.now() - 86400000).toISOString())
    ]);

    let corridorRiders = 0;
    let corridorHosts = 0;

    if (userId) {
      console.log(`📊 [SocialProof] Calculating corridor stats for user: ${userId}`);
      
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('from_lat, from_lng')
        .eq('id', userId)
        .single();
        
      if (profile && !profileErr && profile.from_lat && profile.from_lng) {
        // Count corridor riders
        const { data: riders } = await supabase
          .from('ride_requests')
          .select('from_lat, from_lng')
          .eq('status', 'active')
          .limit(100);
          
        if (riders) {
          corridorRiders = riders.filter(r => 
            r.from_lat && r.from_lng && 
            haversineDistance(profile.from_lat, profile.from_lng, r.from_lat, r.from_lng) <= 5
          ).length;
        }

        // Count corridor hosts
        const { data: hosts } = await supabase
          .from('ride_templates')
          .select('from_lat, from_lng')
          .eq('status', 'active')
          .limit(100);
          
        if (hosts) {
          corridorHosts = hosts.filter(h => 
            h.from_lat && h.from_lng && 
            haversineDistance(profile.from_lat, profile.from_lng, h.from_lat, h.from_lng) <= 5
          ).length;
        }
      } else {
         console.log(`⚠️ [SocialProof] Could not find location for user: ${userId}`);
      }
    }

    console.log("✅ [SocialProof] Stats generated successfully");
    
    return NextResponse.json({
      activePods: activePods || 0,
      activeRiders: activeRiders || 0,
      activeHosts: activeHosts || 0,
      totalMembers: totalMembers || 0,
      recentMatches24h: recentMatches || 0,
      corridorRiders,
      corridorHosts
    });
  } catch (error) {
    console.error("❌ [SocialProof] Error fetching stats:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}

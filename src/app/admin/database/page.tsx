"use client";

import { useState } from "react";
import AdminTableView from "@/components/admin/AdminTableView";

const TABLES = [
  "profiles",
  "ride_templates",
  "ride_requests",
  "match_suggestions",
  "pods",
  "pod_members",
  "activity_logs",
  "campus_leaders"
];

export default function DatabaseViewerPage() {
  const [activeTable, setActiveTable] = useState(TABLES[0]);

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Database Viewer</h1>
          <p className="text-gray-500 mt-1">Directly view and manage database records</p>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {TABLES.map(table => (
            <button
              key={table}
              onClick={() => setActiveTable(table)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeTable === table
                  ? "bg-[#6675FF] text-white shadow-md shadow-[#6675FF]/20"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {table}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="font-semibold text-gray-800 capitalize">
              {activeTable.replace(/_/g, ' ')}
            </h2>
          </div>
          <div className="p-6">
            <AdminTableView tableName={activeTable} />
          </div>
        </div>
      </div>
    </div>
  );
}

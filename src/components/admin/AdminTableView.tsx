"use client";

import { useState, useEffect } from "react";

interface AdminTableViewProps {
  tableName: string;
}

export default function AdminTableView({ tableName }: AdminTableViewProps) {
  const [data, setData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit Mode State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});

  // Create Mode State
  const [isCreating, setIsCreating] = useState(false);
  const [createFormData, setCreateFormData] = useState<any>({});

  useEffect(() => {
    fetchData();
    setIsCreating(false);
    setEditingId(null);
  }, [tableName]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/database?table=${tableName}`);
      const result = await res.json();
      
      if (!res.ok) throw new Error(result.error || "Failed to fetch data");
      
      setData(result.data || []);
      if (result.data && result.data.length > 0) {
        setColumns(Object.keys(result.data[0]));
      } else {
        // Fallback generic columns if table is empty (ideally fetched via schema)
        setColumns(["id", "created_at"]);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditChange = (col: string, value: string) => {
    setEditFormData((prev: any) => ({ ...prev, [col]: value }));
  };

  const handleCreateChange = (col: string, value: string) => {
    setCreateFormData((prev: any) => ({ ...prev, [col]: value }));
  };

  const startEdit = (row: any) => {
    setEditingId(row.id);
    // Clone row data (ignoring deep nested objects for simplicity in this admin tool)
    const formData = { ...row };
    setEditFormData(formData);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      // Remove immutable fields to prevent DB errors
      const payload = { ...editFormData };
      delete payload.id;
      delete payload.created_at;

      const res = await fetch("/api/admin/database", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: tableName, id: editingId, payload }),
      });
      
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to update record");
      
      setData(data.map(item => item.id === editingId ? { ...item, ...payload } : item));
      setEditingId(null);
      alert("Updated successfully");
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const saveCreate = async () => {
    try {
      const res = await fetch("/api/admin/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: tableName, payload: createFormData }),
      });
      
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to create record");
      
      setData([result.data, ...data]);
      setIsCreating(false);
      setCreateFormData({});
      alert("Created successfully");
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Are you sure you want to delete this record from ${tableName}?`)) return;
    
    try {
      const res = await fetch("/api/admin/database", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: tableName, id }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to delete");
      }
      
      setData(data.filter(item => item.id !== id));
      alert("Deleted successfully");
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading {tableName}...</div>;
  if (error) return <div className="p-8 text-center text-red-500">Error: {error}</div>;

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button 
          onClick={() => setIsCreating(!isCreating)}
          className="px-4 py-2 bg-[#6675FF] text-white rounded-xl text-sm font-medium hover:bg-[#5b6ae0] transition-colors shadow-sm"
        >
          {isCreating ? "Cancel" : "Add New Record"}
        </button>
      </div>

      <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-gray-100">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
            <tr>
              {columns.map(col => (
                <th key={col} className="px-6 py-3 whitespace-nowrap">{col}</th>
              ))}
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {/* Create Row */}
            {isCreating && (
              <tr className="bg-blue-50/50">
                {columns.map(col => (
                  <td key={col} className="px-3 py-3">
                    {col === 'id' || col === 'created_at' ? (
                      <span className="text-xs text-gray-400 italic">Auto-generated</span>
                    ) : (
                      <input
                        type="text"
                        className="w-full px-2 py-1 border border-gray-200 rounded text-sm bg-white"
                        placeholder={col}
                        value={createFormData[col] || ""}
                        onChange={(e) => handleCreateChange(col, e.target.value)}
                      />
                    )}
                  </td>
                ))}
                <td className="px-6 py-3 text-right whitespace-nowrap">
                  <button onClick={saveCreate} className="text-green-600 hover:text-green-900 font-medium mr-3">Save</button>
                </td>
              </tr>
            )}

            {data.map((row, i) => (
              <tr key={row.id || i} className="hover:bg-gray-50/50 transition-colors">
                {columns.map(col => (
                  <td key={col} className="px-3 py-3 truncate max-w-xs">
                    {editingId === row.id && col !== 'id' && col !== 'created_at' ? (
                      <input
                        type="text"
                        className="w-full px-2 py-1 border border-[#6675FF] rounded text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#6675FF]/20"
                        value={editFormData[col] !== null ? String(editFormData[col]) : ""}
                        onChange={(e) => handleEditChange(col, e.target.value)}
                      />
                    ) : (
                      <span className="px-3 block">
                        {typeof row[col] === 'object' && row[col] !== null 
                          ? JSON.stringify(row[col]) 
                          : String(row[col])}
                      </span>
                    )}
                  </td>
                ))}
                <td className="px-6 py-3 text-right whitespace-nowrap">
                  {editingId === row.id ? (
                    <>
                      <button onClick={saveEdit} className="text-green-600 hover:text-green-900 font-medium mr-3">Save</button>
                      <button onClick={() => setEditingId(null)} className="text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(row)} className="text-[#6675FF] hover:text-[#5b6ae0] font-medium mr-3">Edit</button>
                      {row.id && (
                        <button onClick={() => handleDelete(row.id)} className="text-red-500 hover:text-red-700 font-medium">Delete</button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
            
            {data.length === 0 && !isCreating && (
              <tr>
                <td colSpan={columns.length + 1} className="p-8 text-center text-gray-500">
                  No records found in {tableName}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

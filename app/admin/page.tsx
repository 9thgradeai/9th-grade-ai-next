// app/admin/page.tsx
// Minimal Admin Panel (admin only)

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  handle: string;
  role: string;
  emailVerified: boolean;
  onboarded: boolean;
  authProvider: string;
  createdAt: string;
  _count: {
    attempts: number;
    mockTestResults: number;
    aiConversations: number;
  };
};

type UsersResponse = {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/users?${params}`, { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        router.push("/login");
        return;
      }
      const data: UsersResponse = await res.json();
      setUsers(data.users);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchUsers();
  }, []);

  const handleAction = async (userId: string, action: "ban" | "unban" | "revoke_sessions") => {
    setActionLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("Action failed");
      await fetchUsers();
    } catch (err) {
      alert(`Failed to ${action}: ${err}`);
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  if (loading && users.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-mono font-semibold text-emerald-400">Admin Panel</h1>
          <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-emerald-400">
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Search */}
        <div className="mb-6">
          <input
            type="search"
            placeholder="Search by name, email, or handle..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full max-w-md rounded-lg border border-white/10 bg-zinc-900/50 px-4 py-2 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* Users Table */}
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/50">
              <tr className="text-left text-zinc-400 font-mono text-xs uppercase tracking-wider">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role / Status</th>
                <th className="px-4 py-3">Activity</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{user.name}</div>
                    <div className="text-zinc-500 text-xs">{user.email}</div>
                    <div className="text-zinc-500 text-xs">@{user.handle}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-mono ${
                      user.role === "ADMIN" ? "bg-emerald-500/20 text-emerald-400" :
                      user.role === "BANNED" ? "bg-red-500/20 text-red-400" :
                      "bg-zinc-500/20 text-zinc-400"
                    }`}>
                      {user.role}
                    </span>
                    <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                      <span className={user.emailVerified ? "text-emerald-400" : "text-yellow-400"}>
                        {user.emailVerified ? "✓ Verified" : "✗ Unverified"}
                      </span>
                      <span className={user.onboarded ? "text-emerald-400" : "text-yellow-400"}>
                        {user.onboarded ? "✓ Onboarded" : "✗ Not onboarded"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    <div>Questions: {user._count.attempts}</div>
                    <div>Mock Tests: {user._count.mockTestResults}</div>
                    <div>AI Chats: {user._count.aiConversations}</div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="px-3 py-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 rounded-lg transition-colors"
                      >
                        View
                      </Link>
                      {user.role !== "BANNED" ? (
                        <button
                          onClick={() => { void handleAction(user.id, "ban"); }}
                          disabled={actionLoading === user.id}
                          className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 border border-red-500/30 rounded-lg transition-colors disabled:opacity-50"
                        >
                          Ban
                        </button>
                      ) : (
                        <button
                          onClick={() => { void handleAction(user.id, "unban"); }}
                          disabled={actionLoading === user.id}
                          className="px-3 py-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 rounded-lg transition-colors disabled:opacity-50"
                        >
                          Unban
                        </button>
                      )}
                      <button
                        onClick={() => { void handleAction(user.id, "revoke_sessions"); }}
                        disabled={actionLoading === user.id}
                        className="px-3 py-1.5 text-xs font-medium text-yellow-400 hover:text-yellow-300 border border-yellow-500/30 rounded-lg transition-colors disabled:opacity-50"
                      >
                        Revoke Sessions
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="px-4 py-2 text-sm font-medium text-zinc-300 bg-zinc-900 border border-white/10 rounded-lg hover:bg-zinc-800 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="px-4 text-sm text-zinc-400">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
              className="px-4 py-2 text-sm font-medium text-zinc-300 bg-zinc-900 border border-white/10 rounded-lg hover:bg-zinc-800 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
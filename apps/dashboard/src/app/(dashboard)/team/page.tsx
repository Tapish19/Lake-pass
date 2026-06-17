'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { useApi } from '@/lib/useApi';

type StaffRole = 'owner' | 'manager' | 'staff';

interface StaffMember {
  id:    string;
  name:  string | null;
  email: string | null;
  role:  StaffRole;
}

interface TeamInvite {
  id:        string;
  email:     string;
  role:      StaffRole;
  createdAt: string;
}

interface TeamData {
  members: StaffMember[];
  invites: TeamInvite[];
}

const ROLE_LABELS: Record<StaffRole, string> = {
  owner:   'Owner',
  manager: 'Manager',
  staff:   'Staff',
};

const ROLE_COLORS: Record<StaffRole, string> = {
  owner:   'bg-purple-100 text-purple-700',
  manager: 'bg-blue-100 text-blue-700',
  staff:   'bg-gray-100 text-gray-600',
};

export default function TeamPage() {
  const api         = useApi();
  const { isLoaded } = useAuth();
  const queryClient = useQueryClient();

  const [email, setEmail]         = useState('');
  const [role, setRole]           = useState<'manager' | 'staff'>('staff');
  const [inviteError, setInviteError] = useState('');

  const { data, isLoading } = useQuery<TeamData>({
    queryKey: ['team'],
    queryFn:  () => api.get('/team').then(r => r.data),
    enabled:  isLoaded,
  });

  const inviteMutation = useMutation({
    mutationFn: (body: { email: string; role: string }) => api.post('/team/invite', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] });
      setEmail('');
      setRole('staff');
      setInviteError('');
    },
    onError: (err: any) => {
      setInviteError(err?.response?.data?.error ?? 'Something went wrong.');
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: string }) =>
      api.patch(`/team/${memberId}`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team'] }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => api.delete(`/team/${memberId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team'] }),
  });

  const cancelInviteMutation = useMutation({
    mutationFn: (inviteId: string) => api.delete(`/team/invites/${inviteId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team'] }),
  });

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    inviteMutation.mutate({ email: email.trim(), role });
  }

  const members = data?.members ?? [];
  const invites = data?.invites ?? [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Team</h1>
        <p className="text-gray-500">Invite staff and manage roles for your marina.</p>
      </div>

      <div className="space-y-6 max-w-2xl">

        {/* ── Invite form ────────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Invite a team member</h2>
          <form onSubmit={handleInvite} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="staff@yourmarina.com"
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <div className="flex gap-3">
                {(['manager', 'staff'] as const).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      role === r
                        ? 'border-brand-600 bg-brand-50 text-brand-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {ROLE_LABELS[r]}
                    <span className="block text-xs font-normal mt-0.5 text-gray-400">
                      {r === 'manager' ? 'Full access except billing' : 'View & check-in only'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {inviteError && (
              <p className="text-sm text-red-600">{inviteError}</p>
            )}

            {inviteMutation.isSuccess && (
              <p className="text-sm text-green-600">
                Invite {inviteMutation.data?.data?.resent ? 're-sent' : 'sent'} — they'll join when they sign in.
              </p>
            )}

            <button
              type="submit"
              disabled={inviteMutation.isPending || !email.trim()}
              className="w-full bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {inviteMutation.isPending ? 'Sending…' : 'Send Invite'}
            </button>
          </form>
        </section>

        {/* ── Current members ────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Current members
            {members.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-400">({members.length})</span>
            )}
          </h2>

          {isLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-gray-400">No team members yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {members.map(member => (
                <li key={member.id} className="flex items-center gap-3 py-3">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold shrink-0">
                    {(member.name ?? member.email ?? '?')[0].toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {member.name ?? <span className="text-gray-400 italic">No name</span>}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{member.email ?? '—'}</p>
                  </div>

                  {/* Role badge / selector */}
                  {member.role === 'owner' ? (
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_COLORS.owner}`}>
                      Owner
                    </span>
                  ) : (
                    <select
                      value={member.role}
                      onChange={e => updateRoleMutation.mutate({ memberId: member.id, role: e.target.value })}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="manager">Manager</option>
                      <option value="staff">Staff</option>
                    </select>
                  )}

                  {/* Remove */}
                  {member.role !== 'owner' && (
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${member.name ?? member.email} from the team?`)) {
                          removeMemberMutation.mutate(member.id);
                        }
                      }}
                      className="text-gray-300 hover:text-red-500 transition-colors ml-1 text-lg leading-none"
                      title="Remove member"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Pending invites ────────────────────────────────────────────── */}
        {invites.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Pending invites
              <span className="ml-2 text-sm font-normal text-gray-400">({invites.length})</span>
            </h2>
            <ul className="divide-y divide-gray-100">
              {invites.map(invite => (
                <li key={invite.id} className="flex items-center gap-3 py-3">
                  <div className="w-9 h-9 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center text-sm font-semibold shrink-0">
                    ✉
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{invite.email}</p>
                    <p className="text-xs text-gray-400">
                      Invited {new Date(invite.createdAt).toLocaleDateString()} · awaiting sign-in
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_COLORS[invite.role]}`}>
                    {ROLE_LABELS[invite.role]}
                  </span>
                  <button
                    onClick={() => cancelInviteMutation.mutate(invite.id)}
                    className="text-gray-300 hover:text-red-500 transition-colors ml-1 text-lg leading-none"
                    title="Cancel invite"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

      </div>
    </div>
  );
}

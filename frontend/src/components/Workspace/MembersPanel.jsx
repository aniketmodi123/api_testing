import { useState } from 'react';
import RoleBadge from '../common/RoleBadge';
import InviteModal from './InviteModal';
import styles from './Workspace.module.css';
import {
  useGetWorkspaceMembersQuery,
  useRemoveWorkspaceMemberMutation,
  useUpdateMemberRoleMutation,
} from '../../store/apiSlice';

export default function MembersPanel({ workspaceId, isOwner }) {
  const [showInvite, setShowInvite] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingRole, setEditingRole] = useState('viewer');

  const { data, isLoading, refetch } = useGetWorkspaceMembersQuery(workspaceId, { skip: !workspaceId });
  const [removeMember] = useRemoveWorkspaceMemberMutation();
  const [updateRole] = useUpdateMemberRoleMutation();

  const members = data?.members || [];
  const pendingInvites = data?.pending_invites || [];

  const handleRemove = async userId => {
    if (!confirm('Remove this member from the workspace?')) return;
    await removeMember({ workspaceId, userId });
    refetch();
  };

  const handleRoleEdit = (userId, currentRole) => {
    setEditingUserId(userId);
    setEditingRole(currentRole);
  };

  const handleRoleSave = async userId => {
    await updateRole({ workspaceId, userId, role: editingRole });
    setEditingUserId(null);
    refetch();
  };

  if (isLoading) return <div className={styles.loading}>Loading members…</div>;

  return (
    <div className={styles.membersPanel}>
      <div className={styles.membersPanelHeader}>
        <span>Members ({members.length})</span>
        {isOwner && (
          <button className={styles.inviteBtn} onClick={() => setShowInvite(true)}>
            + Invite
          </button>
        )}
      </div>

      {members.length === 0 && pendingInvites.length === 0 ? (
        <p className={styles.emptyMsg}>No members yet. Invite someone to collaborate.</p>
      ) : (
        <ul className={styles.memberList}>
          {members.map(m => (
            <li key={m.user_id} className={styles.memberItem}>
              <span className={styles.memberEmail}>{m.email}</span>
              {editingUserId === m.user_id ? (
                <span className={styles.roleEdit}>
                  <select
                    value={editingRole}
                    onChange={e => setEditingRole(e.target.value)}
                    className={styles.select}
                    style={{ marginRight: 6 }}
                  >
                    <option value="viewer">viewer</option>
                    <option value="editor">editor</option>
                    <option value="admin">admin</option>
                  </select>
                  <button className={styles.saveBadge} onClick={() => handleRoleSave(m.user_id)}>Save</button>
                  <button className={styles.cancelBadge} onClick={() => setEditingUserId(null)}>×</button>
                </span>
              ) : (
                <span className={styles.roleArea}>
                  <RoleBadge role={m.role} />
                  {isOwner && (
                    <>
                      <button className={styles.editBtn} onClick={() => handleRoleEdit(m.user_id, m.role)} title="Change role">✎</button>
                      <button className={styles.removeBtn} onClick={() => handleRemove(m.user_id)} title="Remove member">×</button>
                    </>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {pendingInvites.length > 0 && (
        <>
          <div className={styles.sectionLabel}>Pending invites</div>
          <ul className={styles.memberList}>
            {pendingInvites.map(inv => (
              <li key={inv.id} className={styles.memberItem}>
                <span className={styles.memberEmail}>{inv.email}</span>
                <span className={styles.roleArea}>
                  <RoleBadge role={inv.role} />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>pending</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {showInvite && (
        <InviteModal
          workspaceId={workspaceId}
          onClose={() => setShowInvite(false)}
          onInvited={() => { setShowInvite(false); refetch(); }}
        />
      )}
    </div>
  );
}

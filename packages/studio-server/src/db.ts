import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Config } from './config.js';
import type { AuthedUser } from './auth.js';
import type { Database } from './database.types.js';

export type ArtifactKind = 'grid' | 'profile';

// `type` (not `interface`) so these satisfy supabase-js's `GenericTable` row shape.
export type OrgRow = {
  readonly id: string;
  readonly name: string;
  readonly created_at: string;
};

export type OrgMemberRow = {
  readonly org_id: string;
  readonly user_id: string;
  readonly role: 'admin' | 'member';
  readonly created_at: string;
};

/** A roster entry with the member's email (from the `org_members` function). */
export type OrgMemberDetail = {
  readonly user_id: string;
  readonly email: string | null;
  readonly role: 'admin' | 'member';
  readonly created_at: string;
};

export type OrgInviteRow = {
  readonly id: string;
  readonly org_id: string;
  readonly token: string;
  readonly email: string | null;
  readonly role: 'admin' | 'member';
  readonly created_by: string | null;
  readonly expires_at: string;
  readonly accepted_by: string | null;
  readonly accepted_at: string | null;
  readonly created_at: string;
};

export interface NewInvite {
  readonly email?: string;
  readonly role: 'admin' | 'member';
}

export type ArtifactRow = {
  readonly id: string;
  readonly org_id: string | null;
  readonly created_by: string | null;
  readonly name: string;
  readonly body: unknown;
  readonly is_template: boolean;
  readonly created_at: string;
  readonly updated_at: string;
};

export type RunRow = {
  readonly id: string;
  readonly org_id: string;
  readonly created_by: string | null;
  readonly subject_id: string;
  readonly grid_snapshot: unknown;
  readonly profile_snapshot: unknown;
  readonly evaluation: unknown;
  readonly created_at: string;
};

export interface NewArtifact {
  readonly orgId: string;
  readonly name: string;
  readonly body: unknown;
}

export interface NewRun {
  readonly orgId: string;
  readonly subjectId: string;
  readonly gridSnapshot: unknown;
  readonly profileSnapshot: unknown;
  readonly evaluation: unknown;
}

/**
 * Every method runs as the calling user (their JWT rides on the PostgREST
 * request), so row-level security decides what is visible and writable: a
 * member reads an org's grids, an admin or the creator changes them, any member
 * may run. The server adds no checks of its own -- the policies are the boundary.
 */
export interface Store {
  listOrgs(): Promise<OrgRow[]>;
  createOrg(name: string): Promise<OrgRow>;

  listMembers(orgId: string): Promise<OrgMemberDetail[]>;
  updateMemberRole(
    orgId: string,
    userId: string,
    role: 'admin' | 'member',
  ): Promise<OrgMemberRow | null>;
  removeMember(orgId: string, userId: string): Promise<boolean>;

  listInvites(orgId: string): Promise<OrgInviteRow[]>;
  createInvite(orgId: string, input: NewInvite): Promise<OrgInviteRow>;
  deleteInvite(orgId: string, inviteId: string): Promise<boolean>;
  acceptInvite(token: string): Promise<OrgMemberRow>;

  /**
   * Delete the caller's account: every org membership, then the auth.users row
   * itself. Refuses (with a message naming the orgs) rather than stranding a
   * shared org the caller is the sole admin of.
   */
  deleteAccount(): Promise<void>;

  list(kind: ArtifactKind, orgId?: string): Promise<ArtifactRow[]>;
  get(kind: ArtifactKind, id: string): Promise<ArtifactRow | null>;
  create(kind: ArtifactKind, input: NewArtifact): Promise<ArtifactRow>;
  update(
    kind: ArtifactKind,
    id: string,
    patch: { name?: string; body?: unknown },
  ): Promise<ArtifactRow | null>;
  remove(kind: ArtifactKind, id: string): Promise<boolean>;

  listRuns(filter: { orgId?: string; subjectId?: string }): Promise<RunRow[]>;
  getRun(id: string): Promise<RunRow | null>;
  createRun(input: NewRun): Promise<RunRow>;
}

export interface Db {
  forUser(user: AuthedUser): Store;
}

/** Throw a PostgREST error, or return the data (the caller knows the shape). */
function unwrap<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error !== null) {
    throw new Error(result.error.message);
  }
  return result.data;
}

/** Like `unwrap`, for a query that must return exactly one row (`.single()`, an rpc). */
function unwrapOne<T>(result: { data: T | null; error: { message: string } | null }): T {
  const data = unwrap(result);
  if (data === null) {
    throw new Error('expected a row, got none');
  }
  return data;
}

class SupabaseStore implements Store {
  private readonly supabase: SupabaseClient<Database>;

  constructor(config: Config, private readonly user: AuthedUser) {
    this.supabase = createClient<Database>(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${user.jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async listOrgs(): Promise<OrgRow[]> {
    return (
      unwrap(
        await this.supabase.from('org').select('*').order('created_at', { ascending: true }),
      ) ?? []
    );
  }

  async createOrg(name: string): Promise<OrgRow> {
    return unwrapOne(await this.supabase.rpc("create_org", { p_name: name }));
  }

  async listMembers(orgId: string): Promise<OrgMemberDetail[]> {
    return (unwrap(await this.supabase.rpc('org_members', { p_org: orgId })) ?? []) as OrgMemberDetail[];
  }

  async updateMemberRole(
    orgId: string,
    userId: string,
    role: 'admin' | 'member',
  ): Promise<OrgMemberRow | null> {
    return unwrap(
      await this.supabase
        .from('org_member')
        .update({ role })
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .select('*')
        .maybeSingle(),
    );
  }

  async removeMember(orgId: string, userId: string): Promise<boolean> {
    const rows = unwrap(
      await this.supabase
        .from('org_member')
        .delete()
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .select('org_id'),
    );
    return (rows ?? []).length > 0;
  }

  async listInvites(orgId: string): Promise<OrgInviteRow[]> {
    return (
      unwrap(
        await this.supabase
          .from('org_invite')
          .select('*')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false }),
      ) ?? []
    );
  }

  async createInvite(orgId: string, input: NewInvite): Promise<OrgInviteRow> {
    return unwrapOne(
      await this.supabase
        .from('org_invite')
        .insert({
          org_id: orgId,
          created_by: this.user.id,
          role: input.role,
          ...(input.email === undefined ? {} : { email: input.email }),
        })
        .select('*')
        .single(),
    );
  }

  async deleteInvite(orgId: string, inviteId: string): Promise<boolean> {
    const rows = unwrap(
      await this.supabase
        .from('org_invite')
        .delete()
        .eq('id', inviteId)
        .eq('org_id', orgId)
        .select('id'),
    );
    return (rows ?? []).length > 0;
  }

  async acceptInvite(token: string): Promise<OrgMemberRow> {
    return unwrapOne(await this.supabase.rpc("accept_invite", { p_token: token }));
  }

  async deleteAccount(): Promise<void> {
    unwrap(await this.supabase.rpc('delete_account'));
  }

  async list(kind: ArtifactKind, orgId?: string): Promise<ArtifactRow[]> {
    let query = this.supabase.from(kind).select('*').order('updated_at', { ascending: false });
    if (orgId !== undefined) {
      // Templates carry a NULL org, so include them alongside the org's own rows.
      query = query.or(`org_id.eq.${orgId},is_template.is.true`);
    }
    return unwrap(await query) ?? [];
  }

  async get(kind: ArtifactKind, id: string): Promise<ArtifactRow | null> {
    return unwrap(await this.supabase.from(kind).select('*').eq('id', id).maybeSingle());
  }

  async create(kind: ArtifactKind, input: NewArtifact): Promise<ArtifactRow> {
    return unwrapOne(
      await this.supabase
        .from(kind)
        .insert({
          org_id: input.orgId,
          created_by: this.user.id,
          name: input.name,
          body: input.body,
        })
        .select('*')
        .single(),
    );
  }

  async update(
    kind: ArtifactKind,
    id: string,
    patch: { name?: string; body?: unknown },
  ): Promise<ArtifactRow | null> {
    return unwrap(
      await this.supabase.from(kind).update(patch).eq('id', id).select('*').maybeSingle(),
    );
  }

  async remove(kind: ArtifactKind, id: string): Promise<boolean> {
    const rows = unwrap(await this.supabase.from(kind).delete().eq('id', id).select('id'));
    return (rows ?? []).length > 0;
  }

  async listRuns(filter: { orgId?: string; subjectId?: string }): Promise<RunRow[]> {
    let query = this.supabase.from('run').select('*').order('created_at', { ascending: false });
    if (filter.orgId !== undefined) query = query.eq('org_id', filter.orgId);
    if (filter.subjectId !== undefined) query = query.eq('subject_id', filter.subjectId);
    return unwrap(await query) ?? [];
  }

  async getRun(id: string): Promise<RunRow | null> {
    return unwrap(await this.supabase.from('run').select('*').eq('id', id).maybeSingle());
  }

  async createRun(input: NewRun): Promise<RunRow> {
    return unwrapOne(
      await this.supabase
        .from('run')
        .insert({
          org_id: input.orgId,
          created_by: this.user.id,
          subject_id: input.subjectId,
          grid_snapshot: input.gridSnapshot,
          profile_snapshot: input.profileSnapshot,
          evaluation: input.evaluation,
        })
        .select('*')
        .single(),
    );
  }
}

export function supabaseDb(config: Config): Db {
  return { forUser: (user) => new SupabaseStore(config, user) };
}

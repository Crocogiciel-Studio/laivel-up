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

class SupabaseStore implements Store {
  constructor(
    private readonly config: Config,
    private readonly user: AuthedUser,
  ) {}

  private client(): SupabaseClient<Database> {
    return createClient<Database>(this.config.SUPABASE_URL, this.config.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${this.user.jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async listOrgs(): Promise<OrgRow[]> {
    const { data, error } = await this.client()
      .from('org')
      .select('*')
      .order('created_at', { ascending: true });
    if (error !== null) throw new Error(error.message);
    return (data ?? []) as OrgRow[];
  }

  async createOrg(name: string): Promise<OrgRow> {
    const { data, error } = await this.client().rpc('create_org', { p_name: name });
    if (error !== null) throw new Error(error.message);
    return data as OrgRow;
  }

  async list(kind: ArtifactKind, orgId?: string): Promise<ArtifactRow[]> {
    let query = this.client().from(kind).select('*').order('updated_at', { ascending: false });
    if (orgId !== undefined) query = query.eq('org_id', orgId);
    const { data, error } = await query;
    if (error !== null) throw new Error(error.message);
    return (data ?? []) as ArtifactRow[];
  }

  async get(kind: ArtifactKind, id: string): Promise<ArtifactRow | null> {
    const { data, error } = await this.client().from(kind).select('*').eq('id', id).maybeSingle();
    if (error !== null) throw new Error(error.message);
    return (data as ArtifactRow | null) ?? null;
  }

  async create(kind: ArtifactKind, input: NewArtifact): Promise<ArtifactRow> {
    const { data, error } = await this.client()
      .from(kind)
      .insert({
        org_id: input.orgId,
        created_by: this.user.id,
        name: input.name,
        body: input.body,
      })
      .select('*')
      .single();
    if (error !== null) throw new Error(error.message);
    return data as ArtifactRow;
  }

  async update(
    kind: ArtifactKind,
    id: string,
    patch: { name?: string; body?: unknown },
  ): Promise<ArtifactRow | null> {
    const { data, error } = await this.client()
      .from(kind)
      .update(patch)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error !== null) throw new Error(error.message);
    return (data as ArtifactRow | null) ?? null;
  }

  async remove(kind: ArtifactKind, id: string): Promise<boolean> {
    const { data, error } = await this.client().from(kind).delete().eq('id', id).select('id');
    if (error !== null) throw new Error(error.message);
    return (data ?? []).length > 0;
  }

  async listRuns(filter: { orgId?: string; subjectId?: string }): Promise<RunRow[]> {
    let query = this.client().from('run').select('*').order('created_at', { ascending: false });
    if (filter.orgId !== undefined) query = query.eq('org_id', filter.orgId);
    if (filter.subjectId !== undefined) query = query.eq('subject_id', filter.subjectId);
    const { data, error } = await query;
    if (error !== null) throw new Error(error.message);
    return (data ?? []) as RunRow[];
  }

  async getRun(id: string): Promise<RunRow | null> {
    const { data, error } = await this.client().from('run').select('*').eq('id', id).maybeSingle();
    if (error !== null) throw new Error(error.message);
    return (data as RunRow | null) ?? null;
  }

  async createRun(input: NewRun): Promise<RunRow> {
    const { data, error } = await this.client()
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
      .single();
    if (error !== null) throw new Error(error.message);
    return data as RunRow;
  }
}

export function supabaseDb(config: Config): Db {
  return { forUser: (user) => new SupabaseStore(config, user) };
}

// Hand-written stand-in for `supabase gen types`. Only the columns the studio
// server reads or writes. Keep in step with supabase/migrations/.
import type {
  ArtifactRow,
  OrgInviteRow,
  OrgMemberDetail,
  OrgMemberRow,
  OrgRow,
  RunRow,
} from './db.js';

type Empty = Record<string, never>;

// These must be `type` (not `interface`) so they carry an implicit index
// signature and satisfy supabase-js's `GenericTable`.
type OrgInsert = { id?: string; name: string; created_at?: string };
type OrgMemberInsert = {
  org_id: string;
  user_id: string;
  role?: 'admin' | 'member';
  created_at?: string;
};
type OrgMemberUpdate = { role?: 'admin' | 'member' };
type OrgInviteInsert = {
  id?: string;
  org_id: string;
  token?: string;
  email?: string | null;
  role?: 'admin' | 'member';
  created_by?: string | null;
  expires_at?: string;
};

type ArtifactInsert = {
  id?: string;
  org_id?: string | null;
  created_by?: string | null;
  name: string;
  body: unknown;
  is_template?: boolean;
  created_at?: string;
  updated_at?: string;
};

type ArtifactUpdate = {
  name?: string;
  body?: unknown;
  updated_at?: string;
};

type RunInsert = {
  id?: string;
  org_id: string;
  created_by?: string | null;
  subject_id: string;
  grid_snapshot: unknown;
  profile_snapshot: unknown;
  evaluation: unknown;
  created_at?: string;
};

export interface Database {
  public: {
    Tables: {
      org: { Row: OrgRow; Insert: OrgInsert; Update: Partial<OrgInsert>; Relationships: [] };
      org_member: {
        Row: OrgMemberRow;
        Insert: OrgMemberInsert;
        Update: OrgMemberUpdate;
        Relationships: [];
      };
      org_invite: {
        Row: OrgInviteRow;
        Insert: OrgInviteInsert;
        Update: Partial<OrgInviteInsert>;
        Relationships: [];
      };
      grid: { Row: ArtifactRow; Insert: ArtifactInsert; Update: ArtifactUpdate; Relationships: [] };
      profile: {
        Row: ArtifactRow;
        Insert: ArtifactInsert;
        Update: ArtifactUpdate;
        Relationships: [];
      };
      run: { Row: RunRow; Insert: RunInsert; Update: Partial<RunInsert>; Relationships: [] };
    };
    Views: Empty;
    Functions: {
      create_org: { Args: { p_name: string }; Returns: OrgRow };
      accept_invite: { Args: { p_token: string }; Returns: OrgMemberRow };
      org_members: { Args: { p_org: string }; Returns: OrgMemberDetail[] };
    };
    Enums: Empty;
    CompositeTypes: Empty;
  };
}

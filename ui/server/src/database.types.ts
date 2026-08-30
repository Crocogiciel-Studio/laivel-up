// Hand-written stand-in for `supabase gen types`. Only the columns the studio
// server reads or writes. Keep in step with supabase/migrations/.
import type { ArtifactRow, RunRow } from './db.js';

type Empty = Record<string, never>;

// These must be `type` (not `interface`) so they carry an implicit index
// signature and satisfy supabase-js's `GenericTable`.
type ArtifactInsert = {
  id?: string;
  owner_id?: string | null;
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
  owner_id: string;
  subject_id: string;
  grid_snapshot: unknown;
  profile_snapshot: unknown;
  evaluation: unknown;
  created_at?: string;
};

export interface Database {
  public: {
    Tables: {
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
    Functions: Empty;
    Enums: Empty;
    CompositeTypes: Empty;
  };
}

// Mirrors the Supabase schema. Only the columns we read are typed.

export type Role = 'contributor' | 'admin';

export interface Profile {
  id: string;
  email: string | null;
  role: Role;
  alias: string | null;
  avatar_path: string | null;
  created_at: string;
}

// Public, non-sensitive subset (id/alias/avatar) exposed via the
// `public_profiles` view — used to show who logged a care session.
export interface PublicProfile {
  id: string;
  alias: string | null;
  avatar_path: string | null;
}

export interface TreeBedType {
  id: number;
  label: string;
  is_active: boolean;
  sort_order: number;
}

export interface ActivityType {
  id: number;
  label: string;
  is_active: boolean;
  sort_order: number;
}

// Free-form, community-editable lookup. Beds reference it by id, so renaming a
// species updates every bed automatically.
export interface TreeSpecies {
  id: number;
  name: string;
  created_at: string;
  created_by: string | null;
}

export interface TreeBed {
  id: string;
  name: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  species_id: number | null;
  // NYC Parks tree id — only set for "City tree" beds. Free-form text.
  tree_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Nested shape returned by Supabase when joining the junction + types lookup.
// `tree_species` is only present on queries that join it (e.g. the detail view).
export interface TreeBedWithTypes extends TreeBed {
  tree_bed_type_assignments: Array<{
    type_id: number;
    tree_bed_types: { label: string } | null;
  }>;
  tree_species?: { name: string } | null;
}

// A spigot/hydrant used to water beds. Its own entity — not a tree bed.
export interface WaterSource {
  id: string;
  name: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  is_working: boolean;
  status_checked_at: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CareSession {
  id: string;
  tree_bed_id: string;
  notes: string | null;
  performed_at: string;
  created_by: string | null;
  created_at: string;
}

export interface CareSessionPhoto {
  id: number;
  storage_path: string;
}

// Shape returned when joining a care_session with its activities (M2M) and photos.
export interface CareSessionFull extends CareSession {
  care_session_activities: Array<{
    activity_type_id: number;
    activity_types: { label: string } | null;
  }>;
  care_session_photos: CareSessionPhoto[];
  // Present only on queries that embed it (e.g. the bed detail view).
  care_session_reactions?: Array<{ emoji: string; user_id: string }>;
}

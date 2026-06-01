// Mirrors the Supabase schema. Only the columns we read are typed.

export type Role = 'contributor' | 'admin';

export interface Profile {
  id: string;
  email: string | null;
  role: Role;
  created_at: string;
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

export interface TreeBed {
  id: string;
  name: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Nested shape returned by Supabase when joining the junction + types lookup.
export interface TreeBedWithTypes extends TreeBed {
  tree_bed_type_assignments: Array<{
    type_id: number;
    tree_bed_types: { label: string } | null;
  }>;
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
}

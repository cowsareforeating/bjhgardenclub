import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useLocationPicker } from '../lib/useLocationPicker';
import { selectedTypeFlags } from '../lib/treeBedTypes';
import type { TreeBedType } from '../lib/types';
import { Banner } from '../components/Banner';
import { PageHeader } from '../components/PageHeader';
import { LocationPicker } from '../components/LocationPicker';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { SpeciesSelect } from '../components/SpeciesSelect';
import { cn } from '../lib/utils';

// What the user is creating. Water sources aren't tree beds — different table.
type Entity = 'water' | 'bed';

// Router state set by MapView's FAB → "Confirm location" path.
interface PresetState {
  lat?: number;
  lon?: number;
}

export function AddTreeBed() {
  const { user } = useAuth();
  const nav = useNavigate();
  const routerState = (useLocation().state as PresetState | null) ?? null;
  const preset =
    routerState && typeof routerState.lat === 'number' && typeof routerState.lon === 'number'
      ? { lat: routerState.lat, lon: routerState.lon }
      : undefined;

  const loc = useLocationPicker(preset);

  const [entity, setEntity] = useState<Entity>('bed');
  // Water-source-only fields.
  const [isWorking, setIsWorking] = useState(true);
  const [notes, setNotes] = useState('');

  const [name, setName] = useState('');
  const [types, setTypes] = useState<TreeBedType[]>([]);
  const [selectedTypeIds, setSelectedTypeIds] = useState<number[]>([]);
  const [speciesId, setSpeciesId] = useState<number | null>(null);
  const [treeId, setTreeId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase
      .from('tree_bed_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setTypes((data ?? []) as TreeBedType[]);
      });
  }, []);

  const toggleType = (id: number) => {
    setSelectedTypeIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  // Species + NYC tree id only apply to tree / city-tree beds.
  const { hasTree: hasTreeType, hasCityTree } = selectedTypeFlags(types, selectedTypeIds);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!user) {
      setError('You must be signed in to add to the map.');
      return;
    }
    if (loc.lat === null || loc.lon === null) {
      setError('Pick a location first (GPS, address, or tap the map).');
      return;
    }
    if (entity === 'water') {
      setSubmitting(true);
      const { error: waterErr } = await supabase.from('water_sources').insert({
        name: name.trim() || null,
        latitude: loc.lat,
        longitude: loc.lon,
        address: loc.address.trim() || null,
        is_working: isWorking,
        notes: notes.trim() || null
      });
      setSubmitting(false);
      if (waterErr) {
        setError(waterErr.message);
        return;
      }
      nav('/');
      return;
    }
    if (selectedTypeIds.length === 0) {
      setError('Choose at least one tree bed type.');
      return;
    }
    setSubmitting(true);
    const { data: bed, error: insertErr } = await supabase
      .from('tree_beds')
      .insert({
        name: name.trim() || null,
        latitude: loc.lat,
        longitude: loc.lon,
        address: loc.address.trim() || null,
        species_id: hasTreeType ? speciesId : null,
        tree_id: hasCityTree ? treeId.trim() || null : null
      })
      .select('id')
      .single();
    if (insertErr || !bed) {
      setSubmitting(false);
      setError(insertErr?.message ?? 'Could not save bed.');
      return;
    }
    const assignments = selectedTypeIds.map((type_id) => ({ tree_bed_id: bed.id, type_id }));
    const { error: assignErr } = await supabase.from('tree_bed_type_assignments').insert(assignments);
    setSubmitting(false);
    if (assignErr) {
      setError(`Bed saved but types failed to attach: ${assignErr.message}`);
      return;
    }
    nav(`/bed/${bed.id}`);
  };

  return (
    <div className="h-full overflow-y-auto">
      <form onSubmit={onSubmit} className="space-y-5 p-4 pb-8">
        <PageHeader title={entity === 'water' ? 'Add a water source' : 'Add a tree bed'} back="/" />

        <div className="space-y-2">
          <Label>What are you adding?</Label>
          <div className="flex gap-2 rounded-lg bg-muted p-1">
            <EntityOption entity="water" current={entity} setEntity={setEntity} label="Water source" />
            <EntityOption entity="bed" current={entity} setEntity={setEntity} label="Tree bed" />
          </div>
        </div>

        <LocationPicker loc={loc} />

        <div className="space-y-2">
          <Label htmlFor="name">Name (optional)</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Corner oak" />
        </div>

        {entity === 'bed' && (
          <div className="space-y-2">
            <Label>Type(s) — pick one or more</Label>
            <div className="flex flex-wrap gap-2">
              {types.map((t) => {
                const on = selectedTypeIds.includes(t.id);
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => toggleType(t.id)}
                    aria-pressed={on}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm transition-colors',
                      on
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-foreground hover:bg-muted'
                    )}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {entity === 'water' && (
          <>
            <div className="space-y-2">
              <Label>Status</Label>
              <div className="flex gap-2 rounded-lg bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setIsWorking(true)}
                  aria-pressed={isWorking}
                  className={cn(
                    'flex-1 rounded-md py-2.5 text-sm font-medium transition-colors',
                    isWorking ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Working
                </button>
                <button
                  type="button"
                  onClick={() => setIsWorking(false)}
                  aria-pressed={!isWorking}
                  className={cn(
                    'flex-1 rounded-md py-2.5 text-sm font-medium transition-colors',
                    !isWorking ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Dry / broken
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. behind the gate — needs a key"
                rows={3}
              />
            </div>
          </>
        )}

        {hasTreeType && (
          <div className="space-y-2">
            <Label>Tree species (optional)</Label>
            <SpeciesSelect value={speciesId} onChange={setSpeciesId} canEdit={!!user} />
          </div>
        )}

        {hasCityTree && (
          <div className="space-y-2">
            <Label htmlFor="tree_id">NYC tree ID (optional)</Label>
            <Input
              id="tree_id"
              value={treeId}
              onChange={(e) => setTreeId(e.target.value)}
              placeholder="e.g. 3754306"
              inputMode="numeric"
            />
            <p className="text-xs text-muted-foreground">
              From the NYC tree map — the number after “Tree ID #”.
            </p>
          </div>
        )}

        {(error || loc.error) && <Banner kind="error">{error ?? loc.error}</Banner>}

        <Button type="submit" disabled={submitting} size="xl" className="w-full">
          {submitting ? 'Saving…' : entity === 'water' ? 'Save water source' : 'Save tree bed'}
        </Button>
      </form>
    </div>
  );
}

function EntityOption({
  entity,
  current,
  setEntity,
  label
}: {
  entity: Entity;
  current: Entity;
  setEntity: (e: Entity) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => setEntity(entity)}
      aria-pressed={current === entity}
      className={cn(
        'flex-1 rounded-md py-2.5 text-sm font-medium transition-colors',
        current === entity
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  );
}

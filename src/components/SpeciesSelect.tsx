import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { TreeSpecies } from '../lib/types';
import { Input } from './ui/input';
import { cn } from '../lib/utils';

interface Props {
  value: number | null;
  onChange: (id: number | null) => void;
  /** Whether the current user may add / rename / delete species. */
  canEdit: boolean;
}

/**
 * Creatable single-select for tree species. Add, rename, and delete all happen
 * inline. Deletion is blocked by the DB (ON DELETE RESTRICT) while any bed still
 * references the species, surfaced here as a friendly message.
 */
export function SpeciesSelect({ value, onChange, canEdit }: Props) {
  const [list, setList] = useState<TreeSpecies[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    supabase
      .from('tree_species')
      .select('*')
      .order('name')
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setList((data ?? []) as TreeSpecies[]);
      });
  }, []);

  const sortByName = (arr: TreeSpecies[]) =>
    [...arr].sort((a, b) => a.name.localeCompare(b.name));

  const selected = useMemo(() => list.find((s) => s.id === value) ?? null, [list, value]);
  const q = query.trim();
  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return ql ? list.filter((s) => s.name.toLowerCase().includes(ql)) : list;
  }, [list, q]);
  const exactExists = list.some((s) => s.name.toLowerCase() === q.toLowerCase());

  const addSpecies = async () => {
    if (!q) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from('tree_species')
      .insert({ name: q })
      .select('*')
      .single();
    setBusy(false);
    if (error) {
      // Already exists (case-insensitive unique) → just select the existing one.
      if (error.code === '23505') {
        const existing = list.find((s) => s.name.toLowerCase() === q.toLowerCase());
        if (existing) {
          onChange(existing.id);
          setQuery('');
          return;
        }
      }
      setError(error.message);
      return;
    }
    const created = data as TreeSpecies;
    setList((cur) => sortByName([...cur, created]));
    onChange(created.id);
    setQuery('');
  };

  const deleteSpecies = async (s: TreeSpecies) => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('tree_species').delete().eq('id', s.id);
    setBusy(false);
    if (error) {
      setError(
        error.code === '23503'
          ? `“${s.name}” is still used by a bed, so it can’t be deleted.`
          : error.message
      );
      return;
    }
    setList((cur) => cur.filter((x) => x.id !== s.id));
    if (value === s.id) onChange(null);
  };

  const saveRename = async (s: TreeSpecies) => {
    const next = editName.trim();
    if (!next || next === s.name) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('tree_species').update({ name: next }).eq('id', s.id);
    setBusy(false);
    if (error) {
      setError(error.code === '23505' ? `“${next}” already exists.` : error.message);
      return;
    }
    setEditingId(null);
    setList((cur) => sortByName(cur.map((x) => (x.id === s.id ? { ...x, name: next } : x))));
  };

  return (
    <div className="space-y-2">
      {selected && (
        <div className="flex items-center gap-2 rounded-md border border-primary bg-primary/10 px-3 py-2 text-sm">
          <span className="font-medium">{selected.name}</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Clear species"
            className="ml-auto text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Input
        type="text"
        placeholder={selected ? 'Change species…' : 'Search or add a species'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />

      {(filtered.length > 0 || (canEdit && !!q && !exactExists)) && (
        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {filtered.map((s) => (
            <li key={s.id}>
              {editingId === s.id ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoFocus
                    className="h-9"
                  />
                  <button
                    type="button"
                    onClick={() => saveRename(s)}
                    aria-label="Save name"
                    className="p-2 text-primary"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    aria-label="Cancel rename"
                    className="p-2 text-muted-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div
                  className={cn(
                    'flex items-center rounded-md border px-3 py-2 text-sm',
                    s.id === value ? 'border-primary bg-primary/10' : 'border-border bg-card'
                  )}
                >
                  <button type="button" onClick={() => onChange(s.id)} className="flex-1 text-left">
                    {s.name}
                  </button>
                  {canEdit && (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(s.id);
                          setEditName(s.name);
                          setError(null);
                        }}
                        aria-label={`Rename ${s.name}`}
                        className="p-1 text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSpecies(s)}
                        disabled={busy}
                        aria-label={`Delete ${s.name}`}
                        className="p-1 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}

          {canEdit && !!q && !exactExists && (
            <li>
              <button
                type="button"
                onClick={addSpecies}
                disabled={busy}
                className="flex w-full items-center gap-2 rounded-md border border-dashed border-primary px-3 py-2 text-left text-sm text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Add “{q}”
              </button>
            </li>
          )}
        </ul>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

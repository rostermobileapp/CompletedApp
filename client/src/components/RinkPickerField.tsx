import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getAuthHeaders, queryClient } from '@/lib/queryClient';
import { MapPin, Search, Check, Plus, AlertTriangle, X, Building2 } from 'lucide-react';

interface Facility {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}

export interface RinkSelection {
  facilityId: string;
  name: string;
  address: string;
}

interface Props {
  onSelect: (data: RinkSelection | null) => void;
  initialSelection?: { facilityId: string; name: string; address: string };
}

function formatAddress(f: Facility) {
  return [f.address, f.city, f.state, f.zipCode].filter(Boolean).join(', ') || '';
}

export function RinkPickerField({ onSelect, initialSelection }: Props) {
  const [mode, setMode] = useState<'idle' | 'searching' | 'selected' | 'adding'>(
    initialSelection ? 'selected' : 'idle'
  );
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState<Facility | null>(
    initialSelection
      ? { id: initialSelection.facilityId, name: initialSelection.name, address: initialSelection.address }
      : null
  );

  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<Facility | null>(null);
  const [bypassCheck, setBypassCheck] = useState(false);

  const autocompleteRef = useRef<any>(null);
  const placesRef = useRef<any>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const addingDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    function initMaps() {
      if ((window as any).google?.maps?.places) {
        autocompleteRef.current = new (window as any).google.maps.places.AutocompleteService();
        placesRef.current = new (window as any).google.maps.places.PlacesService(document.createElement('div'));
      }
    }

    if ((window as any).google?.maps?.places) {
      initMaps();
      return;
    }

    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) {
      existing.addEventListener('load', initMaps);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = initMaps;
    script.onerror = () => console.error('Failed to load Google Maps API');
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: searchResults = [], isFetching } = useQuery<Facility[]>({
    queryKey: ['/api/facilities', 'search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery.trim()) return [];
      const res = await fetch(`/api/facilities?search=${encodeURIComponent(debouncedQuery)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: debouncedQuery.trim().length > 0,
  });

  const handleAddressInput = useCallback((value: string) => {
    setNewAddress(value);
    setDuplicateWarning(null);
    setBypassCheck(false);
    if (!value.trim() || !autocompleteRef.current) {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      return;
    }
    autocompleteRef.current.getPlacePredictions(
      { input: value, types: ['address'] },
      (predictions: any[], status: string) => {
        if (status === 'OK' && predictions?.length) {
          setAddressSuggestions(predictions);
          setShowAddressSuggestions(true);
        } else {
          setAddressSuggestions([]);
          setShowAddressSuggestions(false);
        }
      }
    );
  }, []);

  const handleAddressSelect = useCallback((prediction: any) => {
    setShowAddressSuggestions(false);
    if (!placesRef.current) {
      setNewAddress(prediction.description);
      return;
    }
    placesRef.current.getDetails(
      { placeId: prediction.place_id, fields: ['formatted_address'] },
      (place: any, status: string) => {
        if (status === 'OK' && place?.formatted_address) {
          setNewAddress(place.formatted_address);
        } else {
          setNewAddress(prediction.description);
        }
      }
    );
  }, []);

  const createFacilityMutation = useMutation({
    mutationFn: async (data: { name: string; address: string; bypassAddressCheck?: boolean }) => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/facilities', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          address: data.address,
          bypassAddressCheck: data.bypassAddressCheck ?? false,
        }),
      });
      const body = await res.json();
      if (res.status === 409) {
        return { conflict: true, existingFacility: body.existingFacility as Facility };
      }
      if (!res.ok) throw new Error(body.message || 'Failed to save rink');
      return { conflict: false, facility: body as Facility };
    },
    onSuccess: (result) => {
      if (result.conflict) {
        setDuplicateWarning(result.existingFacility);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['/api/facilities'] });
      selectFacility(result.facility!);
    },
  });

  const selectFacility = (f: Facility) => {
    setSelected(f);
    setMode('selected');
    setShowDropdown(false);
    setQuery('');
    setDuplicateWarning(null);
    onSelect({ facilityId: f.id, name: f.name, address: formatAddress(f) });
  };

  const clearSelection = () => {
    setSelected(null);
    setMode('idle');
    setQuery('');
    setNewName('');
    setNewAddress('');
    setDuplicateWarning(null);
    setBypassCheck(false);
    onSelect(null);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideSearch = dropdownRef.current?.contains(target) ?? false;
      const insideAdding = addingDropdownRef.current?.contains(target) ?? false;
      if (!insideSearch && !insideAdding) {
        setShowDropdown(false);
        setShowAddressSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (mode === 'selected' && selected) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Check className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">{selected.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5 break-words">{formatAddress(selected)}</div>
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="text-muted-foreground hover:text-foreground text-xs underline flex-shrink-0 mt-0.5 ml-2"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'adding') {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Rink Name</label>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full p-3 bg-background border border-[hsl(var(--hairline))] shadow-[var(--elev-inset)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            placeholder="e.g., Metro Ice Center"
            autoFocus
          />
        </div>

        <div className="relative" ref={addingDropdownRef}>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Full Address</label>
          <input
            type="text"
            value={newAddress}
            onChange={e => handleAddressInput(e.target.value)}
            className="w-full p-3 bg-background border border-[hsl(var(--hairline))] shadow-[var(--elev-inset)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            placeholder="Start typing an address…"
            autoComplete="off"
          />
          {showAddressSuggestions && addressSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-[hsl(var(--hairline))] rounded-lg shadow-lg z-50 overflow-hidden">
              {addressSuggestions.map(s => (
                <button
                  key={s.place_id}
                  type="button"
                  className="w-full text-left px-4 py-3 text-sm hover:bg-muted transition-colors border-b border-[hsl(var(--hairline))] last:border-0"
                  onMouseDown={() => handleAddressSelect(s)}
                >
                  <div className="font-medium">{s.structured_formatting?.main_text}</div>
                  <div className="text-xs text-muted-foreground">{s.structured_formatting?.secondary_text}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {duplicateWarning && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
            <div className="flex items-start gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-amber-700 dark:text-amber-400">This rink might already exist</div>
                <div className="text-sm font-medium mt-1">{duplicateWarning.name}</div>
                <div className="text-xs text-muted-foreground">{formatAddress(duplicateWarning)}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => selectFacility(duplicateWarning)}
                className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold"
              >
                Yes, use this rink
              </button>
              <button
                type="button"
                onClick={() => {
                  setDuplicateWarning(null);
                  setBypassCheck(true);
                }}
                className="flex-1 py-2 bg-muted text-foreground rounded-lg text-xs font-semibold"
              >
                No, it&apos;s different
              </button>
            </div>
          </div>
        )}

        {createFacilityMutation.isError && (
          <p className="text-destructive text-xs">
            {(createFacilityMutation.error as Error)?.message || 'Failed to save rink. Please try again.'}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              setMode('idle');
              setQuery('');
              setNewName('');
              setNewAddress('');
              setDuplicateWarning(null);
              setBypassCheck(false);
            }}
            className="flex-1 py-2.5 border border-[hsl(var(--hairline))] text-foreground rounded-lg text-sm font-medium hover:bg-muted transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => {
              if (!newName.trim() || !newAddress.trim()) return;
              setDuplicateWarning(null);
              createFacilityMutation.mutate({ name: newName.trim(), address: newAddress.trim(), bypassAddressCheck: bypassCheck });
            }}
            disabled={!newName.trim() || !newAddress.trim() || createFacilityMutation.isPending}
            className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createFacilityMutation.isPending ? 'Saving…' : 'Save Rink'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => { if (query.trim()) setShowDropdown(true); }}
          className="w-full pl-12 pr-10 py-3 bg-background border border-[hsl(var(--hairline))] shadow-[var(--elev-inset)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          placeholder="Search for a rink…"
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); setShowDropdown(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {showDropdown && query.trim() && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-[hsl(var(--hairline))] rounded-lg shadow-lg z-50 overflow-hidden max-h-64 overflow-y-auto">
          {isFetching && (
            <div className="px-4 py-3 text-sm text-muted-foreground">Searching…</div>
          )}
          {!isFetching && searchResults.length === 0 && (
            <div className="px-4 py-3 text-sm text-muted-foreground">No rinks found for &quot;{query}&quot;</div>
          )}
          {!isFetching && searchResults.map(f => (
            <button
              key={f.id}
              type="button"
              className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-[hsl(var(--hairline))] last:border-0"
              onMouseDown={() => selectFacility(f)}
            >
              <div className="flex items-start gap-2">
                <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium">{f.name}</div>
                  {formatAddress(f) && (
                    <div className="text-xs text-muted-foreground">{formatAddress(f)}</div>
                  )}
                </div>
              </div>
            </button>
          ))}
          <button
            type="button"
            className="w-full text-left px-4 py-3 hover:bg-muted transition-colors flex items-center gap-2 text-primary"
            onMouseDown={() => {
              setMode('adding');
              setNewName(query);
              setShowDropdown(false);
            }}
          >
            <Plus className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm font-medium">Add &quot;{query}&quot; as a new rink</span>
          </button>
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
        <MapPin className="w-3 h-3" />
        Search existing rinks or add a new one with address verification
      </p>
    </div>
  );
}

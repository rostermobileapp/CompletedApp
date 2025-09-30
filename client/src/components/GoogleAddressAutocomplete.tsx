import { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

interface GoogleAddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  dataTestId?: string;
}

export function GoogleAddressAutocomplete({
  value,
  onChange,
  placeholder = 'Enter address',
  className = '',
  dataTestId = 'input-address-autocomplete',
}: GoogleAddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      setError('Google Maps API key not configured');
      setIsLoading(false);
      return;
    }

    const loader: any = new Loader({
      apiKey,
      version: 'weekly',
      libraries: ['places'],
    });

    const initAutocomplete = async () => {
      try {
        // Use the loader's importLibrary method
        const placesLibrary: any = await loader.importLibrary('places');
        
        if (!inputRef.current) return;

        const autocomplete = new placesLibrary.Autocomplete(inputRef.current, {
          types: ['address'],
          fields: ['formatted_address', 'address_components', 'geometry'],
        });

        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          
          if (place.formatted_address) {
            onChange(place.formatted_address);
          }
        });

        setIsLoading(false);
      } catch (err) {
        console.error('Error loading Google Maps:', err);
        setError('Failed to load Google Maps');
        setIsLoading(false);
      }
    };

    initAutocomplete();
  }, [onChange]);

  if (error) {
    return (
      <div className="space-y-2">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={className}
          data-testid={dataTestId}
        />
        <p className="text-xs text-yellow-600">
          Address verification unavailable. You can still enter an address manually.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        data-testid={dataTestId}
        disabled={isLoading}
      />
      {isLoading && (
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
        </div>
      )}
    </div>
  );
}

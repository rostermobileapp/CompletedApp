import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Sparkles, Heart, Laugh, Trophy, Zap, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { queryClient } from '@/lib/queryClient';

interface GiphyGif {
  id: string;
  title: string;
  url: string;
  images: {
    fixed_height: {
      url: string;
      width: string;
      height: string;
    };
    fixed_width: {
      url: string;
      width: string;
      height: string;
    };
    downsized: {
      url: string;
      width: string;
      height: string;
    };
    original: {
      url: string;
      width: string;
      height: string;
    };
  };
}

interface GiphySearchResponse {
  data: GiphyGif[];
  pagination: {
    total_count: number;
    count: number;
    offset: number;
  };
}

interface GifSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectGif: (gif: GiphyGif) => void;
}

const CATEGORIES = [
  { id: 'trending', label: 'Trending', icon: Sparkles, endpoint: '/api/giphy/trending' },
  { id: 'reactions', label: 'Reactions', icon: Laugh, endpoint: '/api/giphy/category/reactions' },
  { id: 'emotions', label: 'Emotions', icon: Heart, endpoint: '/api/giphy/category/emotions' },
  { id: 'sports', label: 'Sports', icon: Trophy, endpoint: '/api/giphy/category/sports' },
  { id: 'celebration', label: 'Celebration', icon: Zap, endpoint: '/api/giphy/category/celebration' },
];

// Debounce hook
const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

export default function GifSearchModal({ open, onOpenChange, onSelectGif }: GifSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('trending');
  const [selectedGifIndex, setSelectedGifIndex] = useState(-1);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    // Load search history from localStorage
    try {
      const saved = localStorage.getItem('gif-search-history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const debouncedSearch = useDebounce(searchQuery.trim(), 300);
  const gridRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Save search history to localStorage
  const saveSearchHistory = useCallback((query: string) => {
    if (!query.trim()) return;
    
    setSearchHistory(prev => {
      const newHistory = [query, ...prev.filter(h => h !== query)].slice(0, 10); // Keep last 10 searches
      try {
        localStorage.setItem('gif-search-history', JSON.stringify(newHistory));
      } catch {
        // Ignore localStorage errors
      }
      return newHistory;
    });
  }, []);

  // Determine which endpoint to use
  const getQueryKey = () => {
    if (debouncedSearch) {
      return [`/api/giphy/search?q=${encodeURIComponent(debouncedSearch)}`];
    }
    const category = CATEGORIES.find(c => c.id === selectedCategory);
    return [category?.endpoint || '/api/giphy/trending'];
  };

  // Fetch GIFs based on search or category
  const { data: gifsData, isLoading, error, isFetching } = useQuery<GiphySearchResponse>({
    queryKey: getQueryKey(),
    enabled: open, // Only fetch when modal is open
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
  });

  const gifs = gifsData?.data || [];

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setSelectedGifIndex(-1); // Reset selection when searching
    
    if (value.trim()) {
      setSelectedCategory(''); // Clear category when searching
    }
  };

  // Handle search submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debouncedSearch) {
      saveSearchHistory(debouncedSearch);
    }
  };

  // Handle category selection
  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setSearchQuery('');
    setSelectedGifIndex(-1);
  };

  // Handle GIF selection
  const handleGifSelect = (gif: GiphyGif, index: number) => {
    setSelectedGifIndex(index);
    onSelectGif(gif);
    
    // Save search query to history if it was a search
    if (debouncedSearch) {
      saveSearchHistory(debouncedSearch);
    }
    
    // Close modal
    onOpenChange(false);
  };

  // Handle search history item click
  const handleHistoryItemClick = (query: string) => {
    setSearchQuery(query);
    setSelectedCategory('');
    setSelectedGifIndex(-1);
  };

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const gridColumns = 3; // Adjust based on your grid layout
      const maxIndex = gifs.length - 1;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          setSelectedGifIndex(prev => Math.min(prev + 1, maxIndex));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setSelectedGifIndex(prev => Math.max(prev - 1, -1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedGifIndex(prev => Math.min(prev + gridColumns, maxIndex));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedGifIndex(prev => Math.max(prev - gridColumns, -1));
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedGifIndex >= 0 && gifs[selectedGifIndex]) {
            handleGifSelect(gifs[selectedGifIndex], selectedGifIndex);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onOpenChange(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, selectedGifIndex, gifs, onOpenChange]);

  // Focus input when modal opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setSelectedCategory('trending');
      setSelectedGifIndex(-1);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-xl font-semibold">Search GIFs</DialogTitle>
        </DialogHeader>

        <div className="px-6">
          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              ref={inputRef}
              type="text"
              placeholder="Search for GIFs..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="pl-10 pr-4 w-full"
              data-testid="gif-search-input"
            />
            {isFetching && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              </div>
            )}
          </form>

          {/* Search History */}
          {!debouncedSearch && searchHistory.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Recent searches:</p>
              <div className="flex flex-wrap gap-2">
                {searchHistory.slice(0, 5).map((query, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    onClick={() => handleHistoryItemClick(query)}
                    className="text-xs"
                    data-testid={`search-history-${index}`}
                  >
                    {query}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Categories */}
          {!debouncedSearch && (
            <div className="mb-4">
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((category) => {
                  const Icon = category.icon;
                  return (
                    <Button
                      key={category.id}
                      variant={selectedCategory === category.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleCategorySelect(category.id)}
                      className="flex items-center gap-2"
                      data-testid={`category-${category.id}`}
                    >
                      <Icon className="w-4 h-4" />
                      {category.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* GIF Grid */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {error && (
            <div className="text-center py-8 text-red-500" data-testid="error-message">
              Failed to load GIFs. Please try again.
            </div>
          )}

          {isLoading && (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 9 }).map((_, index) => (
                <Skeleton key={index} className="aspect-square rounded-lg" />
              ))}
            </div>
          )}

          {!isLoading && !error && gifs.length === 0 && (
            <div className="text-center py-8 text-gray-500" data-testid="no-results">
              {debouncedSearch ? `No GIFs found for "${debouncedSearch}"` : 'No GIFs available'}
            </div>
          )}

          {!isLoading && !error && gifs.length > 0 && (
            <div ref={gridRef} className="grid grid-cols-3 gap-2" data-testid="gif-grid">
              {gifs.map((gif, index) => (
                <div
                  key={gif.id}
                  className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg ${
                    selectedGifIndex === index 
                      ? 'ring-2 ring-primary ring-offset-2 scale-105' 
                      : ''
                  }`}
                  onClick={() => handleGifSelect(gif, index)}
                  onMouseEnter={() => setSelectedGifIndex(index)}
                  data-testid={`gif-item-${index}`}
                >
                  <img
                    src={gif.images.fixed_height.url}
                    alt={gif.title || 'GIF'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      // Fallback to downsized version if fixed_height fails
                      const target = e.target as HTMLImageElement;
                      target.src = gif.images.downsized.url;
                    }}
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-10 transition-all duration-200" />
                  
                  {/* Selection indicator */}
                  {selectedGifIndex === index && (
                    <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                      <ChevronRight className="w-3 h-3" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Powered by Giphy attribution */}
        <div className="px-6 pb-4">
          <p className="text-xs text-gray-500 text-center">
            Powered by <span className="font-semibold">GIPHY</span>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
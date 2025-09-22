export interface GiphyGif {
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

export interface GiphySearchResponse {
  data: GiphyGif[];
  pagination: {
    total_count: number;
    count: number;
    offset: number;
  };
}

export class GiphyService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.giphy.com/v1';
  private cache = new Map<string, { data: GiphyGif[], timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.apiKey = process.env.GIPHY_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('GIPHY_API_KEY environment variable is required');
    }
  }

  private getCacheKey(endpoint: string, params: Record<string, any>): string {
    return `${endpoint}:${JSON.stringify(params)}`;
  }

  private isValidCache(timestamp: number): boolean {
    return Date.now() - timestamp < this.CACHE_TTL;
  }

  private async makeRequest(endpoint: string, params: Record<string, any> = {}): Promise<GiphySearchResponse> {
    const cacheKey = this.getCacheKey(endpoint, params);
    const cached = this.cache.get(cacheKey);

    // Return cached data if valid
    if (cached && this.isValidCache(cached.timestamp)) {
      return {
        data: cached.data,
        pagination: {
          total_count: cached.data.length,
          count: cached.data.length,
          offset: 0
        }
      };
    }

    // Build URL with parameters
    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('limit', '25'); // Default limit
    url.searchParams.set('rating', 'g'); // Keep it family-friendly

    // Add additional parameters
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });

    try {
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new Error(`Giphy API error: ${response.status} ${response.statusText}`);
      }

      const data: GiphySearchResponse = await response.json();
      
      // Cache the results
      this.cache.set(cacheKey, {
        data: data.data,
        timestamp: Date.now()
      });

      // Clean old cache entries occasionally
      if (this.cache.size > 100) {
        this.cleanCache();
      }

      return data;
    } catch (error) {
      console.error('Error fetching from Giphy API:', error);
      throw new Error('Failed to fetch GIFs from Giphy');
    }
  }

  private cleanCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.cache.forEach((value, key) => {
      if (!this.isValidCache(value.timestamp)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  async searchGifs(query: string, options: {
    limit?: number;
    offset?: number;
  } = {}): Promise<GiphySearchResponse> {
    if (!query || query.trim().length === 0) {
      throw new Error('Search query is required');
    }

    // Sanitize search query
    const sanitizedQuery = query.trim().slice(0, 50); // Limit query length

    return this.makeRequest('/gifs/search', {
      q: sanitizedQuery,
      limit: options.limit || 25,
      offset: options.offset || 0
    });
  }

  async getTrendingGifs(options: {
    limit?: number;
    offset?: number;
  } = {}): Promise<GiphySearchResponse> {
    return this.makeRequest('/gifs/trending', {
      limit: options.limit || 25,
      offset: options.offset || 0
    });
  }

  async getGifById(id: string): Promise<GiphyGif | null> {
    if (!id || typeof id !== 'string') {
      throw new Error('GIF ID is required');
    }

    try {
      const response = await this.makeRequest(`/gifs/${id}`);
      return response.data[0] || null;
    } catch (error) {
      console.error('Error fetching GIF by ID:', error);
      return null;
    }
  }

  // Get categorized GIFs for popular search terms
  async getCategoryGifs(category: string, options: {
    limit?: number;
    offset?: number;
  } = {}): Promise<GiphySearchResponse> {
    const categories = {
      'reactions': 'reaction',
      'emotions': 'emotion happy sad excited',
      'sports': 'sports football basketball hockey',
      'animals': 'cute animals dog cat',
      'funny': 'funny laugh comedy',
      'love': 'love heart kiss',
      'celebration': 'celebration party happy win'
    };

    const searchTerm = categories[category as keyof typeof categories] || category;
    return this.searchGifs(searchTerm, options);
  }

  // Get GIF metadata for database storage
  getGifMetadata(gif: GiphyGif): {
    giphyId: string;
    title: string;
    originalUrl: string;
    thumbnailUrl: string;
    width: number;
    height: number;
    fileSize?: number;
  } {
    return {
      giphyId: gif.id,
      title: gif.title || 'GIF',
      originalUrl: gif.images.original.url,
      thumbnailUrl: gif.images.fixed_height.url,
      width: parseInt(gif.images.original.width) || 0,
      height: parseInt(gif.images.original.height) || 0
    };
  }

  // Rate limiting check
  private rateLimitCheck(): boolean {
    // Implement simple rate limiting here if needed
    // For now, relying on caching to reduce API calls
    return true;
  }
}

// Export a singleton instance
export const giphyService = new GiphyService();
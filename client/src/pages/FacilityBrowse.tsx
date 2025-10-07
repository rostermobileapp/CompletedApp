import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Users, Calendar, Plus, Home } from "lucide-react";
import { useState } from "react";
import type { Facility } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";

export default function FacilityBrowse() {
  const { isAuthenticated } = useAuth();
  const [sportFilter, setSportFilter] = useState<string>("");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [stateFilter, setStateFilter] = useState<string>("");

  const { data: facilities, isLoading } = useQuery<Facility[]>({
    queryKey: ['/api/facilities', sportFilter, cityFilter, stateFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (sportFilter) params.append('sport', sportFilter);
      if (cityFilter) params.append('city', cityFilter);
      if (stateFilter) params.append('state', stateFilter);
      const queryString = params.toString();
      return fetch(`/api/facilities${queryString ? '?' + queryString : ''}`).then(r => r.json());
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2" data-testid="heading-facilities">
              Facilities
            </h1>
            <p className="text-muted-foreground" data-testid="text-subtitle">
              Browse sports facilities and their calendars
            </p>
          </div>
          <div className="flex gap-2">
            {isAuthenticated && (
              <>
                <Button variant="outline" asChild data-testid="button-dashboard">
                  <Link href="/">
                    <Home className="h-4 w-4 mr-2" />
                    Dashboard
                  </Link>
                </Button>
                <Button asChild data-testid="button-create-facility">
                  <Link href="/facilities/create">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Facility
                  </Link>
                </Button>
              </>
            )}
            {!isAuthenticated && (
              <Button variant="default" asChild data-testid="button-home">
                <Link href="/">
                  <Home className="h-4 w-4 mr-2" />
                  Home
                </Link>
              </Button>
            )}
          </div>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Filter Facilities</CardTitle>
            <CardDescription>Search by sport, city, or state</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="sport-filter" className="text-sm font-medium mb-2 block">
                  Sport
                </label>
                <Select value={sportFilter} onValueChange={setSportFilter}>
                  <SelectTrigger id="sport-filter" data-testid="select-sport-filter">
                    <SelectValue placeholder="All Sports" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="" data-testid="option-all-sports">All Sports</SelectItem>
                    <SelectItem value="basketball" data-testid="option-basketball">Basketball</SelectItem>
                    <SelectItem value="soccer" data-testid="option-soccer">Soccer</SelectItem>
                    <SelectItem value="volleyball" data-testid="option-volleyball">Volleyball</SelectItem>
                    <SelectItem value="tennis" data-testid="option-tennis">Tennis</SelectItem>
                    <SelectItem value="hockey" data-testid="option-hockey">Hockey</SelectItem>
                    <SelectItem value="baseball" data-testid="option-baseball">Baseball</SelectItem>
                    <SelectItem value="football" data-testid="option-football">Football</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="city-filter" className="text-sm font-medium mb-2 block">
                  City
                </label>
                <Input
                  id="city-filter"
                  placeholder="Enter city..."
                  value={cityFilter}
                  onChange={(e) => setCityFilter(e.target.value)}
                  data-testid="input-city-filter"
                />
              </div>
              <div>
                <label htmlFor="state-filter" className="text-sm font-medium mb-2 block">
                  State
                </label>
                <Input
                  id="state-filter"
                  placeholder="Enter state..."
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                  data-testid="input-state-filter"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-6 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="h-4 bg-muted rounded" />
                    <div className="h-4 bg-muted rounded w-5/6" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : facilities && facilities.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {facilities.map((facility) => (
              <Card
                key={facility.id}
                className="hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer"
                data-testid={`card-facility-${facility.id}`}
              >
                <Link href={`/facilities/${facility.id}`}>
                  <CardHeader>
                    <CardTitle className="text-xl" data-testid={`text-facility-name-${facility.id}`}>
                      {facility.name}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-1" data-testid={`text-facility-location-${facility.id}`}>
                      <MapPin className="h-3 w-3" />
                      {facility.city}, {facility.state}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {(facility.sports || []).map((sport) => (
                          <span
                            key={sport}
                            className="px-2 py-1 bg-primary/10 text-primary rounded-md text-xs font-medium"
                            data-testid={`badge-sport-${sport}`}
                          >
                            {sport}
                          </span>
                        ))}
                      </div>
                      {facility.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-facility-description-${facility.id}`}>
                          {facility.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2 border-t">
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          <span data-testid={`text-member-count-${facility.id}`}>Members</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span data-testid={`text-calendar-${facility.id}`}>Calendar</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Link>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="text-muted-foreground mb-4">
                <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium" data-testid="text-no-facilities">No facilities found</p>
                <p className="text-sm" data-testid="text-no-facilities-description">
                  {sportFilter || cityFilter || stateFilter
                    ? "Try adjusting your filters"
                    : "Be the first to create a facility"}
                </p>
              </div>
              {isAuthenticated && (
                <Button asChild data-testid="button-create-first-facility">
                  <Link href="/facilities/create">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Facility
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

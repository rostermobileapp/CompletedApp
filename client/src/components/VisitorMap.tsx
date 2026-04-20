import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import AnimatedCounter from "@/components/AnimatedCounter";

interface CityCount {
  city: string;
  country: string;
  count: number;
}

interface VisitorLocationsResponse {
  locations: { lat: string; lng: string }[];
  total: number;
  cities?: CityCount[];
}

export default function VisitorMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const heatLayerRef = useRef<L.HeatLayer | null>(null);

  const { data } = useQuery<VisitorLocationsResponse>({
    queryKey: ["/api/visitor-locations"],
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;

    const northAmericaBounds = L.latLngBounds(
      L.latLng(24.0, -170.0),
      L.latLng(84.0, -52.0)
    );

    const map = L.map(mapRef.current, {
      center: [49.0, -97.0],
      zoom: 3,
      minZoom: 3,
      maxZoom: 7,
      maxBounds: northAmericaBounds,
      maxBoundsViscosity: 1.0,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      subdomains: "abcd",
      maxZoom: 7,
    }).addTo(map);

    const heat = L.heatLayer([], {
      radius: 14,
      blur: 10,
      maxZoom: 7,
      max: 1.0,
      minOpacity: 0.4,
      gradient: {
        0.2: "#3b82f6",
        0.5: "#6366f1",
        0.8: "#8b5cf6",
        1.0: "#ec4899",
      },
    });
    heat.addTo(map);

    leafletMap.current = map;
    heatLayerRef.current = heat;

    return () => {
      map.remove();
      leafletMap.current = null;
      heatLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!heatLayerRef.current || !data?.locations) return;
    const points: [number, number, number][] = data.locations.map((loc) => [
      parseFloat(loc.lat),
      parseFloat(loc.lng),
      0.8,
    ]);
    heatLayerRef.current.setLatLngs(points);
    heatLayerRef.current.redraw();
  }, [data]);

  const total = data?.total ?? 0;

  return (
    <section className="py-16 px-6 bg-white border-b border-gray-100">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-6">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">
            Roster is growing across{" "}
            <span className="text-[#3c82f4]">North America</span>
          </h2>
          <p className="text-gray-500 text-sm">
            <span className="font-semibold text-[#3c82f4]">
              <AnimatedCounter value={total} />
            </span>{" "}
            {total === 1 ? "visitor" : "visitors"} from the US and Canada
          </p>
        </div>
        <div
          className="rounded-2xl overflow-hidden border border-blue-100 shadow-sm"
          style={{ height: 340 }}
        >
          <div ref={mapRef} style={{ height: "100%", width: "100%", background: "#f0f4ff" }} />
        </div>
        <p className="text-center text-xs text-gray-400 mt-2">
          Locations are approximate. No personal data is stored.
        </p>

      </div>
    </section>
  );
}

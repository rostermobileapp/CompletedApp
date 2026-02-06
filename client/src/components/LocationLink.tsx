interface LocationLinkProps {
  location: string;
  className?: string;
  "data-testid"?: string;
}

function getMapUrl(address: string): string {
  const encoded = encodeURIComponent(address);

  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
  }

  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof document !== "undefined" && "ontouchend" in document);

  if (isIOS) {
    return `https://maps.apple.com/?q=${encoded}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}

export default function LocationLink({ location, className, "data-testid": testId }: LocationLinkProps) {
  return (
    <a
      href={getMapUrl(location)}
      target="_blank"
      rel="noopener noreferrer"
      className={`font-bold text-blue-500 underline underline-offset-2 hover:text-blue-400 transition-colors ${className || ""}`}
      data-testid={testId}
      onClick={(e) => e.stopPropagation()}
    >
      {location}
    </a>
  );
}

export function normalizeQuery(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  const toUrl = (value: string): URL | null => {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  };

  let url = toUrl(trimmed);
  if (!url && /[./]/.test(trimmed)) {
    url = toUrl(`https://${trimmed}`);
  }

  if (!url) {
    return trimmed;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 0) {
    return trimmed;
  }

  const homedetailsIndex = segments.findIndex(segment =>
    segment.toLowerCase() === 'homedetails'
  );
  const rawSegment =
    homedetailsIndex >= 0 && segments[homedetailsIndex + 1]
      ? segments[homedetailsIndex + 1]
      : segments[0];

  const segmentWithoutZpid = rawSegment.split('_')[0];
  const decoded = decodeURIComponent(segmentWithoutZpid);
  const address = decoded.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

  return address.length > 0 ? address : trimmed;
}

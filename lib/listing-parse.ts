export interface ListingHints {
  acres?: number;
  price?: number;
}

export function parseListingText(text: string, targetAddress?: string): ListingHints {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return {};

  const addressIndex = targetAddress
    ? normalized.toLowerCase().indexOf(targetAddress.toLowerCase())
    : -1;

  const priceMatches = Array.from(
    normalized.matchAll(/\$\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.\d+)?)/g)
  );
  const acresMatches = Array.from(
    normalized.matchAll(/(\d+(?:\.\d+)?)\s*(acres?|acre)\b/gi)
  );

  const pickClosest = (
    matches: RegExpMatchArray[]
  ): RegExpMatchArray | undefined => {
    if (matches.length === 0) return undefined;
    if (addressIndex < 0) return matches[0];

    let closest = matches[0];
    let bestDistance = Math.abs((closest.index || 0) - addressIndex);
    for (const match of matches) {
      const distance = Math.abs((match.index || 0) - addressIndex);
      if (distance < bestDistance) {
        closest = match;
        bestDistance = distance;
      }
    }
    return closest;
  };

  const priceMatch = pickClosest(priceMatches);
  const acresMatch = pickClosest(acresMatches);

  const price = priceMatch
    ? Number(priceMatch[1].replace(/,/g, ''))
    : undefined;
  const acres = acresMatch ? Number(acresMatch[1]) : undefined;

  return {
    price: Number.isFinite(price) ? price : undefined,
    acres: Number.isFinite(acres) ? acres : undefined,
  };
}

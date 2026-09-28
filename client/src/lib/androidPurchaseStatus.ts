export interface AndroidPurchaseResult {
  /** Google Play SKU (e.g. "player_pro_monthly") */
  productIdentifier: string;
  /** Only store-issued purchase proof can be verified by the server. */
  purchaseToken: string;
  raw?: any;
}

export interface AndroidPurchaseStatus {
  purchases: AndroidPurchaseResult[];
  /** Store-reported products are for UI guidance only, never entitlement proof. */
  activeProductIds: string[];
}

export function isAlreadyOwnedPurchaseError(message: string): boolean {
  return /already (active|subscribed|owned)|item_already_owned/i.test(message);
}

export function extractPurchaseToken(data: any): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const candidates = [
    data.purchaseToken,
    data.googlePurchaseToken,
    data.purchase_token,
    data.token,
    data.transactionId,
    data.transaction_id,
    data.originalPurchaseToken,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  if (data.transaction) return extractPurchaseToken(data.transaction);
  return undefined;
}

export function extractProductId(data: any, fallback?: string): string {
  if (!data || typeof data !== 'object') return fallback ?? '';
  return data.productIdentifier ?? data.product_id ?? data.productId ?? data.sku ?? fallback ?? '';
}

export function parseAndroidPurchaseStatus(data: any): AndroidPurchaseStatus {
  const items: any[] = Array.isArray(data)
    ? data
    : data.purchases ?? data.transactions ?? data.activeSubscriptions ?? [];
  const purchases: AndroidPurchaseResult[] = [];
  const activeProductIds = new Set<string>();
  const knownProducts = new Set([
    'player_pro_monthly', 'player_pro_yearly', 'commissioner_monthly', 'commissioner_yearly',
  ]);
  const addProduct = (item: any) => {
    const id = typeof item === 'string' ? item : extractProductId(item);
    if (knownProducts.has(id)) activeProductIds.add(id);
  };
  for (const item of items) {
    const purchaseToken = extractPurchaseToken(item);
    if (purchaseToken) {
      purchases.push({ productIdentifier: extractProductId(item), purchaseToken, raw: item });
    }
  }
  const customerInfo = data.customerInfo ?? data.customer_info ?? data;
  const activeSubscriptions = customerInfo?.activeSubscriptions;
  for (const item of Array.isArray(activeSubscriptions) ? activeSubscriptions : []) addProduct(item);
  for (const entitlement of Object.values(customerInfo?.entitlements?.active ?? {}) as any[]) {
    addProduct(entitlement);
  }
  if (purchases.length === 0) {
    const purchaseToken = extractPurchaseToken(data);
    if (purchaseToken) {
      purchases.push({ productIdentifier: extractProductId(data), purchaseToken, raw: data });
    }
  }
  return { purchases, activeProductIds: Array.from(activeProductIds) };
}
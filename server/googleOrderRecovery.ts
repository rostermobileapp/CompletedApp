/**
 * A changed native identity is not proof of ownership. Only allow recovery
 * when the exact order also belongs to the signed-in user's RevenueCat
 * identity; the caller must derive that identity on the server.
 */
export async function verifyGoogleOrderWithLinkedFallback<T>(
  orderId: string,
  verifyDeviceOrder: () => Promise<T>,
  getSignedInCustomerOrders: () => Promise<string[]>,
  verifyLinkedOrder: () => Promise<T>,
): Promise<T> {
  try {
    return await verifyDeviceOrder();
  } catch (error: any) {
    if (error?.status !== 403) throw error;
    const linkedOrders = await getSignedInCustomerOrders();
    if (!linkedOrders.includes(orderId)) throw error;
    return verifyLinkedOrder();
  }
}
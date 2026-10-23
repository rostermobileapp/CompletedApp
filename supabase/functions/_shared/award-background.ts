/** No credentials or image contents are logged by this provider boundary. */
export async function removeAwardBackground(
  image: Uint8Array, provider: string, key: string,
  fetcher: typeof fetch = fetch,
): Promise<Uint8Array> {
  if (!["removebg", "photoroom"].includes(provider) || !key) {
    throw new Error("Background removal is not configured. You can use the original image.");
  }
  const form = new FormData();
  form.append("image_file", new Blob([image as BlobPart], { type: "image/png" }), "award.png");
  if (provider === "removebg") form.append("size", "auto");
  const response = await fetcher(provider === "removebg"
    ? "https://api.remove.bg/v1.0/removebg"
    : "https://sdk.photoroom.com/v1/segment", {
    method: "POST", headers: { "X-Api-Key": key }, body: form,
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error("Background removal failed. You can still use the original image.");
  if (!response.headers.get("content-type")?.includes("image/png")) throw new Error("The provider returned an unsupported image.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 5 * 1024 * 1024 || bytes.length < 24 ||
      ![137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)) {
    throw new Error("The provider returned an invalid image.");
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  return bytesToBase64(new Uint8Array(buf));
}

export function utf8ToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

export function generateImageFilename(originalName: string): string {
  const dot = originalName.lastIndexOf(".");
  const ext = dot === -1 ? "" : originalName.slice(dot).toLowerCase();
  const id = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${id}${ext}`;
}

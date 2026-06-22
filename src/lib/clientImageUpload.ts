import { supabase } from "./supabase.ts";

const MAX_CLIENT_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_CLIENT_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function uploadClientImage({
  file,
  companyLegacyId,
  clientLegacyId,
}: {
  file: File;
  companyLegacyId: string;
  clientLegacyId?: string | null;
}) {
  if (!ALLOWED_CLIENT_IMAGE_TYPES.has(file.type)) {
    throw new Error("Upload a JPG, PNG, WEBP, or GIF image.");
  }
  if (file.size > MAX_CLIENT_IMAGE_SIZE) {
    throw new Error("Client images must be 5 MB or smaller.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("companyLegacyId", companyLegacyId);
  if (clientLegacyId) formData.append("clientLegacyId", clientLegacyId);

  const { data, error } = await supabase.functions.invoke("upload-client-image", {
    body: formData,
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  if (typeof data?.publicUrl !== "string") {
    throw new Error("Image uploaded, but no public URL was returned.");
  }
  return data.publicUrl;
}

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Response } from "express";
import { randomUUID } from "crypto";

export class SupabaseStorageNotFoundError extends Error {
  constructor() {
    super("Object not found in Supabase Storage");
    this.name = "SupabaseStorageNotFoundError";
    Object.setPrototypeOf(this, SupabaseStorageNotFoundError.prototype);
  }
}

export class SupabaseStorageService {
  private supabase: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables"
      );
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  // Profile Images
  async getProfileImageUploadURL(): Promise<{ uploadURL: string; path: string }> {
    const objectId = randomUUID();
    const filePath = `profile-images/${objectId}`;

    // Generate a signed URL for uploading (15 minutes expiry)
    const { data, error } = await this.supabase.storage
      .from("private")
      .createSignedUploadUrl(filePath);

    if (error) {
      console.error("Error creating signed upload URL:", error);
      throw new Error("Failed to create upload URL");
    }

    // Return normalized path for backend proxy serving
    return {
      uploadURL: data.signedUrl,
      path: `/profile-images/${objectId}`,
    };
  }

  normalizeProfileImagePath(rawPath: string): string {
    // If it's already normalized (starts with /profile-images/), return as is
    if (rawPath.startsWith("/profile-images/")) {
      return rawPath;
    }

    // If it's a full Supabase URL, extract the path
    if (rawPath.includes("supabase.co/storage")) {
      try {
        const url = new URL(rawPath);
        const pathMatch = url.pathname.match(/\/profile-images\/([^?]+)/);
        if (pathMatch) {
          return `/profile-images/${pathMatch[1]}`;
        }
      } catch (e) {
        console.error("Error parsing profile image URL:", e);
      }
    }

    return rawPath;
  }

  async getProfileImageFile(profileImagePath: string): Promise<{ data: Blob; contentType: string }> {
    if (!profileImagePath.startsWith("/profile-images/")) {
      throw new SupabaseStorageNotFoundError();
    }

    const objectId = profileImagePath.slice("/profile-images/".length);
    const filePath = `profile-images/${objectId}`;

    const { data, error } = await this.supabase.storage
      .from("private")
      .download(filePath);

    if (error || !data) {
      console.error("Error downloading profile image:", error);
      throw new SupabaseStorageNotFoundError();
    }

    return {
      data,
      contentType: data.type || "application/octet-stream",
    };
  }

  // Team Logos
  async getTeamLogoUploadURL(): Promise<{ uploadURL: string; path: string }> {
    const objectId = randomUUID();
    const filePath = `team-logos/${objectId}`;

    const { data, error } = await this.supabase.storage
      .from("private")
      .createSignedUploadUrl(filePath);

    if (error) {
      console.error("Error creating signed upload URL:", error);
      throw new Error("Failed to create upload URL");
    }

    // Return normalized path for backend proxy serving
    return {
      uploadURL: data.signedUrl,
      path: `/team-logos/${objectId}`,
    };
  }

  normalizeTeamLogoPath(rawPath: string): string {
    if (rawPath.startsWith("/team-logos/")) {
      return rawPath;
    }

    if (rawPath.includes("supabase.co/storage")) {
      try {
        const url = new URL(rawPath);
        const pathMatch = url.pathname.match(/\/team-logos\/([^?]+)/);
        if (pathMatch) {
          return `/team-logos/${pathMatch[1]}`;
        }
      } catch (e) {
        console.error("Error parsing team logo URL:", e);
      }
    }

    return rawPath;
  }

  async getTeamLogoFile(teamLogoPath: string): Promise<{ data: Blob; contentType: string }> {
    if (!teamLogoPath.startsWith("/team-logos/")) {
      throw new SupabaseStorageNotFoundError();
    }

    const objectId = teamLogoPath.slice("/team-logos/".length);
    const filePath = `team-logos/${objectId}`;

    const { data, error } = await this.supabase.storage
      .from("private")
      .download(filePath);

    if (error || !data) {
      console.error("Error downloading team logo:", error);
      throw new SupabaseStorageNotFoundError();
    }

    return {
      data,
      contentType: data.type || "application/octet-stream",
    };
  }

  // Message Attachments
  async getMessageAttachmentUploadURL(): Promise<{ uploadURL: string; path: string }> {
    const objectId = randomUUID();
    const filePath = `message-attachments/${objectId}`;

    const { data, error } = await this.supabase.storage
      .from("private")
      .createSignedUploadUrl(filePath);

    if (error) {
      console.error("Error creating signed upload URL:", error);
      throw new Error("Failed to create upload URL");
    }

    // Return normalized path for backend proxy serving
    return {
      uploadURL: data.signedUrl,
      path: `/message-attachments/${objectId}`,
    };
  }

  normalizeMessageAttachmentPath(rawPath: string): string {
    if (rawPath.startsWith("/message-attachments/")) {
      return rawPath;
    }

    if (rawPath.includes("supabase.co/storage")) {
      try {
        const url = new URL(rawPath);
        const pathMatch = url.pathname.match(/\/message-attachments\/([^?]+)/);
        if (pathMatch) {
          return `/message-attachments/${pathMatch[1]}`;
        }
      } catch (e) {
        console.error("Error parsing message attachment URL:", e);
      }
    }

    return rawPath;
  }

  async getMessageAttachmentFile(messageAttachmentPath: string): Promise<{ data: Blob; contentType: string }> {
    if (!messageAttachmentPath.startsWith("/message-attachments/")) {
      throw new SupabaseStorageNotFoundError();
    }

    const objectId = messageAttachmentPath.slice("/message-attachments/".length);
    const filePath = `message-attachments/${objectId}`;

    const { data, error } = await this.supabase.storage
      .from("private")
      .download(filePath);

    if (error || !data) {
      console.error("Error downloading message attachment:", error);
      throw new SupabaseStorageNotFoundError();
    }

    return {
      data,
      contentType: data.type || "application/octet-stream",
    };
  }

  // Announcement Media
  async getAnnouncementMediaUploadURL(): Promise<{ uploadURL: string; path: string }> {
    const objectId = randomUUID();
    const filePath = `announcement-media/${objectId}`;

    const { data, error } = await this.supabase.storage
      .from("private")
      .createSignedUploadUrl(filePath);

    if (error) {
      console.error("Error creating signed upload URL:", error);
      throw new Error("Failed to create upload URL");
    }

    // Return normalized path for backend proxy serving
    return {
      uploadURL: data.signedUrl,
      path: `/announcement-media/${objectId}`,
    };
  }

  normalizeAnnouncementMediaPath(rawPath: string): string {
    if (rawPath.startsWith("/announcement-media/")) {
      return rawPath;
    }

    if (rawPath.includes("supabase.co/storage")) {
      try {
        const url = new URL(rawPath);
        const pathMatch = url.pathname.match(/\/announcement-media\/([^?]+)/);
        if (pathMatch) {
          return `/announcement-media/${pathMatch[1]}`;
        }
      } catch (e) {
        console.error("Error parsing announcement media URL:", e);
      }
    }

    return rawPath;
  }

  async getAnnouncementMediaFile(announcementMediaPath: string): Promise<{ data: Blob; contentType: string }> {
    if (!announcementMediaPath.startsWith("/announcement-media/")) {
      throw new SupabaseStorageNotFoundError();
    }

    const objectId = announcementMediaPath.slice("/announcement-media/".length);
    const filePath = `announcement-media/${objectId}`;

    const { data, error } = await this.supabase.storage
      .from("private")
      .download(filePath);

    if (error || !data) {
      console.error("Error downloading announcement media:", error);
      throw new SupabaseStorageNotFoundError();
    }

    return {
      data,
      contentType: data.type || "application/octet-stream",
    };
  }

  // Tournament Photos
  async getTournamentPhotoUploadURL(): Promise<{ uploadURL: string; path: string }> {
    const objectId = randomUUID();
    const filePath = `tournament-photos/${objectId}`;

    const { data, error } = await this.supabase.storage
      .from("private")
      .createSignedUploadUrl(filePath);

    if (error) {
      console.error("Error creating signed upload URL:", error);
      throw new Error("Failed to create upload URL");
    }

    return {
      uploadURL: data.signedUrl,
      path: `/tournament-photos/${objectId}`,
    };
  }

  normalizeTournamentPhotoPath(rawPath: string): string {
    if (rawPath.startsWith("/tournament-photos/")) {
      return rawPath;
    }

    if (rawPath.includes("supabase.co/storage")) {
      try {
        const url = new URL(rawPath);
        const pathMatch = url.pathname.match(/\/tournament-photos\/([^?]+)/);
        if (pathMatch) {
          return `/tournament-photos/${pathMatch[1]}`;
        }
      } catch (e) {
        console.error("Error parsing tournament photo URL:", e);
      }
    }

    return rawPath;
  }

  async getTournamentPhotoFile(tournamentPhotoPath: string): Promise<{ data: Blob; contentType: string }> {
    if (!tournamentPhotoPath.startsWith("/tournament-photos/")) {
      throw new SupabaseStorageNotFoundError();
    }

    const objectId = tournamentPhotoPath.slice("/tournament-photos/".length);
    const filePath = `tournament-photos/${objectId}`;

    const { data, error } = await this.supabase.storage
      .from("private")
      .download(filePath);

    if (error || !data) {
      console.error("Error downloading tournament photo:", error);
      throw new SupabaseStorageNotFoundError();
    }

    return {
      data,
      contentType: data.type || "application/octet-stream",
    };
  }

  async deleteTournamentPhoto(tournamentPhotoPath: string): Promise<void> {
    if (!tournamentPhotoPath.startsWith("/tournament-photos/")) {
      throw new Error("Invalid tournament photo path");
    }

    const objectId = tournamentPhotoPath.slice("/tournament-photos/".length);
    const filePath = `tournament-photos/${objectId}`;

    const { error } = await this.supabase.storage
      .from("private")
      .remove([filePath]);

    if (error) {
      console.error("Error deleting tournament photo:", error);
      throw new Error("Failed to delete photo");
    }
  }

  // League Photos
  async getLeaguePhotoUploadURL(): Promise<{ uploadURL: string; path: string }> {
    const objectId = randomUUID();
    const filePath = `league-photos/${objectId}`;

    const { data, error } = await this.supabase.storage
      .from("private")
      .createSignedUploadUrl(filePath);

    if (error) {
      console.error("Error creating signed upload URL:", error);
      throw new Error("Failed to create upload URL");
    }

    return {
      uploadURL: data.signedUrl,
      path: `/league-photos/${objectId}`,
    };
  }

  normalizeLeaguePhotoPath(rawPath: string): string {
    if (rawPath.startsWith("/league-photos/")) {
      return rawPath;
    }

    if (rawPath.includes("supabase.co/storage")) {
      try {
        const url = new URL(rawPath);
        const pathMatch = url.pathname.match(/\/league-photos\/([^?]+)/);
        if (pathMatch) {
          return `/league-photos/${pathMatch[1]}`;
        }
      } catch (e) {
        console.error("Error parsing league photo URL:", e);
      }
    }

    return rawPath;
  }

  async getLeaguePhotoFile(leaguePhotoPath: string): Promise<{ data: Blob; contentType: string }> {
    if (!leaguePhotoPath.startsWith("/league-photos/")) {
      throw new SupabaseStorageNotFoundError();
    }

    const objectId = leaguePhotoPath.slice("/league-photos/".length);
    const filePath = `league-photos/${objectId}`;

    const { data, error } = await this.supabase.storage
      .from("private")
      .download(filePath);

    if (error || !data) {
      console.error("Error downloading league photo:", error);
      throw new SupabaseStorageNotFoundError();
    }

    return {
      data,
      contentType: data.type || "application/octet-stream",
    };
  }

  async deleteLeaguePhoto(leaguePhotoPath: string): Promise<void> {
    if (!leaguePhotoPath.startsWith("/league-photos/")) {
      throw new Error("Invalid league photo path");
    }

    const objectId = leaguePhotoPath.slice("/league-photos/".length);
    const filePath = `league-photos/${objectId}`;

    const { error } = await this.supabase.storage
      .from("private")
      .remove([filePath]);

    if (error) {
      console.error("Error deleting league photo:", error);
      throw new Error("Failed to delete photo");
    }
  }

  // Helper method to stream blob data to Express response
  async streamToResponse(file: { data: Blob; contentType: string }, res: Response, cacheTtlSec: number = 3600) {
    try {
      const buffer = Buffer.from(await file.data.arrayBuffer());

      res.set({
        "Content-Type": file.contentType,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": `public, max-age=${cacheTtlSec}`,
      });

      res.send(buffer);
    } catch (error) {
      console.error("Error streaming file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error streaming file" });
      }
    }
  }
}
import "server-only";
import { createHash } from "crypto";
import type { StorageProvider, DriveFile } from "./types";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

async function driveFetch(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> || {}) },
    });
    if (res.status === 401) {
      const e = new Error("Google token expired/revoked") as Error & { code: string };
      e.code = "TOKEN_EXPIRED";
      throw e;
    }
    if (res.status === 403) {
      const body = await res.text().catch(() => "");
      const e = new Error(`Drive forbidden (revoked?): ${body.slice(0, 200)}`) as Error & { code: string };
      e.code = "DRIVE_403";
      throw e;
    }
    if (res.status === 404) {
      const e = new Error("Drive file not found (deleted/moved)") as Error & { code: string };
      e.code = "DRIVE_404";
      throw e;
    }
    if (res.status === 409) {
      const e = new Error("Drive conflict (concurrent modification)") as Error & { code: string };
      e.code = "DRIVE_409";
      throw e;
    }
    if (res.status === 429) {
      const e = new Error("Drive quota exceeded") as Error & { code: string };
      e.code = "QUOTA_EXCEEDED";
      throw e;
    }
    if (res.status >= 500) {
      const body = await res.text().catch(() => "");
      const e = new Error(`Drive server error ${res.status}: ${body.slice(0, 200)}`) as Error & { code: string };
      e.code = `DRIVE_${res.status}`;
      throw e;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const e = new Error(`Drive API ${res.status}: ${body.slice(0, 300)}`) as Error & { code: string };
      e.code = `DRIVE_${res.status}`;
      throw e;
    }
    return res;
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      const err = new Error("Drive timeout (30s)") as Error & { code: string };
      err.code = "TIMEOUT";
      throw err;
    }
    if ((e as Error & { code?: string }).code) throw e;
    const err = new Error(`Network failure: ${(e as Error).message}`) as Error & { code: string };
    err.code = "NETWORK_ERROR";
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export class GoogleDriveProvider implements StorageProvider {
  readonly type = "GOOGLE_DRIVE" as const;

  async ensureRootFolder(accessToken: string, folderName: string): Promise<string> {
    // Search for existing folder in root
    const q = `mimeType='application/vnd.google-apps.folder' and name='${folderName.replace(/'/g, "\\'")}' and trashed=false`;
    const search = await driveFetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`, accessToken);
    const j = await search.json() as { files: DriveFile[] };
    if (j.files?.[0]) return j.files[0].id;
    // Create
    const created = await driveFetch(`${DRIVE_API}/files`, accessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: folderName, mimeType: "application/vnd.google-apps.folder" }),
    });
    const data = await created.json() as DriveFile;
    return data.id;
  }

  async findFile(accessToken: string, folderId: string, fileName: string): Promise<DriveFile | null> {
    const q = `name='${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`;
    const res = await driveFetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,parents,size,modifiedTime)&pageSize=1`, accessToken);
    const j = await res.json() as { files: DriveFile[] };
    return j.files?.[0] ?? null;
  }

  async uploadJson(accessToken: string, folderId: string, fileName: string, data: string, existingFileId?: string): Promise<{ fileId: string; checksum: string }> {
    const checksum = createHash("sha256").update(data).digest("hex");
    if (data.length > 10 * 1024 * 1024) throw new Error("File too large (10MB limit)");
    if (existingFileId) {
      const res = await driveFetch(`${UPLOAD_API}/files/${existingFileId}?uploadType=media`, accessToken, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: data,
      });
      const j = await res.json() as DriveFile;
      return { fileId: j.id, checksum };
    }
    // Multipart create
    const boundary = "-------314159265358979323846";
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: fileName, parents: [folderId], mimeType: "application/json" })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${data}\r\n--${boundary}--`;
    const res = await driveFetch(`${UPLOAD_API}/files?uploadType=multipart`, accessToken, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    const j = await res.json() as DriveFile;
    return { fileId: j.id, checksum };
  }

  async downloadJson(accessToken: string, fileId: string): Promise<{ data: string; checksum: string }> {
    const res = await driveFetch(`${DRIVE_API}/files/${fileId}?alt=media`, accessToken);
    const data = await res.text();
    if (data.length > 10 * 1024 * 1024) throw new Error("Download too large");
    // Validate JSON
    try { JSON.parse(data); } catch { throw new Error("Corrupted data: invalid JSON"); }
    const checksum = createHash("sha256").update(data).digest("hex");
    return { data, checksum };
  }

  async deleteFile(accessToken: string, fileId: string): Promise<void> {
    await driveFetch(`${DRIVE_API}/files/${fileId}`, accessToken, { method: "DELETE" });
  }

  async verifyFile(accessToken: string, fileId: string): Promise<boolean> {
    try {
      const res = await driveFetch(`${DRIVE_API}/files/${fileId}?fields=id,trashed`, accessToken);
      const j = await res.json() as { trashed?: boolean };
      return !j.trashed;
    } catch { return false; }
  }
}

export const googleDriveProvider = new GoogleDriveProvider();

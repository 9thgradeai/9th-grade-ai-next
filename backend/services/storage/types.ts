import "server-only";

export type StorageProviderType = "GOOGLE_DRIVE";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  size?: number;
  modifiedTime?: string;
}

export interface StorageProvider {
  readonly type: StorageProviderType;
  ensureRootFolder(accessToken: string, folderName: string): Promise<string>; // returns folderId
  uploadJson(accessToken: string, folderId: string, fileName: string, data: string, existingFileId?: string): Promise<{ fileId: string; checksum: string }>;
  downloadJson(accessToken: string, fileId: string): Promise<{ data: string; checksum: string }>;
  findFile(accessToken: string, folderId: string, fileName: string): Promise<DriveFile | null>;
  deleteFile(accessToken: string, fileId: string): Promise<void>;
  verifyFile(accessToken: string, fileId: string): Promise<boolean>;
}

export interface VersionedEnvelope<T = unknown> {
  schemaVersion: number;
  entityType: string;
  id: string;
  userId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  checksum: string; // sha256 of canonical payload
  provider: StorageProviderType;
  providerFileId?: string;
  data: T;
}

export type SyncEntityType = "BOOKMARKS" | "FLASHCARD_STATE" | "VOCAB_PROGRESS" | "MISTAKE_NOTES" | "USER_PREFERENCES" | "EXAM_ARCHIVE";

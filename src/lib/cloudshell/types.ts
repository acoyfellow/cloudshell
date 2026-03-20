export interface Session {
  id: string;
  name: string;
  createdAt: number;
  lastActiveTabId: string;
  lastOpenedAt: number;
}

export interface Tab {
  id: string;
  name: string;
  createdAt: number;
}

export interface SessionPort {
  port: number;
  url: string;
  createdAt: number;
}

export interface FileMetadata {
  name: string;
  size: number;
  modifiedAt: number;
  path: string;
}

export interface SSHKey {
  id: string;
  name: string;
  key: string;
  createdAt: number;
}

export interface ShareLookup {
  userId: string;
  userEmail: string | null;
  permissions: string;
}

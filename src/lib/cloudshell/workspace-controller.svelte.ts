import { browser } from '$app/environment';
import { toast } from 'svelte-sonner';
import type {
  FileRecord,
  FileTreeNode,
  Session,
  SessionPort,
  ShareLookup,
  SSHKey,
  Tab,
} from './types';

export type UtilityPaneTab = 'ports' | 'tools';
export type TerminalStatus = 'connecting' | 'connected' | 'disconnected';

const ACTIVE_SESSION_KEY = 'cloudshell.activeSessionId';

interface FileBreadcrumb {
  label: string;
  path: string;
}

interface FolderTreeItem {
  name: string;
  path: string;
  depth: number;
}

function parseShareToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    return url.pathname.split('/').pop() ?? null;
  } catch {
    return trimmed.split('token=').pop() ?? null;
  }
}

function normalizeFolderPath(input: string): string {
  const trimmed = input.trim().replace(/^\/+|\/+$/g, '');
  if (!trimmed) {
    return '';
  }

  return trimmed
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('/');
}

function joinFolderPath(basePath: string, childName: string): string {
  const base = normalizeFolderPath(basePath);
  const child = normalizeFolderPath(childName);
  if (!base) {
    return child;
  }

  if (!child) {
    return base;
  }

  return `${base}/${child}`;
}

function sortTree(nodes: FileTreeNode[]): FileTreeNode[] {
  nodes.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === 'folder' ? -1 : 1;
    }

    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });

  for (const node of nodes) {
    if (node.type === 'folder' && node.children) {
      sortTree(node.children);
    }
  }

  return nodes;
}

function buildFileTree(entries: FileRecord[]): FileTreeNode[] {
  const root: FileTreeNode = { type: 'folder', name: '~', path: '', children: [] };
  const folderMap = new Map<string, FileTreeNode>([['', root]]);

  for (const entry of entries) {
    const normalizedPath = normalizeFolderPath(entry.path);
    if (!normalizedPath) {
      continue;
    }

    const segments = normalizedPath.split('/');
    let currentPath = '';
    let parent = root;

    for (const segment of segments.slice(0, -1)) {
      currentPath = joinFolderPath(currentPath, segment);
      let folder = folderMap.get(currentPath);
      if (!folder) {
        folder = { type: 'folder', name: segment, path: currentPath, children: [] };
        parent.children ??= [];
        parent.children.push(folder);
        folderMap.set(currentPath, folder);
      }

      parent = folder;
    }

    parent.children ??= [];
    parent.children.push({
      type: 'file',
      name: segments[segments.length - 1],
      path: normalizedPath,
      size: entry.size,
      modifiedAt: entry.modifiedAt,
    });
  }

  return sortTree(root.children ?? []);
}

function findFolderNode(nodes: FileTreeNode[], targetPath: string): FileTreeNode | null {
  const normalizedTarget = normalizeFolderPath(targetPath);
  if (!normalizedTarget) {
    return { type: 'folder', name: '~', path: '', children: nodes };
  }

  for (const node of nodes) {
    if (node.type !== 'folder') {
      continue;
    }

    if (node.path === normalizedTarget) {
      return node;
    }

    const nested = findFolderNode(node.children ?? [], normalizedTarget);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function flattenFolderTree(nodes: FileTreeNode[], depth = 0): FolderTreeItem[] {
  const items: FolderTreeItem[] = [];

  for (const node of nodes) {
    if (node.type !== 'folder') {
      continue;
    }

    items.push({ name: node.name, path: node.path, depth });
    items.push(...flattenFolderTree(node.children ?? [], depth + 1));
  }

  return items;
}

export class WorkspaceController {
  sessions = $state<Session[]>([]);
  tabs = $state<Tab[]>([]);
  ports = $state<SessionPort[]>([]);
  fileEntries = $state<FileRecord[]>([]);
  sshKeys = $state<SSHKey[]>([]);
  activeSessionId = $state('');
  activeTabId = $state('');
  terminalStatus = $state<TerminalStatus>('disconnected');
  terminalError = $state('');
  filesDrawerOpen = $state(false);
  currentFolderPath = $state('');
  utilityPaneOpen = $state(false);
  utilityPaneTab = $state<UtilityPaneTab>('ports');
  shareLink = $state('');
  shareLookup = $state<ShareLookup | null>(null);
  isWorkspaceLoading = $state(true);
  isFilesLoading = $state(false);
  isFilesRefreshing = $state(false);
  isFilesUploading = $state(false);
  isPortsLoading = $state(false);
  isToolsLoading = $state(false);
  isBusy = $state(false);
  isRecording = $state(false);
  recordingOutput = $state<string[]>([]);

  get activeSession(): Session | null {
    return this.sessions.find((session) => session.id === this.activeSessionId) ?? null;
  }

  get activeTab(): Tab | null {
    return this.tabs.find((tab) => tab.id === this.activeTabId) ?? null;
  }

  get hasUtilityPane(): boolean {
    return this.utilityPaneOpen;
  }

  get fileTree(): FileTreeNode[] {
    return buildFileTree(this.fileEntries);
  }

  get folderTreeItems(): FolderTreeItem[] {
    return flattenFolderTree(this.fileTree);
  }

  get fileBreadcrumbs(): FileBreadcrumb[] {
    const breadcrumbs: FileBreadcrumb[] = [{ label: '~', path: '' }];
    let currentPath = '';

    for (const segment of normalizeFolderPath(this.currentFolderPath).split('/').filter(Boolean)) {
      currentPath = joinFolderPath(currentPath, segment);
      breadcrumbs.push({ label: segment, path: currentPath });
    }

    return breadcrumbs;
  }

  get currentFolderEntries(): FileTreeNode[] {
    return (findFolderNode(this.fileTree, this.currentFolderPath)?.children ?? []).slice();
  }

  private resetWorkspaceSelection() {
    this.tabs = [];
    this.ports = [];
    this.activeSessionId = '';
    this.activeTabId = '';
    this.utilityPaneOpen = false;
    this.setTerminalStatus('disconnected');
  }

  private resetWorkspaceData() {
    this.resetWorkspaceSelection();
    this.sessions = [];
    this.sshKeys = [];
    this.shareLink = '';
    this.shareLookup = null;
    if (browser) {
      window.localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
  }

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`/api/cloudshell${path}`, init);
    const text = await response.text();
    const data = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T);

    if (!response.ok) {
      throw new Error((data as { error?: string }).error || `Request failed (${response.status})`);
    }

    return data as T;
  }

  async initialize() {
    this.isWorkspaceLoading = true;

    try {
      await this.refreshWorkspace();
    } catch (error) {
      toast.error((error as Error).message || 'Unable to load workspace');
    } finally {
      this.isWorkspaceLoading = false;
    }
  }

  async refreshWorkspace() {
    const sessionData = await this.fetchJson<{ sessions: Session[] }>('/sessions');
    this.sessions = sessionData.sessions;

    if (this.sessions.length === 0) {
      this.resetWorkspaceData();
      return;
    }

    const storedSession = browser ? window.localStorage.getItem(ACTIVE_SESSION_KEY) : null;
    const nextSession =
      this.sessions.find((session) => session.id === storedSession) ?? this.sessions[0];

    await this.switchSession(nextSession.id, { checkpoint: false, toastOnError: false });
  }

  async checkpointActiveSession(options: { keepalive?: boolean } = {}) {
    if (!this.activeSessionId) {
      return;
    }

    try {
      const path = `/api/cloudshell/sessions/${this.activeSessionId}/checkpoint`;
      if (options.keepalive) {
        await fetch(path, {
          method: 'POST',
          keepalive: true,
        });
        return;
      }

      await this.fetchJson<{ success: boolean }>(`/sessions/${this.activeSessionId}/checkpoint`, {
        method: 'POST',
      });
    } catch (error) {
      if (!options.keepalive) {
        toast.error((error as Error).message || 'Checkpoint failed');
      }
    }
  }

  async switchSession(
    sessionId: string,
    options: { checkpoint?: boolean; toastOnError?: boolean } = {
      checkpoint: true,
      toastOnError: true,
    }
  ) {
    try {
      if (
        options.checkpoint !== false &&
        this.activeSessionId &&
        this.activeSessionId !== sessionId
      ) {
        await this.checkpointActiveSession();
      }

      this.activeSessionId = sessionId;
      if (browser) {
        window.localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
      }

      this.tabs = [];
      this.ports = [];
      this.activeTabId = '';
      this.setTerminalStatus('disconnected');

      const data = await this.fetchJson<{ tabs: Tab[] }>(`/sessions/${sessionId}/tabs`);
      this.tabs = data.tabs;
      const session = this.sessions.find((candidate) => candidate.id === sessionId);
      const nextTab =
        this.tabs.find((candidate) => candidate.id === session?.lastActiveTabId) ?? this.tabs[0];
      this.activeTabId = nextTab?.id ?? '';

      if (this.utilityPaneOpen) {
        await this.ensureUtilityData(this.utilityPaneTab);
      }
    } catch (error) {
      if (options.toastOnError !== false) {
        toast.error((error as Error).message || 'Unable to switch session');
      }
    }
  }

  async setActiveTab(tabId: string) {
    if (!this.activeSessionId || !tabId) {
      return;
    }

    try {
      this.activeTabId = tabId;
      this.sessions = this.sessions.map((session) =>
        session.id === this.activeSessionId
          ? { ...session, lastActiveTabId: tabId, lastOpenedAt: Date.now() }
          : session
      );

      await this.fetchJson<{ session: Session }>(`/sessions/${this.activeSessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastActiveTabId: tabId }),
      });
    } catch (error) {
      toast.error((error as Error).message || 'Unable to switch tab');
    }
  }

  async createSession(name: string) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Session name is required');
    }

    const data = await this.fetchJson<{ session: Session; tab: Tab }>('/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmedName }),
    });

    this.sessions = [...this.sessions, data.session];
    await this.switchSession(data.session.id, { checkpoint: true, toastOnError: true });
    toast.success(`Created session ${data.session.name}`);
  }

  async renameSession(sessionId: string, name: string) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Session name is required');
    }

    const data = await this.fetchJson<{ session: Session }>(`/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmedName }),
    });

    this.sessions = this.sessions.map((session) =>
      session.id === sessionId ? data.session : session
    );
    toast.success(`Renamed session to ${data.session.name}`);
  }

  async deleteSession(sessionId: string) {
    await this.fetchJson<{ success: boolean }>(`/sessions/${sessionId}`, {
      method: 'DELETE',
    });

    toast.success('Session deleted');
    await this.refreshWorkspace();
  }

  async createTab(name: string) {
    if (!this.activeSessionId) {
      throw new Error('No active session');
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Tab name is required');
    }

    const data = await this.fetchJson<{ tab: Tab }>(`/sessions/${this.activeSessionId}/tabs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmedName }),
    });

    this.tabs = [...this.tabs, data.tab];
    await this.setActiveTab(data.tab.id);
    toast.success(`Created tab ${data.tab.name}`);
  }

  async renameTab(tabId: string, name: string) {
    if (!this.activeSessionId) {
      throw new Error('No active session');
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Tab name is required');
    }

    const data = await this.fetchJson<{ tab: Tab }>(
      `/sessions/${this.activeSessionId}/tabs/${tabId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }),
      }
    );

    this.tabs = this.tabs.map((tab) => (tab.id === tabId ? data.tab : tab));
    toast.success(`Renamed tab to ${data.tab.name}`);
  }

  async deleteTab(tabId: string) {
    if (!this.activeSessionId) {
      throw new Error('No active session');
    }

    const data = await this.fetchJson<{ success: boolean; lastActiveTabId: string }>(
      `/sessions/${this.activeSessionId}/tabs/${tabId}`,
      { method: 'DELETE' }
    );

    this.tabs = this.tabs.filter((tab) => tab.id !== tabId);
    this.activeTabId = this.tabs.some((tab) => tab.id === data.lastActiveTabId)
      ? data.lastActiveTabId
      : (this.tabs[0]?.id ?? '');
    this.sessions = this.sessions.map((session) =>
      session.id === this.activeSessionId
        ? { ...session, lastActiveTabId: this.activeTabId, lastOpenedAt: Date.now() }
        : session
    );
    if (!this.activeTabId) {
      this.setTerminalStatus('disconnected');
    }
    toast.success('Tab deleted');
  }

  async loadFiles(options: { refresh?: boolean } = {}) {
    if (options.refresh) {
      this.isFilesRefreshing = true;
    } else {
      this.isFilesLoading = true;
    }

    try {
      const data = await this.fetchJson<{ files: FileRecord[] }>('/files/tree');
      this.fileEntries = data.files
        .map((file) => ({ ...file, path: normalizeFolderPath(file.path) }))
        .filter((file) => file.path);

      if (this.currentFolderPath) {
        const folderExists = !!findFolderNode(this.fileTree, this.currentFolderPath);
        if (!folderExists) {
          this.currentFolderPath = '';
        }
      }
    } finally {
      if (options.refresh) {
        this.isFilesRefreshing = false;
      } else {
        this.isFilesLoading = false;
      }
    }
  }

  async uploadFiles(fileList: FileList | null, targetPath = this.currentFolderPath) {
    if (!fileList || fileList.length === 0) {
      return;
    }

    this.isFilesUploading = true;
    try {
      const normalizedTargetPath = normalizeFolderPath(targetPath);

      for (const file of Array.from(fileList)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', normalizedTargetPath);
        if (this.activeSessionId) {
          formData.append('sessionId', this.activeSessionId);
        }
        const response = await fetch('/api/cloudshell/files/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || `Failed to upload ${file.name}`);
        }

        const payload = (await response.json().catch(() => ({}))) as {
          shellVisible?: boolean;
          error?: string;
        };

        if (payload.shellVisible === false) {
          toast.warning(`${file.name} uploaded, but the active shell has not reflected it yet.`);
        }
      }

      await this.loadFiles({ refresh: true });
      toast.success('Files uploaded');
    } finally {
      this.isFilesUploading = false;
    }
  }

  downloadFile(name: string) {
    if (!browser) {
      return;
    }

    const normalizedPath = normalizeFolderPath(name);
    window.open(`/api/cloudshell/files/download/${encodeURIComponent(normalizedPath)}`, '_blank');
  }

  async openFilesDrawer() {
    this.filesDrawerOpen = true;
    try {
      await this.loadFiles();
    } catch (error) {
      toast.error((error as Error).message || 'Unable to load files');
    }
  }

  closeFilesDrawer() {
    this.filesDrawerOpen = false;
  }

  async toggleFilesDrawer() {
    if (this.filesDrawerOpen) {
      this.closeFilesDrawer();
      return;
    }

    await this.openFilesDrawer();
  }

  async refreshFiles(options: { background?: boolean } = {}) {
    try {
      await this.loadFiles({ refresh: true });
    } catch (error) {
      if (!options.background) {
        toast.error((error as Error).message || 'Unable to refresh files');
      }
    }
  }

  setCurrentFolder(path: string) {
    this.currentFolderPath = normalizeFolderPath(path);
  }

  navigateUpFolder() {
    const segments = normalizeFolderPath(this.currentFolderPath).split('/').filter(Boolean);
    if (segments.length === 0) {
      return;
    }

    segments.pop();
    this.currentFolderPath = segments.join('/');
  }

  async loadPorts() {
    if (!this.activeSessionId) {
      this.ports = [];
      return;
    }

    this.isPortsLoading = true;
    try {
      const data = await this.fetchJson<{ ports: SessionPort[] }>(
        `/sessions/${this.activeSessionId}/ports`
      );
      this.ports = data.ports;
    } finally {
      this.isPortsLoading = false;
    }
  }

  async forwardPort(portInput: string) {
    if (!this.activeSessionId) {
      throw new Error('No active session');
    }

    const port = Number(portInput);
    if (!Number.isInteger(port)) {
      throw new Error('Enter a valid port number');
    }

    const created = await this.fetchJson<SessionPort>(`/sessions/${this.activeSessionId}/ports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port }),
    });

    this.ports = [...this.ports.filter((existing) => existing.port !== created.port), created];
    toast.success(`Forwarded port ${created.port}`);
  }

  async loadSshKeys() {
    this.isToolsLoading = true;
    try {
      const data = await this.fetchJson<{ keys: SSHKey[] }>('/ssh-keys');
      this.sshKeys = data.keys;
    } finally {
      this.isToolsLoading = false;
    }
  }

  async addSshKey(name: string, key: string) {
    const trimmedName = name.trim();
    const trimmedKey = key.trim();
    if (!trimmedName || !trimmedKey) {
      throw new Error('SSH key name and value are required');
    }

    await this.fetchJson<{ success: boolean }>('/ssh-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmedName, key: trimmedKey }),
    });
    await this.loadSshKeys();
    toast.success('SSH key added');
  }

  async deleteSshKey(id: string) {
    await this.fetchJson<{ success: boolean }>(`/ssh-keys/${id}`, { method: 'DELETE' });
    await this.loadSshKeys();
    toast.success('SSH key removed');
  }

  async createShareLink() {
    const data = await this.fetchJson<{ shareUrl: string; token: string }>('/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: 'read' }),
    });

    this.shareLink = browser ? `${window.location.origin}${data.shareUrl}` : data.shareUrl;

    if (browser && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(this.shareLink);
      toast.success('Share link copied to clipboard');
      return;
    }

    toast.success('Share link created');
  }

  async lookupShare(input: string) {
    const token = parseShareToken(input);
    if (!token) {
      throw new Error('Enter a share token or share URL');
    }

    const response = await fetch(`/api/share/${encodeURIComponent(token)}`);
    const payload = (await response.json()) as ShareLookup & { error?: string };

    if (!response.ok) {
      throw new Error(payload.error || 'Share lookup failed');
    }

    this.shareLookup = payload;
    toast.success('Share metadata loaded');
  }

  async backupWorkspace() {
    this.isBusy = true;
    try {
      await this.fetchJson<{ success: boolean }>('/backup', { method: 'POST' });
      toast.success('Workspace checkpoint complete');
    } finally {
      this.isBusy = false;
    }
  }

  async ensureUtilityData(tab: UtilityPaneTab) {
    if (tab === 'ports') {
      await this.loadPorts();
      return;
    }

    await this.loadSshKeys();
  }

  async setUtilityPaneTab(tab: UtilityPaneTab) {
    this.utilityPaneTab = tab;
    if (this.utilityPaneOpen) {
      await this.ensureUtilityData(tab);
    }
  }

  async openUtilityPane(tab: UtilityPaneTab) {
    this.utilityPaneOpen = true;
    this.utilityPaneTab = tab;
    await this.ensureUtilityData(tab);
  }

  async toggleUtilityPane(tab: UtilityPaneTab) {
    if (this.utilityPaneOpen && this.utilityPaneTab === tab) {
      this.utilityPaneOpen = false;
      return;
    }

    await this.openUtilityPane(tab);
  }

  closeUtilityPane() {
    this.utilityPaneOpen = false;
  }

  setTerminalStatus(status: TerminalStatus, errorMessage = '') {
    this.terminalStatus = status;
    this.terminalError = status === 'disconnected' ? errorMessage : '';
  }

  startRecording() {
    this.recordingOutput = [];
    this.isRecording = true;
    return this.fetchJson('/recording/start', { method: 'POST' });
  }

  async stopRecording() {
    this.isRecording = false;
    await this.fetchJson('/recording/stop', { method: 'POST' });

    if (!browser) {
      return;
    }

    const blob = new Blob([this.recordingOutput.join('')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `recording-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Recording downloaded');
  }

  async toggleRecording() {
    if (!this.isRecording) {
      await this.startRecording();
      toast.success('Recording started');
      return;
    }

    await this.stopRecording();
  }

  recordTerminalOutput(payload: string) {
    if (!this.isRecording) {
      return;
    }

    this.recordingOutput.push(payload);
  }
}

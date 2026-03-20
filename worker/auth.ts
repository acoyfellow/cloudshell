export interface WorkerIdentity {
  readonly userId: string;
  readonly userEmail: string | null;
}

export function getUserContainerId(userId: string): string {
  return `shell:${normalizeContainerSegment(userId)}`;
}

export function getUserSessionContainerId(userId: string, sessionId: string): string {
  return `${getUserContainerId(userId)}:${normalizeContainerSegment(sessionId)}`;
}

export function readWorkerIdentity(headers: Headers): WorkerIdentity | null {
  const userId = headers.get('X-User-Id')?.trim();
  if (!userId) {
    return null;
  }

  const userEmail = headers.get('X-User-Email')?.trim();
  return {
    userId,
    userEmail: userEmail && userEmail !== '' ? userEmail : null,
  };
}

function normalizeContainerSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

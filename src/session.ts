import type { Session } from './types';
import { getSessionScrollback, createSession, sendKeys } from './tmux';

const SESSION_PREFIX = 'sessions/';

export async function saveSession(
  r2: R2Bucket,
  username: string,
  session: Session
): Promise<void> {
  const key = `${SESSION_PREFIX}${username}/${session.id}.json`;
  const data = JSON.stringify(session);
  await r2.put(key, data);
}

export async function loadSession(
  r2: R2Bucket,
  username: string,
  sessionId: string
): Promise<Session | null> {
  const key = `${SESSION_PREFIX}${username}/${sessionId}.json`;
  const object = await r2.get(key);
  
  if (!object) {
    return null;
  }
  
  const text = await object.text();
  return JSON.parse(text) as Session;
}

export async function listSessions(
  r2: R2Bucket,
  username: string
): Promise<Session[]> {
  const prefix = `${SESSION_PREFIX}${username}/`;
  const objects = await r2.list({ prefix });
  
  const sessions: Session[] = [];
  for (const obj of objects.objects) {
    const object = await r2.get(obj.key);
    if (object) {
      const text = await object.text();
      sessions.push(JSON.parse(text));
    }
  }
  
  return sessions;
}

export async function deleteSession(
  r2: R2Bucket,
  username: string,
  sessionId: string
): Promise<void> {
  const key = `${SESSION_PREFIX}${username}/${sessionId}.json`;
  await r2.delete(key);
}

export async function captureAndSaveSession(
  r2: R2Bucket,
  username: string,
  sessionId: string,
  tmuxName: string
): Promise<void> {
  try {
    const scrollback = await getSessionScrollback(tmuxName, 1000);
    
    const session: Session = {
      id: sessionId,
      tmuxSessionName: tmuxName,
      createdAt: Date.now(),
      lastActive: Date.now(),
      scrollback,
      cwd: '/home/user',
      env: {},
    };
    
    await saveSession(r2, username, session);
  } catch (error) {
    console.error('Failed to capture session:', error);
  }
}

export async function restoreSession(
  r2: R2Bucket,
  username: string,
  sessionId: string
): Promise<boolean> {
  try {
    const session = await loadSession(r2, username, sessionId);
    
    if (!session) {
      return false;
    }
    
    await createSession(session.tmuxSessionName);
    
    if (session.scrollback.length > 0) {
      const history = session.scrollback.join('\n');
      await sendKeys(session.tmuxSessionName, `echo "${history}"`);
    }
    
    return true;
  } catch (error) {
    console.error('Failed to restore session:', error);
    return false;
  }
}
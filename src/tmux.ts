import { spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(spawn);

export async function createSession(name: string): Promise<void> {
  const proc = spawn('tmux', ['new-session', '-d', '-s', name]);
  return new Promise((resolve, reject) => {
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Failed to create session: ${name} (exit ${code})`));
      }
    });
  });
}

export async function attachSession(name: string): Promise<void> {
  const proc = spawn('tmux', ['attach-session', '-t', name]);
  return new Promise((resolve, reject) => {
    proc.on('close', (code) => {
      if (code === 0 || code === null) {
        resolve();
      } else {
        reject(new Error(`Failed to attach to session: ${name}`));
      }
    });
  });
}

export async function listSessions(): Promise<string[]> {
  const proc = spawn('tmux', ['list-sessions', '-F', '#{session_name}']);
  let output = '';
  
  proc.stdout?.on('data', (data) => {
    output += data.toString();
  });
  
  return new Promise((resolve, reject) => {
    proc.on('close', (code) => {
      if (code === 0 || code === 1) {
        const sessions = output.split('\n').filter(s => s.trim());
        resolve(sessions);
      } else {
        reject(new Error('Failed to list sessions'));
      }
    });
  });
}

export async function killSession(name: string): Promise<void> {
  const proc = spawn('tmux', ['kill-session', '-t', name]);
  return new Promise((resolve, reject) => {
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Failed to kill session: ${name}`));
      }
    });
  });
}

export async function getSessionScrollback(name: string, lines: number = 1000): Promise<string[]> {
  const proc = spawn('tmux', ['capture-pane', '-t', name, '-p', '-S', `-${lines}`]);
  let output = '';
  
  proc.stdout?.on('data', (data) => {
    output += data.toString();
  });
  
  return new Promise((resolve, reject) => {
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(output.split('\n'));
      } else {
        reject(new Error(`Failed to capture scrollback for session: ${name}`));
      }
    });
  });
}

export async function sendKeys(name: string, keys: string): Promise<void> {
  const proc = spawn('tmux', ['send-keys', '-t', name, keys]);
  return new Promise((resolve, reject) => {
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Failed to send keys to session: ${name}`));
      }
    });
  });
}
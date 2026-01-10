// remoteLogger.js - Sends logs to remote server for easy viewing
// 
// Usage:
//   import { initRemoteLogger, rlog } from './remoteLogger.js';
//   initRemoteLogger('http://YOUR_COMPUTER_IP:8765');
//   rlog.info('Hello from Quest!');

let serverUrl = null;
let queue = [];
let sending = false;

/**
 * Initialize the remote logger
 * @param {string} url - Log server URL (e.g., 'http://192.168.1.100:8765')
 */
export function initRemoteLogger(url) {
  serverUrl = url.replace(/\/$/, ''); // Remove trailing slash
  
  // Intercept console methods
  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  
  console.log = (...args) => {
    original.log(...args);
    send('info', args);
  };
  
  console.warn = (...args) => {
    original.warn(...args);
    send('warn', args);
  };
  
  console.error = (...args) => {
    original.error(...args);
    send('error', args);
  };
  
  // Catch unhandled errors
  window.addEventListener('error', (e) => {
    send('error', [`Uncaught: ${e.message} at ${e.filename}:${e.lineno}`]);
  });
  
  window.addEventListener('unhandledrejection', (e) => {
    send('error', [`Unhandled Promise: ${e.reason}`]);
  });
  
  send('success', ['Remote logger initialized, server: ' + serverUrl]);
}

function stringify(val) {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  
  try {
    // Handle Three.js objects
    if (val.isVector3) return `Vec3(${val.x.toFixed(3)}, ${val.y.toFixed(3)}, ${val.z.toFixed(3)})`;
    if (val.isQuaternion) return `Quat(${val.x.toFixed(3)}, ${val.y.toFixed(3)}, ${val.z.toFixed(3)}, ${val.w.toFixed(3)})`;
    if (val.isMatrix4) return 'Matrix4[...]';
    if (val.isObject3D) return `Object3D(${val.name || val.type}, children=${val.children?.length || 0})`;
    
    // Handle errors
    if (val instanceof Error) return `${val.name}: ${val.message}`;
    
    // Generic object
    return JSON.stringify(val, (key, value) => {
      // Avoid circular refs and huge objects
      if (typeof value === 'object' && value !== null) {
        if (value.isBufferGeometry) return '[BufferGeometry]';
        if (value.isMaterial) return `[Material:${value.type}]`;
        if (value.isTexture) return '[Texture]';
      }
      return value;
    }, 0).substring(0, 500);
  } catch {
    return String(val);
  }
}

function send(level, args) {
  if (!serverUrl) return;
  
  const message = args.map(stringify).join(' ');
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message
  };
  
  queue.push(entry);
  flush();
}

async function flush() {
  if (sending || queue.length === 0) return;
  
  sending = true;
  const entry = queue.shift();
  
  try {
    await fetch(`${serverUrl}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
      // Short timeout to not block
      signal: AbortSignal.timeout(2000)
    });
  } catch {
    // Silently fail - don't want logging to break the app
  }
  
  sending = false;
  
  // Process next in queue
  if (queue.length > 0) {
    setTimeout(flush, 10);
  }
}

// Direct logging helpers (bypass console interception)
export const rlog = {
  debug: (msg) => send('debug', [msg]),
  info: (msg) => send('info', [msg]),
  warn: (msg) => send('warn', [msg]),
  error: (msg) => send('error', [msg]),
  success: (msg) => send('success', [msg]),
};

/**
 * Log with explicit level and structured data
 */
export function logData(level, label, data) {
  send(level, [`${label}:`, data]);
}

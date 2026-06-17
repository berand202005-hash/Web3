const DB_NAME = 'StreamRecDB';
const DB_VERSION = 1;
const STORE_NAME = 'recordings';

export function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function saveRecording(recording) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // Ensure chatHistory is initialized
    if (!recording.chatHistory) {
      recording.chatHistory = [];
    }

    const request = store.put(recording);

    request.onsuccess = () => resolve(true);
    request.onerror = (event) => reject(event.target.error);
  });
}

export async function getAllRecordings() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      // Sort recordings by date descending
      const recordings = request.result || [];
      recordings.sort((a, b) => new Date(b.date) - new Date(a.date));
      resolve(recordings);
    };
    request.onerror = (event) => reject(event.target.error);
  });
}

export async function getRecording(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

export async function deleteRecording(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = (event) => reject(event.target.error);
  });
}

export async function updateRecording(id, updates) {
  const recording = await getRecording(id);
  if (!recording) throw new Error('Recording not found');

  const updatedRecording = { ...recording, ...updates };
  await saveRecording(updatedRecording);
  return updatedRecording;
}

export async function saveChatMessage(id, message) {
  const recording = await getRecording(id);
  if (!recording) throw new Error('Recording not found');

  if (!recording.chatHistory) {
    recording.chatHistory = [];
  }
  
  recording.chatHistory.push({
    ...message,
    timestamp: new Date().toISOString()
  });

  await saveRecording(recording);
  return recording.chatHistory;
}

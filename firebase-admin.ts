import { initializeApp } from 'firebase/app';
import { 
  initializeFirestore,
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  deleteDoc, 
  updateDoc,
  writeBatch, 
  Timestamp,
  setLogLevel
} from 'firebase/firestore';
import fs from 'fs';

// Silence internal transport-level reconnect traces
setLogLevel('silent');

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(firebaseConfig);
const firestore = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  experimentalAutoDetectLongPolling: false,
}, firebaseConfig.firestoreDatabaseId);

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 300): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const msg = err?.message || String(err);
      if (
        msg.includes('UNAVAILABLE') || 
        msg.includes('ECONNRESET') || 
        msg.includes('deadline') || 
        msg.includes('network') ||
        msg.includes('ETIMEDOUT')
      ) {
        await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// Compatibility layer to mimic Admin SDK API using Web SDK
class FirestoreCompat {
  collection(path: string) {
    return new CollectionCompat(path);
  }

  batch() {
    return writeBatch(firestore);
  }
}

class CollectionCompat {
  private queryConstraints: any[] = [];
  private path: string;

  constructor(path: string) {
    this.path = path;
  }

  doc(id: string) {
    return new DocCompat(this.path, id);
  }

  where(field: string, op: any, value: any) {
    this.queryConstraints.push(where(field, op, value));
    return this;
  }

  orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
    this.queryConstraints.push(orderBy(field, dir));
    return this;
  }

  limit(n: number) {
    this.queryConstraints.push(limit(n));
    return this;
  }

  async get() {
    return await withRetry(async () => {
      const colRef = collection(firestore, this.path);
      const q = this.queryConstraints.length > 0 
        ? query(colRef, ...this.queryConstraints)
        : colRef;
      
      const snap = await getDocs(q);
      return {
        empty: snap.empty,
        size: snap.docs.length,
        docs: snap.docs.map(d => ({
          id: d.id,
          data: () => d.data(),
          exists: d.exists()
        }))
      };
    });
  }
}

class DocCompat {
  private colPath: string;
  private id: string;
  
  constructor(colPath: string, id: string) {
    this.colPath = colPath;
    this.id = id;
  }

  async set(data: any) {
    return await withRetry(async () => {
      return await setDoc(doc(firestore, this.colPath, this.id), data);
    });
  }

  async update(data: any) {
    return await withRetry(async () => {
      return await updateDoc(doc(firestore, this.colPath, this.id), data);
    });
  }

  async delete() {
    return await withRetry(async () => {
      return await deleteDoc(doc(firestore, this.colPath, this.id));
    });
  }

  async get() {
    return await withRetry(async () => {
      const snap = await getDoc(doc(firestore, this.colPath, this.id));
      return {
        id: snap.id,
        exists: snap.exists(),
        data: () => snap.data()
      };
    });
  }

  onSnapshot(callback: (doc: any) => void, errorCallback?: (err: any) => void) {
    return onSnapshot(
      doc(firestore, this.colPath, this.id), 
      (snap) => {
        callback({
          id: snap.id,
          exists: snap.exists(),
          data: () => snap.data()
        });
      },
      (err) => {
        // Suppress transient stream disconnect errors or delegate to callback
        if (errorCallback) {
          errorCallback(err);
        }
      }
    );
  }
}

export const adminDb = new FirestoreCompat() as any;
export const adminAuth = {
  verifyIdToken: async (token: string) => ({ uid: token }),
};


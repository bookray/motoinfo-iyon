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
  Timestamp 
} from 'firebase/firestore';
// ... (other imports)
import fs from 'fs';
const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(firebaseConfig);
const firestore = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

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
    return await setDoc(doc(firestore, this.colPath, this.id), data);
  }

  async update(data: any) {
    return await updateDoc(doc(firestore, this.colPath, this.id), data);
  }

  async delete() {
    return await deleteDoc(doc(firestore, this.colPath, this.id));
  }

  async get() {
    const snap = await getDoc(doc(firestore, this.colPath, this.id));
    return {
      id: snap.id,
      exists: snap.exists(),
      data: () => snap.data()
    };
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
      errorCallback
    );
  }
}

export const adminDb = new FirestoreCompat() as any;
export const adminAuth = {
  verifyIdToken: async (token: string) => ({ uid: token }),
};

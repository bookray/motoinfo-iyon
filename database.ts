import dotenv from 'dotenv';
dotenv.config();
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { adminDb as firebaseDb } from './firebase-admin';
import { CHATS_CATALOG, CHAT_TO_DB_MAPPING } from './chatsCatalog';

const DB_TYPE = (process.env.DB_TYPE || 'HYBRID').toUpperCase();
const SQLITE_PATH = process.env.SQLITE_PATH || './data/database.sqlite';

console.log(`[Database] Selected type: ${DB_TYPE}`);

export function isFirestoreQuotaExceeded(err: any): boolean {
  if (!err) return false;
  const msg = String(err?.message || err);
  const code = err?.code;
  return (
    code === 8 ||
    code === 'RESOURCE_EXHAUSTED' ||
    msg.includes('Quota limit exceeded') ||
    msg.includes('Quota exceeded') ||
    msg.includes('Free daily read units') ||
    msg.includes('ResourceExhausted') ||
    msg.includes('DEADLINE_EXCEEDED')
  );
}

export class SQLiteDoc {
  private db: Database.Database;
  private tableName: string;
  private id: string;

  constructor(db: Database.Database, tableName: string, id: string) {
    this.db = db;
    this.tableName = tableName;
    this.id = String(id);
  }

  async get() {
    try {
      const row: any = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`).get(this.id);
      if (!row) {
        return {
          id: this.id,
          exists: false,
          data: () => null
        };
      }
      return {
        id: this.id,
        exists: true,
        data: () => {
          let res: any = { ...row };
          if (row.data) {
            try {
              const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
              res = { ...res, ...parsed };
            } catch (e) {}
          }
          res.id = this.id;
          return res;
        }
      };
    } catch (e) {
      return { id: this.id, exists: false, data: () => null };
    }
  }

  async set(data: any) {
    if (!data) return;
    const clean = { ...data };
    clean.id = this.id;

    // Ensure table exists
    try {
      this.db.prepare(`SELECT 1 FROM ${this.tableName} LIMIT 1`).get();
    } catch (e) {
      this.db.prepare(`CREATE TABLE IF NOT EXISTS ${this.tableName} (id TEXT PRIMARY KEY, data TEXT)`).run();
    }

    const columns = (this.db.prepare(`PRAGMA table_info(${this.tableName})`).all() as any[]).map(c => c.name);

    if (columns.includes('data')) {
      clean.data = JSON.stringify(data);
    }

    const validFields = Object.keys(clean).filter(k => columns.includes(k));
    if (validFields.length === 0) {
      if (!columns.includes('data')) {
        this.db.prepare(`ALTER TABLE ${this.tableName} ADD COLUMN data TEXT`).run();
        columns.push('data');
      }
      clean.data = JSON.stringify(data);
      validFields.push('id', 'data');
    }

    const placeholders = validFields.map(() => '?').join(', ');
    const colList = validFields.join(', ');
    const values = validFields.map(k => {
      const val = clean[k];
      if (typeof val === 'boolean') return val ? 1 : 0;
      if (typeof val === 'object' && val !== null) return JSON.stringify(val);
      return val;
    });

    const sql = `INSERT OR REPLACE INTO ${this.tableName} (${colList}) VALUES (${placeholders})`;
    this.db.prepare(sql).run(...values);
  }

  async update(data: any) {
    if (!data) return;
    const existing = await this.get();
    const currentData = existing.exists ? existing.data() || {} : {};
    return this.set({ ...currentData, ...data });
  }

  async delete() {
    try {
      this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).run(this.id);
    } catch (e) {}
  }

  onSnapshot(callback: (doc: any) => void) {
    this.get().then(callback);
    return () => {};
  }
}

export class SQLiteCollection {
  private db: Database.Database;
  private tableName: string;
  private queryConstraints: Array<{ type: string; field: string; op?: string; value?: any; dir?: string }> = [];

  constructor(db: Database.Database, tableName: string, constraints: Array<{ type: string; field: string; op?: string; value?: any; dir?: string }> = []) {
    this.db = db;
    this.tableName = tableName;
    this.queryConstraints = [...constraints];
  }

  doc(id: string) {
    return new SQLiteDoc(this.db, this.tableName, id);
  }

  where(field: string, op: string, value: any) {
    return new SQLiteCollection(this.db, this.tableName, [
      ...this.queryConstraints,
      { type: 'where', field, op, value }
    ]);
  }

  orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
    return new SQLiteCollection(this.db, this.tableName, [
      ...this.queryConstraints,
      { type: 'orderBy', field, dir }
    ]);
  }

  limit(n: number) {
    return new SQLiteCollection(this.db, this.tableName, [
      ...this.queryConstraints,
      { type: 'limit', field: '', value: n }
    ]);
  }

  async add(data: any) {
    const id = data.id || Math.random().toString(36).substr(2, 9);
    const docRef = this.doc(id);
    await docRef.set(data);
    return docRef;
  }

  async get() {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params: any[] = [];
    const whereClauses: string[] = [];

    // Ensure table exists
    try {
      this.db.prepare(`SELECT 1 FROM ${this.tableName} LIMIT 1`).get();
    } catch (e) {
      return { empty: true, size: 0, docs: [] };
    }

    const columns = (this.db.prepare(`PRAGMA table_info(${this.tableName})`).all() as any[]).map(c => c.name);

    for (const c of this.queryConstraints) {
      if (c.type === 'where') {
        const op = c.op === '==' ? '=' : c.op;
        if (columns.includes(c.field)) {
          whereClauses.push(`${c.field} ${op} ?`);
          params.push(c.value);
        } else if (columns.includes('data')) {
          whereClauses.push(`json_extract(data, '$.${c.field}') ${op} ?`);
          params.push(typeof c.value === 'object' ? JSON.stringify(c.value) : c.value);
        }
      }
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const orderBy = this.queryConstraints.find(c => c.type === 'orderBy');
    if (orderBy) {
      if (columns.includes(orderBy.field)) {
        sql += ` ORDER BY ${orderBy.field} ${orderBy.dir?.toUpperCase()}`;
      } else if (columns.includes('data')) {
        sql += ` ORDER BY json_extract(data, '$.${orderBy.field}') ${orderBy.dir?.toUpperCase()}`;
      }
    }

    const limit = this.queryConstraints.find(c => c.type === 'limit');
    if (limit) {
      sql += ` LIMIT ${limit.value}`;
    }

    try {
      const rows = this.db.prepare(sql).all(...params);
      return {
        empty: rows.length === 0,
        size: rows.length,
        docs: rows.map((row: any) => ({
          id: String(row.id),
          data: () => {
            let res: any = { ...row };
            if (row.data) {
              try {
                const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
                res = { ...res, ...parsed };
              } catch (e) {}
            }
            res.id = String(row.id);
            return res;
          },
          exists: true
        }))
      };
    } catch (e) {
      console.error(`SQLite get error for ${this.tableName}:`, e);
      return { empty: true, size: 0, docs: [] };
    }
  }
}

export class SQLiteDB {
  public db: Database.Database;

  constructor() {
    const dir = path.dirname(SQLITE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(SQLITE_PATH);
    this.init();
  }

  private init() {
    if (fs.existsSync('./sqlite-init.sql')) {
      const sql = fs.readFileSync('./sqlite-init.sql', 'utf8');
      this.db.exec(sql);
    }

    // Ensure all collection tables exist
    const collections = [
      'stats', 'broadcast_history', 'whitelist', 'users', 'chats', 
      'global_bans', 'chat_bans', 'filters', 'logs', 'memberships', 
      'tasks', 'config', 'chat_digests', 'chat_messages', 'reputations', 
      'warnings', 'active_mutes', 'scam_alert_logs', 'pinned_messages',
      'shop_topics', 'shop_vendors', 'shop_publications'
    ];

    for (const c of collections) {
      try {
        this.db.prepare(`SELECT 1 FROM ${c} LIMIT 1`).get();
      } catch (e) {
        this.db.prepare(`CREATE TABLE IF NOT EXISTS ${c} (id TEXT PRIMARY KEY, data TEXT)`).run();
      }
    }

    // Auto-seed chats from CHATS_CATALOG if empty
    try {
      const chatCount = (this.db.prepare('SELECT count(*) as count FROM chats').get() as any)?.count || 0;
      if (chatCount === 0 && Array.isArray(CHATS_CATALOG)) {
        console.log(`[SQLiteDB] Seeding ${CHATS_CATALOG.length} moto communities from catalog...`);
        const insertStmt = this.db.prepare(`
          INSERT OR REPLACE INTO chats (id, title, members, active, username, category, description, avatarUrl)
          VALUES (?, ?, ?, 1, ?, ?, ?, ?)
        `);
        for (const item of CHATS_CATALOG) {
          const mapping = CHAT_TO_DB_MAPPING[item.slug];
          const chatId = mapping?.id || `chat_${item.slug}`;
          try {
            insertStmt.run(
              chatId,
              item.title,
              item.estimatedMembers || 100,
              item.username,
              item.category,
              item.shortDesc,
              item.image
            );
          } catch (err) {}
        }
      }
    } catch (e) {
      console.warn('[SQLiteDB] Note on chats seed:', e);
    }

    // Ensure superadmin user exists (password: admin123)
    try {
      const adminCount = (this.db.prepare("SELECT count(*) as count FROM users WHERE username = 'admin'").get() as any)?.count || 0;
      if (adminCount === 0) {
        this.db.prepare(`
          INSERT OR REPLACE INTO users (id, username, email, password, role, createdAt)
          VALUES ('superadmin', 'admin', 'admin@example.com', '$2b$10$1xUBiO5w/emNGq1aEgxDguYE7AyDu7rQygeHhn27SwUsZFJIQV09C', 'SUPER_ADMIN', CURRENT_TIMESTAMP)
        `).run();
      }
      const bookrayCount = (this.db.prepare("SELECT count(*) as count FROM users WHERE username = 'bookray'").get() as any)?.count || 0;
      if (bookrayCount === 0) {
        this.db.prepare(`
          INSERT OR REPLACE INTO users (id, username, email, password, role, createdAt)
          VALUES ('user_bookray', 'bookray', 'bookray1114@gmail.com', '$2b$10$1xUBiO5w/emNGq1aEgxDguYE7AyDu7rQygeHhn27SwUsZFJIQV09C', 'SUPER_ADMIN', CURRENT_TIMESTAMP)
        `).run();
      }
    } catch (e) {}
  }

  collection(name: string) {
    let tableName = name;
    if (name === 'bans') tableName = 'global_bans';

    try {
      this.db.prepare(`SELECT 1 FROM ${tableName} LIMIT 1`).get();
    } catch (e) {
      this.db.prepare(`CREATE TABLE IF NOT EXISTS ${tableName} (id TEXT PRIMARY KEY, data TEXT)`).run();
    }

    return new SQLiteCollection(this.db, tableName);
  }

  batch() {
    return {
      set: (docRef: any, data: any) => docRef.set(data),
      update: (docRef: any, data: any) => docRef.update(data),
      delete: (docRef: any) => docRef.delete(),
      commit: async () => {}
    };
  }
}

class HybridDatabase {
  public sqlite: SQLiteDB;
  private isQuotaExhausted: boolean = true; // Active failover protection while free read quota is exhausted
  private quotaCooldownUntil: number = Date.now() + 60 * 60 * 1000;

  constructor() {
    this.sqlite = new SQLiteDB();
    console.log('[HybridDatabase] 🛡️ Initialized with SQLite fallback engine active.');
  }

  markQuotaExhausted(reason?: string) {
    this.isQuotaExhausted = true;
    this.quotaCooldownUntil = Date.now() + 60 * 60 * 1000;
    console.warn(`[HybridDatabase] ⚠️ Firestore Free Read Quota limit reached (50k daily units). Seamlessly routed to local SQLite engine. Reason: ${reason || 'quota check'}`);
  }

  collection(name: string) {
    const sqliteCol = this.sqlite.collection(name);

    if (DB_TYPE === 'SQLITE' || (this.isQuotaExhausted && Date.now() < this.quotaCooldownUntil)) {
      return sqliteCol;
    }

    return this.createProxyCollection(name, sqliteCol);
  }

  private createProxyCollection(name: string, sqliteCol: SQLiteCollection): any {
    const self = this;
    const fbCol = (firebaseDb as any).collection(name);

    return {
      doc(id: string) {
        const sqliteDoc = sqliteCol.doc(id);
        const fbDoc = fbCol.doc(id);

        return {
          async get() {
            if (self.isQuotaExhausted && Date.now() < self.quotaCooldownUntil) {
              return sqliteDoc.get();
            }
            try {
              const snap = await fbDoc.get();
              if (snap.exists) {
                sqliteDoc.set(snap.data()).catch(() => {});
              }
              return snap;
            } catch (err: any) {
              if (isFirestoreQuotaExceeded(err)) {
                self.markQuotaExhausted(err.message);
                return sqliteDoc.get();
              }
              throw err;
            }
          },

          async set(data: any) {
            await sqliteDoc.set(data);
            if (!self.isQuotaExhausted) {
              fbDoc.set(data).catch((err: any) => {
                if (isFirestoreQuotaExceeded(err)) self.markQuotaExhausted(err.message);
              });
            }
          },

          async update(data: any) {
            await sqliteDoc.update(data);
            if (!self.isQuotaExhausted) {
              fbDoc.update(data).catch((err: any) => {
                if (isFirestoreQuotaExceeded(err)) self.markQuotaExhausted(err.message);
              });
            }
          },

          async delete() {
            await sqliteDoc.delete();
            if (!self.isQuotaExhausted) {
              fbDoc.delete().catch((err: any) => {
                if (isFirestoreQuotaExceeded(err)) self.markQuotaExhausted(err.message);
              });
            }
          },

          onSnapshot(cb: any) {
            if (self.isQuotaExhausted) {
              return sqliteDoc.onSnapshot(cb);
            }
            try {
              return fbDoc.onSnapshot(cb, (err: any) => {
                if (isFirestoreQuotaExceeded(err)) {
                  self.markQuotaExhausted(err.message);
                  sqliteDoc.onSnapshot(cb);
                }
              });
            } catch (err: any) {
              return sqliteDoc.onSnapshot(cb);
            }
          }
        };
      },

      where(field: string, op: string, val: any) {
        return self.createProxyQuery(fbCol.where(field, op, val), sqliteCol.where(field, op, val));
      },

      orderBy(field: string, dir?: any) {
        return self.createProxyQuery(fbCol.orderBy(field, dir), sqliteCol.orderBy(field, dir));
      },

      limit(n: number) {
        return self.createProxyQuery(fbCol.limit(n), sqliteCol.limit(n));
      },

      async add(data: any) {
        const docRef = await sqliteCol.add(data);
        if (!self.isQuotaExhausted) {
          fbCol.add(data).catch((err: any) => {
            if (isFirestoreQuotaExceeded(err)) self.markQuotaExhausted(err.message);
          });
        }
        return docRef;
      },

      async get() {
        if (self.isQuotaExhausted && Date.now() < self.quotaCooldownUntil) {
          return sqliteCol.get();
        }
        try {
          const snap = await fbCol.get();
          if (snap && snap.docs) {
            for (const doc of snap.docs) {
              sqliteCol.doc(doc.id).set(doc.data()).catch(() => {});
            }
          }
          return snap;
        } catch (err: any) {
          if (isFirestoreQuotaExceeded(err)) {
            self.markQuotaExhausted(err.message);
            return sqliteCol.get();
          }
          throw err;
        }
      }
    };
  }

  private createProxyQuery(fbQuery: any, sqliteQuery: any): any {
    const self = this;
    return {
      where(field: string, op: string, val: any) {
        return self.createProxyQuery(fbQuery.where(field, op, val), sqliteQuery.where(field, op, val));
      },
      orderBy(field: string, dir?: any) {
        return self.createProxyQuery(fbQuery.orderBy(field, dir), sqliteQuery.orderBy(field, dir));
      },
      limit(n: number) {
        return self.createProxyQuery(fbQuery.limit(n), sqliteQuery.limit(n));
      },
      async get() {
        if (self.isQuotaExhausted && Date.now() < self.quotaCooldownUntil) {
          return sqliteQuery.get();
        }
        try {
          const snap = await fbQuery.get();
          return snap;
        } catch (err: any) {
          if (isFirestoreQuotaExceeded(err)) {
            self.markQuotaExhausted(err.message);
            return sqliteQuery.get();
          }
          throw err;
        }
      }
    };
  }

  batch() {
    return this.sqlite.batch();
  }
}

export const db = new HybridDatabase();

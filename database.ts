import dotenv from 'dotenv';
dotenv.config();
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { adminDb as firebaseDb } from './firebase-admin';

const DB_TYPE = (process.env.DB_TYPE || 'FIREBASE').toUpperCase();
const SQLITE_PATH = process.env.SQLITE_PATH || './data/database.sqlite';

console.log(`[Database] Selected type: ${DB_TYPE}`);

class SQLiteCollection {
  private db: Database.Database;
  private tableName: string;
  private queryConstraints: Array<{ type: string; field: string; op?: string; value?: any; dir?: string }> = [];

  constructor(db: Database.Database, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  doc(id: string) {
    return new SQLiteDoc(this.db, this.tableName, id);
  }

  where(field: string, op: string, value: any) {
    this.queryConstraints.push({ type: 'where', field, op, value });
    return this;
  }

  orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
    this.queryConstraints.push({ type: 'orderBy', field, dir });
    return this;
  }

  limit(n: number) {
    this.queryConstraints.push({ type: 'limit', field: '', value: n });
    return this;
  }

  async get() {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params: any[] = [];
    const whereClauses: string[] = [];

    for (const c of this.queryConstraints) {
      if (c.type === 'where') {
        const op = c.op === '==' ? '=' : c.op;
        whereClauses.push(`${c.field} ${op} ?`);
        params.push(c.value);
      }
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const orderBy = this.queryConstraints.find(c => c.type === 'orderBy');
    if (orderBy) {
      sql += ` ORDER BY ${orderBy.field} ${orderBy.dir?.toUpperCase()}`;
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
          id: row.id,
          data: () => {
            // If it's a 'config' table, data is JSON in the 'data' column
            if (this.tableName === 'config' && row.data) {
              return JSON.parse(row.data);
            }
            return row;
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

class SQLiteDoc {
  private db: Database.Database;
  private tableName: string;
  private id: string;

  constructor(db: Database.Database, tableName: string, id: string) {
    this.db = db;
    this.tableName = tableName;
    this.id = id;
  }

  async get() {
    try {
      const row: any = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`).get(this.id);
      return {
        id: this.id,
        exists: !!row,
        data: () => {
          if (this.tableName === 'config' && row?.data) {
            return JSON.parse(row.data);
          }
          return row;
        }
      };
    } catch (e) {
      return { id: this.id, exists: false, data: () => null };
    }
  }

  async set(data: any) {
    const fields = Object.keys(data);
    if (!fields.includes('id')) {
      data.id = this.id;
      fields.push('id');
    }

    if (this.tableName === 'config') {
      const sql = `INSERT OR REPLACE INTO config (id, data) VALUES (?, ?)`;
      this.db.prepare(sql).run(this.id, JSON.stringify(data));
      return;
    }

    const placeholders = fields.map(() => '?').join(', ');
    const columns = fields.join(', ');
    const values = fields.map(f => {
        const val = data[f];
        if (typeof val === 'boolean') return val ? 1 : 0;
        if (typeof val === 'object' && val !== null) return JSON.stringify(val);
        return val;
    });

    const sql = `INSERT OR REPLACE INTO ${this.tableName} (${columns}) VALUES (${placeholders})`;
    this.db.prepare(sql).run(...values);
  }

  async update(data: any) {
    if (this.tableName === 'config') {
      const existing = await this.get();
      const newData = { ...existing.data(), ...data };
      return this.set(newData);
    }

    const fields = Object.keys(data);
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => {
        const val = data[f];
        if (typeof val === 'boolean') return val ? 1 : 0;
        if (typeof val === 'object' && val !== null) return JSON.stringify(val);
        return val;
    });
    values.push(this.id);

    const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`;
    this.db.prepare(sql).run(...values);
  }

  async delete() {
    this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).run(this.id);
  }

  onSnapshot(callback: (doc: any) => void) {
    // Basic implementation: call immediately
    this.get().then(callback);
    // In a real app we might use an event emitter here
    return () => {}; // Unsubscribe mock
  }
}

class SQLiteDB {
  private db: Database.Database;

  constructor() {
    const dir = path.dirname(SQLITE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(SQLITE_PATH);
    this.init();
  }

  private init() {
    const sql = fs.readFileSync('./sqlite-init.sql', 'utf8');
    this.db.exec(sql);

    // Migration: Add missing columns to chats table if they don't exist
    const columnsToSync = [
      { name: 'muteDurationMinutes', type: 'INTEGER DEFAULT 0' },
      { name: 'deleteSystemMessages', type: 'INTEGER DEFAULT 0' },
      { name: 'deleteCommands', type: 'INTEGER DEFAULT 0' },
      { name: 'userVoteEnabled', type: 'INTEGER DEFAULT 0' },
      { name: 'userVotePercentage', type: 'INTEGER DEFAULT 10' },
      { name: 'userVoteMin', type: 'INTEGER DEFAULT 5' },
      { name: 'userVoteMax', type: 'INTEGER DEFAULT 50' },
      { name: 'userVoteDuration', type: 'INTEGER DEFAULT 1440' },
      { name: 'notifyMultiChat', type: 'INTEGER DEFAULT 0' },
      { name: 'multiChatThreshold', type: 'INTEGER DEFAULT 5' }
    ];

    const existingColumns = this.db.prepare('PRAGMA table_info(chats)').all() as any[];
    const existingColumnNames = existingColumns.map(c => c.name);

    for (const column of columnsToSync) {
      if (!existingColumnNames.includes(column.name)) {
        try {
          this.db.prepare(`ALTER TABLE chats ADD COLUMN ${column.name} ${column.type}`).run();
          console.log(`Successfully added missing column ${column.name} to chats table`);
        } catch (err) {
          console.error(`Failed to add column ${column.name} to chats table:`, err);
        }
      }
    }

    // Migration for stats table
    const existingStatsColumns = this.db.prepare('PRAGMA table_info(stats)').all() as any[];
    const existingStatsColumnNames = existingStatsColumns.map(c => c.name);
    if (!existingStatsColumnNames.includes('name')) {
      try {
        this.db.prepare('ALTER TABLE stats ADD COLUMN name TEXT').run();
        console.log('Successfully added missing column name to stats table');
      } catch (err) {
        console.error('Failed to add column name to stats table:', err);
      }
    }
    if (!existingStatsColumnNames.includes('joins')) {
      try {
        this.db.prepare('ALTER TABLE stats ADD COLUMN joins INTEGER DEFAULT 0').run();
        console.log('Successfully added missing column joins to stats table');
      } catch (err) {
        console.error('Failed to add column joins to stats table:', err);
      }
    }
    if (!existingStatsColumnNames.includes('leaves')) {
      try {
        this.db.prepare('ALTER TABLE stats ADD COLUMN leaves INTEGER DEFAULT 0').run();
        console.log('Successfully added missing column leaves to stats table');
      } catch (err) {
        console.error('Failed to add column leaves to stats table:', err);
      }
    }
    if (!existingStatsColumnNames.includes('msgs')) {
      try {
        this.db.prepare('ALTER TABLE stats ADD COLUMN msgs INTEGER DEFAULT 0').run();
        console.log('Successfully added missing column msgs to stats table');
      } catch (err) {
        console.error('Failed to add column msgs to stats table:', err);
      }
    }
    if (!existingStatsColumnNames.includes('chatStats')) {
      try {
        this.db.prepare('ALTER TABLE stats ADD COLUMN chatStats TEXT').run();
        console.log('Successfully added missing column chatStats to stats table');
      } catch (err) {
        console.error('Failed to add column chatStats to stats table:', err);
      }
    }
    if (!existingStatsColumnNames.includes('onlineUsers')) {
      try {
        this.db.prepare('ALTER TABLE stats ADD COLUMN onlineUsers INTEGER DEFAULT 0').run();
        console.log('Successfully added missing column onlineUsers to stats table');
      } catch (err) {
        console.error('Failed to add column onlineUsers to stats table:', err);
      }
    }
    if (!existingStatsColumnNames.includes('totalMembers')) {
      try {
        this.db.prepare('ALTER TABLE stats ADD COLUMN totalMembers INTEGER DEFAULT 0').run();
        console.log('Successfully added missing column totalMembers to stats table');
      } catch (err) {
        console.error('Failed to add column totalMembers to stats table:', err);
      }
    }
  }

  collection(name: string) {
    // Map Firestore names to SQLite tables
    let tableName = name;
    if (name === 'bans') tableName = 'global_bans';
    
    // Check if table exists, if not use a fallback or config pattern
    try {
        this.db.prepare(`SELECT 1 FROM ${tableName} LIMIT 1`).get();
    } catch (e) {
        // Create table as a json-store if it doesn't exist in schema
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

export const db = DB_TYPE === 'SQLITE' ? new SQLiteDB() : firebaseDb;

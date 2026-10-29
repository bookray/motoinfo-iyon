import dotenv from 'dotenv';
dotenv.config();
import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { adminDb as firebaseDb } from './firebase-admin';
import { CHATS_CATALOG, CHAT_TO_DB_MAPPING } from './chatsCatalog';

const SQLITE_PATH = process.env.SQLITE_PATH || './data/database.sqlite';
const DB_CONFIG_PATH = './data/db-config.json';

export interface DbConnectionConfig {
  dbType: 'FIREBASE' | 'MYSQL';
  dbHost: string;
  dbPort: number;
  dbUser: string;
  dbPass: string;
  dbName: string;
}

export interface DbStatusInfo {
  configuredType: 'FIREBASE' | 'MYSQL';
  activeEngine: 'FIREBASE' | 'MYSQL' | 'SQLITE';
  mysqlConnected: boolean;
  mysqlError: string | null;
  mysqlHost: string;
  mysqlPort: number;
  mysqlDatabase: string;
  mysqlUser: string;
  firebaseConnected: boolean;
  quotaExhausted: boolean;
  tablesCount?: number;
}

const ALL_COLLECTIONS = [
  'stats', 'broadcast_history', 'whitelist', 'users', 'chats',
  'global_bans', 'chat_bans', 'filters', 'logs', 'memberships',
  'tasks', 'config', 'chat_digests', 'chat_messages', 'reputations',
  'warnings', 'active_mutes', 'scam_alert_logs', 'pinned_messages',
  'shop_topics', 'shop_vendors', 'shop_publications',
  'buy_sell_topics', 'buy_sell_alerts',
  'captcha_sessions', 'subscription_sessions'
];

const JSON_COLUMNS = new Set([
  'chatStats', 'hourly', 'activeUsers', 'onlineUsers',
  'assignedChatIds', 'forbiddenWords', 'buttons', 'chatIds',
  'messageIds', 'pinResults', 'history', 'chatScores', 'settings',
  'configs', 'items', 'messages', 'keywords', 'markerWords', 'matchedMarkers'
]);

const BOOLEAN_COLUMNS = new Set([
  'active', 'enabled', 'isAdmin', 'tzAdjusted', 'sentToTelegram',
  'isForward', 'muteNewcomers', 'autoApprove', 'pin', 'silent',
  'unpinned', 'hasMedia', 'deleteMessage', 'notifyInGroup',
  'notifyVendorOnDelete', 'autoSendTelegram', 'isCommercial'
]);

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

function normalizeSQLiteRow(row: any, id: string): any {
  if (!row) return null;
  let res: any = { ...row };

  // Convert any raw MySQL Date objects in base columns before merging JSON data
  for (const key of Object.keys(res)) {
    if (res[key] instanceof Date) {
      res[key] = (res[key] as Date).toISOString();
    }
  }

  if (row.data) {
    try {
      const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      if (parsed && typeof parsed === 'object') {
        res = { ...res, ...parsed };
      }
    } catch (e) {}
  }

  delete res.data;

  for (const key of Object.keys(res)) {
    const val = res[key];
    if (val instanceof Date) {
      res[key] = val.toISOString();
    } else if (typeof val === 'string') {
      const trimmed = val.trim();
      if (
        JSON_COLUMNS.has(key) ||
        ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
          (trimmed.startsWith('[') && trimmed.endsWith(']')))
      ) {
        try {
          res[key] = JSON.parse(trimmed);
        } catch (e) {}
      }
    } else if (typeof val === 'number' && BOOLEAN_COLUMNS.has(key)) {
      res[key] = val === 1;
    } else if (typeof val === 'number' && (key === 'activeUsers' || key === 'onlineUsers')) {
      res[key] = [];
    }
  }

  res.id = String(id);
  return res;
}

function sanitizeTableName(name: string): string {
  const mapped = name === 'bans' ? 'global_bans' : name;
  return mapped.replace(/[^a-zA-Z0-9_]/g, '');
}

export class SQLiteDoc {
  private db: Database.Database;
  private tableName: string;
  private id: string;

  constructor(db: Database.Database, tableName: string, id: string) {
    this.db = db;
    this.tableName = sanitizeTableName(tableName);
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
      const parsedData = normalizeSQLiteRow(row, this.id);
      return {
        id: this.id,
        exists: true,
        data: () => parsedData
      };
    } catch (e) {
      return { id: this.id, exists: false, data: () => null };
    }
  }

  async set(data: any) {
    if (!data) return;
    const clean = { ...data, id: this.id };

    try {
      this.db.prepare(`SELECT 1 FROM ${this.tableName} LIMIT 1`).get();
    } catch (e) {
      this.db.prepare(`CREATE TABLE IF NOT EXISTS ${this.tableName} (id TEXT PRIMARY KEY, data TEXT)`).run();
    }

    const columns = (this.db.prepare(`PRAGMA table_info(${this.tableName})`).all() as any[]).map(c => c.name);
    if (!columns.includes('data')) {
      try {
        this.db.prepare(`ALTER TABLE ${this.tableName} ADD COLUMN data TEXT`).run();
        columns.push('data');
      } catch (e) {}
    }

    clean.data = JSON.stringify(data);

    const validFields = Object.keys(clean).filter(k => columns.includes(k));
    if (!validFields.includes('id')) validFields.unshift('id');

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
    this.tableName = sanitizeTableName(tableName);
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
        docs: rows.map((row: any) => {
          const docId = String(row.id);
          const parsedData = normalizeSQLiteRow(row, docId);
          return {
            id: docId,
            ref: this.doc(docId),
            data: () => parsedData,
            exists: true
          };
        })
      };
    } catch (e) {
      console.error(`SQLite get error for ${this.tableName}:`, e);
      return { empty: true, size: 0, docs: [] };
    }
  }
}

const mysqlTableColumnsCache = new Map<string, Set<string>>();
const mysqlTableColumnTypesCache = new Map<string, Map<string, string>>();

function toMySQLDateTime(val: any, isDateOnly = false): string {
  try {
    const d = val instanceof Date ? val : new Date(val);
    if (!isNaN(d.getTime())) {
      const iso = d.toISOString();
      return isDateOnly ? iso.slice(0, 10) : iso.slice(0, 19).replace('T', ' ');
    }
  } catch {}
  const str = String(val || '');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str)) {
    return isDateOnly ? str.slice(0, 10) : str.slice(0, 19).replace('T', ' ');
  }
  return isDateOnly ? new Date().toISOString().slice(0, 10) : new Date().toISOString().slice(0, 19).replace('T', ' ');
}

async function ensureMySQLTableAndColumns(pool: mysql.Pool, tableName: string): Promise<Set<string>> {
  const cached = mysqlTableColumnsCache.get(tableName);
  if (cached && cached.has('data') && mysqlTableColumnTypesCache.has(tableName)) {
    return cached;
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS \`${tableName}\` (
      \`id\` VARCHAR(255) NOT NULL PRIMARY KEY,
      \`data\` LONGTEXT NULL,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [colRows]: any = await pool.query(`SHOW COLUMNS FROM \`${tableName}\``);
  const cols = new Set<string>();
  const colTypes = new Map<string, string>();
  for (const r of colRows || []) {
    const fieldName = String(r.Field);
    const fieldType = String(r.Type || '').toLowerCase();
    cols.add(fieldName);
    colTypes.set(fieldName, fieldType);
  }

  if (!cols.has('data')) {
    try {
      await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`data\` LONGTEXT NULL`);
      cols.add('data');
      colTypes.set('data', 'longtext');
      console.log(`[MySQL] Auto-migrated table \`${tableName}\`: added \`data\` LONGTEXT column`);
    } catch (alterErr: any) {
      if (String(alterErr?.code) === 'ER_DUP_FIELDNAME' || String(alterErr?.message).includes('Duplicate column')) {
        cols.add('data');
        colTypes.set('data', 'longtext');
      } else {
        console.warn(`[MySQL] Warning adding \`data\` column to \`${tableName}\`:`, alterErr?.message);
      }
    }
  }

  mysqlTableColumnsCache.set(tableName, cols);
  mysqlTableColumnTypesCache.set(tableName, colTypes);
  return cols;
}

export class MySQLDoc {
  private pool: mysql.Pool;
  private tableName: string;
  private id: string;
  private sqliteFallbackDoc: SQLiteDoc;

  constructor(pool: mysql.Pool, tableName: string, id: string, sqliteFallbackDoc: SQLiteDoc) {
    this.pool = pool;
    this.tableName = sanitizeTableName(tableName);
    this.id = String(id);
    this.sqliteFallbackDoc = sqliteFallbackDoc;
  }

  async ensureTable(): Promise<Set<string>> {
    return ensureMySQLTableAndColumns(this.pool, this.tableName);
  }

  async get() {
    try {
      await this.ensureTable();
      const [rows]: any = await this.pool.execute(
        `SELECT * FROM \`${this.tableName}\` WHERE \`id\` = ? LIMIT 1`,
        [this.id]
      );
      if (!rows || rows.length === 0) {
        return {
          id: this.id,
          exists: false,
          data: () => null
        };
      }
      const row = rows[0];
      const parsed = normalizeSQLiteRow(row, this.id);
      this.sqliteFallbackDoc.set(parsed).catch(() => {});
      return {
        id: this.id,
        exists: true,
        data: () => parsed
      };
    } catch (err) {
      console.warn(`[MySQL] Read error on ${this.tableName}/${this.id}, using SQLite mirror:`, (err as any)?.message);
      return this.sqliteFallbackDoc.get();
    }
  }

  async set(data: any) {
    if (!data) return;
    const payload = { ...data, id: this.id };
    await this.sqliteFallbackDoc.set(payload);

    let cols = await this.ensureTable();
    const jsonStr = JSON.stringify(payload);

    const record: Record<string, any> = {
      ...payload,
      id: this.id,
      data: jsonStr
    };

    // Provide safe defaults for legacy NOT NULL columns if present in the existing MySQL table
    if (cols.has('title') && (record.title === undefined || record.title === null)) {
      record.title = String(record.chatTitle || record.name || this.id);
    }
    if (cols.has('date') && (record.date === undefined || record.date === null)) {
      record.date = String(this.id);
    }
    if (cols.has('chatId') && (record.chatId === undefined || record.chatId === null)) {
      record.chatId = '';
    }
    if (cols.has('userId') && (record.userId === undefined || record.userId === null)) {
      record.userId = String(this.id);
    }
    if (cols.has('text') && (record.text === undefined || record.text === null)) {
      record.text = String(record.message || '');
    }
    if (cols.has('message') && (record.message === undefined || record.message === null)) {
      record.message = String(record.text || '');
    }
    if (cols.has('summary') && (record.summary === undefined || record.summary === null)) {
      record.summary = '';
    }
    if (cols.has('type') && (record.type === undefined || record.type === null)) {
      record.type = 'SYSTEM';
    }
    if (cols.has('status') && (record.status === undefined || record.status === null)) {
      record.status = 'active';
    }
    if (cols.has('pattern') && (record.pattern === undefined || record.pattern === null)) {
      record.pattern = '';
    }
    if (cols.has('action') && (record.action === undefined || record.action === null)) {
      record.action = 'NONE';
    }
    if (cols.has('username') && (record.username === undefined || record.username === null) && this.tableName === 'users') {
      record.username = String(this.id);
    }
    if (cols.has('role') && (record.role === undefined || record.role === null) && this.tableName === 'users') {
      record.role = 'MODERATOR';
    }

    const buildAndExecuteUpsert = async (columnSet: Set<string>, excludedCols?: Set<string>) => {
      const colTypes = mysqlTableColumnTypesCache.get(this.tableName) || new Map<string, string>();
      const validFields = Object.keys(record).filter(
        k => columnSet.has(k) && k !== 'updatedAt' && record[k] !== undefined && (!excludedCols || !excludedCols.has(k))
      );
      if (!validFields.includes('id')) validFields.unshift('id');

      const colList = validFields.map(f => `\`${f}\``).join(', ');
      const placeholders = validFields.map(() => '?').join(', ');
      const updateAssignments = validFields
        .filter(f => f !== 'id')
        .map(f => `\`${f}\` = VALUES(\`${f}\`)`)
        .join(', ');

      const values = validFields.map(f => {
        const val = record[f];
        if (f === 'data') return jsonStr;
        if (val === null) return null;

        const cType = (colTypes.get(f) || '').toLowerCase();
        const isNumericCol =
          cType.startsWith('int') ||
          cType.startsWith('tinyint') ||
          cType.startsWith('smallint') ||
          cType.startsWith('mediumint') ||
          cType.startsWith('bigint') ||
          cType.startsWith('decimal') ||
          cType.startsWith('float') ||
          cType.startsWith('double');

        const isDateCol =
          cType.includes('datetime') ||
          cType.includes('timestamp') ||
          cType === 'date';

        if (isDateCol) {
          return toMySQLDateTime(val, cType === 'date');
        }

        // Also convert ISO-8601 datetime strings (e.g. '2026-10-26T10:43:05.559Z') to MySQL format 'YYYY-MM-DD HH:MM:SS'
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?$/.test(val)) {
          return toMySQLDateTime(val, false);
        }

        if (isNumericCol) {
          if (typeof val === 'boolean') return val ? 1 : 0;
          if (Array.isArray(val)) return val.length;
          if (typeof val === 'object') return Object.keys(val).length;
          const num = Number(val);
          return isNaN(num) ? 0 : num;
        }

        if (typeof val === 'boolean') return val ? 1 : 0;
        if (typeof val === 'object') return JSON.stringify(val);
        return val;
      });

      const sql = updateAssignments
        ? `INSERT INTO \`${this.tableName}\` (${colList}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateAssignments}`
        : `INSERT IGNORE INTO \`${this.tableName}\` (${colList}) VALUES (${placeholders})`;

      await this.pool.execute(sql, values);
    };

    try {
      await buildAndExecuteUpsert(cols);
    } catch (err: any) {
      if (err?.code === 'ER_BAD_FIELD_ERROR' || err?.errno === 1054) {
        mysqlTableColumnsCache.delete(this.tableName);
        mysqlTableColumnTypesCache.delete(this.tableName);
        cols = await this.ensureTable();
        await buildAndExecuteUpsert(cols);
      } else if (
        err?.errno === 1292 ||
        err?.errno === 1366 ||
        err?.code === 'ER_TRUNCATED_WRONG_VALUE' ||
        err?.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD'
      ) {
        mysqlTableColumnsCache.delete(this.tableName);
        mysqlTableColumnTypesCache.delete(this.tableName);
        cols = await this.ensureTable();
        const excluded = new Set<string>();
        const colMatch = String(err?.sqlMessage || err?.message || '').match(/for column '([^']+)'/i);
        if (colMatch && colMatch[1] && colMatch[1] !== 'id' && colMatch[1] !== 'data') {
          excluded.add(colMatch[1]);
        }
        await buildAndExecuteUpsert(cols, excluded);
      } else {
        throw err;
      }
    }
  }

  async update(data: any) {
    if (!data) return;
    const existing = await this.get();
    const currentData = existing.exists ? existing.data() || {} : {};
    return this.set({ ...currentData, ...data });
  }

  async delete() {
    await this.sqliteFallbackDoc.delete();
    await this.ensureTable();
    await this.pool.execute(`DELETE FROM \`${this.tableName}\` WHERE \`id\` = ?`, [this.id]);
  }

  onSnapshot(callback: (doc: any) => void) {
    this.get().then(callback);
    return () => {};
  }
}

export class MySQLCollection {
  private pool: mysql.Pool;
  private tableName: string;
  private sqliteCol: SQLiteCollection;
  private queryConstraints: Array<{ type: string; field: string; op?: string; value?: any; dir?: string }> = [];

  constructor(
    pool: mysql.Pool,
    tableName: string,
    sqliteCol: SQLiteCollection,
    constraints: Array<{ type: string; field: string; op?: string; value?: any; dir?: string }> = []
  ) {
    this.pool = pool;
    this.tableName = sanitizeTableName(tableName);
    this.sqliteCol = sqliteCol;
    this.queryConstraints = [...constraints];
  }

  doc(id: string) {
    return new MySQLDoc(this.pool, this.tableName, id, this.sqliteCol.doc(id));
  }

  where(field: string, op: string, value: any) {
    return new MySQLCollection(this.pool, this.tableName, this.sqliteCol.where(field, op, value), [
      ...this.queryConstraints,
      { type: 'where', field, op, value }
    ]);
  }

  orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
    return new MySQLCollection(this.pool, this.tableName, this.sqliteCol.orderBy(field, dir), [
      ...this.queryConstraints,
      { type: 'orderBy', field, dir }
    ]);
  }

  limit(n: number) {
    return new MySQLCollection(this.pool, this.tableName, this.sqliteCol.limit(n), [
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
    try {
      await ensureMySQLTableAndColumns(this.pool, this.tableName);

      const [rows]: any = await this.pool.execute(`SELECT * FROM \`${this.tableName}\``);
      let items: Array<{ id: string; data: any }> = (rows || []).map((row: any) => {
        const docId = String(row.id);
        const parsed = normalizeSQLiteRow(row, docId);
        return { id: docId, data: parsed };
      });

      // Apply where filters in memory for full compatibility with arbitrary JSON fields
      for (const c of this.queryConstraints) {
        if (c.type === 'where') {
          items = items.filter(item => {
            const fieldVal = item.data[c.field];
            if (c.op === '==' || c.op === '=') return String(fieldVal) === String(c.value);
            if (c.op === '>=') return fieldVal >= c.value;
            if (c.op === '<=') return fieldVal <= c.value;
            if (c.op === '>') return fieldVal > c.value;
            if (c.op === '<') return fieldVal < c.value;
            if (c.op === '!=') return fieldVal !== c.value;
            return true;
          });
        }
      }

      const orderBy = this.queryConstraints.find(c => c.type === 'orderBy');
      if (orderBy) {
        const dirMult = orderBy.dir?.toLowerCase() === 'desc' ? -1 : 1;
        items.sort((a, b) => {
          const va = a.data[orderBy.field];
          const vb = b.data[orderBy.field];
          if (va === vb) return 0;
          return (va > vb ? 1 : -1) * dirMult;
        });
      }

      const limitConstraint = this.queryConstraints.find(c => c.type === 'limit');
      if (limitConstraint && typeof limitConstraint.value === 'number') {
        items = items.slice(0, limitConstraint.value);
      }

      return {
        empty: items.length === 0,
        size: items.length,
        docs: items.map(item => ({
          id: item.id,
          ref: this.doc(item.id),
          data: () => item.data,
          exists: true
        }))
      };
    } catch (err) {
      console.warn(`[MySQL] Collection get error on ${this.tableName}, falling back to SQLite:`, (err as any)?.message);
      return this.sqliteCol.get();
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

    // Ensure all collection tables exist AND have a `data TEXT` column
    for (const c of ALL_COLLECTIONS) {
      try {
        this.db.prepare(`SELECT 1 FROM ${c} LIMIT 1`).get();
      } catch (e) {
        this.db.prepare(`CREATE TABLE IF NOT EXISTS ${c} (id TEXT PRIMARY KEY, data TEXT)`).run();
      }
      try {
        const cols = (this.db.prepare(`PRAGMA table_info(${c})`).all() as any[]).map(col => col.name);
        if (!cols.includes('data')) {
          this.db.prepare(`ALTER TABLE ${c} ADD COLUMN data TEXT`).run();
        }
      } catch (e) {}
    }

    // Auto-seed chats from CHATS_CATALOG if empty
    try {
      const chatCount = (this.db.prepare('SELECT count(*) as count FROM chats').get() as any)?.count || 0;
      if (chatCount === 0 && Array.isArray(CHATS_CATALOG)) {
        console.log(`[SQLiteDB] Seeding ${CHATS_CATALOG.length} moto communities from catalog...`);
        for (const item of CHATS_CATALOG) {
          const mapping = CHAT_TO_DB_MAPPING[item.slug];
          const chatId = mapping?.id || `chat_${item.slug}`;
          const chatData = {
            id: chatId,
            title: item.title,
            members: item.estimatedMembers || 100,
            active: true,
            username: item.username,
            category: item.category,
            description: item.shortDesc,
            avatarUrl: item.image
          };
          new SQLiteDoc(this.db, 'chats', chatId).set(chatData).catch(() => {});
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
          VALUES ('superadmin', 'admin', 'admin@example.com', '$2b$10$LHF7wbmq2X103Iv1a97J9eUmNCrEXKNT7wgBMBV/S0k7FRJdVmFJm', 'SUPER_ADMIN', CURRENT_TIMESTAMP)
        `).run();
      }
      const bookrayCount = (this.db.prepare("SELECT count(*) as count FROM users WHERE username = 'bookray'").get() as any)?.count || 0;
      if (bookrayCount === 0) {
        this.db.prepare(`
          INSERT OR REPLACE INTO users (id, username, email, password, role, createdAt)
          VALUES ('user_bookray', 'bookray', 'bookray1114@gmail.com', '$2b$10$LHF7wbmq2X103Iv1a97J9eUmNCrEXKNT7wgBMBV/S0k7FRJdVmFJm', 'SUPER_ADMIN', CURRENT_TIMESTAMP)
        `).run();
      }
    } catch (e) {}
  }

  collection(name: string) {
    const tableName = sanitizeTableName(name);
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
  private isQuotaExhausted: boolean = false;
  private quotaCooldownUntil: number = 0;

  private configuredType: 'FIREBASE' | 'MYSQL' = 'FIREBASE';
  private mysqlConfig: DbConnectionConfig = {
    dbType: (process.env.DB_TYPE?.toUpperCase() === 'MYSQL' ? 'MYSQL' : 'FIREBASE'),
    dbHost: process.env.DB_HOST || 'localhost',
    dbPort: Number(process.env.DB_PORT) || 3306,
    dbUser: process.env.DB_USER || 'root',
    dbPass: process.env.DB_PASS || '',
    dbName: process.env.DB_NAME || 'teleguard'
  };
  private mysqlPool: mysql.Pool | null = null;
  private mysqlConnected: boolean = false;
  private mysqlError: string | null = null;

  constructor() {
    this.sqlite = new SQLiteDB();
    this.loadPersistedConfig();
    console.log(`[HybridDatabase] Initialized. Configured mode: ${this.configuredType}`);
  }

  private loadPersistedConfig() {
    try {
      if (fs.existsSync(DB_CONFIG_PATH)) {
        const raw = JSON.parse(fs.readFileSync(DB_CONFIG_PATH, 'utf8'));
        if (raw && typeof raw === 'object') {
          this.mysqlConfig = {
            dbType: raw.dbType === 'MYSQL' ? 'MYSQL' : 'FIREBASE',
            dbHost: raw.dbHost || this.mysqlConfig.dbHost,
            dbPort: Number(raw.dbPort) || 3306,
            dbUser: raw.dbUser || this.mysqlConfig.dbUser,
            dbPass: raw.dbPass !== undefined ? raw.dbPass : this.mysqlConfig.dbPass,
            dbName: raw.dbName || this.mysqlConfig.dbName
          };
          this.configuredType = this.mysqlConfig.dbType;
        }
      }
    } catch (e) {
      console.warn('[HybridDatabase] Could not read persisted db-config.json:', (e as any)?.message);
    }
  }

  public getPersistedConfig(): DbConnectionConfig {
    this.loadPersistedConfig();
    return { ...this.mysqlConfig };
  }

  public savePersistedConfig(cfg: Partial<DbConnectionConfig>) {
    try {
      const dir = path.dirname(DB_CONFIG_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.mysqlConfig = {
        dbType: cfg.dbType === 'MYSQL' ? 'MYSQL' : (cfg.dbType === 'FIREBASE' ? 'FIREBASE' : this.mysqlConfig.dbType),
        dbHost: cfg.dbHost !== undefined ? String(cfg.dbHost).trim() : this.mysqlConfig.dbHost,
        dbPort: Number(cfg.dbPort) || this.mysqlConfig.dbPort || 3306,
        dbUser: cfg.dbUser !== undefined ? String(cfg.dbUser).trim() : this.mysqlConfig.dbUser,
        dbPass: cfg.dbPass !== undefined ? String(cfg.dbPass) : this.mysqlConfig.dbPass,
        dbName: cfg.dbName !== undefined ? String(cfg.dbName).trim() : this.mysqlConfig.dbName
      };
      this.configuredType = this.mysqlConfig.dbType;
      fs.writeFileSync(DB_CONFIG_PATH, JSON.stringify(this.mysqlConfig, null, 2), 'utf8');
    } catch (e) {
      console.error('[HybridDatabase] Failed to save db-config.json:', e);
    }
  }

  public async configure(settingsObj: any): Promise<DbStatusInfo> {
    if (!settingsObj) return this.getStatus();

    const nextType = settingsObj.dbType === 'MYSQL' ? 'MYSQL' : 'FIREBASE';
    this.savePersistedConfig({
      dbType: nextType,
      dbHost: settingsObj.dbHost,
      dbPort: settingsObj.dbPort,
      dbUser: settingsObj.dbUser,
      dbPass: settingsObj.dbPass,
      dbName: settingsObj.dbName
    });

    if (nextType === 'MYSQL') {
      await this.connectMySQLPool();
    } else {
      if (this.mysqlPool) {
        try {
          await this.mysqlPool.end();
        } catch (e) {}
        this.mysqlPool = null;
      }
      this.mysqlConnected = false;
      this.mysqlError = null;
    }

    return this.getStatus();
  }

  private async connectMySQLPool(): Promise<boolean> {
    try {
      if (this.mysqlPool) {
        try {
          await this.mysqlPool.end();
        } catch (e) {}
        this.mysqlPool = null;
      }

      const { dbHost, dbPort, dbUser, dbPass, dbName } = this.mysqlConfig;
      if (!dbHost || !dbUser || !dbName) {
        throw new Error('Не указаны обязательные параметры MySQL (Host, User, Database Name)');
      }

      // First try connecting without database name to create DB if needed
      try {
        const initConn = await mysql.createConnection({
          host: dbHost,
          port: Number(dbPort) || 3306,
          user: dbUser,
          password: dbPass,
          connectTimeout: 7000
        });
        const safeDbName = dbName.replace(/[^a-zA-Z0-9_$]/g, '');
        if (safeDbName) {
          await initConn.query(`CREATE DATABASE IF NOT EXISTS \`${safeDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        }
        await initConn.end();
      } catch (createDbErr) {
        // Ignore if user only has privileges for existing database
      }

      const pool = mysql.createPool({
        host: dbHost,
        port: Number(dbPort) || 3306,
        user: dbUser,
        password: dbPass,
        database: dbName,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 7000
      });

      const conn = await pool.getConnection();
      await conn.ping();
      conn.release();

      this.mysqlPool = pool;
      this.mysqlConnected = true;
      this.mysqlError = null;
      console.log(`[HybridDatabase] ✅ Connected to MySQL (${dbUser}@${dbHost}:${dbPort}/${dbName})`);
      return true;
    } catch (err: any) {
      this.mysqlConnected = false;
      this.mysqlError = err?.message || String(err);
      console.error(`[HybridDatabase] ❌ MySQL connection failed:`, this.mysqlError);
      return false;
    }
  }

  public async testAndSetupMySQL(
    cfg: Partial<DbConnectionConfig>,
    seedCollections?: Record<string, Array<{ id: string; data: any }>>
  ): Promise<{ success: boolean; message: string; tablesCreated: number; recordsMigrated: number; status: DbStatusInfo }> {
    this.savePersistedConfig({
      ...cfg,
      dbType: 'MYSQL'
    });

    const ok = await this.connectMySQLPool();
    if (!ok || !this.mysqlPool) {
      return {
        success: false,
        message: `Не удалось подключиться к MySQL (${this.mysqlConfig.dbHost}:${this.mysqlConfig.dbPort}): ${this.mysqlError || 'Ошибка соединения'}`,
        tablesCreated: 0,
        recordsMigrated: 0,
        status: this.getStatus()
      };
    }

    let tablesCreated = 0;
    let recordsMigrated = 0;

    for (const colName of ALL_COLLECTIONS) {
      const tableName = sanitizeTableName(colName);
      await this.mysqlPool.execute(`
        CREATE TABLE IF NOT EXISTS \`${tableName}\` (
          \`id\` VARCHAR(255) NOT NULL PRIMARY KEY,
          \`data\` LONGTEXT NOT NULL,
          \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      tablesCreated++;
    }

    if (seedCollections) {
      for (const [colName, docs] of Object.entries(seedCollections)) {
        if (!Array.isArray(docs) || docs.length === 0) continue;
        const tableName = sanitizeTableName(colName);
        for (const item of docs) {
          if (!item || !item.id) continue;
          const payload = { ...item.data, id: String(item.id) };
          await this.mysqlPool.execute(
            `INSERT INTO \`${tableName}\` (\`id\`, \`data\`) VALUES (?, ?) ON DUPLICATE KEY UPDATE \`data\` = VALUES(\`data\`)`,
            [String(item.id), JSON.stringify(payload)]
          );
          recordsMigrated++;
        }
      }
    }

    return {
      success: true,
      message: `Подключение к MySQL (${this.mysqlConfig.dbHost}:${this.mysqlConfig.dbPort}/${this.mysqlConfig.dbName}) успешно установлено! Создано таблиц: ${tablesCreated}, синхронизировано записей: ${recordsMigrated}.`,
      tablesCreated,
      recordsMigrated,
      status: this.getStatus()
    };
  }

  public getStatus(): DbStatusInfo {
    const activeEngine: 'FIREBASE' | 'MYSQL' | 'SQLITE' =
      this.configuredType === 'MYSQL' && this.mysqlConnected
        ? 'MYSQL'
        : !this.isQuotaExhausted
        ? 'FIREBASE'
        : 'SQLITE';

    return {
      configuredType: this.configuredType,
      activeEngine,
      mysqlConnected: this.mysqlConnected,
      mysqlError: this.mysqlError,
      mysqlHost: this.mysqlConfig.dbHost,
      mysqlPort: this.mysqlConfig.dbPort,
      mysqlDatabase: this.mysqlConfig.dbName,
      mysqlUser: this.mysqlConfig.dbUser,
      firebaseConnected: !this.isQuotaExhausted,
      quotaExhausted: this.isQuotaExhausted
    };
  }

  markQuotaExhausted(reason?: string) {
    this.isQuotaExhausted = true;
    this.quotaCooldownUntil = Date.now() + 15 * 60 * 1000;
    console.warn(`[HybridDatabase] ⚠️ Firestore Free Read Quota limit reached. Routed to local SQLite engine for 15m. Reason: ${reason || 'quota check'}`);
  }

  collection(name: string): any {
    const sqliteCol = this.sqlite.collection(name);

    // If MySQL is configured and connected, use MySQL as primary engine
    if (this.configuredType === 'MYSQL' && this.mysqlConnected && this.mysqlPool) {
      return new MySQLCollection(this.mysqlPool, name, sqliteCol);
    }

    // If quota cooldown has expired, reset flag so Firebase is active again
    if (this.isQuotaExhausted && Date.now() >= this.quotaCooldownUntil) {
      this.isQuotaExhausted = false;
    }

    if (this.isQuotaExhausted) {
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
                return snap;
              }
              // Fallback to SQLite if doc was written locally while offline
              const localSnap = await sqliteDoc.get();
              if (localSnap.exists) {
                const localData = localSnap.data();
                if (localData) {
                  fbDoc.set(localData).catch(() => {});
                }
                return localSnap;
              }
              return snap;
            } catch (err: any) {
              if (isFirestoreQuotaExceeded(err)) {
                self.markQuotaExhausted(err.message);
                return sqliteDoc.get();
              }
              return sqliteDoc.get();
            }
          },

          async set(data: any) {
            await sqliteDoc.set(data);
            if (!self.isQuotaExhausted) {
              try {
                await fbDoc.set(data);
              } catch (err: any) {
                if (isFirestoreQuotaExceeded(err)) self.markQuotaExhausted(err.message);
              }
            }
          },

          async update(data: any) {
            await sqliteDoc.update(data);
            if (!self.isQuotaExhausted) {
              try {
                await fbDoc.update(data);
              } catch (err: any) {
                if (isFirestoreQuotaExceeded(err)) {
                  self.markQuotaExhausted(err.message);
                } else {
                  // If document didn't exist in Firestore yet, set full merged doc
                  const merged = await sqliteDoc.get();
                  if (merged.exists) {
                    await fbDoc.set(merged.data()).catch(() => {});
                  }
                }
              }
            }
          },

          async delete() {
            await sqliteDoc.delete();
            if (!self.isQuotaExhausted) {
              try {
                await fbDoc.delete();
              } catch (err: any) {
                if (isFirestoreQuotaExceeded(err)) self.markQuotaExhausted(err.message);
              }
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
          if (snap && snap.docs && snap.docs.length > 0) {
            for (const doc of snap.docs) {
              sqliteCol.doc(doc.id).set(doc.data()).catch(() => {});
            }
            return snap;
          }
          // If Firestore collection is empty, check if SQLite has local records (e.g. shop_topics saved while offline) and sync them up
          const localSnap = await sqliteCol.get();
          if (localSnap && localSnap.docs && localSnap.docs.length > 0) {
            for (const doc of localSnap.docs) {
              fbCol.doc(doc.id).set(doc.data()).catch(() => {});
            }
            return localSnap;
          }
          return snap;
        } catch (err: any) {
          if (isFirestoreQuotaExceeded(err)) {
            self.markQuotaExhausted(err.message);
            return sqliteCol.get();
          }
          return sqliteCol.get();
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
          return sqliteQuery.get();
        }
      }
    };
  }

  batch() {
    return this.sqlite.batch();
  }
}

export const db = new HybridDatabase();

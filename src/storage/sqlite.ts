import Database from 'better-sqlite3';
import type { Database as DatabaseType, RunResult } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import path from 'path';
import { mkdir } from 'fs/promises';
import os from 'os';
import { Logger } from '../utils/logger.js';
import type {
  ProcessingStatus,
  RawContentRecord
} from './models.js';

type ProcessingStage = 'summary' | 'keywords' | 'topics';

type RawContentRow = {
  id: string;
  source: string;
  account: string;
  title: string;
  content: string;
  publish_date: string;
  topics_status: ProcessingStatus;  
};

interface ChannelMetadata {
  accountName: string;
  source: string;
  channelId: string;
  channelTitle?: string;
  subscriberCount?: number;
  resolvedAt: Date;
  lastChecked: Date;
}

const logger = new Logger('Storage');

export class SQLiteStorage {
  private db: DatabaseType | null = null;
  private dbPath: string;

  constructor(fileName: string) {
    const homeDir = os.homedir();
    const appDir = path.join(homeDir, '.contextify');
    this.dbPath = path.join(appDir, fileName);
  }

  async initialize(): Promise<void> {
    try {
      const appDir = path.dirname(this.dbPath);
      await mkdir(appDir, { recursive: true });

      this.db = new Database(this.dbPath);
      this.db.pragma('foreign_keys = ON');

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS raw_content (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          account TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          publish_date DATETIME NOT NULL,
          topics_status TEXT NOT NULL DEFAULT 'pending' CHECK (topics_status IN ('pending','processing','done','error'))
        );

        CREATE TABLE IF NOT EXISTS topics (
          id INTEGER PRIMARY KEY,
          raw_content_id TEXT NOT NULL,
          name TEXT NOT NULL,
          content TEXT NOT NULL,
          keywords TEXT NOT NULL DEFAULT '',
          generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          generated_by_model TEXT,
          FOREIGN KEY (raw_content_id) REFERENCES raw_content (id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_raw_content_publish_date ON raw_content (publish_date);
        CREATE INDEX IF NOT EXISTS idx_topics_name ON topics (name);

        CREATE TABLE IF NOT EXISTS channel_metadata (
          account_name TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          channel_title TEXT,
          subscriber_count INTEGER,
          resolved_at DATETIME NOT NULL,
          last_checked DATETIME NOT NULL
        );
      `);

      this.resetInFlightRawContent();

      logger.info(`SQLite database initialized at ${this.dbPath}`);
    } catch (error) {
      logger.error('Failed to initialize SQLite database:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.info('SQLite database connection closed');
    }
  }

  insertRawContent(item: {
    id: string;
    source: string;
    account: string;
    title: string;
    content: string;
    publishDate: Date;
  }): void {
    const query = `
      INSERT INTO raw_content
        (id, source, account, title, content, publish_date)
      VALUES
        (@id, @source, @account, @title, @content, @publishDate)
      ON CONFLICT(id) DO UPDATE SET
        source = excluded.source,
        account = excluded.account,
        title = excluded.title,
        content = excluded.content,
        publish_date = excluded.publish_date
    `;

    this.runQuery(query, {
      id: item.id,
      source: item.source,
      account: item.account,
      title: item.title,
      content: item.content,
      publishDate: item.publishDate.toISOString()
    });
  }

  isFetched(id: string): boolean {
    const result = this.getQuery<{ count: number }>(
      `SELECT COUNT(1) as count FROM raw_content WHERE id = ?`,
      [id]
    );

    return result?.count ? result.count > 0 : false;
  }

  getLastFetchDate(source: string, account: string): Date | null {
    const result = this.getQuery<{ last_date: string | null }>(
      `SELECT MAX(publish_date) as last_date FROM raw_content WHERE source = ? AND account = ?`,
      [source, account]
    );

    return result?.last_date ? new Date(result.last_date) : null;
  }

  claimRawContentForTopics(): RawContentRecord | null {
    const database = this.ensureDb();
    const begin = database.prepare('BEGIN IMMEDIATE');
    const commit = database.prepare('COMMIT');
    const rollback = database.prepare('ROLLBACK');

    try {
      begin.run();
      const row = database
        .prepare(`
          SELECT * FROM raw_content
          WHERE topics_status = 'pending'
          ORDER BY publish_date ASC
          LIMIT 1
        `)
        .get() as RawContentRow | undefined;

      if (!row) {
        commit.run();
        return null;
      }

      database
        .prepare(`
          UPDATE raw_content
          SET topics_status = 'processing'
          WHERE id = ?
        `)
        .run(row.id);

      commit.run();
      const updatedRow: RawContentRow = { ...row, topics_status: 'processing' };
      return this.mapRawRow(updatedRow);
    } catch (error) {
      rollback.run();
      throw error;
    }
  }

  replaceTopics(
    rawContentId: string,
    topics: Array<{ name: string; content: string; keywords: string; generatedAt?: Date | string, generatedByModel: string }>
  ): void {
    const database = this.ensureDb();

    const deleteStmt = database.prepare(`DELETE FROM topics WHERE raw_content_id = ?`);
    const insertStmt = database.prepare(`
      INSERT INTO topics (raw_content_id, name, content, keywords, generated_at, generated_by_model)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const transaction = database.transaction(() => {
      deleteStmt.run(rawContentId);
      for (const topic of topics) {
        const generatedAt = topic.generatedAt instanceof Date
          ? topic.generatedAt.toISOString()
          : topic.generatedAt || new Date().toISOString();

        insertStmt.run(rawContentId, topic.name, topic.content, topic.keywords, generatedAt, topic.generatedByModel);
      }
    });

    transaction();
  }

  setStageStatus(rawContentId: string, stage: ProcessingStage, status: ProcessingStatus): void {
    const column = this.stageColumn(stage);
    this.runQuery(
      `
        UPDATE raw_content
        SET ${column} = ?
        WHERE id = ?
      `,
      [status, rawContentId]
    );
  }

  getCachedChannelId(source: string, accountName: string): string | null {
    const result = this.getQuery<{ channel_id: string }>(
      `SELECT channel_id FROM channel_metadata WHERE source = ? AND account_name = ?`,
      [source, accountName]
    );

    return result?.channel_id || null;
  }

  storeChannelMetadata(metadata: ChannelMetadata): void {
    this.runQuery(
      `
        INSERT OR REPLACE INTO channel_metadata
          (account_name, source, channel_id, channel_title, subscriber_count, resolved_at, last_checked)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        metadata.accountName,
        metadata.source,
        metadata.channelId,
        metadata.channelTitle || null,
        metadata.subscriberCount || null,
        metadata.resolvedAt.toISOString(),
        metadata.lastChecked.toISOString()
      ]
    );

    logger.debug(`Cached channel metadata for ${metadata.source}:${metadata.accountName}`);
  }

  updateChannelLastChecked(source: string, accountName: string): void {
    this.runQuery(
      `
        UPDATE channel_metadata
        SET last_checked = ?
        WHERE source = ? AND account_name = ?
      `,
      [new Date().toISOString(), source, accountName]
    );
  }

  getTopicsByDateRange(days: number, accountFilter?: string): Array<{
    topicId: number;
    topicName: string;
    account: string;
    source: string;
    publishDate: Date;
    subscriberCount: number | null;
  }> {
    const windowStart = new Date(Date.now() - Math.max(days, 1) * 24 * 60 * 60 * 1000);
    const normalizedAccount = accountFilter ? accountFilter.replace(/^@+/, '').toLowerCase() : null;

    let query = `
        SELECT
          t.id AS topic_id,
          t.name AS topic_name,
          rc.account,
          rc.source,
          rc.publish_date,
          cm.subscriber_count
        FROM topics t
        INNER JOIN raw_content rc ON rc.id = t.raw_content_id
        LEFT JOIN channel_metadata cm
          ON cm.account_name = rc.account AND cm.source = rc.source
        WHERE rc.publish_date >= ?
      `;

    const params: unknown[] = [windowStart.toISOString()];

    if (normalizedAccount) {
      query += `
        AND LOWER(ltrim(rc.account, '@')) = ?
      `;
      params.push(normalizedAccount);
    }

    query += `
        ORDER BY rc.publish_date DESC, t.generated_at DESC
      `;

    const rows = this.allQuery<{
      topic_id: number;
      topic_name: string;
      account: string;
      source: string;
      publish_date: string;
      channel_title: string | null;
      subscriber_count: number | null;
    }>(query, params);

    return rows.map(row => ({
      topicId: row.topic_id,
      topicName: row.topic_name,
      account: row.account,
      source: row.source,
      publishDate: new Date(row.publish_date),
      subscriberCount: row.subscriber_count ?? null
    }));
  }

  getTopicsByIds(topicIds: number[]): Array<{
    topicId: number;
    topicTitle: string;
    content: string;
    account: string;
    source: string;
    publishDate: Date;
    subscriberCount: number | null;
  }> {
    if (topicIds.length === 0) {
      return [];
    }

    const database = this.ensureDb();
    const placeholders = topicIds.map(() => '?').join(',');
    const statement = database.prepare(
      `
        SELECT
          t.id AS topic_id,
          t.name AS topic_title,
          t.content,
          rc.account,
          rc.source,
          rc.publish_date,
          cm.subscriber_count
        FROM topics t
        INNER JOIN raw_content rc ON rc.id = t.raw_content_id
        LEFT JOIN channel_metadata cm
          ON cm.account_name = rc.account AND cm.source = rc.source
        WHERE t.id IN (${placeholders})
      `
    );

    const rows = statement.all(...topicIds) as Array<{
      topic_id: number;
      topic_title: string;
      content: string;
      account: string;
      source: string;
      publish_date: string;
      subscriber_count: number | null;
    }>;

    return rows.map(row => ({
      topicId: row.topic_id,
      topicTitle: row.topic_title,
      content: row.content,
      account: row.account,
      source: row.source,
      publishDate: new Date(row.publish_date),
      subscriberCount: row.subscriber_count ?? null
    }));
  }

  private resetInFlightRawContent(): void {
    const database = this.ensureDb();
    const { changes } = database
      .prepare(
        `
          UPDATE raw_content
          SET topics_status = 'pending'
          WHERE topics_status IN ('processing','error')
        `
      )
      .run();

    if (changes && changes > 0) {
      logger.info(`Reset ${changes} raw_content rows to pending`);
    }
  }
  private ensureDb(): DatabaseType {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  private runQuery(sql: string, params: Record<string, unknown> | unknown[] = []): RunResult {
    const database = this.ensureDb();
    const statement = database.prepare(sql);
    if (Array.isArray(params)) {
      return statement.run(...params);
    }
    return statement.run(params);
  }

  private getQuery<T>(sql: string, params: unknown[] = []): T | undefined {
    const database = this.ensureDb();
    return database.prepare(sql).get(...params) as T | undefined;
  }

  private allQuery<T>(sql: string, params: unknown[] = []): T[] {
    const database = this.ensureDb();
    return database.prepare(sql).all(...params) as T[];
  }

  private mapRawRow(row: RawContentRow): RawContentRecord {
    return {
      id: row.id,
      source: row.source,
      account: row.account,
      title: row.title,
      content: row.content,
      publishDate: new Date(row.publish_date),      
      topicsStatus: row.topics_status
    };
  }

  private stageColumn(stage: ProcessingStage): string {
    switch (stage) {
      case 'summary':
        return 'summary_status';
      case 'keywords':
        return 'keywords_status';
      case 'topics':
        return 'topics_status';
      default:
        throw new Error(`Unsupported processing stage: ${stage as string}`);
    }
  }
}

// Native (expo-sqlite) schema initialisation. The web build has its own
// localStorage-backed module with separate tests in database.web.test.ts.

type FakeDatabase = {
  statements: string[];
  userVersion: number;
  execAsync: jest.Mock;
  getFirstAsync: jest.Mock;
};

function makeFakeDatabase(userVersion: number): FakeDatabase {
  const db: FakeDatabase = {
    statements: [],
    userVersion,
    execAsync: jest.fn(async (sql: string) => {
      db.statements.push(sql);
      const match = /PRAGMA user_version = (\d+)/.exec(sql);
      if (match) db.userVersion = Number(match[1]);
    }),
    getFirstAsync: jest.fn(async (sql: string) =>
      sql === "PRAGMA user_version" ? { user_version: db.userVersion } : null
    ),
  };
  return db;
}

async function openWith(
  db: FakeDatabase
): Promise<typeof import("./database")> {
  let mod: typeof import("./database") | undefined;
  jest.isolateModules(() => {
    jest.doMock("expo-sqlite", () => ({
      openDatabaseAsync: jest.fn(async () => db),
    }));
    mod = require("./database");
  });
  await mod!.getDatabase();
  return mod!;
}

const isMigration = (sql: string) =>
  /ALTER TABLE|CREATE TABLE|CREATE INDEX/.test(sql);

describe("getDatabase schema initialisation", () => {
  afterEach(() => {
    jest.resetModules();
  });

  it("runs every migration on a fresh install and records the schema version", async () => {
    // Arrange
    const db = makeFakeDatabase(0);

    // Act
    const { SCHEMA_VERSION } = await openWith(db);

    // Assert
    expect(
      db.statements.some((sql) => /CREATE TABLE IF NOT EXISTS items/.test(sql))
    ).toBe(true);
    expect(
      db.statements.some((sql) => /ALTER TABLE feeds ADD COLUMN/.test(sql))
    ).toBe(true);
    expect(db.userVersion).toBe(SCHEMA_VERSION);
  });

  it("skips the migration chain entirely once the database is current", async () => {
    // Arrange — an install that has already been migrated.
    const { SCHEMA_VERSION } = await openWith(makeFakeDatabase(0));
    jest.resetModules();
    const db = makeFakeDatabase(SCHEMA_VERSION);

    // Act
    await openWith(db);

    // Assert
    expect(db.statements.filter(isMigration)).toEqual([]);
    expect(db.statements).not.toContain(
      `PRAGMA user_version = ${SCHEMA_VERSION}`
    );
  });

  it("still discards interrupted view-time sessions on every launch", async () => {
    // Arrange
    const { SCHEMA_VERSION } = await openWith(makeFakeDatabase(0));
    jest.resetModules();
    const db = makeFakeDatabase(SCHEMA_VERSION);

    // Act
    await openWith(db);

    // Assert
    expect(db.statements).toContain(
      "DELETE FROM item_view_times WHERE view_end_at IS NULL"
    );
  });

  it("applies connection PRAGMAs before anything else, migrated or not", async () => {
    // Arrange
    const db = makeFakeDatabase(0);

    // Act
    await openWith(db);

    // Assert
    expect(db.statements.slice(0, 3)).toEqual([
      "PRAGMA journal_mode = WAL",
      "PRAGMA busy_timeout = 5000",
      "PRAGMA foreign_keys = ON",
    ]);
  });
});

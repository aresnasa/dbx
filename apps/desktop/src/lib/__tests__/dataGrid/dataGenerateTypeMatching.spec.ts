import { describe, expect, it } from "vitest";
import { columnTypeFamily, defaultGeneratorParams, ensureJsonText, findGeneratorKey, formatGeneratedValue, generateJsonValue, generateTableData, isInsertableTableType } from "@/lib/dataGrid/dataGenerate";

describe("columnTypeFamily — 数据库感知的列类型匹配", () => {
  it("PostgreSQL 家族类型", () => {
    expect(columnTypeFamily("int4", "postgres")).toBe("integer");
    expect(columnTypeFamily("int8", "postgres")).toBe("integer");
    expect(columnTypeFamily("numeric(10,2)", "postgres")).toBe("decimal");
    expect(columnTypeFamily("float8", "postgres")).toBe("decimal");
    expect(columnTypeFamily("bool", "postgres")).toBe("boolean");
    expect(columnTypeFamily("varchar(255)", "postgres")).toBe("text");
    expect(columnTypeFamily("timestamptz", "postgres")).toBe("datetime");
    expect(columnTypeFamily("date", "postgres")).toBe("date");
    expect(columnTypeFamily("bytea", "postgres")).toBe("binary");
    expect(columnTypeFamily("uuid", "postgres")).toBe("uuid");
    expect(columnTypeFamily("jsonb", "postgres")).toBe("json");
  });

  it("TDengine 的 BINARY/NCHAR 是字符串而不是二进制", () => {
    expect(columnTypeFamily("BINARY(64)", "tdengine")).toBe("text");
    expect(columnTypeFamily("NCHAR(32)", "tdengine")).toBe("text");
    expect(columnTypeFamily("TIMESTAMP", "tdengine")).toBe("datetime");
    expect(columnTypeFamily("BOOL", "tdengine")).toBe("boolean");
  });

  it("MySQL 家族的 BINARY 是二进制", () => {
    expect(columnTypeFamily("varbinary(128)", "mysql")).toBe("binary");
    expect(columnTypeFamily("blob", "mysql")).toBe("binary");
    expect(columnTypeFamily("enum('a','b')", "mysql")).toBe("enum");
    expect(columnTypeFamily("timestamp", "mysql")).toBe("datetime");
  });

  it("Oracle 家族：DATE 含时间、NUMBER 是小数、RAW 是二进制", () => {
    expect(columnTypeFamily("DATE", "oracle")).toBe("datetime");
    expect(columnTypeFamily("NUMBER(10,2)", "oracle")).toBe("decimal");
    expect(columnTypeFamily("NUMBER", "oracle")).toBe("decimal");
    expect(columnTypeFamily("VARCHAR2(100)", "oracle")).toBe("text");
    expect(columnTypeFamily("CLOB", "oracle")).toBe("text");
    expect(columnTypeFamily("RAW(16)", "oracle")).toBe("binary");
  });

  it("SQL Server 的 bit 是布尔、uniqueidentifier 是 UUID", () => {
    expect(columnTypeFamily("bit", "sqlserver")).toBe("boolean");
    expect(columnTypeFamily("uniqueidentifier", "sqlserver")).toBe("uuid");
    expect(columnTypeFamily("datetime2", "sqlserver")).toBe("datetime");
    expect(columnTypeFamily("nvarchar(50)", "sqlserver")).toBe("text");
  });

  it("未知数据库走通用匹配", () => {
    expect(columnTypeFamily("bigint unsigned", undefined)).toBe("integer");
    expect(columnTypeFamily("double precision", undefined)).toBe("decimal");
    expect(columnTypeFamily("text", undefined)).toBe("text");
  });
});

describe("findGeneratorKey — 先匹配类型再匹配列名", () => {
  it("自增列始终是序列", () => {
    expect(findGeneratorKey("id", "bigint", true)).toBe("sequence");
  });

  it("schema 枚举值优先于一切", () => {
    expect(findGeneratorKey("status", "enum", false, "mysql", ["pending", "paid"])).toBe("enum");
    expect(findGeneratorKey("anything", "varchar(20)", false, "mysql", ["x", "y"])).toBe("enum");
  });

  it("布尔列使用枚举生成器", () => {
    expect(findGeneratorKey("enabled", "bool", false, "postgres")).toBe("enum");
    expect(findGeneratorKey("flag", "bit", false, "sqlserver")).toBe("enum");
  });

  it("时间/UUID 列由类型决定", () => {
    expect(findGeneratorKey("created_at", "timestamp", false, "mysql")).toBe("datetime");
    expect(findGeneratorKey("created_at", "date", false, "mysql")).toBe("date");
    expect(findGeneratorKey("session_token", "uuid", false, "postgres")).toBe("uuid");
  });

  it("数值列：status/布尔语义列名走枚举，其余走数字", () => {
    expect(findGeneratorKey("order_status", "int", false, "mysql")).toBe("enum");
    expect(findGeneratorKey("is_deleted", "int", false, "mysql")).toBe("enum");
    expect(findGeneratorKey("price", "NUMBER(10,2)", false, "oracle")).toBe("number");
  });

  it("TDengine BINARY 列名匹配内容类模式时仍是文本", () => {
    expect(findGeneratorKey("content", "BINARY(128)", false, "tdengine")).toBe("text");
  });

  it("二进制列使用图像/二进制生成器", () => {
    expect(findGeneratorKey("avatar", "varbinary(255)", false, "mysql")).toBe("image");
    expect(findGeneratorKey("data", "bytea", false, "postgres")).toBe("image");
  });

  it("JSON 列由类型决定，不受列名启发式影响", () => {
    expect(findGeneratorKey("data", "json", false, "postgres")).toBe("json");
    expect(findGeneratorKey("content", "jsonb", false, "postgres")).toBe("json");
    expect(findGeneratorKey("email", "json", false, "mysql")).toBe("json");
  });

  it("文本列回落到列名模式", () => {
    expect(findGeneratorKey("email", "varchar(100)", false, "mysql")).toBe("email");
    expect(findGeneratorKey("user_name", "varchar(50)", false, "mysql")).toBe("full_name");
  });
});

describe("isInsertableTableType — 表类型门控", () => {
  it("视图不可导入", () => {
    expect(isInsertableTableType("VIEW")).toBe(false);
    expect(isInsertableTableType("MATERIALIZED_VIEW")).toBe(false);
    expect(isInsertableTableType("SYSTEM VIEW")).toBe(false);
  });

  it("表/超级表/未知类型可导入", () => {
    expect(isInsertableTableType("TABLE")).toBe(true);
    expect(isInsertableTableType("BASE TABLE")).toBe(true);
    expect(isInsertableTableType("STABLE")).toBe(true);
    expect(isInsertableTableType("FOREIGN TABLE")).toBe(true);
    expect(isInsertableTableType(undefined)).toBe(true);
    expect(isInsertableTableType("")).toBe(true);
  });
});

describe("defaultGeneratorParams — 根据类型的默认参数", () => {
  it("schema 枚举值成为默认枚举选项", () => {
    const params = defaultGeneratorParams("status", { dataType: "enum", enumValues: ["pending", "paid", "failed"] }, "enum", "mysql");
    expect(params.values).toBe("pending\npaid\nfailed");
  });

  it("PG 布尔列默认 true/false，MySQL 数值布尔默认 0/1", () => {
    const pg = defaultGeneratorParams("enabled", { dataType: "bool" }, "enum", "postgres");
    expect(pg.values).toBe("true\nfalse");
    const mysql = defaultGeneratorParams("enabled", { dataType: "tinyint" }, "enum", "mysql");
    expect(mysql.values).toBe("0\n1");
  });

  it("Oracle NUMBER 默认为小数生成", () => {
    const params = defaultGeneratorParams("amount", { dataType: "NUMBER", numericPrecision: 10, numericScale: 2 }, "number", "oracle");
    expect(params.numberType).toBe("decimal");
    expect(params.decimalPlaces).toBe(2);
  });
});

describe("formatGeneratedValue — 按数据库类型渲染布尔字面量", () => {
  it("PG 家族布尔输出 TRUE/FALSE 关键字", () => {
    expect(formatGeneratedValue(true, "postgres", "bool")).toBe("TRUE");
    expect(formatGeneratedValue(false, "postgres", "bool")).toBe("FALSE");
    expect(formatGeneratedValue("true", "postgres", "boolean")).toBe("TRUE");
    expect(formatGeneratedValue("0", "postgres", "bool")).toBe("FALSE");
  });

  it("MySQL tinyint 布尔输出 0/1（字符串值保留引号，MySQL 可隐式转换）", () => {
    expect(formatGeneratedValue(true, "mysql", "tinyint")).toBe("1");
    expect(formatGeneratedValue("1", "mysql", "tinyint")).toBe("'1'");
  });

  it("非布尔列不受布尔格式影响", () => {
    expect(formatGeneratedValue("true", "mysql", "varchar(10)")).toBe("'true'");
    expect(formatGeneratedValue(1, "postgres", "int4")).toBe("1");
  });

  it("JSON 列：合法 JSON 原样输出，其他值包装为 JSON 字符串", () => {
    expect(formatGeneratedValue('{"a": 1}', "postgres", "json")).toBe(`'{"a": 1}'`);
    expect(formatGeneratedValue("[1, 2]", "postgres", "jsonb")).toBe(`'[1, 2]'`);
    expect(formatGeneratedValue("The quick brown fox", "postgres", "json")).toBe(`'"The quick brown fox"'`);
    expect(formatGeneratedValue("it's", "mysql", "json")).toBe(`'"it''s"'`);
    expect(formatGeneratedValue(42, "postgres", "json")).toBe("'42'");
    expect(formatGeneratedValue(true, "postgres", "jsonb")).toBe("'true'");
    expect(formatGeneratedValue(null, "postgres", "json")).toBe("NULL");
  });
});

describe("generateJsonValue / ensureJsonText — JSON 生成器", () => {
  it("生成的对象/数组都是合法 JSON", () => {
    for (let i = 0; i < 20; i++) {
      expect(() => JSON.parse(generateJsonValue("object", i))).not.toThrow();
      expect(Array.isArray(JSON.parse(generateJsonValue("array", i)))).toBe(true);
      expect(() => JSON.parse(generateJsonValue("mixed", i))).not.toThrow();
    }
    expect(typeof JSON.parse(generateJsonValue(undefined, 0))).toBe("object");
  });

  it("ensureJsonText 保留合法 JSON，包装非法文本", () => {
    expect(ensureJsonText('  {"k": "v"} ')).toBe('{"k": "v"}');
    expect(ensureJsonText("plain")).toBe('"plain"');
    expect(ensureJsonText("")).toBe('""');
    expect(ensureJsonText(3.5)).toBe("3.5");
  });
});

describe("generateTableData — 按类型生成数据与 SQL", () => {
  it("二进制列按数据库方言生成十六进制字面量", () => {
    const config = {
      tableName: "t",
      schema: "",
      database: "db",
      rowCount: 1,
      columns: [{ columnName: "payload", dataType: "varbinary(16)", rowCount: 1, generatorKey: "image" }],
    };
    const mysql = generateTableData(config, "mysql");
    expect(mysql.statements[0]).toMatch(/0x[0-9a-f]{32}/);
    const pg = generateTableData(config, "postgres");
    expect(pg.statements[0]).toMatch(/'\\x[0-9a-f]{32}'/);
    const oracle = generateTableData(config, "oracle");
    expect(oracle.statements[0]).toMatch(/HEXTORAW\('[0-9a-f]{32}'\)/);
  });

  it("PG 布尔列生成 TRUE/FALSE", () => {
    const config = {
      tableName: "t",
      schema: "public",
      database: "db",
      rowCount: 2,
      columns: [{ columnName: "enabled", dataType: "bool", rowCount: 2, generatorKey: "enum", generatorParams: { values: "true\nfalse" } }],
    };
    const result = generateTableData(config, "postgres");
    expect(result.statements[0]).toMatch(/(TRUE|FALSE)/);
    expect(result.statements[0]).not.toMatch(/'(true|false)'/);
  });

  it("PG json 列默认生成合法 JSON 字面量", () => {
    const config = {
      tableName: "test",
      schema: "public",
      database: "db",
      rowCount: 5,
      columns: [
        { columnName: "id", dataType: "character varying(255)", rowCount: 5 },
        { columnName: "data", dataType: "json", rowCount: 5 },
      ],
    };
    const result = generateTableData(config, "postgres");
    for (const row of result.rows) {
      expect(() => JSON.parse(String(row[1]))).not.toThrow();
    }
    // Even when a text generator is forced onto the json column the literal stays valid JSON.
    const forced = generateTableData({ ...config, columns: [{ columnName: "data", dataType: "json", rowCount: 5, generatorKey: "text" }] }, "postgres");
    const literals = forced.statements[0].match(/\('(.*)'\)/g) ?? [];
    expect(literals.length).toBe(5);
    for (const literal of literals) {
      const inner = literal.slice(2, -2).replace(/''/g, "'");
      expect(() => JSON.parse(inner)).not.toThrow();
    }
  });

  it("返回列类型以便后续格式化", () => {
    const config = {
      tableName: "t",
      schema: "",
      database: "db",
      rowCount: 1,
      columns: [
        { columnName: "a", dataType: "int4", rowCount: 1 },
        { columnName: "b", dataType: "text", rowCount: 1 },
      ],
    };
    const result = generateTableData(config, "postgres");
    expect(result.columnTypes).toEqual(["int4", "text"]);
    expect(result.columns).toEqual(["a", "b"]);
  });
});

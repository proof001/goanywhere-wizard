import { useState, useCallback, useRef } from "react";

const STEPS = [
  { id: "project", label: "Project", icon: "📋" },
  { id: "source", label: "Source", icon: "📁" },
  { id: "snowflake", label: "Snowflake", icon: "❄️" },
  { id: "columns", label: "Columns", icon: "🔀" },
  { id: "options", label: "Options", icon: "⚙️" },
  { id: "review", label: "Review", icon: "✅" },
];

const SF_TYPES = [
  "VARCHAR", "NUMBER", "INTEGER", "FLOAT", "BOOLEAN",
  "DATE", "TIMESTAMP", "TIMESTAMP_NTZ", "TIMESTAMP_LTZ", "VARIANT",
];

const INSERT_MODES = [
  { value: "INSERT", label: "INSERT — Append rows" },
  { value: "TRUNCATE_INSERT", label: "TRUNCATE + INSERT — Clear table first" },
];

const DELIMITERS = [
  { value: "comma", label: "Comma ( , )" },
  { value: "pipe", label: "Pipe ( | )" },
  { value: "tab", label: "Tab" },
  { value: "semicolon", label: "Semicolon ( ; )" },
];

const TEXT_QUALIFIERS = [
  { value: "doubleQuote", label: 'Double Quote ( " )' },
  { value: "singleQuote", label: "Single Quote ( ' )" },
  { value: "tilde", label: "Tilde ( ~ )" },
  { value: "none", label: "None" },
];

const RECORD_DELIMITERS = [
  { value: "CRLF", label: "CRLF (Windows)" },
  { value: "LF", label: "LF (Unix/Mac)" },
  { value: "CR", label: "CR (Legacy Mac)" },
];

const LOG_LEVELS = [
  { value: "verbose", label: "Verbose" },
  { value: "normal", label: "Normal" },
  { value: "minimal", label: "Minimal" },
];

function generateXML(cfg) {
  const esc = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

  const projName = esc(cfg.project.name);
  const sfFull = esc(cfg.snowflake.database) + "." + esc(cfg.snowflake.schema) + "." + esc(cfg.snowflake.table);

  const colIndexXML = cfg.columns
    .map((c, i) => '\t\t\t\t\t<column index="' + (i + 1) + '" name="' + esc(c.csvName) + '" />')
    .join("\n");

  const placeholders = cfg.columns.map(() => "?").join(",");

  const hasDate = cfg.columns.some((c) => c.type === "DATE");
  const hasTimestamp = cfg.columns.some((c) => c.type.startsWith("TIMESTAMP"));
  const dateFormat = cfg.columns.find((c) => c.type === "DATE");
  const tsFormat = cfg.columns.find((c) => c.type.startsWith("TIMESTAMP"));
  const dateFmt = dateFormat ? dateFormat.format || "MM/DD/YYYY" : "MM/DD/YYYY";
  const tsFmt = tsFormat ? tsFormat.format || "yyyy-MM-dd HH:mm:ss" : "yyyy-MM-dd HH:mm:ss";

  const extraColXML = cfg.options.addFilenameColumn
    ? '\n\t\t\t<modifyRowSet inputRowSetVariable="${varRowSet}" outputRowSetVariable="varRowSet" version="1.0">\n\t\t\t\t<newColumn index="1" value="${Current_File:name}" />\n\t\t\t</modifyRowSet>'
    : "";

  const finalPlaceholders = cfg.options.addFilenameColumn ? "?," + placeholders : placeholders;

  const clearTableModule =
    cfg.snowflake.insertMode === "TRUNCATE_INSERT"
      ? '\n\t<module name="Clear Table">\n\t\t<sql label="Clear Records" resourceId="' + esc(cfg.snowflake.resource) + '" version="1.0">\n\t\t\t<query createScrollableRowSet="false">\n\t\t\t\t<statement>TRUNCATE TABLE ' + sfFull + '\n\t</statement>\n\t\t\t</query>\n\t\t</sql>\n\t</module>'
      : "";

  const clearTableCall =
    cfg.snowflake.insertMode === "TRUNCATE_INSERT"
      ? '\n\t\t<callModule label="Call Clear Table" module="Clear Table" version="1.0" />'
      : "";

  var dataAttrs = ' trim="' + esc(cfg.options.trimMode) + '"';
  if (hasDate) dataAttrs += ' dateFormat="' + esc(dateFmt) + '"';
  if (hasTimestamp) dataAttrs += ' timestampFormat="' + esc(tsFmt) + '"';

  return '<project name="' + projName + '" mainModule="Main" version="2.0" logLevel="' + cfg.options.logLevel + '">\n' +
'\t<module name="Main">\n' +
'\t\t<setVariable name="Date" value="${CurrentDate()}" version="2.0" />\n' +
'\t\t<callModule label="Call Get Source File" module="Get Source File" version="1.0" />' + clearTableCall + '\n' +
'\t\t<callModule label="Call Load Data" module="Load Data" version="1.0" />\n' +
'\t\t<callModule label="Call Archive File" module="Archive File" version="1.0" />\n' +
'\t</module>\n' +
'\t<module name="Get Source File">\n' +
'\t\t<createFileList fileListVariable="varFileList" numFilesFoundVariable="varFileCount" version="1.0">\n' +
'\t\t\t<fileset dir="' + esc(cfg.source.path) + '">\n' +
'\t\t\t\t<wildcardFilter>\n' +
'\t\t\t\t\t<include pattern="' + esc(cfg.source.filename) + '" />\n' +
'\t\t\t\t</wildcardFilter>\n' +
'\t\t\t</fileset>\n' +
'\t\t</createFileList>\n' +
'\t</module>' + clearTableModule + '\n' +
'\t<module name="Load Data">\n' +
'\t\t<forEachLoop itemsVariable="${varFileList}" currentItemVariable="Current_File">\n' +
'\t\t\t<readCSV inputFile="${Current_File}" outputRowSetVariable="varRowSet" fieldDelimiter="' + esc(cfg.source.delimiter) + '" skipInvalidRecords="' + (cfg.options.skipInvalidRecords ? "true" : "false") + '" skipFirstRow="' + (cfg.source.hasHeader ? "true" : "false") + '" recordDelimiter="' + esc(cfg.source.recordDelimiter) + '" textQualifier="' + esc(cfg.source.textQualifier) + '" version="1.0">\n' +
'\t\t\t\t<data' + dataAttrs + '>\n' +
colIndexXML + '\n' +
'\t\t\t\t</data>\n' +
'\t\t\t</readCSV>' + extraColXML + '\n' +
'\t\t\t<countRowSet rowsetVariable="${varRowSet}" rowCountVariable="varRowCount" version="1.0" />\n' +
'\t\t\t<sql label="Insert Records" resourceId="' + esc(cfg.snowflake.resource) + '" version="1.0">\n' +
'\t\t\t\t<query inputRowSetVariable="${varRowSet}" createScrollableRowSet="false" batchSize="' + cfg.options.batchSize + '">\n' +
'\t\t\t\t\t<statement>INSERT INTO ' + sfFull + '\n' +
'\tVALUES (' + finalPlaceholders + ')</statement>\n' +
'\t\t\t\t</query>\n' +
'\t\t\t</sql>\n' +
'\t\t</forEachLoop>\n' +
'\t</module>\n' +
'\t<module name="Archive File">\n' +
'\t\t<move sourceFilesVariable="${varFileList}" destDir="' + esc(cfg.source.archivePath) + '" prefix="Processed_${Date}_" version="1.0" />\n' +
'\t</module>\n' +
'</project>';
}

function Field({ label, required, children, hint }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--label)", marginBottom: 5, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {label} {required && <span style={{ color: "#e05252" }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function Input({ value, onChange, placeholder, ...rest }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%", padding: "9px 12px", fontSize: 14,
        border: "1.5px solid var(--border)", borderRadius: 7,
        background: "var(--input-bg)", color: "var(--fg)",
        outline: "none", transition: "border-color .15s", boxSizing: "border-box",
      }}
      onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
      onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
      {...rest}
    />
  );
}

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%", padding: "9px 12px", fontSize: 14,
        border: "1.5px solid var(--border)", borderRadius: 7,
        background: "var(--input-bg)", color: "var(--fg)",
        outline: "none", cursor: "pointer", boxSizing: "border-box",
      }}
    >
      {options.map((o) => (
        <option key={o.value || o} value={o.value || o}>{o.label || o}</option>
      ))}
    </select>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14 }}>
      <div onClick={() => onChange(!checked)}
        style={{
          width: 40, height: 22, borderRadius: 11,
          background: checked ? "var(--accent)" : "#555",
          position: "relative", transition: "background .2s", flexShrink: 0,
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: "50%", background: "#fff",
          position: "absolute", top: 2, left: checked ? 20 : 2,
          transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)",
        }} />
      </div>
      <span style={{ color: "var(--fg)" }}>{label}</span>
    </label>
  );
}

function Btn({ children, onClick, variant = "primary", disabled, style: s = {} }) {
  const base = {
    padding: "10px 22px", fontSize: 14, fontWeight: 600, borderRadius: 8,
    border: "none", cursor: disabled ? "not-allowed" : "pointer",
    transition: "all .15s", opacity: disabled ? 0.5 : 1, ...s,
  };
  const styles = variant === "primary"
    ? { ...base, background: "var(--accent)", color: "#fff" }
    : variant === "ghost"
    ? { ...base, background: "transparent", color: "var(--fg)", border: "1.5px solid var(--border)" }
    : { ...base, background: "#e05252", color: "#fff" };
  return <button style={styles} onClick={onClick} disabled={disabled}>{children}</button>;
}

function ProjectStep({ cfg, set }) {
  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 22, color: "var(--fg)" }}>Project Details</h2>
      <p style={{ margin: "0 0 24px", color: "#888", fontSize: 14 }}>Name your GoAnywhere project. This becomes the project name in Project Designer.</p>
      <Field label="Project Name" required hint='Appears as the project name attribute — e.g. "ECP Incident Data - SnowFlake Load"'>
        <Input value={cfg.name} onChange={(v) => set({ ...cfg, name: v })} placeholder="e.g. ECP Incident Data - SnowFlake Load" />
      </Field>
    </div>
  );
}

function SourceStep({ cfg, set }) {
  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 22, color: "var(--fg)" }}>CSV Source Configuration</h2>
      <p style={{ margin: "0 0 24px", color: "#888", fontSize: 14 }}>File location on the GoAnywhere server and CSV parsing settings.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Source Directory" required hint="createFileList fileset dir path">
          <Input value={cfg.path} onChange={(v) => set({ ...cfg, path: v })} placeholder="/home/mft-user/HelpSystems/GoAnywhere/userdata/SFTP/Inbound" />
        </Field>
        <Field label="Filename Pattern" required hint="wildcardFilter include pattern">
          <Input value={cfg.filename} onChange={(v) => set({ ...cfg, filename: v })} placeholder="*IncidentReport.csv" />
        </Field>
        <Field label="Archive Directory" required hint="move destDir — processed files go here">
          <Input value={cfg.archivePath} onChange={(v) => set({ ...cfg, archivePath: v })} placeholder="/mnt/efs/HelpSystems/GoAnywhere/userdata/SFTP/Archive" />
        </Field>
        <Field label="Field Delimiter">
          <Select value={cfg.delimiter} onChange={(v) => set({ ...cfg, delimiter: v })} options={DELIMITERS} />
        </Field>
        <Field label="Text Qualifier">
          <Select value={cfg.textQualifier} onChange={(v) => set({ ...cfg, textQualifier: v })} options={TEXT_QUALIFIERS} />
        </Field>
        <Field label="Record Delimiter">
          <Select value={cfg.recordDelimiter} onChange={(v) => set({ ...cfg, recordDelimiter: v })} options={RECORD_DELIMITERS} />
        </Field>
      </div>
      <div style={{ marginTop: 8 }}>
        <Toggle checked={cfg.hasHeader} onChange={(v) => set({ ...cfg, hasHeader: v })} label="Skip first row (skipFirstRow — CSV has header)" />
      </div>
    </div>
  );
}

function SnowflakeStep({ cfg, set }) {
  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 22, color: "var(--fg)" }}>Snowflake Target</h2>
      <p style={{ margin: "0 0 24px", color: "#888", fontSize: 14 }}>The resourceId must match a database resource configured in GoAnywhere under Resources.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Resource ID" required hint='GoAnywhere database resource name — used in sql resourceId=""'>
          <Input value={cfg.resource} onChange={(v) => set({ ...cfg, resource: v })} placeholder="Snowflake" />
        </Field>
        <Field label="Insert Mode">
          <Select value={cfg.insertMode} onChange={(v) => set({ ...cfg, insertMode: v })} options={INSERT_MODES} />
        </Field>
        <Field label="Database" required>
          <Input value={cfg.database} onChange={(v) => set({ ...cfg, database: v })} placeholder="DSL" />
        </Field>
        <Field label="Schema" required>
          <Input value={cfg.schema} onChange={(v) => set({ ...cfg, schema: v })} placeholder="ECP_INGEST" />
        </Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Table" required>
            <Input value={cfg.table} onChange={(v) => set({ ...cfg, table: v })} placeholder="INCIDENTS" />
          </Field>
        </div>
      </div>
      <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "rgba(78,168,222,0.08)", border: "1px solid rgba(78,168,222,0.2)", fontSize: 13, color: "var(--accent)" }}>
        INSERT INTO <strong>{cfg.database || "DB"}.{cfg.schema || "SCHEMA"}.{cfg.table || "TABLE"}</strong>
      </div>
    </div>
  );
}

/* Map Snowflake data types to our SF_TYPES list */
const SF_TYPE_MAP = {
  "TEXT": "VARCHAR", "STRING": "VARCHAR", "CHAR": "VARCHAR", "CHARACTER": "VARCHAR",
  "VARCHAR": "VARCHAR", "BINARY": "VARCHAR", "VARBINARY": "VARCHAR",
  "NUMBER": "NUMBER", "DECIMAL": "NUMBER", "NUMERIC": "NUMBER", "REAL": "FLOAT",
  "INT": "INTEGER", "INTEGER": "INTEGER", "BIGINT": "INTEGER", "SMALLINT": "INTEGER", "TINYINT": "INTEGER", "BYTEINT": "INTEGER",
  "FLOAT": "FLOAT", "FLOAT4": "FLOAT", "FLOAT8": "FLOAT", "DOUBLE": "FLOAT", "DOUBLE PRECISION": "FLOAT",
  "BOOLEAN": "BOOLEAN",
  "DATE": "DATE",
  "DATETIME": "TIMESTAMP", "TIMESTAMP": "TIMESTAMP", "TIME": "TIMESTAMP",
  "TIMESTAMP_NTZ": "TIMESTAMP_NTZ", "TIMESTAMP_LTZ": "TIMESTAMP_LTZ", "TIMESTAMP_TZ": "TIMESTAMP",
  "VARIANT": "VARIANT", "OBJECT": "VARIANT", "ARRAY": "VARIANT",
};

function normalizeType(raw) {
  const upper = String(raw).trim().toUpperCase();
  /* Handle types with precision like NUMBER(38,0) */
  const base = upper.replace(/\(.*\)/, "").trim();
  return SF_TYPE_MAP[base] || "VARCHAR";
}

function parseColumnCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length === 0) return [];

  /* Auto-detect delimiter: pipe or comma */
  const firstLine = lines[0];
  const delim = firstLine.includes("|") ? "|" : ",";

  /* Check if first line is a header */
  const firstCols = firstLine.split(delim).map((s) => s.trim().toUpperCase());
  const hasHeader = firstCols.includes("COLUMN_NAME") || firstCols.includes("DATA_TYPE") || firstCols.includes("NAME") || firstCols.includes("TYPE");
  const startIdx = hasHeader ? 1 : 0;

  const cols = [];
  for (let i = startIdx; i < lines.length; i++) {
    const parts = lines[i].split(delim).map((s) => s.trim());
    if (parts.length >= 2 && parts[0]) {
      cols.push({
        csvName: parts[0],
        type: normalizeType(parts[1]),
        format: "",
      });
    } else if (parts.length === 1 && parts[0]) {
      /* Name only, no type */
      cols.push({ csvName: parts[0], type: "VARCHAR", format: "" });
    }
  }
  return cols;
}

function ColumnsStep({ columns, setColumns }) {
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  /* Preview state: parsed columns with include/exclude toggles */
  const [previewCols, setPreviewCols] = useState(null);
  const [filterText, setFilterText] = useState("");
  const [filterType, setFilterType] = useState("ALL");
  const fileInputRef = useRef(null);

  /* Drag state */
  const dragIdx = useRef(null);
  const dragOverIdx = useRef(null);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const addCol = () => setColumns([...columns, { csvName: "", type: "VARCHAR", format: "" }]);
  const removeCol = (i) => setColumns(columns.filter((_, idx) => idx !== i));
  const updateCol = (i, field, val) => {
    const copy = [...columns];
    copy[i] = { ...copy[i], [field]: val };
    setColumns(copy);
  };

  /* Drag handlers */
  const onDragStart = (i) => { dragIdx.current = i; setDragging(i); };
  const onDragEnter = (i) => { dragOverIdx.current = i; setDragOver(i); };
  const onDragEnd = () => {
    if (dragIdx.current !== null && dragOverIdx.current !== null && dragIdx.current !== dragOverIdx.current) {
      const copy = [...columns];
      const item = copy.splice(dragIdx.current, 1)[0];
      copy.splice(dragOverIdx.current, 0, item);
      setColumns(copy);
    }
    dragIdx.current = null;
    dragOverIdx.current = null;
    setDragging(null);
    setDragOver(null);
  };

  /* Parse into preview (with included flag) instead of directly importing */
  const parseToPreview = (text) => {
    const parsed = parseColumnCSV(text);
    if (parsed.length === 0) {
      setImportError("No columns found. Expected format: COLUMN_NAME|DATA_TYPE (one per line)");
      setPreviewCols(null);
      return;
    }
    setImportError("");
    setPreviewCols(parsed.map((c) => ({ ...c, included: true })));
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      setImportText(text);
      parseToPreview(text);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const togglePreviewCol = (i) => {
    const copy = [...previewCols];
    copy[i] = { ...copy[i], included: !copy[i].included };
    setPreviewCols(copy);
  };

  const selectAllPreview = (val) => setPreviewCols(previewCols.map((c) => ({ ...c, included: val })));

  const confirmImport = () => {
    const selected = previewCols.filter((c) => c.included).map(({ included, ...rest }) => rest);
    if (selected.length === 0) {
      setImportError("Select at least one column to import.");
      return;
    }
    setColumns(selected);
    setPreviewCols(null);
    setImportText("");
    setImportError("");
    setShowImport(false);
    setFilterText("");
    setFilterType("ALL");
  };

  const cancelImport = () => {
    setShowImport(false);
    setPreviewCols(null);
    setImportText("");
    setImportError("");
    setFilterText("");
    setFilterType("ALL");
  };

  /* Unique types in preview for filter dropdown */
  const previewTypes = previewCols ? [...new Set(previewCols.map((c) => c.type))].sort() : [];
  const includedCount = previewCols ? previewCols.filter((c) => c.included).length : 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, color: "var(--fg)" }}>Column Mapping</h2>
          <p style={{ margin: "4px 0 0", color: "#888", fontSize: 14 }}>Define CSV columns in order, or import from Snowflake. Drag to reorder.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={() => { if (showImport) cancelImport(); else setShowImport(true); }} variant="ghost" style={{ fontSize: 13 }}>
            {showImport ? "Cancel Import" : "\u2744\uFE0F Import from Snowflake"}
          </Btn>
          <Btn onClick={addCol} variant="ghost" style={{ fontSize: 13 }}>+ Add Column</Btn>
        </div>
      </div>

      {/* Import Panel */}
      {showImport && !previewCols && (
        <div style={{ border: "1.5px solid var(--accent)", borderRadius: 10, padding: 20, marginBottom: 20, background: "rgba(78,168,222,0.05)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", marginBottom: 4 }}>Import Snowflake Column Definitions</div>
          <p style={{ margin: "0 0 12px", color: "#888", fontSize: 12.5, lineHeight: 1.5 }}>
            Paste output from a Snowflake query like: <code style={{ color: "var(--accent)", background: "rgba(78,168,222,0.1)", padding: "2px 5px", borderRadius: 4 }}>SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'YOUR_TABLE' ORDER BY ORDINAL_POSITION</code>
            <br />Accepts pipe-delimited or comma-delimited. Types like TEXT, TIMESTAMP_NTZ, NUMBER(38,0) are auto-mapped.
          </p>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <input ref={fileInputRef} type="file" accept=".csv,.txt,.tsv" onChange={handleFileUpload} style={{ display: "none" }} />
            <Btn onClick={() => fileInputRef.current && fileInputRef.current.click()} variant="ghost" style={{ fontSize: 13 }}>Upload CSV File</Btn>
            <span style={{ color: "#666", fontSize: 13, alignSelf: "center" }}>or paste below:</span>
          </div>
          <textarea
            value={importText}
            onChange={(e) => { setImportText(e.target.value); setImportError(""); }}
            placeholder={"COLUMN_NAME|DATA_TYPE\nCR_1_PTS|NUMBER\nLAUNDRY|TEXT\nDATECREATED|TIMESTAMP_NTZ"}
            rows={8}
            style={{ width: "100%", padding: "10px 12px", fontSize: 13, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", border: "1.5px solid var(--border)", borderRadius: 7, background: "var(--input-bg)", color: "var(--fg)", resize: "vertical", outline: "none", boxSizing: "border-box" }}
          />
          {importError && <div style={{ color: "#e05252", fontSize: 12.5, marginTop: 6 }}>{importError}</div>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <span style={{ color: "#888", fontSize: 12 }}>
              {importText.trim() ? (parseColumnCSV(importText).length + " columns detected") : ""}
            </span>
            <Btn onClick={() => parseToPreview(importText)} disabled={!importText.trim()} style={{ fontSize: 13 }}>
              Preview Columns
            </Btn>
          </div>
          {columns.length > 0 && <div style={{ marginTop: 8, color: "#e05252", fontSize: 12 }}>Warning: Importing will replace your current {columns.length} column(s).</div>}
        </div>
      )}

      {/* Preview / Exclude Panel */}
      {showImport && previewCols && (
        <div style={{ border: "1.5px solid var(--accent)", borderRadius: 10, padding: 20, marginBottom: 20, background: "rgba(78,168,222,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>Select Columns to Import</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{includedCount} of {previewCols.length} selected</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={() => selectAllPreview(true)} variant="ghost" style={{ fontSize: 12, padding: "6px 12px" }}>Select All</Btn>
              <Btn onClick={() => selectAllPreview(false)} variant="ghost" style={{ fontSize: 12, padding: "6px 12px" }}>Deselect All</Btn>
            </div>
          </div>

          {/* Filter bar */}
          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter by name..."
              style={{ flex: 1, minWidth: 160, padding: "7px 10px", fontSize: 13, border: "1.5px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--fg)", outline: "none", boxSizing: "border-box" }}
            />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{ padding: "7px 10px", fontSize: 13, border: "1.5px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--fg)", outline: "none", cursor: "pointer" }}
            >
              <option value="ALL">All Types</option>
              {previewTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Column list */}
          <div style={{ maxHeight: 350, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8, background: "var(--input-bg)" }}>
            {previewCols.map((col, i) => {
              const matchesName = !filterText || col.csvName.toUpperCase().includes(filterText.toUpperCase());
              const matchesType = filterType === "ALL" || col.type === filterType;
              if (!matchesName || !matchesType) return null;
              return (
                <div
                  key={i}
                  onClick={() => togglePreviewCol(i)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 12px", cursor: "pointer",
                    borderBottom: "1px solid var(--border)",
                    background: col.included ? "rgba(78,168,222,0.07)" : "transparent",
                    transition: "background .1s",
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                    border: col.included ? "none" : "1.5px solid #555",
                    background: col.included ? "var(--accent)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, color: "#fff", fontWeight: 700, transition: "all .15s",
                  }}>
                    {col.included ? "\u2713" : ""}
                  </div>
                  <span style={{ flex: 1, fontSize: 13, color: col.included ? "var(--fg)" : "#666", fontFamily: "'JetBrains Mono', monospace" }}>{col.csvName}</span>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(78,168,222,0.1)", color: "var(--accent)" }}>{col.type}</span>
                </div>
              );
            })}
          </div>

          {importError && <div style={{ color: "#e05252", fontSize: 12.5, marginTop: 6 }}>{importError}</div>}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
            <Btn onClick={() => { setPreviewCols(null); setImportError(""); }} variant="ghost" style={{ fontSize: 13 }}>{"\u2190"} Back to Paste</Btn>
            <Btn onClick={confirmImport} disabled={includedCount === 0} style={{ fontSize: 13 }}>
              Import {includedCount} Column{includedCount !== 1 ? "s" : ""}
            </Btn>
          </div>
        </div>
      )}

      {/* Empty state */}
      {columns.length === 0 && !showImport && (
        <div style={{ textAlign: "center", padding: 40, color: "#999", border: "2px dashed var(--border)", borderRadius: 10 }}>
          No columns defined. Click "Add Column" or "Import from Snowflake" to start.
        </div>
      )}

      {/* Column cards with drag-to-reorder */}
      {columns.map((col, i) => (
        <div
          key={col.csvName + "-" + i}
          draggable
          onDragStart={() => onDragStart(i)}
          onDragEnter={() => onDragEnter(i)}
          onDragEnd={onDragEnd}
          onDragOver={(e) => e.preventDefault()}
          style={{
            border: dragging === i ? "1.5px dashed var(--accent)" : dragOver === i && dragging !== null && dragging !== i ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
            borderRadius: 10, padding: 16, marginBottom: 12,
            background: dragging === i ? "rgba(78,168,222,0.08)" : "var(--card-bg)",
            position: "relative", opacity: dragging === i ? 0.6 : 1,
            transition: "border-color .15s, opacity .15s, background .15s",
          }}
        >
          {/* Drag handle */}
          <div
            style={{
              position: "absolute", top: 0, left: 0, bottom: 0, width: 32,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "grab", color: "#555", fontSize: 16, userSelect: "none",
              borderRight: "1px solid var(--border)", borderRadius: "10px 0 0 10px",
            }}
            title="Drag to reorder"
          >
            {"\u2261"}
          </div>

          <div style={{ marginLeft: 36 }}>
            <div style={{ position: "absolute", top: 10, right: 12 }}>
              <button onClick={() => removeCol(i)} style={{ background: "none", border: "none", color: "#e05252", cursor: "pointer", fontSize: 18, fontWeight: 700 }} title="Remove">x</button>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              index="{i + 1}"
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 150px", gap: 12 }}>
              <Field label="Column Name" required hint="readCSV column name attribute">
                <Input value={col.csvName} onChange={(v) => updateCol(i, "csvName", v)} placeholder="e.g. Incident Description" />
              </Field>
              <Field label="SF Type" hint="For reference">
                <Select value={col.type} onChange={(v) => updateCol(i, "type", v)} options={SF_TYPES} />
              </Field>
            </div>
            {(col.type === "DATE" || col.type.startsWith("TIMESTAMP")) && (
              <Field label="Format Pattern" hint="Sets dateFormat or timestampFormat on the data element">
                <Input value={col.format} onChange={(v) => updateCol(i, "format", v)} placeholder={col.type === "DATE" ? "MM/DD/YYYY" : "yyyy-MM-dd HH:mm:ss"} />
              </Field>
            )}
          </div>
        </div>
      ))}

      {/* Column Summary Bar */}
      {columns.length > 0 && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, padding: "10px 14px", borderRadius: 8, background: "var(--input-bg)", fontSize: 12, color: "#888" }}>
          <span><strong style={{ color: "var(--fg)" }}>{columns.length}</strong> columns</span>
          {Object.entries(columns.reduce((acc, c) => { acc[c.type] = (acc[c.type] || 0) + 1; return acc; }, {}))
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => (
              <span key={type} style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(78,168,222,0.1)", color: "var(--accent)" }}>
                {type}: {count}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

function OptionsStep({ cfg, set }) {
  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 22, color: "var(--fg)" }}>Additional Options</h2>
      <p style={{ margin: "0 0 24px", color: "#888", fontSize: 14 }}>Fine-tune job behavior.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Log Level">
          <Select value={cfg.logLevel} onChange={(v) => set({ ...cfg, logLevel: v })} options={LOG_LEVELS} />
        </Field>
        <Field label="Batch Size" hint="sql query batchSize attribute">
          <Input value={cfg.batchSize} onChange={(v) => set({ ...cfg, batchSize: v })} placeholder="10000" type="number" />
        </Field>
        <Field label="Trim Mode" hint="readCSV data trim attribute">
          <Select value={cfg.trimMode} onChange={(v) => set({ ...cfg, trimMode: v })}
            options={[
              { value: "none", label: "None" },
              { value: "both", label: "Both (leading + trailing)" },
              { value: "leading", label: "Leading only" },
              { value: "trailing", label: "Trailing only" },
            ]}
          />
        </Field>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
        <Toggle checked={cfg.skipInvalidRecords} onChange={(v) => set({ ...cfg, skipInvalidRecords: v })} label="Skip invalid records (skipInvalidRecords)" />
        <Toggle checked={cfg.addFilenameColumn} onChange={(v) => set({ ...cfg, addFilenameColumn: v })} label="Add source filename as first column (modifyRowSet)" />
      </div>
      {cfg.addFilenameColumn && (
        <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, background: "rgba(78,168,222,0.08)", border: "1px solid rgba(78,168,222,0.2)", fontSize: 13, color: "#aaa" }}>
          A <code style={{ color: "var(--accent)" }}>modifyRowSet</code> task will prepend the source filename as column index 1. Your INSERT will have an extra <code style={{ color: "var(--accent)" }}>?</code> placeholder. Make sure your Snowflake table has this column first.
        </div>
      )}
    </div>
  );
}

function ReviewStep({ config }) {
  const { project, source, snowflake, columns, options } = config;
  const sfFull = snowflake.database + "." + snowflake.schema + "." + snowflake.table;

  const Section = ({ title, items }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>{title}</div>
      <div style={{ background: "var(--input-bg)", borderRadius: 8, padding: 14 }}>
        {items.map(([k, v], i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < items.length - 1 ? "1px solid var(--border)" : "none" }}>
            <span style={{ color: "#888", fontSize: 13 }}>{k}</span>
            <span style={{ color: "var(--fg)", fontSize: 13, fontWeight: 500, textAlign: "right", maxWidth: "60%", wordBreak: "break-all" }}>{v || "\u2014"}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 22, color: "var(--fg)" }}>Review Configuration</h2>
      <p style={{ margin: "0 0 24px", color: "#888", fontSize: 14 }}>Verify before generating. Output matches GoAnywhere Project Designer XML format.</p>
      <Section title="Project" items={[["Name", project.name], ["Log Level", options.logLevel]]} />
      <Section title="CSV Source" items={[
        ["Directory", source.path], ["Pattern", source.filename], ["Archive", source.archivePath],
        ["Delimiter", DELIMITERS.find((d) => d.value === source.delimiter)?.label],
        ["Text Qualifier", TEXT_QUALIFIERS.find((d) => d.value === source.textQualifier)?.label],
        ["Record Delimiter", source.recordDelimiter],
        ["Skip Header", source.hasHeader ? "Yes" : "No"],
      ]} />
      <Section title="Snowflake" items={[
        ["Resource ID", snowflake.resource], ["Target Table", sfFull],
        ["Insert Mode", snowflake.insertMode], ["Batch Size", options.batchSize],
      ]} />
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Columns ({columns.length})</div>
        <div style={{ background: "var(--input-bg)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1.5px solid var(--border)" }}>
                {["Index", "Name", "SF Type"].map((h) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#888", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {columns.map((c, i) => (
                <tr key={i} style={{ borderBottom: i < columns.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <td style={{ padding: "7px 12px", color: "#888" }}>{i + 1}</td>
                  <td style={{ padding: "7px 12px", color: "var(--fg)", fontWeight: 500 }}>{c.csvName}</td>
                  <td style={{ padding: "7px 12px", color: "var(--fg)" }}>{c.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Section title="Options" items={[
        ["Skip Invalid Records", options.skipInvalidRecords ? "Yes" : "No"],
        ["Add Filename Column", options.addFilenameColumn ? "Yes (prepended)" : "No"],
        ["Trim", options.trimMode],
      ]} />
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Module Structure</div>
        <div style={{ background: "var(--input-bg)", borderRadius: 8, padding: 16, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 12.5, color: "#8b9dc3", lineHeight: 1.8 }}>
          <div>Main</div>
          <div style={{ paddingLeft: 20 }}>{"\u251C\u2500"} setVariable Date</div>
          <div style={{ paddingLeft: 20 }}>{"\u251C\u2500"} callModule {"\u2192"} Get Source File</div>
          {snowflake.insertMode === "TRUNCATE_INSERT" && <div style={{ paddingLeft: 20 }}>{"\u251C\u2500"} callModule {"\u2192"} Clear Table</div>}
          <div style={{ paddingLeft: 20 }}>{"\u251C\u2500"} callModule {"\u2192"} Load Data</div>
          <div style={{ paddingLeft: 20 }}>{"\u2514\u2500"} callModule {"\u2192"} Archive File</div>
          <div style={{ marginTop: 8 }}>Get Source File</div>
          <div style={{ paddingLeft: 20 }}>{"\u2514\u2500"} createFileList</div>
          {snowflake.insertMode === "TRUNCATE_INSERT" && <>
            <div style={{ marginTop: 8 }}>Clear Table</div>
            <div style={{ paddingLeft: 20 }}>{"\u2514\u2500"} sql TRUNCATE TABLE</div>
          </>}
          <div style={{ marginTop: 8 }}>Load Data</div>
          <div style={{ paddingLeft: 20 }}>{"\u2514\u2500"} forEachLoop</div>
          <div style={{ paddingLeft: 40 }}>{"\u251C\u2500"} readCSV ({columns.length} columns)</div>
          {options.addFilenameColumn && <div style={{ paddingLeft: 40 }}>{"\u251C\u2500"} modifyRowSet (add filename)</div>}
          <div style={{ paddingLeft: 40 }}>{"\u251C\u2500"} countRowSet</div>
          <div style={{ paddingLeft: 40 }}>{"\u2514\u2500"} sql INSERT INTO {sfFull}</div>
          <div style={{ marginTop: 8 }}>Archive File</div>
          <div style={{ paddingLeft: 20 }}>{"\u2514\u2500"} move {"\u2192"} Processed_$Date_*</div>
        </div>
      </div>
    </div>
  );
}

const INITIAL = {
  project: { name: "" },
  source: { path: "", filename: "*.csv", archivePath: "", delimiter: "comma", hasHeader: true, textQualifier: "doubleQuote", recordDelimiter: "LF" },
  snowflake: { resource: "Snowflake", database: "", schema: "", table: "", insertMode: "INSERT" },
  columns: [],
  options: { logLevel: "verbose", batchSize: "10000", trimMode: "none", skipInvalidRecords: true, addFilenameColumn: false },
};

export default function App() {
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState(INITIAL);
  const [xmlOutput, setXmlOutput] = useState(null);
  const [copied, setCopied] = useState(false);
  const xmlRef = useRef(null);

  const set = (key) => (val) => setConfig((prev) => ({ ...prev, [key]: val }));

  const canProceed = useCallback(() => {
    switch (step) {
      case 0: return config.project.name.trim() !== "";
      case 1: return config.source.path.trim() !== "" && config.source.filename.trim() !== "" && config.source.archivePath.trim() !== "";
      case 2: return config.snowflake.resource.trim() !== "" && config.snowflake.database.trim() !== "" && config.snowflake.schema.trim() !== "" && config.snowflake.table.trim() !== "";
      case 3: return config.columns.length > 0 && config.columns.every((c) => c.csvName.trim());
      case 4: return true;
      default: return true;
    }
  }, [step, config]);

  const handleGenerate = () => setXmlOutput(generateXML(config));

  const handleCopy = () => {
    if (xmlOutput) {
      navigator.clipboard.writeText(xmlOutput).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const handleDownload = () => {
    if (xmlOutput) {
      const blob = new Blob([xmlOutput], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (config.project.name.replace(/\s+/g, "_") || "project") + ".xml";
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleReset = () => { setStep(0); setConfig(INITIAL); setXmlOutput(null); };

  if (xmlOutput) {
    return (
      <div style={{ "--fg": "#e8e6e3", "--bg": "#111214", "--card-bg": "#1a1b1f", "--input-bg": "#1a1b1f", "--border": "#2d2e33", "--accent": "#4ea8de", "--label": "#8b8d94", fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif", background: "var(--bg)", color: "var(--fg)", minHeight: "100vh", padding: 24 }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 22 }}>Generated Project XML</h2>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Btn onClick={handleCopy} variant="ghost">{copied ? "\u2713 Copied!" : "Copy XML"}</Btn>
              <Btn onClick={handleDownload}>Download .xml</Btn>
              <Btn onClick={handleReset} variant="ghost">New Project</Btn>
            </div>
          </div>
          <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: "rgba(78,168,222,0.08)", border: "1px solid rgba(78,168,222,0.2)", fontSize: 13, color: "#aaa" }}>
            Import via GoAnywhere {"\u2192"} Workflows {"\u2192"} Projects {"\u2192"} Import. Verify your <strong style={{ color: "var(--accent)" }}>resourceId</strong> matches your configured Snowflake database resource.
          </div>
          <pre ref={xmlRef} style={{ background: "#0d0e10", border: "1.5px solid var(--border)", borderRadius: 10, padding: 20, fontSize: 12.5, lineHeight: 1.6, overflowX: "auto", color: "#b0c4de", fontFamily: "'JetBrains Mono', 'Fira Code', monospace", maxHeight: "70vh", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{xmlOutput}</pre>
        </div>
      </div>
    );
  }

  return (
    <div style={{ "--fg": "#e8e6e3", "--bg": "#111214", "--card-bg": "#1a1b1f", "--input-bg": "#16171b", "--border": "#2d2e33", "--accent": "#4ea8de", "--label": "#8b8d94", fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif", background: "var(--bg)", color: "var(--fg)", minHeight: "100vh", padding: 24 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "var(--accent)", textTransform: "uppercase", marginBottom: 6 }}>GoAnywhere MFT</div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: "var(--fg)" }}>CSV {"\u2192"} Snowflake Project Builder</h1>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 14 }}>Generates real GoAnywhere project XML {"\u2014"} ready to import into Project Designer.</p>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 32, flexWrap: "wrap" }}>
          {STEPS.map((s, i) => (
            <button key={s.id} onClick={() => i <= step && setStep(i)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "none",
                background: i === step ? "var(--accent)" : i < step ? "#1e3a4d" : "var(--card-bg)",
                color: i === step ? "#fff" : i < step ? "var(--accent)" : "#555",
                fontSize: 12.5, fontWeight: 600, cursor: i <= step ? "pointer" : "default", transition: "all .15s",
              }}
            >
              <span>{s.icon}</span>
              <span style={{ display: i === step ? "inline" : "none" }}>{s.label}</span>
              {i < step && <span style={{ fontSize: 10 }}>{"\u2713"}</span>}
            </button>
          ))}
        </div>
        <div style={{ background: "var(--card-bg)", border: "1.5px solid var(--border)", borderRadius: 14, padding: 32, marginBottom: 20 }}>
          {step === 0 && <ProjectStep cfg={config.project} set={set("project")} />}
          {step === 1 && <SourceStep cfg={config.source} set={set("source")} />}
          {step === 2 && <SnowflakeStep cfg={config.snowflake} set={set("snowflake")} />}
          {step === 3 && <ColumnsStep columns={config.columns} setColumns={(v) => setConfig((prev) => ({ ...prev, columns: v }))} />}
          {step === 4 && <OptionsStep cfg={config.options} set={set("options")} />}
          {step === 5 && <ReviewStep config={config} />}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Btn onClick={() => setStep(step - 1)} variant="ghost" disabled={step === 0}>{"\u2190"} Back</Btn>
          {step < STEPS.length - 1
            ? <Btn onClick={() => setStep(step + 1)} disabled={!canProceed()}>Next {"\u2192"}</Btn>
            : <Btn onClick={handleGenerate} disabled={!canProceed()}>Generate XML</Btn>
          }
        </div>
      </div>
    </div>
  );
}

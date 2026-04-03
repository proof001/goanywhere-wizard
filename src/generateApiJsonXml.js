import { escapeXml as esc } from "./escapeXml.js";

/**
 * GoAnywhere project XML: REST GET → response file → readJSON → Snowflake INSERT.
 *
 * Template calibration: element names follow the same camelCase style as CSV exports
 * (readCSV, sql, callModule). If Project Designer import fails, compare this output to a
 * minimal export from your GA version (REST Web Service + Read JSON + SQL) and adjust
 * the webServiceRest / readJSON fragments below.
 *
 * Assumptions used here:
 * - webServiceRest: resourceId, method="GET", resourcePath (relative to REST resource base URL),
 *   outputFile (server path for response body). Optional child elements: requestHeader.
 * - readJSON: same family as readCSV — inputFile, outputRowSetVariable, skipInvalidRecords,
 *   data/trim/dateFormat/timestampFormat, column index + name + value (JSON path).
 */

function buildResourcePathWithQuery(path, queryParams) {
  const base = String(path || "").trim();
  const pairs = (queryParams || []).filter((p) => p && String(p.name || "").trim());
  if (pairs.length === 0) return base;
  const qs = pairs
    .map((p) => `${encodeURIComponent(String(p.name).trim())}=${encodeURIComponent(String(p.value ?? ""))}`)
    .join("&");
  if (!base) return "?" + qs;
  const sep = base.includes("?") ? "&" : "?";
  return base + sep + qs;
}

export function generateApiJsonXML(cfg) {
  const projName = esc(cfg.project.name);
  const sfFull = esc(cfg.snowflake.database) + "." + esc(cfg.snowflake.schema) + "." + esc(cfg.snowflake.table);
  const resourcePath = buildResourcePathWithQuery(cfg.rest.path, cfg.rest.queryParams);

  const colIndexXML = cfg.jsonColumns
    .map(
      (c, i) =>
        '\t\t\t\t\t<column index="' +
        (i + 1) +
        '" name="' +
        esc(c.name) +
        '" value="' +
        esc(c.path) +
        '" />'
    )
    .join("\n");

  const placeholders = cfg.jsonColumns.map(() => "?").join(",");

  const hasDate = cfg.jsonColumns.some((c) => c.type === "DATE");
  const hasTimestamp = cfg.jsonColumns.some((c) => c.type.startsWith("TIMESTAMP"));
  const dateFormat = cfg.jsonColumns.find((c) => c.type === "DATE");
  const tsFormat = cfg.jsonColumns.find((c) => c.type.startsWith("TIMESTAMP"));
  const dateFmt = dateFormat ? dateFormat.format || "MM/DD/YYYY" : "MM/DD/YYYY";
  const tsFmt = tsFormat ? tsFormat.format || "yyyy-MM-dd HH:mm:ss" : "yyyy-MM-dd HH:mm:ss";

  const clearTableModule =
    cfg.snowflake.insertMode === "TRUNCATE_INSERT"
      ? '\n\t<module name="Clear Table">\n\t\t<sql label="Clear Records" resourceId="' +
        esc(cfg.snowflake.resource) +
        '" version="1.0">\n\t\t\t<query createScrollableRowSet="false">\n\t\t\t\t<statement>TRUNCATE TABLE ' +
        sfFull +
        '\n\t</statement>\n\t\t\t</query>\n\t\t</sql>\n\t</module>'
      : "";

  const clearTableCall =
    cfg.snowflake.insertMode === "TRUNCATE_INSERT"
      ? '\n\t\t<callModule label="Call Clear Table" module="Clear Table" version="1.0" />'
      : "";

  let dataAttrs = ' trim="' + esc(cfg.options.trimMode) + '"';
  if (hasDate) dataAttrs += ' dateFormat="' + esc(dateFmt) + '"';
  if (hasTimestamp) dataAttrs += ' timestampFormat="' + esc(tsFmt) + '"';

  const headerXML = (cfg.rest.headers || [])
    .filter((h) => h && String(h.name || "").trim())
    .map(
      (h) =>
        '\n\t\t\t<requestHeader name="' + esc(h.name) + '" value="' + esc(h.value ?? "") + '" />'
    )
    .join("");

  const restBlock =
    '\t<module name="REST GET">\n' +
    '\t\t<webServiceRest label="REST GET JSON" resourceId="' +
    esc(cfg.rest.resource) +
    '" version="1.0" method="GET" resourcePath="' +
    esc(resourcePath) +
    '" outputFile="' +
    esc(cfg.response.outputFile) +
    '">' +
    headerXML +
    "\n\t\t</webServiceRest>\n" +
    "\t</module>";

  const loadModule =
    '\t<module name="Load JSON to Snowflake">\n' +
    '\t\t<readJSON inputFile="' +
    esc(cfg.response.outputFile) +
    '" outputRowSetVariable="varRowSet" skipInvalidRecords="' +
    (cfg.options.skipInvalidRecords ? "true" : "false") +
    '" version="1.0">\n' +
    "\t\t\t<data" +
    dataAttrs +
    ">\n" +
    colIndexXML +
    "\n\t\t\t</data>\n" +
    "\t\t</readJSON>\n" +
    '\t\t<countRowSet rowsetVariable="${varRowSet}" rowCountVariable="varRowCount" version="1.0" />\n' +
    '\t\t<sql label="Insert Records" resourceId="' +
    esc(cfg.snowflake.resource) +
    '" version="1.0">\n' +
    '\t\t\t<query inputRowSetVariable="${varRowSet}" createScrollableRowSet="false" batchSize="' +
    cfg.options.batchSize +
    '">\n' +
    "\t\t\t\t<statement>INSERT INTO " +
    sfFull +
    "\n" +
    "\tVALUES (" +
    placeholders +
    ")</statement>\n" +
    "\t\t\t</query>\n" +
    "\t\t</sql>\n" +
    "\t</module>";

  return (
    '<project name="' +
    projName +
    '" mainModule="Main" version="2.0" logLevel="' +
    cfg.options.logLevel +
    '">\n' +
    '\t<module name="Main">\n' +
    '\t\t<setVariable name="Date" value="${CurrentDate()}" version="2.0" />\n' +
    '\t\t<callModule label="Call REST GET" module="REST GET" version="1.0" />' +
    clearTableCall +
    "\n" +
    '\t\t<callModule label="Call Load JSON to Snowflake" module="Load JSON to Snowflake" version="1.0" />\n' +
    "\t</module>\n" +
    restBlock +
    clearTableModule +
    "\n" +
    loadModule +
    "\n" +
    "</project>"
  );
}

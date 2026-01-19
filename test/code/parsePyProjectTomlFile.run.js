#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parsePyProjectTomlFile } from "../../lib/helpers/utils.js";

function parseArgs(argv) {
  const out = {
    pyproject: undefined,
    json: false,
    outFile: undefined,
    showDirect: false,
    showGroups: false,
    showWorkspacePaths: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--pyproject" || a === "-p") {
      out.pyproject = argv[i + 1];
      i += 1;
    } else if (a === "--json") {
      out.json = true;
    } else if (a === "--out" || a === "-o") {
      out.outFile = argv[i + 1];
      i += 1;
    } else if (a === "--show-direct") {
      out.showDirect = true;
    } else if (a === "--show-groups") {
      out.showGroups = true;
    } else if (a === "--show-workspace-paths") {
      out.showWorkspacePaths = true;
    } else if (a === "--help" || a === "-h") {
      out.help = true;
    }
  }

  return out;
}

function usage() {
  console.log(`Usage:
  node ./test/parsePyProjectTomlFile.run.js --pyproject <pyproject.toml> [options]

Options:
  -p, --pyproject            Path to pyproject.toml
      --json                 Print the raw returned object as JSON
  -o, --out                  Write JSON to a file (works with --json or without)
      --show-direct          Print directDepsKeys (names)
      --show-groups          Print groupDepsKeys (name -> groups)
      --show-workspace-paths Print workspacePaths
  -h, --help                 Show help

Examples:
  node ./test/parsePyProjectTomlFile.run.js -p ./test/local-data/pyproject.toml
  node ./test/parsePyProjectTomlFile.run.js -p ./test/local-data/pyproject.toml --json -o ./test/local-data/pyproject.parsed.json
`);
}

function countKeys(obj) {
  return obj && typeof obj === "object" ? Object.keys(obj).length : 0;
}

function buildSummary(ret, pyprojectPath) {
  return {
    pyproject: pyprojectPath,
    modes: {
      poetryMode: Boolean(ret?.poetryMode),
      uvMode: Boolean(ret?.uvMode),
      hatchMode: Boolean(ret?.hatchMode),
    },
    parentComponent: ret?.parentComponent
      ? {
          name: ret.parentComponent.name,
          version: ret.parentComponent.version,
          "bom-ref": ret.parentComponent["bom-ref"],
          purl: ret.parentComponent.purl,
          type: ret.parentComponent.type,
        }
      : null,
    counts: {
      workspacePaths: ret?.workspacePaths?.length || 0,
      directDepsKeys: countKeys(ret?.directDepsKeys),
      groupDepsKeys: countKeys(ret?.groupDepsKeys),
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }
  if (!args.pyproject) {
    usage();
    process.exit(2);
  }

  const pyprojectPath = path.resolve(process.cwd(), args.pyproject);
  if (!existsSync(pyprojectPath)) {
    console.error(`pyproject.toml not found: ${pyprojectPath}`);
    process.exit(2);
  }

  // Touch file once so parse errors are surfaced early (even though parser re-reads it)
  readFileSync(pyprojectPath, { encoding: "utf-8" });

  const ret = parsePyProjectTomlFile(pyprojectPath);

  const shouldWriteJson = Boolean(args.outFile);
  const outPath = shouldWriteJson
    ? path.resolve(process.cwd(), args.outFile)
    : undefined;

  if (shouldWriteJson) {
    const jsonObj = args.json ? ret : buildSummary(ret, pyprojectPath);
    writeFileSync(outPath, `${JSON.stringify(jsonObj, null, 2)}\n`, {
      encoding: "utf-8",
    });
    console.log(`Wrote JSON: ${outPath}`);
    if (args.json) {
      return;
    }
  }

  if (args.json) {
    console.log(JSON.stringify(ret, null, 2));
    return;
  }

  const summary = buildSummary(ret, pyprojectPath);
  console.log("=== parsePyProjectTomlFile summary ===");
  console.log(`pyproject: ${summary.pyproject}`);
  console.log(
    `modes: poetry=${summary.modes.poetryMode} uv=${summary.modes.uvMode} hatch=${summary.modes.hatchMode}`,
  );
  console.log(
    `parentComponent: ${summary.parentComponent?.name || "(none)"}@$${summary.parentComponent?.version || ""}`.replace(
      "@$",
      "@",
    ),
  );
  console.log(
    `counts: workspacePaths=${summary.counts.workspacePaths} directDepsKeys=${summary.counts.directDepsKeys} groupDepsKeys=${summary.counts.groupDepsKeys}`,
  );

  if (args.showWorkspacePaths) {
    console.log("\n=== workspacePaths ===");
    for (const p of ret.workspacePaths || []) {
      console.log(p);
    }
  }

  if (args.showDirect) {
    console.log("\n=== directDepsKeys ===");
    for (const k of Object.keys(ret.directDepsKeys || {}).sort()) {
      console.log(k);
    }
  }

  if (args.showGroups) {
    console.log("\n=== groupDepsKeys ===");
    const keys = Object.keys(ret.groupDepsKeys || {}).sort();
    for (const k of keys) {
      console.log(`${k} -> ${(ret.groupDepsKeys[k] || []).join(", ")}`);
    }
  }
}

await main();

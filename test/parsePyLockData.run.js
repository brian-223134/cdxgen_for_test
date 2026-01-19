#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parsePyLockData } from "../lib/helpers/utils.js";

function parseArgs(argv) {
  const out = {
    lock: undefined,
    pyproject: undefined,
    showDeps: false,
    showPkgs: false,
    ref: undefined,
    name: undefined,
    json: false,
    outFile: undefined,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--lock" || a === "-l") {
      out.lock = argv[i + 1];
      i += 1;
    } else if (a === "--pyproject" || a === "-p") {
      out.pyproject = argv[i + 1];
      i += 1;
    } else if (a === "--ref" || a === "-r") {
      out.ref = argv[i + 1];
      i += 1;
    } else if (a === "--name" || a === "-n") {
      out.name = argv[i + 1];
      i += 1;
    } else if (a === "--show-deps") {
      out.showDeps = true;
    } else if (a === "--show-pkgs") {
      out.showPkgs = true;
    } else if (a === "--json") {
      out.json = true;
    } else if (a === "--out" || a === "-o") {
      out.outFile = argv[i + 1];
      i += 1;
    } else if (a === "--help" || a === "-h") {
      out.help = true;
    }
  }

  return out;
}

function usage() {
  // Intentionally plain text (good for copy/paste)
  console.log(`Usage:
  node ./test/parsePyLockData.run.js --lock <lockfile> [--pyproject <pyproject.toml>] [options]

Options:
  -l, --lock         Path to poetry.lock / pdm.lock / uv.lock / uv-workspace.lock
  -p, --pyproject    Path to pyproject.toml (optional)
  -r, --ref          Print only one dependency node (bom-ref)
  -n, --name         Resolve bom-ref by package name, then apply as --ref (use with --show-deps)
      --show-deps    Print dependenciesList (or one node if --ref)
      --show-pkgs    Print pkgList (name@version + bom-ref)
      --json         Print the raw returned object as JSON
  -o, --out          Write JSON to a file (works with --json or with --show-deps + --ref/--name)
  -h, --help         Show help

Examples:
  node ./test/parsePyLockData.run.js -l ./test/data/uv.lock --show-deps
  node ./test/parsePyLockData.run.js -l ./test/data/uv-workspace.lock -p ./test/data/pyproject_uv-workspace.toml --show-deps
  node ./test/parsePyLockData.run.js -l ./test/local-data/poetry.lock --json -o ./test/local-data/poetry.lock.parsed.json
  node ./test/parsePyLockData.run.js -l ./test/local-data/poetry.lock --show-deps --name django -o ./test/local-data/django.deps.json
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }
  if (!args.lock) {
    usage();
    process.exit(2);
  }

  const lockPath = path.resolve(process.cwd(), args.lock);
  const pyprojectPath = args.pyproject
    ? path.resolve(process.cwd(), args.pyproject)
    : undefined;

  if (!existsSync(lockPath)) {
    console.error(`Lock file not found: ${lockPath}`);
    process.exit(2);
  }
  if (pyprojectPath && !existsSync(pyprojectPath)) {
    console.error(`pyproject.toml not found: ${pyprojectPath}`);
    process.exit(2);
  }

  const lockData = readFileSync(lockPath, { encoding: "utf-8" });

  const ret = await parsePyLockData(lockData, lockPath, pyprojectPath);

  if (args.name && !args.ref) {
    const needle = args.name.toLowerCase();
    const found = (ret.pkgList || []).find((p) => (p.name || "").toLowerCase() === needle);
    if (!found) {
      console.error(`No package found in pkgList with name: ${args.name}`);
      process.exit(2);
    }
    args.ref = found["bom-ref"];
  }

  const shouldWriteJson = Boolean(args.outFile);
  const outPath = shouldWriteJson
    ? path.resolve(process.cwd(), args.outFile)
    : undefined;

  if (shouldWriteJson) {
    let jsonObj;
    if (args.showDeps && args.ref) {
      jsonObj = (ret.dependenciesList || []).find((d) => d.ref === args.ref) || null;
    } else {
      jsonObj = ret;
    }
    writeFileSync(outPath, `${JSON.stringify(jsonObj, null, 2)}\n`, {
      encoding: "utf-8",
    });
    console.log(`Wrote JSON: ${outPath}`);
    // If the user's intent is "write json to file", avoid also dumping the full JSON to stdout.
    if (args.json) {
      return;
    }
    if (!args.json && !(args.showDeps && args.ref) && !args.showPkgs && !args.showDeps) {
      return;
    }
  }

  if (args.json) {
    console.log(JSON.stringify(ret, null, 2));
    return;
  }

  console.log("=== parsePyLockData result summary ===");
  console.log(`lock: ${lockPath}`);
  if (pyprojectPath) {
    console.log(`pyproject: ${pyprojectPath}`);
  }
  console.log(`parentComponent: ${ret.parentComponent?.name || "(none)"}`);
  console.log(`pkgList.length: ${ret.pkgList?.length || 0}`);
  console.log(`rootList.length: ${ret.rootList?.length || 0}`);
  console.log(`dependenciesList.length: ${ret.dependenciesList?.length || 0}`);

  if (args.showPkgs) {
    console.log("\n=== pkgList ===");
    for (const p of ret.pkgList || []) {
      console.log(`${p.name}@${p.version}  ref=${p["bom-ref"]}`);
    }
  }

  if (args.showDeps) {
    console.log("\n=== dependenciesList ===");

    if (args.ref) {
      const node = (ret.dependenciesList || []).find((d) => d.ref === args.ref);
      if (!node) {
        console.log(`(no node found for ref: ${args.ref})`);
        return;
      }
      console.log(JSON.stringify(node, null, 2));
      return;
    }

    for (const d of ret.dependenciesList || []) {
      console.log(`${d.ref} -> ${d.dependsOn?.length || 0}`);
    }
  }
}

await main();

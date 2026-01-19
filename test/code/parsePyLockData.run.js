#!/usr/bin/env node

/**
 * parsePyLockData.run.js
 *
 * 목적
 * - cdxgen의 `parsePyLockData(lockData, lockFile, pyProjectFile)` 함수를 “단독 실행”하기 위한 러너(실험/디버깅용) 스크립트입니다.
 * - Python lock 파일(`poetry.lock`/`pdm.lock`/`uv.lock`/`uv-workspace.lock`)을 읽어서
 *   `pkgList`, `dependenciesList`, `rootList`, `parentComponent` 등 파싱 결과를 사람이 보기 좋게 출력하거나 JSON으로 저장합니다.
 *
 * 작동 원리(요약)
 * 1) CLI 인자 파싱 (`parseArgs`)
 * 2) `--lock`/`--pyproject` 경로를 CWD 기준 절대경로로 정규화
 * 3) lock 파일을 문자열로 읽고 `parsePyLockData(...)` 호출
 * 4) 옵션에 따라:
 *    - 요약 출력
 *    - `pkgList`/`dependenciesList` 출력
 *    - JSON stdout 출력(`--json`)
 *    - JSON 파일 저장(`--out`)
 *
 * 사용 방법(Windows PowerShell 예시)
 * - 반드시 패키지 루트(= `cdxgen/cdxgen`, package.json 있는 폴더)에서 실행하는 것을 권장합니다.
 *
 *   # 1) dependenciesList 요약
 *   node .\test\code\parsePyLockData.run.js -l .\test\local-data\poetry\poetry.lock --show-deps
 *
 *   # 2) 전체 결과를 JSON 파일로 저장
 *   node .\test\code\parsePyLockData.run.js -l .\test\local-data\poetry\poetry.lock --json -o .\test\local-data\poetry\poetry.lock.parsed.json
 *
 *   # 3) 특정 패키지의 dependency 노드 1개만 저장(패키지명으로 bom-ref 자동 탐색)
 *   node .\test\code\parsePyLockData.run.js -l .\test\local-data\poetry\poetry.lock --show-deps --name django -o .\test\local-data\poetry\django.deps.json
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parsePyLockData } from "../../lib/helpers/utils.js";

/**
 * argv를 파싱해서 옵션 객체로 변환합니다.
 * - 인자 값이 없는 플래그(`--show-deps` 등)는 boolean으로 처리합니다.
 * - `--lock`, `--pyproject`, `--ref`, `--name`, `--out`는 다음 토큰을 값으로 읽습니다.
 */
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
  node ./test/code/parsePyLockData.run.js --lock <lockfile> [--pyproject <pyproject.toml>] [options]

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
  node ./test/code/parsePyLockData.run.js -l ./test/data/uv.lock --show-deps
  node ./test/code/parsePyLockData.run.js -l ./test/data/uv-workspace.lock -p ./test/data/pyproject_uv-workspace.toml --show-deps
  node ./test/code/parsePyLockData.run.js -l ./test/local-data/poetry/poetry.lock --json -o ./test/local-data/poetry/poetry.lock.parsed.json
  node ./test/code/parsePyLockData.run.js -l ./test/local-data/poetry/poetry.lock --show-deps --name django -o ./test/local-data/poetry/django.deps.json
`);
}

/**
 * 메인 실행 함수
 * - 파일 존재 여부 확인 후 파서를 호출합니다.
 * - `--name`이 주어진 경우 `pkgList`에서 이름으로 bom-ref를 찾아 `--ref`처럼 동작하게 합니다.
 * - `--out`이 주어진 경우 JSON 파일을 생성합니다.
 */
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

#!/usr/bin/env node

/**
 * parsePyProjectTomlFile.run.js
 *
 * 목적
 * - cdxgen의 `parsePyProjectTomlFile(pyprojectPath)` 함수를 “단독 실행”하기 위한 러너(실험/디버깅용) 스크립트입니다.
 * - `pyproject.toml`을 파싱해서 아래 정보를 빠르게 확인합니다.
 *   - parentComponent (프로젝트 자체 메타데이터: name/version/purl/bom-ref 등)
 *   - directDepsKeys (프로젝트의 direct dependency 이름 집합)
 *   - groupDepsKeys (dependency-groups/poetry group 등 그룹 정보)
 *   - workspacePaths (uv workspace 멤버를 찾기 위한 glob 목록)
 *
 * 작동 원리(요약)
 * 1) CLI 인자 파싱 (`parseArgs`)
 * 2) `--pyproject` 경로를 CWD 기준 절대경로로 정규화
 * 3) `parsePyProjectTomlFile(절대경로)` 호출
 * 4) 옵션에 따라:
 *    - 요약 출력(기본)
 *    - direct/group/workspace 상세 출력
 *    - JSON stdout 출력(`--json`)
 *    - JSON 파일 저장(`--out`)
 *
 * 사용 방법(Windows PowerShell 예시)
 * - 반드시 패키지 루트(= `cdxgen/cdxgen`, package.json 있는 폴더)에서 실행하는 것을 권장합니다.
 *
 *   # 1) 요약 출력
 *   node .\test\code\parsePyProjectTomlFile.run.js -p .\test\local-data\pyproject\pyproject.toml
 *
 *   # 2) 상세 출력
 *   node .\test\code\parsePyProjectTomlFile.run.js -p .\test\local-data\pyproject\pyproject.toml --show-direct --show-groups --show-workspace-paths
 *
 *   # 3) 전체 결과를 JSON 파일로 저장
 *   node .\test\code\parsePyProjectTomlFile.run.js -p .\test\local-data\pyproject\pyproject.toml --json -o .\test\local-data\pyproject\pyproject.parsed.json
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parsePyProjectTomlFile } from "../../lib/helpers/utils.js";

/**
 * argv를 파싱해서 옵션 객체로 변환합니다.
 * - 인자 값이 없는 플래그(`--show-direct` 등)는 boolean으로 처리합니다.
 * - `--pyproject`, `--out`는 다음 토큰을 값으로 읽습니다.
 */
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
  node ./test/code/parsePyProjectTomlFile.run.js --pyproject <pyproject.toml> [options]

Options:
  -p, --pyproject            Path to pyproject.toml
      --json                 Print the raw returned object as JSON
  -o, --out                  Write JSON to a file (works with --json or without)
      --show-direct          Print directDepsKeys (names)
      --show-groups          Print groupDepsKeys (name -> groups)
      --show-workspace-paths Print workspacePaths
  -h, --help                 Show help

Examples:
  node ./test/code/parsePyProjectTomlFile.run.js -p ./test/local-data/pyproject/pyproject.toml
  node ./test/code/parsePyProjectTomlFile.run.js -p ./test/local-data/pyproject/pyproject.toml --json -o ./test/local-data/pyproject/pyproject.parsed.json
`);
}

function countKeys(obj) {
  return obj && typeof obj === "object" ? Object.keys(obj).length : 0;
}

/**
 * 사람이 보기 쉬운 요약 객체를 만듭니다.
 * - `--json`이 아니라면 이 요약을 출력하거나 파일로 저장합니다.
 */
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
  /**
   * 메인 실행 함수
   * - 파일 존재 여부 확인 후 파서를 호출합니다.
   * - `--out`이 있으면 JSON 파일을 생성합니다.
   *   - `--json`이면 전체 결과를
   *   - 아니면 요약(summary)을 저장합니다.
   */
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

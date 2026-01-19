# local-data (python lock/pyproject 실험용)

이 폴더는 `cdxgen`의 파서 함수들을 단독으로 실행해보는 “실험용 데이터/결과물” 공간입니다.

- `poetry/`: `parsePyLockData.run.js`로 `poetry.lock` 기반 의존성 파싱을 실험
- `pyproject/`: `parsePyProjectTomlFile.run.js`로 `pyproject.toml` 파싱을 실험

> NOTE
>
> - 이 폴더는 사람마다 데이터가 달라질 수 있으니, 커밋 정책은 팀 룰에 맞게 가져가세요.
> - 아래 명령어들은 Windows PowerShell 기준이지만, macOS/Linux에서도 `node`만 있으면 동일하게 동작합니다(경로 구분자만 주의).

---

## 사전 준비(필수)

1. Node.js 설치(권장: LTS)
2. 리포지토리 의존성 설치

```powershell
cd C:\Users\cjkim\Desktop\cdxgen\cdxgen
npm install
```

> 이 러너들은 `cdxgen` 패키지 내부 모듈을 import 하므로, 반드시 `cdxgen/cdxgen` 디렉토리에서 실행해야 합니다.

---

## 디렉토리 구조(권장)

```text
cdxgen/
	test/
		parsePyLockData.run.js
		parsePyProjectTomlFile.run.js
		local-data/
			README.md
			poetry/
				poetry.lock
				pyproject.toml              (선택)
				poetry.lock.parsed.json     (생성물)
				django.deps.json            (생성물)
			pyproject/
				pyproject.toml
				pyproject.summary.json      (생성물)
				pyproject.parsed.json       (생성물)
```

---

## 1) poetry.lock 파싱 (parsePyLockData)

### 입력 파일

- `./test/local-data/poetry/poetry.lock`
- (선택) `./test/local-data/poetry/pyproject.toml`
  - `parentComponent`, `directDepsKeys`, `groupDepsKeys`, `workspacePaths` 같은 “pyproject 기반 힌트”까지 같이 보고 싶을 때 사용

### 실행 예시

#### A. dependenciesList 요약 출력(가장 많이 씀)

```powershell
cd C:\Users\cjkim\Desktop\cdxgen\cdxgen
node .\test\parsePyLockData.run.js -l .\test\local-data\poetry\poetry.lock --show-deps
```

#### B. 전체 결과를 JSON으로 파일 저장

```powershell
node .\test\parsePyLockData.run.js -l .\test\local-data\poetry\poetry.lock --json -o .\test\local-data\poetry\poetry.lock.parsed.json
```

#### C. 특정 패키지 1개 노드만 저장(패키지명으로 찾기)

```powershell
node .\test\parsePyLockData.run.js -l .\test\local-data\poetry\poetry.lock --show-deps --name django -o .\test\local-data\poetry\django.deps.json
```

#### D. pyproject까지 같이 넘겨서 실행(선택)

```powershell
node .\test\parsePyLockData.run.js -l .\test\local-data\poetry\poetry.lock -p .\test\local-data\poetry\pyproject.toml --show-deps
```

### 결과물(생성 파일)

- `poetry.lock.parsed.json`: `parsePyLockData(...)` 반환 전체(JSON)
- `*.deps.json`: 특정 패키지 1개의 `{ ref, dependsOn[] }` 노드(JSON)

---

## 2) pyproject.toml 파싱 (parsePyProjectTomlFile)

### 입력 파일

- `./test/local-data/pyproject/pyproject.toml`

### 실행 예시

#### A. 요약 출력

```powershell
cd C:\Users\cjkim\Desktop\cdxgen\cdxgen
node .\test\parsePyProjectTomlFile.run.js -p .\test\local-data\pyproject\pyproject.toml
```

#### B. direct/group/workspace 상세 출력

```powershell
node .\test\parsePyProjectTomlFile.run.js -p .\test\local-data\pyproject\pyproject.toml --show-direct --show-groups --show-workspace-paths
```

#### C. 요약 JSON 저장 / 전체 JSON 저장

```powershell
node .\test\parsePyProjectTomlFile.run.js -p .\test\local-data\pyproject\pyproject.toml -o .\test\local-data\pyproject\pyproject.summary.json
node .\test\parsePyProjectTomlFile.run.js -p .\test\local-data\pyproject\pyproject.toml --json -o .\test\local-data\pyproject\pyproject.parsed.json
```

---

## 트러블슈팅

### Q1. `parentComponent: (none)`으로 나와요

- `parsePyLockData.run.js` 실행 시 `-p/--pyproject`를 안 주면 `parentComponent`는 비어있을 수 있습니다.
- `pyproject.toml` 경로를 함께 넘겨서 실행해보세요.

### Q2. workspace 관련 경고가 떠요(uv workspace)

- `pyproject.toml`의 `tool.uv.workspace.members` 패턴에 맞는 하위 `pyproject.toml`을 실제로 찾지 못하면,
  트리가 flatten될 수 있다는 경고가 나옵니다.
- workspace 실험을 하려면, 멤버 패턴이 실제 파일들을 찾을 수 있게 폴더 구조까지 같이 준비해야 합니다.

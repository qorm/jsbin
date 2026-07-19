# asm.js test262 conformance report

_Generated 2026-07-19T13:14:09.054Z — target macos-arm64_

## Headline

**asm.js passes 1318 / 6462 = 20.40% of the run test262 subset**
(selected `language/` + core `built-ins/`), one variant per test.

Of 33776 discovered test files in the selected dirs, 1466 were excluded up front (module=83, unsupported-feature=1383, intl/staging-dir=0); 32310 were eligible; 6462 were actually run (deterministic stride=5).

## Overall breakdown

| class | count | % of run |
|-------|------:|---------:|
| PASS         | 1318 | 20.40 |
| FAIL         | 4086 | 63.23 |
| COMPILE_FAIL | 601 | 9.30 |
| CRASH        | 457 | 7.07 |
| **run**      | **6462** | 100 |

## By area

| area | run | PASS | FAIL | COMPILE_FAIL | CRASH | pass% |
|------|----:|-----:|-----:|-------------:|------:|------:|
| built-ins/Array | 594 | 121 | 321 | 1 | 151 | 20.4 |
| built-ins/Boolean | 10 | 1 | 8 | 0 | 1 | 10.0 |
| built-ins/JSON | 33 | 8 | 25 | 0 | 0 | 24.2 |
| built-ins/Map | 41 | 7 | 32 | 0 | 2 | 17.1 |
| built-ins/Math | 65 | 21 | 44 | 0 | 0 | 32.3 |
| built-ins/Number | 68 | 26 | 41 | 0 | 1 | 38.2 |
| built-ins/Object | 682 | 141 | 480 | 0 | 61 | 20.7 |
| built-ins/Promise | 145 | 15 | 96 | 2 | 32 | 10.3 |
| built-ins/RegExp | 374 | 48 | 273 | 5 | 48 | 12.8 |
| built-ins/Set | 76 | 20 | 46 | 0 | 10 | 26.3 |
| built-ins/String | 244 | 49 | 194 | 0 | 1 | 20.1 |
| built-ins/Symbol | 15 | 3 | 12 | 0 | 0 | 20.0 |
| built-ins/TypedArray | 288 | 0 | 268 | 0 | 20 | 0.0 |
| language/expressions | 2005 | 488 | 1183 | 258 | 76 | 24.3 |
| language/statements | 1822 | 370 | 1063 | 335 | 54 | 20.3 |

## Excluded categories (counted, not scored)

- **module flag** (ES modules as test262 expects): 83
- **unsupported feature** (structurally out of scope, see UNSUPPORTED_FEATURES): 1383
- **intl402/ + staging/ dirs**: 0

Excluded-by-feature detail:

- `dynamic-import`: 688
- `source-phase-imports`: 237
- `explicit-resource-management`: 179
- `Array.fromAsync`: 95
- `cross-realm`: 74
- `import-attributes`: 42
- `tail-call-optimization`: 34
- `decorators`: 24
- `SharedArrayBuffer`: 10

## Top failing patterns (FAIL / COMPILE_FAIL / CRASH detail strings)

- **2252×** FAIL: assertion mismatch (Test262Error / wrong value)
- **601×** COMPILE_FAIL: asm.js could not compile (unsupported syntax / parser gap)
- **535×** FAIL: async ($DONE not signalled / promise rejected)
- **528×** FAIL: property-descriptor reflection (verifyProperty: length/name/writable/enumerable/configurable)
- **429×** FAIL: negative test wrong outcome (phase=parse)
- **360×** CRASH: run signal SIGSEGV
- **194×** FAIL: TypedArray/ArrayBuffer semantics
- **96×** FAIL: array contents mismatch (compareArray)
- **55×** CRASH: run signal SIGBUS
- **50×** FAIL: constructor-ness reflection (isConstructor / not-a-constructor)
- **42×** CRASH: run timeout
- **2×** FAIL: negative test wrong outcome (phase=runtime)

## Failures correlated with features (top tags among failing tests)

- `destructuring-binding`: 1020
- `class`: 805
- `async-iteration`: 801
- `generators`: 685
- `class-fields-public`: 386
- `default-parameters`: 338
- `Symbol.iterator`: 329
- `class-methods-private`: 273
- `TypedArray`: 271
- `class-static-methods-private`: 244
- `class-fields-private`: 200
- `regexp-unicode-property-escapes`: 133
- `BigInt`: 129
- `Symbol.asyncIterator`: 112
- `Symbol`: 97
- `async-functions`: 89
- `object-rest`: 76
- `arrow-function`: 70
- `class-static-fields-private`: 60
- `computed-property-names`: 58

## Methodology / reproducibility

- Corpus: official `tc39/test262` (main), vendored locally, NOT committed.
- Each test is assembled per test262 `INTERPRETING.md`: host shims (`print`, `$262` stub) +
  `harness/assert.js` + `harness/sta.js` (+ `doneprintHandle.js` for async) + any `includes:` +
  the test body. `raw` tests run the body alone. `onlyStrict` tests get a leading `"use strict";`.
- **One variant per test**: strict where `onlyStrict`, else the sloppy variant (we do not run
  both strict+sloppy for flag-less tests — a deliberate, stated bound to keep the AOT run tractable).
- Each assembled test is AOT-compiled (`node cli.js t.js -o t --target macos-arm64`, 30s timeout) then executed (10s timeout).
- Classification: PASS = positive test exits 0 (async: `Test262:AsyncTestComplete` on stdout);
  FAIL = compiled+ran but assertion threw / wrong exit; COMPILE_FAIL = asm.js could not compile;
  CRASH = signal/timeout. NEGATIVE tests invert: parse/resolution ⇒ PASS iff compile fails;
  runtime ⇒ PASS iff the binary exits nonzero without crashing.
- **Known limitation**: negative tests are verified by *phase* (compile-fail vs runtime-throw),
  not by the exact error constructor — asm.js does not print the thrown error's type, so a test
  that throws the wrong error type at the right phase is scored PASS. This slightly favors asm.js
  on negative tests and is disclosed here for honesty.

### Reproduce

```sh
# 1. vendor the corpus (NOT committed)
curl -sL -o /tmp/t262.tgz https://github.com/tc39/test262/archive/refs/heads/main.tar.gz
mkdir -p .test262-corpus && tar xzf /tmp/t262.tgz -C .test262-corpus --strip-components=1
# 2. run the harness
node tests/test262/run.mjs --stride 5 --jobs 10 --target macos-arm64
```

_Run wall-clock: 292.4s._

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const engine = require('../regex_engine.js');

function run(overrides) {
  return engine.runRegexExtraction({
    id: 'test-request',
    sourceText: '',
    patternInput: '/(?:)/g',
    maxMatches: 100,
    maxResultChars: 1000,
    ...overrides
  });
}

test('exports a Node-compatible pure-function API', function () {
  assert.equal(typeof engine.parseRegexPattern, 'function');
  assert.equal(typeof engine.normalizeRegexFlags, 'function');
  assert.equal(typeof engine.runRegexExtraction, 'function');
});

test('matches a raw pattern globally by default', function () {
  const result = run({ sourceText: 'foo foo', patternInput: 'foo' });

  assert.deepEqual(result, {
    id: 'test-request',
    ok: true,
    matches: ['foo', 'foo'],
    matchCount: 2,
    truncated: false,
    error: null
  });
});

test('parses regex literals with escaped slashes and class slashes', function () {
  const escapedSlash = run({
    sourceText: 'A/B a/b',
    patternInput: '/a\\/b/i'
  });
  const classSlash = run({
    sourceText: 'a///z',
    patternInput: '/[a/]+/g'
  });

  assert.deepEqual(escapedSlash.matches, ['A/B', 'a/b']);
  assert.equal(escapedSlash.matchCount, 2);
  assert.deepEqual(classSlash.matches, ['a///']);
  assert.equal(classSlash.matchCount, 1);
});

test('uses literal flags unless a non-empty explicit flags value is supplied', function () {
  const omitted = run({ sourceText: 'FOO', patternInput: '/foo/i' });
  const empty = run({ sourceText: 'FOO', patternInput: '/foo/i', flagsInput: '' });
  const whitespace = run({ sourceText: 'FOO', patternInput: '/foo/i', flagsInput: '   ' });
  const overridden = run({ sourceText: 'FOO', patternInput: '/foo/i', flagsInput: 'm' });

  assert.equal(omitted.matchCount, 1);
  assert.equal(empty.matchCount, 1);
  assert.equal(whitespace.matchCount, 1);
  assert.equal(overridden.matchCount, 0);
});

test('preserves capture output while reporting regex-hit count separately', function () {
  const result = run({
    sourceText: 'a1 b2',
    patternInput: '/([a-z])(\\d)/g'
  });

  assert.deepEqual(result.matches, ['a', '1', 'b', '2']);
  assert.equal(result.matchCount, 2);
});

test('falls back to the full match when every capture is empty or unmatched', function () {
  const result = run({
    sourceText: 'b ab',
    patternInput: '/(a)?b/g'
  });

  assert.deepEqual(result.matches, ['b', 'a']);
  assert.equal(result.matchCount, 2);
});

test('advances safely after zero-width matches', function () {
  const lookahead = run({ sourceText: 'aa', patternInput: '/(?=a)/g' });
  const unicodeEmpty = run({ sourceText: '😀', patternInput: '//u' });
  const codeUnitEmpty = run({ sourceText: '😀', patternInput: '//g' });

  assert.deepEqual(lookahead.matches, []);
  assert.equal(lookahead.matchCount, 2);
  assert.equal(lookahead.truncated, false);
  assert.equal(unicodeEmpty.matchCount, 2);
  assert.equal(codeUnitEmpty.matchCount, 3);
});

test('limits true regex hits and reports whether more hits exist', function () {
  const truncated = run({ sourceText: 'aaa', patternInput: '/a/g', maxMatches: 2 });
  const exact = run({ sourceText: 'aa', patternInput: '/a/g', maxMatches: 2 });
  const zeroBudget = run({ sourceText: 'a', patternInput: '/a/g', maxMatches: 0 });

  assert.deepEqual(truncated.matches, ['a', 'a']);
  assert.equal(truncated.matchCount, 2);
  assert.equal(truncated.truncated, true);
  assert.equal(exact.matchCount, 2);
  assert.equal(exact.truncated, false);
  assert.equal(zeroBudget.matchCount, 0);
  assert.equal(zeroBudget.truncated, true);
});

test('caps aggregate result characters and can truncate one captured value', function () {
  const result = run({
    sourceText: 'alpha beta',
    patternInput: '/([a-z]+)/g',
    maxResultChars: 7
  });
  const exact = run({
    sourceText: 'alpha',
    patternInput: '/([a-z]+)/g',
    maxResultChars: 5
  });

  assert.deepEqual(result.matches, ['alpha', 'be']);
  assert.equal(result.matchCount, 2);
  assert.equal(result.matches.join('').length, 7);
  assert.equal(result.truncated, true);
  assert.deepEqual(exact.matches, ['alpha']);
  assert.equal(exact.truncated, false);
});

test('does not split a UTF-16 surrogate pair at the result limit', function () {
  const result = run({
    sourceText: '😀',
    patternInput: '/(😀)/u',
    maxResultChars: 1
  });

  assert.deepEqual(result.matches, []);
  assert.equal(result.matchCount, 1);
  assert.equal(result.truncated, true);
});

test('accepts an empty regex literal and still terminates', function () {
  const result = run({ sourceText: 'x', patternInput: '//g' });

  assert.equal(result.ok, true);
  assert.equal(result.matchCount, 2);
  assert.deepEqual(result.matches, []);
});

test('returns structured errors for invalid flags, patterns, inputs, and limits', function () {
  const invalidFlag = run({ patternInput: '/foo/x' });
  const duplicateFlag = run({ patternInput: '/foo/gg' });
  const incompatibleFlags = run({ patternInput: 'foo', flagsInput: 'uv' });
  const invalidPattern = run({ patternInput: '(' });
  const missingSource = engine.runRegexExtraction({ id: 42, patternInput: 'foo' });
  const invalidLimit = run({ maxResultChars: -1 });

  for (const result of [
    invalidFlag,
    duplicateFlag,
    incompatibleFlags,
    invalidPattern,
    missingSource,
    invalidLimit
  ]) {
    assert.equal(result.ok, false);
    assert.deepEqual(result.matches, []);
    assert.equal(result.matchCount, 0);
    assert.equal(result.truncated, false);
    assert.equal(typeof result.error, 'string');
    assert.ok(result.error.length > 0);
  }
  assert.equal(missingSource.id, 42);
});

test('rejects regex source text and patterns above their hard input limits', function () {
  const oversizedSource = run({
    sourceText: 'x'.repeat(200001),
    patternInput: 'x'
  });
  const oversizedPattern = run({
    sourceText: 'x',
    patternInput: 'x'.repeat(10001)
  });

  assert.equal(oversizedSource.ok, false);
  assert.match(oversizedSource.error, /sourceText exceeds the 200000 character limit/);
  assert.equal(oversizedPattern.ok, false);
  assert.match(oversizedPattern.error, /patternInput exceeds the 10000 character limit/);
});

test('caller-provided regex hit and result budgets are clamped to hard maxima', function () {
  const hitLimited = run({
    sourceText: 'a'.repeat(1001),
    patternInput: 'a',
    maxMatches: Number.MAX_SAFE_INTEGER,
    maxResultChars: Number.MAX_SAFE_INTEGER
  });
  const resultLimited = run({
    sourceText: 'x'.repeat(100001),
    patternInput: '/(x+)/',
    maxMatches: Number.MAX_SAFE_INTEGER,
    maxResultChars: Number.MAX_SAFE_INTEGER
  });

  assert.equal(hitLimited.ok, true);
  assert.equal(hitLimited.matchCount, 1000);
  assert.equal(hitLimited.matches.length, 1000);
  assert.equal(hitLimited.truncated, true);
  assert.equal(resultLimited.ok, true);
  assert.equal(resultLimited.matchCount, 1);
  assert.equal(resultLimited.matches.length, 1);
  assert.equal(resultLimited.matches[0].length, 100000);
  assert.equal(resultLimited.truncated, true);
});

test('capture-heavy regexes cannot exceed the hard output-element limit', function () {
  const captureCount = 1001;
  const result = run({
    sourceText: 'a'.repeat(captureCount),
    patternInput: '/' + '(a)'.repeat(captureCount) + '/',
    maxMatches: Number.MAX_SAFE_INTEGER,
    maxResultChars: Number.MAX_SAFE_INTEGER
  });

  assert.equal(result.ok, true);
  assert.equal(result.matchCount, 1);
  assert.equal(result.matches.length, 1000);
  assert.ok(result.matches.every(value => value === 'a'));
  assert.equal(result.truncated, true);
});

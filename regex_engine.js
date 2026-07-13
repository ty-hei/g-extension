(function (root, factory) {
  'use strict';

  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.RegexEngine = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_MAX_MATCHES = 1000;
  const DEFAULT_MAX_RESULT_CHARS = 100000;
  const MAX_SOURCE_TEXT_CHARS = 200000;
  const MAX_PATTERN_CHARS = 10000;
  const MAX_REQUEST_ID_CHARS = 200;
  const MAX_OUTPUT_VALUES = 1000;
  const VALID_FLAGS = /^[dgimsuvy]*$/;

  function isEscapedAt(value, index) {
    let backslashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
      backslashCount += 1;
    }
    return backslashCount % 2 === 1;
  }

  function findLiteralClosingSlash(value) {
    for (let index = value.length - 1; index > 0; index -= 1) {
      if (value[index] !== '/' || isEscapedAt(value, index)) {
        continue;
      }

      const possibleFlags = value.slice(index + 1);
      if (/^[A-Za-z]*$/.test(possibleFlags)) {
        return index;
      }
    }

    return -1;
  }

  function parseRegexPattern(patternInput) {
    if (typeof patternInput !== 'string') {
      throw new TypeError('patternInput must be a string.');
    }

    const rawPattern = patternInput.trim();
    if (!rawPattern) {
      throw new Error('patternInput must not be empty.');
    }

    if (rawPattern[0] !== '/') {
      return {
        pattern: rawPattern,
        flags: '',
        isLiteral: false
      };
    }

    const closingSlash = findLiteralClosingSlash(rawPattern);
    if (closingSlash === -1) {
      return {
        pattern: rawPattern,
        flags: '',
        isLiteral: false
      };
    }

    return {
      pattern: rawPattern.slice(1, closingSlash),
      flags: rawPattern.slice(closingSlash + 1),
      isLiteral: true
    };
  }

  function normalizeRegexFlags(flags) {
    if (typeof flags !== 'string') {
      throw new TypeError('flags must be a string.');
    }

    const normalized = flags.trim();
    if (!VALID_FLAGS.test(normalized)) {
      throw new Error('Invalid regex flags. Only d, g, i, m, s, u, v, and y are supported.');
    }

    if (new Set(normalized).size !== normalized.length) {
      throw new Error('Invalid regex flags. Flags must not be repeated.');
    }

    if (normalized.includes('u') && normalized.includes('v')) {
      throw new Error('Invalid regex flags. The u and v flags cannot be used together.');
    }

    return normalized.includes('g') ? normalized : normalized + 'g';
  }

  function resolveFlags(parsedFlags, flagsInput) {
    if (flagsInput !== undefined && flagsInput !== null) {
      if (typeof flagsInput !== 'string') {
        throw new TypeError('flagsInput must be a string when provided.');
      }

      if (flagsInput.trim() !== '') {
        return normalizeRegexFlags(flagsInput);
      }
    }

    return normalizeRegexFlags(parsedFlags);
  }

  function normalizeLimit(value, fallback, hardMaximum, name) {
    if (value === undefined || value === null) {
      return fallback;
    }

    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(name + ' must be a non-negative safe integer.');
    }

    return Math.min(value, hardMaximum);
  }

  function advanceStringIndex(value, index, unicode) {
    if (!unicode || index + 1 >= value.length) {
      return index + 1;
    }

    const first = value.charCodeAt(index);
    if (first < 0xD800 || first > 0xDBFF) {
      return index + 1;
    }

    const second = value.charCodeAt(index + 1);
    if (second < 0xDC00 || second > 0xDFFF) {
      return index + 1;
    }

    return index + 2;
  }

  function getMatchValues(match) {
    const captures = match
      .slice(1)
      .filter(function (value) {
        return typeof value === 'string' && value.length > 0;
      });

    if (captures.length > 0) {
      return captures;
    }

    return match[0] ? [match[0]] : [];
  }

  function takeSafePrefix(value, maxChars) {
    let end = Math.min(value.length, maxChars);
    if (end > 0 && end < value.length) {
      const previous = value.charCodeAt(end - 1);
      const next = value.charCodeAt(end);
      if (previous >= 0xD800 && previous <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) {
        end -= 1;
      }
    }
    return value.slice(0, end);
  }

  function successResponse(id, matches, matchCount, truncated) {
    return {
      id: id,
      ok: true,
      matches: matches,
      matchCount: matchCount,
      truncated: truncated,
      error: null
    };
  }

  function errorResponse(id, error) {
    return {
      id: id,
      ok: false,
      matches: [],
      matchCount: 0,
      truncated: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }

  function runRegexExtraction(request) {
    const input = request && typeof request === 'object' ? request : {};
    const id = typeof input.id === 'string'
      ? takeSafePrefix(input.id, MAX_REQUEST_ID_CHARS)
      : input.id;

    try {
      if (typeof input.sourceText !== 'string') {
        throw new TypeError('sourceText must be a string.');
      }
      if (input.sourceText.length > MAX_SOURCE_TEXT_CHARS) {
        throw new Error('sourceText exceeds the 200000 character limit.');
      }
      if (typeof input.patternInput === 'string' && input.patternInput.length > MAX_PATTERN_CHARS) {
        throw new Error('patternInput exceeds the 10000 character limit.');
      }
      if (typeof id === 'string' && id.length > MAX_REQUEST_ID_CHARS) {
        throw new Error('id exceeds the 200 character limit.');
      }

      const parsed = parseRegexPattern(input.patternInput);
      const flags = resolveFlags(parsed.flags, input.flagsInput);
      const maxMatches = normalizeLimit(
        input.maxMatches,
        DEFAULT_MAX_MATCHES,
        DEFAULT_MAX_MATCHES,
        'maxMatches'
      );
      const maxResultChars = normalizeLimit(
        input.maxResultChars,
        DEFAULT_MAX_RESULT_CHARS,
        DEFAULT_MAX_RESULT_CHARS,
        'maxResultChars'
      );

      let regex;
      try {
        regex = new RegExp(parsed.pattern, flags);
      } catch (error) {
        throw new Error('Invalid regular expression: ' + error.message);
      }

      const matches = [];
      const unicode = flags.includes('u') || flags.includes('v');
      let matchCount = 0;
      let resultChars = 0;
      let truncated = false;

      while (true) {
        const match = regex.exec(input.sourceText);
        if (match === null) {
          break;
        }

        if (matchCount >= maxMatches) {
          truncated = true;
          break;
        }

        matchCount += 1;
        const values = getMatchValues(match);
        let resultLimitReached = false;

        for (const value of values) {
          if (matches.length >= MAX_OUTPUT_VALUES) {
            truncated = true;
            resultLimitReached = true;
            break;
          }
          const remainingChars = maxResultChars - resultChars;
          if (remainingChars <= 0) {
            truncated = true;
            resultLimitReached = true;
            break;
          }

          if (value.length > remainingChars) {
            const prefix = takeSafePrefix(value, remainingChars);
            if (prefix) {
              matches.push(prefix);
              resultChars += prefix.length;
            }
            truncated = true;
            resultLimitReached = true;
            break;
          }

          matches.push(value);
          resultChars += value.length;
        }

        if (match[0] === '') {
          regex.lastIndex = advanceStringIndex(input.sourceText, regex.lastIndex, unicode);
        }

        if (resultLimitReached) {
          break;
        }
      }

      return successResponse(id, matches, matchCount, truncated);
    } catch (error) {
      return errorResponse(id, error);
    }
  }

  return {
    DEFAULT_MAX_MATCHES: DEFAULT_MAX_MATCHES,
    DEFAULT_MAX_RESULT_CHARS: DEFAULT_MAX_RESULT_CHARS,
    advanceStringIndex: advanceStringIndex,
    normalizeRegexFlags: normalizeRegexFlags,
    parseRegexPattern: parseRegexPattern,
    runRegexExtraction: runRegexExtraction
  };
});

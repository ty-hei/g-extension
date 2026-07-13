'use strict';

importScripts('regex_engine.js');

self.addEventListener('message', function (event) {
  const request = event && event.data;
  const id = request && typeof request === 'object' ? request.id : undefined;

  try {
    self.postMessage(self.RegexEngine.runRegexExtraction(request));
  } catch (error) {
    self.postMessage({
      id: id,
      ok: false,
      matches: [],
      matchCount: 0,
      truncated: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

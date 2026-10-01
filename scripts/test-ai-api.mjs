import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import handler from "../api/policy-ai.js";

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    writes: [],
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    send(body) { this.body = body; return this; },
    write(chunk) { this.writes.push(String(chunk)); return true; },
    end() { return this; },
  };
}

// Minimal Claude Messages API payloads for the stubbed fetch.
function claudeMessage(text, stopReason = "end_turn") {
  const message = { id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", content: stopReason === "refusal" ? [] : [{ type: "text", text }], stop_reason: stopReason, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } };
  return new Response(JSON.stringify(message), { status: 200, headers: { "content-type": "application/json", "request-id": "req_test" } });
}
function claudeStream(text) {
  const events = [
    ["message_start", { type: "message_start", message: { id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } }],
    ["message_stop", { type: "message_stop" }],
  ];
  const sse = events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");
  return new Response(sse, { status: 200, headers: { "content-type": "text/event-stream", "request-id": "req_test" } });
}
const retrievedFrom = (request) => JSON.parse(request.messages[0].content.split("Retrieved source records:\n")[1]);

const originalKey = process.env.ANTHROPIC_API_KEY;
const originalFetch = globalThis.fetch;
try {
  delete process.env.ANTHROPIC_API_KEY;
  const options = mockResponse();
  await handler({ method: "OPTIONS", headers: { origin: "http://localhost:4173" } }, options);
  assert.equal(options.statusCode, 204);
  assert.equal(options.headers["Access-Control-Allow-Origin"], "http://localhost:4173");

  const denied = mockResponse();
  await handler({ method: "POST", headers: { origin: "https://not-allowed.example" }, body: {} }, denied);
  assert.equal(denied.statusCode, 403);

  const unconfigured = mockResponse();
  await handler({ method: "POST", headers: { origin: "https://albakhit0089.github.io" }, body: { question: "What did Oman do on water policy?" } }, unconfigured);
  assert.equal(unconfigured.statusCode, 503);
  assert.match(unconfigured.body, /not configured/i);

  const payload = JSON.parse(await readFile(new URL("../data/gcc-yemen-measures.json", import.meta.url), "utf8"));
  const omanRecord = payload.records.find((record) => record.country === "Oman" && /water|irrigation/i.test(`${record.domain} ${record.description}`));
  assert.ok(omanRecord, "Expected an Oman water-related source record.");
  process.env.ANTHROPIC_API_KEY = "test-only-key";
  let claudeCalls = 0;
  let retrievedRecords = [];
  globalThis.fetch = async (url, options) => {
    claudeCalls += 1;
    assert.match(String(url), /\/v1\/messages/);
    const headers = new Headers(options.headers);
    assert.equal(headers.get("x-api-key"), "test-only-key");
    assert.match(headers.get("anthropic-beta") || "", /server-side-fallback-2026-07-01/);
    const request = JSON.parse(options.body);
    assert.equal(request.model, "claude-opus-5-5");
    assert.equal(request.fallbacks, "default");
    retrievedRecords = retrievedFrom(request);
    assert.ok(retrievedRecords.length > 0);
    assert.ok(retrievedRecords.every((record) => record.country === "Oman"));
    return claudeMessage(`A supported Oman policy finding [${retrievedRecords[0].id}]. Unsupported claim [0000000000000000].`);
  };

  const grounded = mockResponse();
  await handler({ method: "POST", headers: { origin: "https://albakhit0089.github.io" }, body: { question: "Oman water policy measures", filters: { country: "Oman" } } }, grounded);
  assert.equal(grounded.statusCode, 200, grounded.body);
  const answer = JSON.parse(grounded.body);
  assert.equal(answer.sources.length, retrievedRecords.length);
  assert.equal(answer.sources[0].id, retrievedRecords[0].id);
  assert.match(answer.answer, new RegExp(retrievedRecords[0].id));
  assert.doesNotMatch(answer.answer, /0000000000000000/);
  assert.equal(claudeCalls, 1);

  const outOfScope = mockResponse();
  await handler({ method: "POST", headers: { origin: "https://albakhit0089.github.io" }, body: { question: "What policies did Egypt adopt?" } }, outOfScope);
  assert.equal(outOfScope.statusCode, 200);
  assert.match(JSON.parse(outOfScope.body).answer, /covers GCC States and Yemen/i);
  assert.equal(claudeCalls, 1, "Out-of-scope questions must not reach the model.");

  globalThis.fetch = async (_url, options) => claudeMessage(`UAE finding [${retrievedFrom(JSON.parse(options.body))[0].id}].`);
  const arabicHamza = mockResponse();
  await handler({ method: "POST", headers: { origin: "https://albakhit0089.github.io" }, body: { question: "الإمارات" } }, arabicHamza);
  assert.equal(arabicHamza.statusCode, 200, arabicHamza.body);
  assert.ok(JSON.parse(arabicHamza.body).sources.length > 0, "Hamza-spelled Arabic country names must expand to their English synonyms.");

  globalThis.fetch = async () => claudeMessage("", "refusal");
  const refused = mockResponse();
  await handler({ method: "POST", headers: { origin: "https://albakhit0089.github.io" }, body: { question: "Oman water policy measures" } }, refused);
  assert.equal(refused.statusCode, 200, refused.body);
  assert.match(JSON.parse(refused.body).answer, /declined/i);

  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    assert.equal(request.stream, true);
    return claudeStream(`Streaming policy finding [${retrievedFrom(request)[0].id}].`);
  };
  const streamed = mockResponse();
  await handler({ method: "POST", headers: { origin: "https://albakhit0089.github.io" }, body: { question: "Oman water policy measures", filters: { country: "Oman" }, stream: true } }, streamed);
  const streamBody = streamed.writes.join("");
  assert.equal(streamed.statusCode, 200);
  assert.match(streamed.headers["Content-Type"], /text\/event-stream/);
  assert.match(streamBody, /event: sources/);
  assert.match(streamBody, /event: delta\ndata: \{"text":"Streaming policy finding/);
  assert.doesNotMatch(streamBody, /event: error/);
  assert.match(streamBody, /event: done/);

  console.log("AI API smoke checks passed: CORS, no-key handling, regional retrieval, Arabic synonyms, citations, out-of-scope refusal, model refusal, and Claude streaming.");
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
}

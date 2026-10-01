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

const originalKey = process.env.OPENAI_API_KEY;
const originalFetch = globalThis.fetch;
try {
  delete process.env.OPENAI_API_KEY;
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
  process.env.OPENAI_API_KEY = "test-only-key";
  let openAiCalls = 0;
  let retrievedRecords = [];
  globalThis.fetch = async (_url, options) => {
    openAiCalls += 1;
    const request = JSON.parse(options.body);
    retrievedRecords = JSON.parse(request.input.split("Retrieved source records:\n")[1]);
    assert.ok(retrievedRecords.length > 0);
    assert.ok(retrievedRecords.every((record) => record.country === "Oman"));
    return { ok: true, json: async () => ({ output_text: `A supported Oman policy finding [${retrievedRecords[0].id}]. Unsupported claim [0000000000000000].` }) };
  };

  const grounded = mockResponse();
  await handler({ method: "POST", headers: { origin: "https://albakhit0089.github.io" }, body: { question: "Oman water policy measures", filters: { country: "Oman" } } }, grounded);
  assert.equal(grounded.statusCode, 200, grounded.body);
  const answer = JSON.parse(grounded.body);
  assert.equal(answer.sources.length, retrievedRecords.length);
  assert.equal(answer.sources[0].id, retrievedRecords[0].id);
  assert.doesNotMatch(answer.answer, /0000000000000000/);
  assert.equal(openAiCalls, 1);

  const outOfScope = mockResponse();
  await handler({ method: "POST", headers: { origin: "https://albakhit0089.github.io" }, body: { question: "What policies did Egypt adopt?" } }, outOfScope);
  assert.equal(outOfScope.statusCode, 200);
  assert.match(JSON.parse(outOfScope.body).answer, /covers GCC States and Yemen/i);
  assert.equal(openAiCalls, 1, "Out-of-scope questions must not reach the model.");

  globalThis.fetch = async (_url, options) => {
    const retrieved = JSON.parse(JSON.parse(options.body).input.split("Retrieved source records:\n")[1]);
    return { ok: true, json: async () => ({ output_text: `UAE finding [${retrieved[0].id}].` }) };
  };
  const arabicHamza = mockResponse();
  await handler({ method: "POST", headers: { origin: "https://albakhit0089.github.io" }, body: { question: "الإمارات" } }, arabicHamza);
  assert.equal(arabicHamza.statusCode, 200, arabicHamza.body);
  assert.ok(JSON.parse(arabicHamza.body).sources.length > 0, "Hamza-spelled Arabic country names must expand to their English synonyms.");

  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    assert.equal(request.stream, true);
    const retrieved = JSON.parse(request.input.split("Retrieved source records:\n")[1]);
    const delta = `Streaming policy finding [${retrieved[0].id}].`;
    const chunk = `event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta })}\n\nevent: response.completed\ndata: {}\n\n`;
    return { ok: true, body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); } }) };
  };
  const streamed = mockResponse();
  await handler({ method: "POST", headers: { origin: "https://albakhit0089.github.io" }, body: { question: "Oman water policy measures", filters: { country: "Oman" }, stream: true } }, streamed);
  const streamBody = streamed.writes.join("");
  assert.equal(streamed.statusCode, 200);
  assert.match(streamed.headers["Content-Type"], /text\/event-stream/);
  assert.match(streamBody, /event: sources/);
  assert.match(streamBody, /event: delta/);
  assert.match(streamBody, /event: done/);

  console.log("AI API smoke checks passed: CORS, no-key handling, regional retrieval, Arabic synonyms, citations, out-of-scope refusal, and streaming.");
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
}

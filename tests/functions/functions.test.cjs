const assert = require("node:assert/strict");
const { test } = require("node:test");

const submitProof = require("../../netlify/functions/submit-proof.cjs");
const aiGenerate = require("../../netlify/functions/ai-generate.cjs");
const publicCampaign = require("../../netlify/functions/public-campaign.cjs");
const publicTestimonials = require("../../netlify/functions/public-testimonials.cjs");
const widget = require("../../netlify/functions/widget.cjs");
const webhooks = require("../../netlify/functions/webhooks.cjs");

function event(body = {}, overrides = {}) {
  return {
    httpMethod: "POST",
    body: JSON.stringify(body),
    headers: { "x-forwarded-for": "203.0.113.7" },
    queryStringParameters: {},
    ...overrides
  };
}

test("public proof rejects missing consent", async () => {
  const response = await submitProof.handler(event({
    campaignId: "q2-customer-advocacy",
    customerName: "Asha Mehta",
    customerEmail: "asha@example.com",
    customerCompany: "Northstar Labs",
    feedbackText: "This feedback is long enough to clear the required validation threshold.",
    rating: 5,
    consentPublish: false,
    consentAiProcessing: true,
    consentContact: false
  }));

  assert.equal(response.statusCode, 400);
  assert.match(response.body, /consent/i);
});

test("public proof has a safe demo fallback without live storage credentials", async () => {
  const response = await submitProof.handler(event({
    campaignId: "q2-customer-advocacy",
    customerName: "Asha Mehta",
    customerEmail: "asha@example.com",
    customerCompany: "Northstar Labs",
    feedbackText: "This feedback is long enough to clear the required validation threshold.",
    rating: 5,
    consentPublish: true,
    consentAiProcessing: true,
    consentContact: false
  }));

  assert.equal(response.statusCode, 201);
  assert.equal(JSON.parse(response.body).mode, "demo");
});

test("AI fallback returns drafts rather than publish instructions", async () => {
  const response = await aiGenerate.handler(event({
    feedback: "The customer said their team could find and reuse authentic customer proof more quickly.",
    workspaceId: "acme-demo",
    campaignId: "q2-customer-advocacy",
    sourceSubmissionIds: []
  }));

  const payload = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.ok(Array.isArray(payload.assets));
  assert.equal(payload.assets.some((asset) => /publish automatically/i.test(asset.body)), false);
});

test("widget response contains no live customer material until storage is configured", async () => {
  const response = await widget.handler(event({}, {
    httpMethod: "GET",
    body: "",
    queryStringParameters: { workspaceId: "acme-demo" }
  }));

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["Access-Control-Allow-Origin"], /^\*$/);
  assert.match(response.body, /Approved customer stories will appear here/);
});

test("public content endpoints do not invent or reveal customer proof before configuration", async () => {
  const campaignResponse = await publicCampaign.handler(event({}, {
    httpMethod: "GET",
    body: "",
    queryStringParameters: { campaignId: "q2-customer-advocacy" }
  }));
  const testimonialResponse = await publicTestimonials.handler(event({}, {
    httpMethod: "GET",
    body: "",
    queryStringParameters: { workspaceId: "11111111-1111-4111-8111-111111111111" }
  }));

  assert.equal(campaignResponse.statusCode, 503);
  assert.equal(testimonialResponse.statusCode, 503);
  assert.doesNotMatch(testimonialResponse.body, /Olivia|customer proof/i);
});

test("unconfigured webhook providers are rejected", async () => {
  const response = await webhooks.handler(event({}, { queryStringParameters: { provider: "twilio" } }));

  assert.equal(response.statusCode, 404);
});

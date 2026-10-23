/** Unit tests for utils (run: node --test tests/unit/) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// utils.js is a browser ES module with no imports; evaluate it in a sandbox
// and collect the exported pure functions.
const src = readFileSync(
  fileURLToPath(new URL("../../public/js/core/utils.js", import.meta.url)),
  "utf8",
);

const sandbox = {};
const body = src
  .replace(/^export function /gm, "function ")
  .replace(/^export const /gm, "const ")
  .replace(/^export let /gm, "let ")
  .replace(/^export \{[^}]*\};?/gm, "");
const factory = new Function(
  `${body}
  return { isValidSlug, parsePriceInput, formatPrice, validateImage, RESERVED_SLUGS };`,
);
const { isValidSlug, parsePriceInput, formatPrice, validateImage, RESERVED_SLUGS } = factory();

test("isValidSlug accepts valid slugs", () => {
  assert.equal(isValidSlug("demo-cafe"), true);
  assert.equal(isValidSlug("cafe2"), true);
  assert.equal(isValidSlug("a"), true);
  assert.equal(isValidSlug("a-b-c"), true);
});

test("isValidSlug rejects invalid slugs", () => {
  assert.equal(isValidSlug(""), false);
  assert.equal(isValidSlug("-abc"), false);
  assert.equal(isValidSlug("abc-"), false);
  assert.equal(isValidSlug("a--b"), false);
  assert.equal(isValidSlug("Has Uppercase"), false);
  assert.equal(isValidSlug("بسة"), false);
  assert.equal(isValidSlug("admin"), false); // reserved
  assert.equal(isValidSlug("api"), false); // reserved
  assert.ok(RESERVED_SLUGS.has("superadmin"));
});

test("parsePriceInput handles Persian digits and separators", () => {
  assert.equal(parsePriceInput("۱۲۰٬۰۰۰"), 120000);
  assert.equal(parsePriceInput("1,200,000"), 1200000);
  assert.equal(parsePriceInput(" 8500 "), 8500);
  assert.ok(Number.isNaN(parsePriceInput("abc")));
});

test("formatPrice uses cafe display label and divisor", () => {
  const cafeToman = { currency_code: "IRR", currency_display: "تومان", price_divisor: 1 };
  assert.match(formatPrice(cafeToman, 1200000, "fa"), /تومان/);
  const cafeIrr = { currency_code: "IRR", currency_display: null, price_divisor: 1 };
  assert.ok(formatPrice(cafeIrr, 850000, "fa").length > 0);
  const en = { currency_code: "IRR", currency_display: "Toman", price_divisor: 1 };
  assert.match(formatPrice(en, 1000, "en"), /Toman/);
});

test("validateImage enforces type and size", () => {
  assert.equal(validateImage({ type: "image/jpeg", size: 1000 }).ok, true);
  assert.equal(validateImage({ type: "image/svg+xml", size: 1000 }).ok, false); // SVG rejected (XSS-safe)
  assert.equal(validateImage({ type: "image/png", size: 10 * 1024 * 1024 }).ok, false);
});

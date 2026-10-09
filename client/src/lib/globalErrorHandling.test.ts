import { test } from "node:test";
import assert from "node:assert/strict";
import { isOpaqueCrossOriginScriptError } from "./globalErrorHandling";

test("recognizes cross-origin script errors whose details the browser hides", () => {
  const origin = "https://www.roster-app.com";
  assert.equal(isOpaqueCrossOriginScriptError({
    message: "Script error.",
    error: null,
    filename: "",
  }, origin), true);
  assert.equal(isOpaqueCrossOriginScriptError({
    message: "Script error.",
    error: null,
    filename: "https://cdn.example.com/sdk.js",
  }, origin), true);
});

test("does not suppress errors with same-origin details", () => {
  const origin = "https://www.roster-app.com";
  assert.equal(isOpaqueCrossOriginScriptError({
    message: "Script error.",
    error: null,
    filename: "https://www.roster-app.com/assets/app.js",
  }, origin), false);
  assert.equal(isOpaqueCrossOriginScriptError({
    message: "Script error.",
    error: new Error("Script error."),
    filename: "",
  }, origin), false);
});

test("does not classify ordinary global errors as opaque script errors", () => {
  assert.equal(isOpaqueCrossOriginScriptError({
    message: "Cannot read properties of undefined",
    error: new TypeError("Cannot read properties of undefined"),
    filename: "https://www.roster-app.com/assets/app.js",
  }, "https://www.roster-app.com"), false);
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  getPublicConfig,
  getSecret,
  getValue,
  updateConfig,
} from "./settings";

const STORE = join(process.cwd(), "config.local.json");

function clean() {
  if (existsSync(STORE)) rmSync(STORE);
}

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-for-config-encryption";
  clean();
});
afterEach(clean);

describe("settings store", () => {
  it("round-trips a secret through encryption and resolves it server-side", () => {
    updateConfig({ secrets: { anthropicApiKey: "sk-ant-supersecret-1234" } });
    expect(getSecret("anthropicApiKey")).toBe("sk-ant-supersecret-1234");
  });

  it("never exposes secret values in the public view — only last4 + presence", () => {
    updateConfig({ secrets: { anthropicApiKey: "sk-ant-supersecret-9876" } });
    const pub = getPublicConfig();
    expect(JSON.stringify(pub)).not.toContain("supersecret");
    expect(pub.secrets.anthropicApiKey.configured).toBe(true);
    expect(pub.secrets.anthropicApiKey.last4).toBe("9876");
    expect(pub.secrets.anthropicApiKey.source).toBe("config");
  });

  it("falls back to env when no stored override exists", () => {
    process.env.ANTHROPIC_MODEL = "claude-opus-4-8";
    expect(getValue("model")).toBe("claude-opus-4-8");
    delete process.env.ANTHROPIC_MODEL;
  });

  it("stored value overrides env", () => {
    process.env.ANTHROPIC_MODEL = "claude-opus-4-8";
    updateConfig({ values: { model: "claude-sonnet-4-6" } });
    expect(getValue("model")).toBe("claude-sonnet-4-6");
    delete process.env.ANTHROPIC_MODEL;
  });

  it("rejects an unknown model", () => {
    updateConfig({ values: { model: "totally-not-a-model" } });
    expect(getValue("model")).toBeUndefined();
  });

  it("clears a secret when passed null", () => {
    updateConfig({ secrets: { zeroentropyApiKey: "ze-key-abcd" } });
    expect(getSecret("zeroentropyApiKey")).toBe("ze-key-abcd");
    updateConfig({ secrets: { zeroentropyApiKey: null } });
    expect(getSecret("zeroentropyApiKey")).toBeUndefined();
  });
});

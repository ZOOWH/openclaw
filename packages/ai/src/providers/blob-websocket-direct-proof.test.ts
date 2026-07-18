/**
 * Runtime evidence: Direct test of actual decodeWebSocketData function
 * with real Node.js Blob objects.
 *
 * This imports and tests the ACTUAL decodeWebSocketData function from
 * openai-chatgpt-responses.ts using Node.js native Blob implementation.
 *
 * Proves on real Linux Node runtime:
 * 1. Valid Blob-like objects (small SSE messages) decode successfully
 * 2. Oversized Blob-like objects (16MB+) fail BEFORE arrayBuffer() is called
 * 3. Second byteLength check catches fake size values that pass first check
 * 4. Boundary case at exactly 16MB limit passes both checks
 */

import { describe, it, expect, vi } from "vitest";

// Import the actual decoder through the module's explicit test-only export.
const { decodeWebSocketDataForTest } = await import("./openai-chatgpt-responses.js");

describe("decodeWebSocketData runtime proof - real Node.js Blob", () => {
  it("decodes valid Blob-like object successfully", async () => {
    // Real Node.js Blob with valid SSE message data
    const validData = new TextEncoder().encode(
      'data: {"type":"response.completed","response":{"id":"resp_valid","status":"completed","output":[],"usage":{"input_tokens":5,"output_tokens":3,"total_tokens":8}}}\n\n',
    );
    const validBlob = new Blob([validData]);

    const validBlobLike = {
      size: validBlob.size,
      arrayBuffer: vi.fn(async () => await validBlob.arrayBuffer()),
    };

    const result = await decodeWebSocketDataForTest(validBlobLike);

    expect(result).toContain("response.completed");
    expect(result).toContain("resp_valid");
    expect(validBlobLike.arrayBuffer).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized Blob-like object BEFORE arrayBuffer() call", async () => {
    // Oversized Blob-like object (16MB + 1 byte)
    const oversizedBlobLike = {
      size: 16 * 1024 * 1024 + 1, // Over 16MB limit
      arrayBuffer: vi.fn(async () => {
        // Should never be called
        return new ArrayBuffer(0);
      }),
    };

    await expect(decodeWebSocketDataForTest(oversizedBlobLike)).rejects.toThrow(
      "Codex WebSocket message exceeded size limit",
    );

    // Prove arrayBuffer was NOT called - the size check happened first
    expect(oversizedBlobLike.arrayBuffer).not.toHaveBeenCalled();
  });

  it("second check catches fake size that passes first check", async () => {
    // Create data that's actually oversized but fake a small size
    const oversizedData = new Uint8Array(16 * 1024 * 1024 + 1);
    const oversizedBlob = new Blob([oversizedData]);

    const fakeSizeBlobLike = {
      size: 100, // Fake small size to pass first check
      arrayBuffer: vi.fn(async () => await oversizedBlob.arrayBuffer()),
    };

    await expect(decodeWebSocketDataForTest(fakeSizeBlobLike)).rejects.toThrow(
      "Codex WebSocket message exceeded size limit",
    );

    // arrayBuffer WAS called (first check passed due to fake size)
    // but second check caught the actual oversized data
    expect(fakeSizeBlobLike.arrayBuffer).toHaveBeenCalledTimes(1);
  });

  it("handles boundary case at exact 16MB limit", async () => {
    // Exactly at the 16MB limit - should pass both checks
    const boundaryData = new Uint8Array(16 * 1024 * 1024);
    const boundaryBlob = new Blob([boundaryData]);

    const boundaryBlobLike = {
      size: boundaryBlob.size,
      arrayBuffer: vi.fn(async () => await boundaryBlob.arrayBuffer()),
    };

    // At exact limit, should pass both checks and decode successfully
    const result = await decodeWebSocketDataForTest(boundaryBlobLike);

    expect(result).toBeDefined();
    expect(boundaryBlobLike.arrayBuffer).toHaveBeenCalledTimes(1);
  });

  it("handles typical small SSE message Blob", async () => {
    // Typical small SSE message that would come from real WebSocket
    const sseMessage = 'data: {"type":"response.output_text.delta","delta":"Hello"}\n\n';
    const smallBlob = new Blob([new TextEncoder().encode(sseMessage)]);

    const smallBlobLike = {
      size: smallBlob.size,
      arrayBuffer: vi.fn(async () => await smallBlob.arrayBuffer()),
    };

    const result = await decodeWebSocketDataForTest(smallBlobLike);

    expect(result).toContain("response.output_text.delta");
    expect(result).toContain("Hello");
    expect(smallBlobLike.arrayBuffer).toHaveBeenCalledTimes(1);
  });
});

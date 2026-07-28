import { describe, expect, it } from "vitest"

import {
  CategorizationValidationError,
  MAX_CATEGORIZATION_BATCH_SIZE,
  partitionCategorizationMentions,
  validateCategorizationBatch,
  validateCategorizationOutput,
} from "./index"

const mention = (index: number) => ({
  id: `mention-${index}`,
  text: `Mention text ${index}`,
})

function expectCategorizationError(
  callback: () => unknown,
  code: CategorizationValidationError["code"],
): void {
  try {
    callback()
    throw new Error("Expected categorization validation to fail")
  } catch (error) {
    expect(error).toBeInstanceOf(CategorizationValidationError)
    expect((error as CategorizationValidationError).code).toBe(code)
  }
}

describe("categorization batches", () => {
  it("partitions inputs into ordered batches of at most 50", () => {
    const mentions = Array.from({ length: 121 }, (_, index) => mention(index))
    const batches = partitionCategorizationMentions(mentions)
    expect(MAX_CATEGORIZATION_BATCH_SIZE).toBe(50)
    expect(batches.map((batch) => batch.length)).toEqual([50, 50, 21])
    expect(batches.flat()).toEqual(mentions)
    expect(partitionCategorizationMentions([])).toEqual([])
  })

  it("validates size, shape, trimming, and globally unique ids", () => {
    expect(
      validateCategorizationBatch([{ id: " mention-1 ", text: " hello " }]),
    ).toEqual([{ id: "mention-1", text: "hello" }])

    expect(() => validateCategorizationBatch([])).toThrow(
      CategorizationValidationError,
    )
    expectCategorizationError(
      () =>
        validateCategorizationBatch(
          Array.from({ length: 51 }, (_, index) => mention(index)),
        ),
      "BATCH_TOO_LARGE",
    )
    expectCategorizationError(
      () => validateCategorizationBatch([mention(1), mention(1)]),
      "DUPLICATE_INPUT_ID",
    )
    expectCategorizationError(
      () =>
        partitionCategorizationMentions([
          ...Array.from({ length: 50 }, (_, index) => mention(index)),
          mention(1),
        ]),
      "DUPLICATE_INPUT_ID",
    )
    expectCategorizationError(
      () => validateCategorizationBatch([{ id: "x", text: "" }]),
      "INVALID_INPUT",
    )
  })
})

describe("categorization output validation", () => {
  const inputs = [mention(1), mention(2)]

  it("accepts exact JSON output and restores input order", () => {
    expect(
      validateCategorizationOutput(
        inputs,
        JSON.stringify({
          results: [
            { mentionId: "mention-2", category: "Praise" },
            { mentionId: "mention-1", category: "Question" },
          ],
        }),
      ),
    ).toEqual([
      { mentionId: "mention-1", category: "Question" },
      { mentionId: "mention-2", category: "Praise" },
    ])
  })

  it.each([
    "not json",
    { results: [{ mentionId: "mention-1", category: "Question" }] },
    {
      results: [
        { mentionId: "mention-1", category: "Question" },
        { mentionId: "mention-1", category: "Praise" },
      ],
    },
    {
      results: [
        { mentionId: "mention-1", category: "Question" },
        { mentionId: "unknown", category: "Praise" },
      ],
    },
    {
      results: [
        { mentionId: "mention-1", category: "Spam" },
        { mentionId: "mention-2", category: "Praise" },
      ],
    },
    {
      results: [
        { mentionId: "mention-1", category: "Question", confidence: 1 },
        { mentionId: "mention-2", category: "Praise" },
      ],
    },
    { results: [], extra: true },
  ])(
    "rejects partial, duplicate, invented, or malformed output %#",
    (output) => {
      expectCategorizationError(
        () => validateCategorizationOutput(inputs, output),
        "INVALID_OUTPUT",
      )
    },
  )
})

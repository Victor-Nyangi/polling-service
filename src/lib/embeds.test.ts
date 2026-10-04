import { describe, expect, it } from "vitest";
import { embeddedRows, firstEmbedded } from "@/lib/embeds";

// The shape PostgREST actually returns for `poll:polls ( ... )`, where
// `polls.post_id` is `not null unique` and so the relationship is to-one.
const toOneEmbed = {
  id: "poll-1",
  question: "What do you think is the best series on Netflix in 2026",
  status: "active",
  poll_options: [{ id: "option-1", label: "The Gentlemen", position: 1 }],
  poll_votes: [],
};

// The shape it returns for a to-many relationship such as `reactions ( ... )`,
// and for a to-one relationship whose uniqueness it cannot prove.
const toManyEmbed = [toOneEmbed];

describe("embeddedRows", () => {
  it("unwraps a to-one embed returned as a bare object", () => {
    expect(embeddedRows(toOneEmbed)).toEqual([toOneEmbed]);
  });

  it("passes through a to-many embed returned as an array", () => {
    expect(embeddedRows(toManyEmbed)).toEqual([toOneEmbed]);
  });

  it("keeps every row of a multi-row embed, in order", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];

    expect(embeddedRows(rows)).toEqual(rows);
  });

  it("is empty for an absent relationship", () => {
    expect(embeddedRows(undefined)).toEqual([]);
    expect(embeddedRows(null)).toEqual([]);
    expect(embeddedRows([])).toEqual([]);
  });

  it("is empty for a scalar, which is never a row", () => {
    expect(embeddedRows("poll-1")).toEqual([]);
    expect(embeddedRows(7)).toEqual([]);
    expect(embeddedRows(false)).toEqual([]);
  });

  it("drops non-row entries instead of handing them on as rows", () => {
    expect(embeddedRows([null, { id: "a" }, "x", 1])).toEqual([{ id: "a" }]);
  });

  it("does not treat a nested array as a row", () => {
    expect(embeddedRows([[{ id: "a" }]])).toEqual([]);
  });
});

describe("firstEmbedded", () => {
  it("returns the row when the to-one embed is a bare object", () => {
    // The regression this file exists for: the old call site did
    // `Array.isArray(row.poll) ? row.poll : []` and dropped this shape, which
    // made every post map to null and the feed render as empty.
    expect(firstEmbedded(toOneEmbed)).toBe(toOneEmbed);
  });

  it("returns the row when the same embed arrives wrapped in an array", () => {
    expect(firstEmbedded(toManyEmbed)).toBe(toOneEmbed);
  });

  it("agrees with embeddedRows on both shapes", () => {
    expect(firstEmbedded(toOneEmbed)).toEqual(firstEmbedded(toManyEmbed));
  });

  it("returns undefined for an absent relationship", () => {
    expect(firstEmbedded(undefined)).toBeUndefined();
    expect(firstEmbedded(null)).toBeUndefined();
    expect(firstEmbedded([])).toBeUndefined();
  });

  it("returns the first row when several arrive", () => {
    expect(firstEmbedded([{ id: "a" }, { id: "b" }])).toEqual({ id: "a" });
  });
});

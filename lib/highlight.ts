/**
 * Where a hunt actually landed in a listing's name.
 *
 * GRIDGO ranks the hunt across the whole search document — the name, the
 * description, the kind of work, the option labels and the prep steps — so a
 * tile can come back for words that are nowhere on it. Marking the run in the
 * name is what tells a shop *why* this sample is on the wall, and marking only
 * the name is deliberate: a caption that lit up in three places would be a
 * highlighter, not an answer.
 *
 * The mark is weight, never colour. Yellow is spent on the one primary action
 * and a wash across a name would read as a status this listing does not have.
 */

export type HuntSegment = { text: string; match: boolean };

/**
 * The hunt, as the words GRIDGO would have looked for.
 *
 * Whitespace-separated, deduplicated, longest first so "tarpaulin" wins over
 * "tarp" where both are typed and the runs would otherwise nest. Punctuation is
 * left alone: a shop hunting "10x10" means the digits and the x.
 */
export function huntTerms(query: string): string[] {
  const seen = new Set<string>();
  for (const word of query.toLowerCase().split(/\s+/)) {
    if (word) seen.add(word);
  }
  return [...seen].sort((a, b) => b.length - a.length);
}

/**
 * Split one line of text into the runs a hunt matched and the runs it did not.
 *
 * Always returns at least one segment, so a caller can render the result
 * without asking whether the hunt was empty. A blank hunt is one unmatched run,
 * which is exactly the resting state of every name on the wall.
 */
export function huntSegments(text: string, query: string): HuntSegment[] {
  const terms = huntTerms(query ?? "");
  if (!text || terms.length === 0) return [{ text: text ?? "", match: false }];

  const haystack = text.toLowerCase();
  const marked = new Array<boolean>(text.length).fill(false);

  for (const term of terms) {
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(term, from);
      if (at === -1) break;
      for (let i = at; i < at + term.length; i += 1) marked[i] = true;
      from = at + term.length;
    }
  }

  const segments: HuntSegment[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i += 1) {
    if (i === text.length || marked[i] !== marked[start]) {
      segments.push({ text: text.slice(start, i), match: marked[start] });
      start = i;
    }
  }
  return segments.length ? segments : [{ text, match: false }];
}

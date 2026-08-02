export type NamedPlayer = { name: string };

export function playerNameComparisonKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`´]/g, "'")
    .toLocaleLowerCase("it-IT")
    .replace(/[đð]/g, "d")
    .replace(/ł/g, "l")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/þ/g, "th")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function suggestPlayerName(sourceName: string, candidates: NamedPlayer[]) {
  const ranked = candidates
    .map((candidate) => ({ candidate, score: playerNameSimilarity(sourceName, candidate.name) }))
    .sort((left, right) => right.score - left.score || left.candidate.name.localeCompare(right.candidate.name, "it"));
  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.score < 0.6) return null;
  if (second && best.score < 0.9 && best.score - second.score < 0.04) return null;
  return best.candidate.name;
}

export function playerNameSimilarity(leftName: string, rightName: string) {
  const left = playerNameComparisonKey(leftName);
  const right = playerNameComparisonKey(rightName);
  if (!left || !right) return 0;
  if (left === right || compact(left) === compact(right)) return 1;

  const leftTokens = withoutSuffix(left.split(" "));
  const rightTokens = withoutSuffix(right.split(" "));
  if (leftTokens.join(" ") === rightTokens.join(" ")) return 0.99;
  const leftFirst = leftTokens[0] ?? "";
  const rightFirst = rightTokens[0] ?? "";
  const leftLast = leftTokens.at(-1) ?? "";
  const rightLast = rightTokens.at(-1) ?? "";
  if (leftFirst === rightFirst && leftLast === rightLast) return 0.94;
  if (leftLast === rightLast && firstNamesCompatible(leftFirst, rightFirst)) return 0.82;

  const editScore = 1 - levenshtein(compact(left), compact(right)) / Math.max(compact(left).length, compact(right).length, 1);
  const tokenScore = diceCoefficient(new Set(leftTokens), new Set(rightTokens));
  const lastNameBonus = leftLast === rightLast ? 0.12 : 0;
  return Math.min(0.93, editScore * 0.58 + tokenScore * 0.42 + lastNameBonus);
}

function compact(value: string) {
  return value.replace(/\s+/g, "");
}

function withoutSuffix(tokens: string[]) {
  const suffixes = new Set(["jr", "sr", "ii", "iii", "iv"]);
  return suffixes.has(tokens.at(-1) ?? "") ? tokens.slice(0, -1) : tokens;
}

function firstNamesCompatible(left: string, right: string) {
  if (!left || !right) return false;
  if (left[0] !== right[0]) return false;
  return left.length === 1 || right.length === 1 || left.startsWith(right) || right.startsWith(left);
}

function diceCoefficient(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  left.forEach((token) => { if (right.has(token)) overlap += 1; });
  return 2 * overlap / (left.size + right.size);
}

function levenshtein(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

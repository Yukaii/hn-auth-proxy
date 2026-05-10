export type UpvotedItem = {
  id: number;
  rank: number | null;
  title: string;
  url: string;
  site: string | null;
  score: number | null;
  by: string | null;
  age: string | null;
  time: number | null;
  comments: number | null;
  itemUrl: string;
};

export type UpvotedPage = {
  user: string;
  page: number;
  items: UpvotedItem[];
  nextPage: number | null;
  nextUrl: string | null;
};

function decodeHtml(value: string): string {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function textContent(html: string): string {
  return decodeHtml(html.replaceAll(/<[^>]*>/g, "")).trim();
}

function numberFrom(value: string | null | undefined): number | null {
  if (!value) return null;

  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function firstMatch(input: string, pattern: RegExp): string | null {
  return input.match(pattern)?.[1] ?? null;
}

export function parseUpvotedPage(html: string, user: string, page: number): UpvotedPage {
  const rowPattern =
    /<tr class="athing submission" id="(?<id>\d+)">(?<titleRow>[\s\S]*?)<\/tr><tr><td colspan="2"><\/td><td class="subtext">(?<subtext>[\s\S]*?)<\/td><\/tr>/g;
  const items: UpvotedItem[] = [];

  for (const match of html.matchAll(rowPattern)) {
    const id = Number(match.groups?.id);
    const titleRow = match.groups?.titleRow ?? "";
    const subtext = match.groups?.subtext ?? "";
    const rank = numberFrom(firstMatch(titleRow, /<span class="rank">([^<]*)<\/span>/));
    const titleLink = titleRow.match(
      /<span class="titleline"><a href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/,
    );
    const titleUrl = titleLink?.[2] ? decodeHtml(titleLink[2]) : `item?id=${id}`;
    const title = titleLink?.[3] ? textContent(titleLink[3]) : "";
    const site = firstMatch(titleRow, /<span class="sitestr">([\s\S]*?)<\/span>/);
    const score = numberFrom(firstMatch(subtext, /<span class="score"[^>]*>([^<]*)<\/span>/));
    const by = firstMatch(subtext, /<a href="user\?id=[^"]+" class="hnuser">([^<]*)<\/a>/);
    const ageMatch = subtext.match(
      /<span class="age" title="[^"]*? (\d+)"><a href="item\?id=\d+">([\s\S]*?)<\/a><\/span>/,
    );
    const time = ageMatch?.[1] ? Number(ageMatch[1]) : null;
    const age = ageMatch?.[2] ? textContent(ageMatch[2]) : null;
    const commentsText = firstMatch(
      subtext,
      /<a href="item\?id=\d+">([^<]*?(?:comments|discuss))<\/a>/,
    );

    items.push({
      id,
      rank,
      title,
      url: titleUrl,
      site: site ? textContent(site) : null,
      score,
      by: by ? textContent(by) : null,
      age,
      time,
      comments: commentsText?.includes("discuss") ? 0 : numberFrom(commentsText),
      itemUrl: `item?id=${id}`,
    });
  }

  const moreUrl = firstMatch(html, /<a href="(upvoted\?id=[^"]+)" class="morelink"[^>]*>More<\/a>/);
  const nextPage = moreUrl
    ? numberFrom(
        new URL(`https://news.ycombinator.com/${decodeHtml(moreUrl)}`).searchParams.get("p"),
      )
    : null;

  return {
    user,
    page,
    items,
    nextPage,
    nextUrl: moreUrl ? decodeHtml(moreUrl) : null,
  };
}

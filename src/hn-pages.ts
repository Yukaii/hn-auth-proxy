export type SubmissionItem = {
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

export type CommentItem = {
  id: number;
  by: string | null;
  age: string | null;
  time: number | null;
  text: string;
  textHtml: string;
  parentUrl: string | null;
  contextUrl: string | null;
  itemUrl: string;
  story: {
    id: number | null;
    title: string | null;
    url: string | null;
  } | null;
};

export type HnPage<T> = {
  user: string;
  page: number;
  items: T[];
  nextPage: number | null;
  nextUrl: string | null;
};

export function decodeHtml(value: string): string {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

export function textContent(html: string): string {
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

function nextLink(html: string, path: string): { nextPage: number | null; nextUrl: string | null } {
  const moreUrl =
    Array.from(html.matchAll(/<a href="([^"]+)" class="morelink"[^>]*>More<\/a>/g), (match) =>
      match[1] ? decodeHtml(match[1]) : null,
    ).find((href) => href?.startsWith(`${path}?id=`)) ?? null;
  const nextPage = moreUrl
    ? numberFrom(
        new URL(`https://news.ycombinator.com/${decodeHtml(moreUrl)}`).searchParams.get("p"),
      )
    : null;

  return {
    nextPage,
    nextUrl: moreUrl ? decodeHtml(moreUrl) : null,
  };
}

export function parseSubmissionPage(
  html: string,
  user: string,
  page: number,
  path = "upvoted",
): HnPage<SubmissionItem> {
  const rowPattern =
    /<tr class="athing submission" id="(?<id>\d+)">(?<titleRow>[\s\S]*?)<\/tr><tr><td colspan="2"><\/td><td class="subtext">(?<subtext>[\s\S]*?)<\/td><\/tr>/g;
  const items: SubmissionItem[] = [];

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

  const more = nextLink(html, path);

  return {
    user,
    page,
    items,
    nextPage: more.nextPage,
    nextUrl: more.nextUrl,
  };
}

export function parseCommentPage(
  html: string,
  user: string,
  page: number,
  path: string,
): HnPage<CommentItem> {
  const rowPattern =
    /<tr class="athing(?: comtr)?" id="(?<id>\d+)">(?<row>[\s\S]*?)(?=<tr class="(?:athing|spacer)"|<\/table><\/td><\/tr>|<\/table><\/td><\/tr><tr>)/g;
  const items: CommentItem[] = [];

  for (const match of html.matchAll(rowPattern)) {
    const id = Number(match.groups?.id);
    const row = match.groups?.row ?? "";
    const by = firstMatch(row, /<a href="user\?id=[^"]+" class="hnuser">([^<]*)<\/a>/);
    const ageMatch = row.match(
      /<span class="age" title="[^"]*? (\d+)"><a href="item\?id=\d+">([\s\S]*?)<\/a><\/span>/,
    );
    const parentUrl = firstMatch(row, /<a href="(item\?id=\d+)">parent<\/a>/);
    const contextUrl = firstMatch(row, /<a href="(item\?id=\d+#\d+)" rel="nofollow">context<\/a>/);
    const storyMatch = row.match(
      /<span class="onstory">[\s\S]*?<a href="item\?id=(\d+)" title="([^"]*)">([\s\S]*?)<\/a>/,
    );
    const commentHtml = firstMatch(
      row,
      /<div class="commtext[^"]*">([\s\S]*?)<\/div><div class="reply">/,
    );

    items.push({
      id,
      by: by ? textContent(by) : null,
      age: ageMatch?.[2] ? textContent(ageMatch[2]) : null,
      time: ageMatch?.[1] ? Number(ageMatch[1]) : null,
      text: commentHtml ? textContent(commentHtml) : "",
      textHtml: commentHtml ? decodeHtml(commentHtml) : "",
      parentUrl: parentUrl ? decodeHtml(parentUrl) : null,
      contextUrl: contextUrl ? decodeHtml(contextUrl) : null,
      itemUrl: `item?id=${id}`,
      story: storyMatch
        ? {
            id: Number(storyMatch[1]),
            title: decodeHtml(storyMatch[2] || textContent(storyMatch[3] ?? "")),
            url: `item?id=${storyMatch[1]}`,
          }
        : null,
    });
  }

  const more = nextLink(html, path);

  return {
    user,
    page,
    items,
    nextPage: more.nextPage,
    nextUrl: more.nextUrl,
  };
}

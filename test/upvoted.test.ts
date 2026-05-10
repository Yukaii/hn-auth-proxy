import { describe, expect, it } from "vitest";
import { parseUpvotedPage } from "../src/upvoted";

describe("upvoted page parser", () => {
  it("parses HN upvoted submission rows and pagination", () => {
    const html = `<tr class="athing submission" id="37144985"><td align="right" valign="top" class="title"><span class="rank">1.</span></td><td valign="top" class="votelinks"><center><a id='up_37144985' class='clicky nosee'  href='vote?id=37144985&amp;how=up&amp;auth=abc&amp;goto=upvoted%3Fid%3Dotacorn'><div class='votearrow' title='upvote'></div></a></center></td><td class="title"><span class="titleline"><a href="https://htmx.org/posts/2023-06-06-htmx-github-accelerator/">Htmx is part of the GitHub Accelerator</a><span class="sitebit comhead"> (<a href="from?site=htmx.org"><span class="sitestr">htmx.org</span></a>)</span></span></td></tr><tr><td colspan="2"></td><td class="subtext"><span class="subline"><span class="score" id="score_37144985">1109 points</span> by <a href="user?id=jjdeveloper" class="hnuser">jjdeveloper</a> <span class="age" title="2023-08-16T10:19:32 1692181172"><a href="item?id=37144985">on Aug 16, 2023</a></span> <span id="unv_37144985"></span> | <a href="item?id=37144985">487&nbsp;comments</a></span></td></tr><tr class="spacer" style="height:5px"></tr><a href="upvoted?id=otacorn&amp;p=2" class="morelink" rel="next">More</a>`;

    expect(parseUpvotedPage(html, "otacorn", 1)).toEqual({
      user: "otacorn",
      page: 1,
      nextPage: 2,
      nextUrl: "upvoted?id=otacorn&p=2",
      items: [
        {
          id: 37144985,
          rank: 1,
          title: "Htmx is part of the GitHub Accelerator",
          url: "https://htmx.org/posts/2023-06-06-htmx-github-accelerator/",
          site: "htmx.org",
          score: 1109,
          by: "jjdeveloper",
          age: "on Aug 16, 2023",
          time: 1692181172,
          comments: 487,
          itemUrl: "item?id=37144985",
        },
      ],
    });
  });
});

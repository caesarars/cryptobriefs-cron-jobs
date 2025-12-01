const axios = require("axios");
const Parser = require("rss-parser");
const News = require("../models/News");

const http = axios.create({ timeout: 5000 });
const aiHttp = axios.create({ timeout: 10000 }); // khusus AI, kasih timeout lebih longgar
const parser = new Parser();
const BASE_API_URL = process.env.BASE_API_URL;

// List RSS crypto yang kita pakai
const FEEDS = [
  "https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml",
  "https://cointelegraph.com/rss",
];

// List coin yang mau kita deteksi dari judul
const COIN_KEYWORDS = {
  BTC: ["BTC", "Bitcoin"],
  ETH: ["ETH", "Ethereum"],
  SOL: ["SOL", "Solana"],
  BNB: ["BNB"],
  XRP: ["XRP", "Ripple"],
  DOGE: ["DOGE", "Dogecoin"],
  ADA: ["ADA", "Cardano"],
  MATIC: ["MATIC", "Polygon"],
  LINK: ["LINK", "Chainlink"],
};

// Deteksi coins dari judul pakai keyword simple
function detectCoinsFromTitle(title = "") {
  const upperTitle = title.toUpperCase();
  const coins = [];

  for (const [symbol, keywords] of Object.entries(COIN_KEYWORDS)) {
    if (keywords.some((kw) => upperTitle.includes(kw.toUpperCase()))) {
      coins.push(symbol);
    }
  }

  return coins;
}

// (Opsional) cari image dari content/enclosure
function extractImage(item) {
  // Kalau RSS-nya pakai enclosure
  if (item.enclosure && item.enclosure.url) {
    return item.enclosure.url;
  }

  // Kalau ada content:encoded dan ada <img>
  const content = item["content:encoded"] || item.content || "";
  const imgMatch = content.match(/<img[^>]+src="([^">]+)"/i);
  if (imgMatch && imgMatch[1]) {
    return imgMatch[1];
  }

  return "https://via.placeholder.com/300";
}

// 🎯 Panggil DeepSeek buat klasifikasi sentiment: bullish / bearish / neutral
async function getSentimentForNews({ title, link }) {
  const apiKey = process.env.DEEP_SEEK_KEY;
  if (!apiKey) {
    console.warn("[AI] DEEP_SEEK_KEY not set, fallback to neutral");
    return "neutral";
  }

  const systemPrompt =
    "You are a crypto market sentiment classifier. Your task is to read crypto news headlines and classify short-term market sentiment as exactly one of three labels: bullish, bearish, or neutral. Respond with ONLY ONE WORD: 'bullish', 'bearish', or 'neutral'. No explanation.";
  const userPrompt = `Classify the sentiment of this crypto news headline:\n\n"${title}"\n\nAnswer with ONLY one word: bullish, bearish, or neutral.`;

  try {
    const response = await aiHttp.post(
      "https://api.deepseek.com/chat/completions",
      {
        model: "deepseek-chat", // atau "deepseek-reasoner" kalau mau
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 3,
        temperature: 0,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const raw =
      response.data?.choices?.[0]?.message?.content?.trim().toLowerCase() ||
      "";

    if (raw.includes("bullish")) return "bullish";
    if (raw.includes("bearish")) return "bearish";
    return "neutral";
  } catch (err) {
    console.error("[AI SENTIMENT ERROR]", err.message, "for link:", link);
    return "neutral";
  }
}

// Fetch berita terbaru dari beberapa RSS
async function fetchLatestNews() {
  const allArticles = [];

  for (const feedUrl of FEEDS) {
    try {
      const feed = await parser.parseURL(feedUrl);
      // Ambil cuma beberapa terbaru dari tiap feed (misal 10)
      const items = (feed.items || []).slice(0, 10);

      const mapped = items.map((item) => {
        const title = item.title || "Untitled";
        const link = item.link;
        const image = extractImage(item);
        const published =
          item.isoDate || item.pubDate || new Date().toISOString();
        const coins = detectCoinsFromTitle(title);

        return {
          title,
          link,
          image,
          published: new Date(published),
          // sentiment diisi nanti pakai AI
          sentiment: "neutral",
          coins,
        };
      });

      allArticles.push(...mapped);
    } catch (err) {
      console.error(`[RSS ERROR] Failed to fetch ${feedUrl}:`, err.message);
    }
  }

  // Optional: sort berdasarkan tanggal terbaru
  allArticles.sort(
    (a, b) => new Date(b.published) - new Date(a.published)
  );

  return allArticles;
}

async function insertNewsJob() {
  console.log("[CRON] insertNewsJob start");

  const allNews = await fetchLatestNews();

  // Batasin total per run biar gak kebanyakan call AI
  const newsList = allNews.slice(0, 10); // misal max 10 per run

  // Ambil semua link yang valid
  const links = newsList.map((n) => n.link).filter(Boolean);

  // Ambil dokumen yang sudah ada di DB untuk link2 ini
  const existingDocs = await News.find(
    { link: { $in: links } },
    { link: 1, sentiment: 1, _id: 0 }
  );

  // Bikin map: link -> dokumen existing
  const existingMap = new Map(
    existingDocs.map((doc) => [doc.link, doc])
  );

  const ops = [];

  for (const item of newsList) {
    const { title, link, image, published, coins = [] } = item;
    if (!link) continue;

    const existing = existingMap.get(link);
    let sentiment = existing?.sentiment || "neutral";

    // Hanya panggil AI kalau:
    // - belum ada dokumen, atau
    // - sentiment kosong / neutral
    if (!existing || !existing.sentiment || existing.sentiment === "neutral") {
      sentiment = await getSentimentForNews({ title, link });
      console.log("📰 title:", title, "- sentiment (AI) -", sentiment);
    } else {
      console.log(
        "📰 title:",
        title,
        "- skip AI, existing sentiment -",
        existing.sentiment
      );
    }

    // Hanya kirim update kalau:
    // - dokumen belum ada (insert), atau
    // - sentiment baru beda dari sentiment lama
    if (!existing || sentiment !== existing.sentiment) {
      ops.push(
        News.updateOne(
          { link },
          {
            $setOnInsert: {
              title,
              link,
              image: image || "https://via.placeholder.com/300",
              published: published ? new Date(published) : new Date(),
              coins,
            },
            $set: {
              sentiment,
            },
          },
          { upsert: true }
        )
      );
    }
  }

  const results = await Promise.all(ops);

  console.log(
    "[CRON] insertNewsJob done, attempted upserts:",
    results.length
  );
}

async function addSummaryNews () {
    console.log('[CRON] Add Summary : Starting')
    const response = await axios.post(`${BASE_API_URL}api/briefs/addSummary`, {});
    console.log("Add Summary Response : ", response)
    console.log('[CRON] Add Summary : Finished')
}


module.exports = { insertNewsJob, addSummaryNews };

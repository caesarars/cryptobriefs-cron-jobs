const axios = require("axios");
const { GoogleGenAI } = require("@google/genai");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BASE_API_URL = process.env.BASE_API_URL;

if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is not set. Please set the environment variable.");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Dipakai kalau nanti mau request HTTP khusus ke AI / service lain
const aiHttp = axios.create({ timeout: 20000 });

const DEFAULT_TONE = "Professional";
const DEFAULT_LENGTH = "Medium (~400-500 words)";
const DEFAULT_AUDIENCE = "General Audience";
const DEFAULT_TAGS =
  "AI,crypto,trading,Portfolio,Technology,Blockchain,Cryptocurrency,Crypto,bots,Bitcoin,btc";

async function generateBlogPost(
  topic,
  tone = DEFAULT_TONE,
  length = DEFAULT_LENGTH,
  targetAudience = DEFAULT_AUDIENCE
) {
  if (!GEMINI_API_KEY) {
    return "Error: API key not configured. Please contact support.";
  }

  const prompt = `
You are an expert financial writer specializing in cryptocurrency and blockchain technology for a blog called "Crypto Briefs".

Your task is to write a blog post about the following topic: "${topic}".

Please adhere to the following parameters for the article:
- Tone: ${tone}
- Target Audience: ${targetAudience}
- Length: ${length}

The post should be well-structured and formatted in Markdown.
Use markdown for structure, including headings (e.g., '## Subheading'), bulleted lists (e.g., '- List item'), and bold text (e.g., '**bold**').
Do not include a main title (H1, or '# Title') in the output, as the user has already provided it.
Make sure it is compatible with ReactMarkdown library.
And make sure it has escape string because it will be copied into Postman.
Start directly with the main content of the article.
AND PLEASE DO NOT WRAP it by DOUBLE QUOTES.
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        temperature: 0.7,
        topP: 1,
        topK: 32,
      },
    });

    // NOTE: tergantung SDK, bisa jadi harus pakai response.text()
    return response.text;
  } catch (error) {
    console.error("Error generating blog post:", error);
    return "An error occurred while generating the blog post. Please try again.";
  }
}

const generateIdeasTrends = async () =>  {
  try {
    const prompt = `
  You are a senior crypto SEO strategist and market analyst.
  Analyze the past 24 hours of crypto activity and identify the 3–4 strongest narratives based on:
  - Social momentum (X viral threads, trending tokens)
  - Whale movements & on-chain anomalies
  - Volume spikes & volatility events
  - Governance votes, protocol upgrades
  - Hacks/exploits/security alerts
  - Regulatory developments
  - Funding rounds / ecosystem partnerships
  For each narrative, extract 2 low-competition long-tail keyword angles with high search potential.

  Requirements:
  - 10 total titles, numbered 1-10 (plain text, no markdown bulleting).
  - Each title <= 14 words, highlight action or insight.
  - Include a specific hook (data point, timeframe, region, protocol, or narrative).
  - Mix tones: analytical, experimental, regulatory, community-focused.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        temperature: 0.8,
      },
    });

    const raw = (response.text || "").toString();
    return raw.replace(/"/g, "").trim();
  } catch (error) {
    console.error("Error generating ideas title:", error);
    return "Failed to generate title.";
  }
}

const generateOptimizedTitle = async (currentTitle) => {
  const prompt = `
    You are an expert copywriter and SEO specialist. Your task is to take a blog post title and make it more compelling, engaging, and SEO-friendly.
    Keep the core topic the same, but improve the wording to attract more readers.
    Do not add quotes or any extra explanatory text around your response. Only return the improved title as a single line of plain text.
    Make sure the optimized title is not too long
    Original Title: "${currentTitle}"

    Optimized Title:
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
       config: {
        temperature: 0.8,
      }
    });
    return response.text.replace(/"/g, '').trim();
  } catch (error) {
    console.error("Error generating optimized title:", error);
    return "Failed to generate title.";
  }
};

function extractIdeas(rawText) {
  if (!rawText) return [];
  return Array.from(rawText.matchAll(/\d+\.\s+(.*)/g))
    .map((match) => (match[1] || "").trim())
    .filter(Boolean);
}

async function generateImage(title, tone) {
  if (!GEMINI_API_KEY) {
    return "Error: API key not configured.";
  }

  const prompt = `
help me to generate an image for my image cover in medium.com for my article titled: ${title} with tone: ${tone}
`;

  try {
    const response = await ai.models.generateImages({
      model: "imagen-4.0-generate-preview-06-06",
      prompt: prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: "image/jpeg",
        aspectRatio: "16:9",
      },
    });

    const base64ImageBytes = response.generatedImages[0].image.imageBytes;
    const compressedBase64 = await compressBase64Image(base64ImageBytes);

    return {
      previewImage: `data:image/jpeg;base64,${compressedBase64}`,
      base64: compressedBase64,
    };
  } catch (error) {
    console.error("Error generating image:", error);
    return "An error occurred while generating the image. Please try again.";
  }
}

async function compressBase64Image(base64ImageBytes, options) {
  const opts = options || {};
  const maxWidth = opts.maxWidth || 1280;
  const maxHeight = opts.maxHeight || 720;
  const quality = opts.quality || 0.75;

  // Kalau di server (Node), gak ada document → langsung return original
  if (typeof document === "undefined") {
    return base64ImageBytes;
  }

  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      let width = image.width;
      let height = image.height;
      const aspectRatio = width / height;

      if (width > maxWidth) {
        width = maxWidth;
        height = Math.round(width / aspectRatio);
      }

      if (height > maxHeight) {
        height = maxHeight;
        width = Math.round(height * aspectRatio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) {
        resolve(base64ImageBytes);
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const compressedBase64 = dataUrl.split(",")[1];
      resolve(compressedBase64 || base64ImageBytes);
    };

    image.onerror = () => resolve(base64ImageBytes);
    image.src = `data:image/jpeg;base64,${base64ImageBytes}`;
  });
}

async function uploadImage(imageBase64) {
  if (!BASE_API_URL) {
    throw new Error("BASE_API_URL is not configured.");
  }

  const uploadUrl = `${BASE_API_URL}api/upload`;
  const response = await axios.post(uploadUrl, { base64: imageBase64 });
  return response.data.url;
}

async function createBlogPostJob() {
  try {
    console.log("[CRON] createBlogPostJob start");
    const ideasRaw = await generateIdeasTrends();
    const ideas = extractIdeas(ideasRaw);
    console.log("[CRON] AI: creating ideas", ideas);
    const randomIndex = Math.floor(Math.random() * ideas.length);
    const ideaTitle = ideas[randomIndex];
    if (!ideaTitle) {
      console.warn("[CRON] AI: no idea generated, skipping blog creation");
      return;
    }

    const optimizedTitle = generateOptimizedTitle(ideaTitle)

    console.log("[CRON] AI: selected idea", ideaTitle);
    console.log("[CRON] AI: Optimize title", optimizedTitle);


    const article = await generateBlogPost(
      optimizedTitle,
      DEFAULT_TONE,
      DEFAULT_LENGTH,
      DEFAULT_AUDIENCE
    );

    console.log("[CRON] AI: article generated");

    const imageResponse = await generateImage(ideaTitle, DEFAULT_TONE);
    let uploadedImageUrl = "";

    if (typeof imageResponse !== "string" && imageResponse && imageResponse.base64) {
      uploadedImageUrl = await uploadImage(imageResponse.base64);
    }

    console.log("[CRON] AI: image generated & uploaded:", uploadedImageUrl);

    try {
      const blogResponse = await axios.post(`${BASE_API_URL}api/blog`, {
        title: ideaTitle,
        content: article,
        blog: ideaTitle,
        tag: DEFAULT_TAGS,
        imageUrl: uploadedImageUrl,
      });

      console.log(
        "[CRON] blog response =",
        blogResponse.data || blogResponse.status
      );
      console.log("[CRON] createBlogPostJob done");
    } catch (err) {
      console.error("[CRON] createBlogPostJob error on POST /api/blog:", err.message);
    }
  } catch (err) {
    console.error("[CRON] createBlogPostJob fatal error:", err);
  }
}

module.exports = {
  createBlogPostJob,
};

const mongoose = require("mongoose");

const newsSchema = new mongoose.Schema({
  title: { type: String, required: true },
  link: { type: String, required: true, unique: true },
  image: { type: String, default: "https://via.placeholder.com/300" },
  published: { type: Date, required: true },
  sentiment: {
    type: String,
    enum: ["bullish", "bearish", "neutral"],
    default: "neutral",
  },
  coins: { type: [String], default: [] }, // Array of coin symbols (BTC, ETH, etc.)
});

const News = mongoose.models.News || mongoose.model("News", newsSchema);

module.exports = News;

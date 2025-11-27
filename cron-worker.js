// cron-worker.js
require("dotenv").config();
const mongoose = require("mongoose");
const cron = require("node-cron");
const { insertNewsJob } = require("./jobs/insertNewsJobs");
const { createBlogPostJob } = require("./jobs/createBlogPostJob");

const mongoURI = process.env.MONGO_DB_URL;
const password = process.env.PASSWORD;

async function connectDB() {
  try {
    await mongoose.connect(mongoURI, {});
    console.log("✅ MongoDB connected (cron worker)");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
}

async function main() {
  await connectDB();
  createBlogPostJob().catch((err) =>
    console.error("First blog job error:", err)
  );

  // Cron tiap jam (menit ke-0)
  cron.schedule("0 * * * *", () => {
    console.log("⏰ Running insertNewsJob (cron)");
    insertNewsJob().catch((err) => console.error("Cron error:", err));
  });

  // Cron tiap jam buat blog (menit ke-15 biar gak tabrakan sama insert news)
  cron.schedule("15 * * * *", () => {
    console.log("✍️  Running createBlogPostJob (cron)");
    createBlogPostJob().catch((err) =>
      console.error("Blog cron error:", err)
    );
  });
}

main();

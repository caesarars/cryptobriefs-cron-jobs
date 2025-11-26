// cron-worker.js
require("dotenv").config();
const mongoose = require("mongoose");
const cron = require("node-cron");
const { insertNewsJob } = require("./jobs/insertNewsJobs");

const mongoURI = process.env.MONGO_DB_URL;

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

  // Test sekali saat start
  insertNewsJob().catch((err) => console.error("First run error:", err));

  // Cron tiap jam (menit ke-0)
  cron.schedule("0 * * * *", () => {
    console.log("⏰ Running insertNewsJob (cron)");
    insertNewsJob().catch((err) => console.error("Cron error:", err));
  });
}

main();

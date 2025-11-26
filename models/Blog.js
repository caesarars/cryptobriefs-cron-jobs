// models/Blog.js
import { Schema, model, models } from "mongoose";

const blogsSchema = new Schema({
  title: String,
  blog: String,
  content: String,
  imageUrl: String,
  created_at: Date,
  tag: String,
  slug: String,
});

export default models.Blog || model("Blog", blogsSchema);

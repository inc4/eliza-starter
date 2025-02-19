import { body, param } from "express-validator";

export const validatePostTweetSchema = [
    body("content").notEmpty().withMessage("Tweet is empty"),
    param("agentId").notEmpty().withMessage("Agent id is required")
];

export type ProductFeedbackRow = {
  id: string;
  user_id: string;
  body: string;
  screenshot_path: string | null;
  plan: string;
  founder_tagged: boolean;
  created_at: string;
};

export const FEEDBACK_MAX_CHARS = 8000;
export const FEEDBACK_SCREENSHOT_BUCKET = "product-feedback";

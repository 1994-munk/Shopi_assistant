// Shared vocabulary for the Shopi agent. Everything the agent reads or writes is typed here.

export const CATEGORIES = ['produce', 'dairy', 'bakery', 'pantry', 'drinks', 'frozen', 'snacks'] as const;
export type Category = (typeof CATEGORIES)[number];

export const DIETARY_TAGS = ['vegan', 'vegetarian', 'gluten-free', 'dairy-free', 'organic', 'low-sugar'] as const;
export type DietaryTag = (typeof DIETARY_TAGS)[number];

export interface Product {
  id: string;
  name: string;
  category: Category;
  price_cents: number;
  description: string;
  tags: DietaryTag[];
  in_stock: boolean;
}

export interface BasketLine {
  productId: string;
  quantity: number;
}

// What the shopper asked for, as understood from one message.
export type UserIntent =
  | 'search'
  | 'add_to_basket'
  | 'remove_from_basket'
  | 'show_basket'
  | 'clear_basket'
  | 'checkout'
  | 'help'
  | 'unclear';

// Outcomes can also be a guardrail decision rather than a shopping intent.
export type ReplyIntent = UserIntent | 'blocked' | 'off_topic';

export type SafetyFlag = 'too_long' | 'prompt_injection' | 'personal_data' | 'off_topic';

// Set when Shopi has listed several options and is waiting for the shopper to pick one.
export interface PendingChoice {
  quantity: number;
  candidateIds: string[];
}

// Everything the agent remembers between turns. The basket is also stored in the database.
export interface ConversationState {
  basket: BasketLine[];
  lastResultIds: string[];
  pendingChoice: PendingChoice | null;
}

export interface AgentReply {
  text: string;
  intent: ReplyIntent;
  productIds: string[];
  asksClarification: boolean;
  safetyFlags: SafetyFlag[];
  nextState: ConversationState;
}
